import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server.mjs';

const password = 'Local-Test-Password!123';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6qjEAAAAASUVORK5CYII=';
const appOrigin = 'http://localhost:8083';

test('connected local flow shares real owned bookings, staff progress and private photos without crossing account boundaries', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'unimate-connected-test-'));
  const filename = join(directory, 'test.sqlite'), mediaDirectory = join(directory, 'private-media');
  const sent = [];
  // All confirmation mail stays inside this test. No SMTP transport is created.
  const localMailbox = { rows: () => sent.map(message => ({ ...message })), render: () => '<!doctype html><title>Local test mailbox</title>' };
  const sendMail = async message => { sent.push({ ...message, id: `mail-${sent.length + 1}`, createdAt: new Date().toISOString() }); };
  let application, origin;
  async function start() {
    application = await createApplication({ filename, mediaDirectory, sendMail, localMailbox, allowRegistration: true });
    await new Promise(resolve => application.server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${application.server.address().port}`;
  }
  async function stop() {
    const current = application; application = null;
    if (current) { await new Promise(resolve => current.server.close(resolve)); current.db.close(); }
  }
  t.after(async () => { await stop(); rmSync(directory, { recursive: true, force: true }); });
  await start();
  const call = async (path, data, identity = {}, extraHeaders = {}) => {
    const response = await fetch(origin + path, {
      method: data === undefined ? 'GET' : 'POST', redirect: 'manual',
      headers: {
        ...(identity.cookie ? { Cookie: identity.cookie } : {}),
        ...(path.startsWith('/api/member/') ? { Origin: appOrigin } : data !== undefined ? { Origin: origin } : {}),
        ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': identity.csrf || '' }),
        ...extraHeaders,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, bytes, data: response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(bytes.toString()) : bytes.toString() };
  };
  const ok = (result, status, label) => { assert.equal(result.status, status, `${label}: ${JSON.stringify(result.data)}`); return result; };
  const anonymous = ok(await call('/api/member/session'), 200, 'anonymous session').data;
  assert.equal(anonymous.registrationEnabled, true); assert.equal(anonymous.mailMode, 'local'); assert.equal(anonymous.user, null);

  const adminAnonymous = ok(await call('/api/session'), 200, 'admin setup session').data;
  ok(await call('/api/setup', { name: 'Test administrator', email: 'admin@example.invalid', password, confirmPassword: password }, { csrf: adminAnonymous.csrf }), 201, 'admin setup');
  const adminLogin = ok(await call('/api/login', { email: 'admin@example.invalid', password }, { csrf: adminAnonymous.csrf }), 200, 'admin login');
  const admin = { cookie: adminLogin.headers.get('set-cookie').split(';')[0] };
  const adminSession = ok(await call('/api/session', undefined, admin), 200, 'signed-in admin session').data;
  admin.csrf = adminSession.csrf; assert.equal(adminSession.localMailbox, true);
  ok(await call('/api/dev-mail'), 401, 'mailbox is protected');

  async function register(name, email) {
    ok(await call('/api/member/signup', { name, email, password, confirmPassword: password, role: 'owner', verified_at: 'forged' }, { csrf: anonymous.csrf }), 202, 'member signup');
    ok(await call('/api/member/login', { email, password }, { csrf: anonymous.csrf }), 401, 'unconfirmed account cannot log in');
    const mail = sent.findLast(message => message.to === email);
    assert.ok(mail, 'confirmation recorded only by injected sender');
    const link = new URL(mail.text.match(/https?:\/\/[^\s]+/)[0]);
    assert.equal(link.origin, appOrigin); assert.equal(link.searchParams.get('member_action'), 'verify');
    ok(await call('/api/member/verify', { token: link.searchParams.get('token') }, { csrf: anonymous.csrf }), 200, 'confirm member email');
    const login = ok(await call('/api/member/login', { email, password }, { csrf: anonymous.csrf }), 200, 'member login');
    assert.equal(login.data.user.role, 'student');
    return { cookie: login.headers.get('set-cookie').split(';')[0], csrf: login.data.csrf, user: login.data.user };
  }
  const first = await register('First test student', 'first@example.invalid');
  const second = await register('Second test student', 'second@example.invalid');
  const staff = await register('Approved test cleaner', 'cleaner@example.invalid');
  assert.equal(sent.length, 3);
  ok(await call('/api/dev-mail', undefined, first), 401, 'members cannot access test mail');
  assert.equal(ok(await call('/api/dev-mail', undefined, admin), 200, 'admin test mail').data.rows.length, 3);
  assert.equal((await call('/test-mail')).status, 302);
  ok(await call('/test-mail', undefined, admin), 200, 'protected mailbox page');

  // Browsers send both localhost cookies across ports. Member requests must use
  // the member identity and member CSRF even when an admin is also signed in.
  const both = { ...first, cookie: `${admin.cookie}; ${first.cookie}` };
  const request = { service: 'cleaning', requestedDate: '2026-11-07', address: 'Fictional local test address', notes: 'Test instructions', amount_pence: 1, owner: second.user.id, status: 'completed' };
  const booking = ok(await call('/api/member/bookings', request, both), 201, 'member request with both cookies').data.row;
  assert.equal(booking.customer, first.user.name); assert.equal(booking.status, 'requested'); assert.equal(booking.pricingStatus, 'unquoted'); assert.equal(booking.amount_pence, 0);
  const secondBooking = ok(await call('/api/member/bookings', { ...request, notes: 'Second private request' }, second), 201, 'second member request').data.row;
  assert.deepEqual(ok(await call('/api/member/bookings', undefined, both), 200, 'first list with both cookies').data.rows.map(row => row.id), [booking.id]);
  assert.deepEqual(ok(await call('/api/member/bookings', undefined, second), 200, 'second list').data.rows.map(row => row.id), [secondBooking.id]);
  ok(await call(`/api/member/bookings/${booking.id}`, undefined, second), 404, 'cross-student details denied');
  ok(await call(`/api/member/bookings/${booking.id}`, undefined, staff), 404, 'unassigned staff details denied');
  ok(await call(`/api/bookings/${booking.id}`, undefined, first), 401, 'student does not gain admin access');
  ok(await call(`/api/bookings/${booking.id}/complete`, { expectedStatus: 'requested', reason: 'Cannot complete an unquoted request' }, admin), 409, 'admin cannot invoice unquoted request');

  const requestPhoto = ok(await call(`/api/member/bookings/${booking.id}/photos`, { group: 'request', filename: 'request.png', mime: 'image/png', base64: png }, both), 201, 'student request photo').data.photo;
  ok(await call(requestPhoto.url, undefined, second), 404, 'cross-student photo denied');
  ok(await call(requestPhoto.url), 401, 'anonymous photo denied');
  const price = 12345;
  ok(await call(`/api/bookings/${booking.id}/quote`, { amountPence: price, expectedStatus: 'requested', reason: 'Agreed test cleaning quote' }, first), 401, 'student cannot set trusted price');
  const quoted = ok(await call(`/api/bookings/${booking.id}/quote`, { amountPence: price, expectedStatus: 'requested', reason: 'Agreed test cleaning quote' }, admin), 200, 'admin confirms quote').data;
  assert.equal(quoted.row.amount_pence, price); assert.equal(quoted.pricingStatus, 'confirmed'); assert.equal(quoted.row.status, 'confirmed');
  assert.match(quoted.photos[0].url, /^\/api\/bookings\//);
  assert.equal(quoted.row.photos[0].url, quoted.photos[0].url);

  // A trusted approved team record is an isolated fixture. Account access still
  // requires the real admin link endpoint and an email-verified member.
  const teamId = 'approved-test-cleaner';
  application.db.prepare("INSERT INTO team_members VALUES(?,'cleaners',?,?,'active',?)").run(teamId, staff.user.name, staff.user.email, new Date().toISOString());
  ok(await call(`/api/teams/${teamId}/link-account`, { userId: first.user.id, reason: 'Wrong account must fail' }, admin), 400, 'link requires matching verified account');
  ok(await call(`/api/teams/${teamId}/link-account`, { userId: staff.user.id, reason: 'Verified approved cleaner identity' }, admin), 200, 'explicit staff account link');
  const staffSession = ok(await call('/api/member/session', undefined, staff), 200, 'existing session sees new staff role').data;
  assert.equal(staffSession.user.role, 'staff'); assert.deepEqual(staffSession.user.staffTeams, ['cleaners']);
  ok(await call('/api/staff-schedule', { bookingId: booking.id, memberId: teamId, start: '2026-11-07T09:00:00Z', end: '2026-11-07T12:00:00Z', reason: 'Test cleaner assignment' }, admin), 200, 'admin assigns booking');
  assert.deepEqual(ok(await call('/api/member/bookings', undefined, staff), 200, 'staff assigned list').data.rows.map(row => row.id), [booking.id]);
  ok(await call(requestPhoto.url, undefined, staff), 200, 'assigned staff can read request photo');
  ok(await call(`/api/member/bookings/${booking.id}/photos`, { group: 'before', filename: 'before.png', mime: 'image/png', base64: png }, first), 403, 'student cannot add staff evidence');
  const before = ok(await call(`/api/member/bookings/${booking.id}/photos`, { group: 'before', filename: 'before.png', mime: 'image/png', base64: png }, staff), 201, 'staff before-service photo').data.photo;
  ok(await call(`/api/member/bookings/${booking.id}/status`, { status: 'in_progress', expectedStatus: 'confirmed' }, first), 403, 'student cannot start work');
  ok(await call(`/api/member/bookings/${booking.id}/status`, { status: 'in_progress', expectedStatus: 'confirmed' }, staff), 200, 'assigned staff starts work');
  const completion = ok(await call(`/api/member/bookings/${booking.id}/photos`, { group: 'completion', filename: 'completion.png', mime: 'image/png', base64: png }, staff), 201, 'staff completion photo').data.photo;
  const completed = ok(await call(`/api/member/bookings/${booking.id}/status`, { status: 'completed', expectedStatus: 'in_progress' }, staff), 200, 'staff completes work').data;
  assert.ok(completed.invoice.reference); assert.equal(completed.row.status, 'completed');
  assert.equal(application.db.prepare('SELECT amount_pence FROM invoices WHERE booking_id=?').get(booking.id).amount_pence, price);
  assert.equal(application.db.prepare('SELECT count(*) n FROM invoices').get().n, 1);
  ok(await call(`/api/member/bookings/${booking.id}/status`, { status: 'completed', expectedStatus: 'in_progress' }, staff), 409, 'stale duplicate completion rejected');

  const staffBoth = { ...staff, cookie: `${admin.cookie}; ${staff.cookie}` };
  const staffWork = ok(await call('/api/member/staff-invoices', undefined, staffBoth), 200, 'staff work review with both cookies').data;
  assert.equal(staffWork.rows.length, 1); assert.equal(staffWork.rows[0].bookingId, booking.id);
  assert.equal(staffWork.rows[0].workStatus, 'pending'); assert.equal(staffWork.rows[0].invoice, null);
  ok(await call('/api/member/staff-invoices', undefined, both), 403, 'student with admin cookie cannot view staff payables');
  ok(await call('/api/staff-invoices', undefined, staff), 401, 'staff cannot enter admin invoice reviews');
  const approveWork = { decision: 'approve', expectedStatus: 'pending', amountPence: 6500, reason: 'Confirmed the separately agreed cleaner fee.' };
  ok(await call(`/api/staff-invoices/${booking.id}/review-work`, approveWork, staff), 401, 'staff cannot approve their own work');
  ok(await call(`/api/staff-invoices/${booking.id}/review-work`, approveWork, { ...admin, csrf: staff.csrf }), 403, 'admin invoice review requires admin CSRF');
  const workApproved = ok(await call(`/api/staff-invoices/${booking.id}/review-work`, approveWork, admin), 200, 'UniMate work review').data.row;
  assert.equal(workApproved.workStatus, 'approved'); assert.equal(workApproved.invoice.amountPence, 6500);
  assert.equal(workApproved.invoice.status, 'awaiting_invoice_review'); assert.equal(workApproved.invoice.billTo, 'UniMate');
  assert.equal(application.db.prepare('SELECT amount_pence FROM invoices WHERE booking_id=?').get(booking.id).amount_pence, price);
  const approveInvoice = { decision: 'approve', expectedStatus: 'awaiting_invoice_review', expectedInvoiceId: workApproved.invoice.id, reason: 'Checked cleaner fee and invoice details.' };
  const invoiceApproved = ok(await call(`/api/staff-invoices/${booking.id}/review-invoice`, approveInvoice, admin), 200, 'UniMate invoice review').data;
  assert.equal(invoiceApproved.row.invoice.status, 'approved_for_payment'); assert.equal(invoiceApproved.paymentConnected, false);
  ok(await call(`/api/staff-invoices/${booking.id}/review-invoice`, approveInvoice, admin), 409, 'duplicate invoice review cannot pay or create another invoice');
  assert.equal(ok(await call(`/api/member/staff-invoices/${booking.id}`, undefined, staffBoth), 200, 'staff can read their reviewed invoice').data.row.invoice.reference, workApproved.invoice.reference);

  // The existing administrative completion path submits the same review record.
  ok(await call('/api/member/bookings/' + secondBooking.id, undefined, staff), 404, 'staff cannot access an unassigned booking');
  ok(await call(`/api/bookings/${secondBooking.id}/quote`, { amountPence: 8000, expectedStatus: 'requested', reason: 'Second test booking quote confirmed.' }, admin), 200, 'quote booking for admin completion');
  ok(await call('/api/staff-schedule', { bookingId: secondBooking.id, memberId: teamId, start: '2026-11-08T09:00:00Z', end: '2026-11-08T12:00:00Z', reason: 'Separate test shift for admin completion.' }, admin), 200, 'assign booking for admin completion');
  ok(await call(`/api/bookings/${secondBooking.id}/complete`, { expectedStatus: 'confirmed', reason: 'Administrator confirms the test service is complete.' }, admin), 200, 'admin completion submits staff work');
  assert.equal(ok(await call(`/api/staff-invoices/${secondBooking.id}`, undefined, admin), 200, 'admin completion has a pending work review').data.row.workStatus, 'pending');
  assert.equal(application.db.prepare('SELECT count(*) n FROM work_reviews').get().n, 2);
  assert.equal(application.db.prepare('SELECT count(*) n FROM staff_invoices').get().n, 1);

  const memberDetail = ok(await call(`/api/member/bookings/${booking.id}`, undefined, first), 200, 'student shared detail').data;
  const adminDetail = ok(await call(`/api/bookings/${booking.id}`, undefined, admin), 200, 'admin shared detail').data;
  assert.equal(memberDetail.row.status, adminDetail.row.status); assert.equal(memberDetail.row.amount_pence, adminDetail.row.amount_pence);
  assert.deepEqual(memberDetail.submission, adminDetail.submission);
  assert.deepEqual(memberDetail.photos.map(photo => photo.group).sort(), ['before', 'completion', 'request']);
  for (const photo of memberDetail.photos) {
    const opened = ok(await call(photo.url, undefined, first), 200, 'student private photo');
    assert.deepEqual(opened.bytes, Buffer.from(png, 'base64')); assert.match(opened.headers.get('cache-control'), /no-store/);
  }
  const adminWithUnrelatedMember = { ...admin, cookie: `${admin.cookie}; ${second.cookie}` };
  for (const photo of adminDetail.photos) {
    assert.match(photo.url, /^\/api\/bookings\//);
    ok(await call(photo.url, undefined, second), 401, 'member cannot use privileged photo route');
    assert.deepEqual(ok(await call(photo.url, undefined, adminWithUnrelatedMember), 200, 'admin photos retain admin authority with both cookies').bytes, Buffer.from(png, 'base64'));
  }
  ok(await call(`/api/teams/${teamId}/link-account`, { userId: null, reason: 'Revoke test staff account link' }, admin), 200, 'revoke staff access');
  ok(await call(before.url, undefined, staff), 404, 'photo access revoked immediately');
  ok(await call('/api/member/staff-invoices', undefined, staffBoth), 403, 'revoked staff access cannot read staff invoice workspace even with admin cookie');
  ok(await call(completion.url, undefined, first), 200, 'owner keeps photo access');

  await stop(); await start();
  const restored = ok(await call(`/api/member/bookings/${booking.id}`, undefined, first), 200, 'booking and member session persist after restart').data;
  assert.equal(restored.row.status, 'completed'); assert.equal(restored.photos.length, 3);
  assert.deepEqual(ok(await call(completion.url, undefined, first), 200, 'private photo persists after restart').bytes, Buffer.from(png, 'base64'));
  assert.equal(application.db.prepare('SELECT count(*) n FROM invoices').get().n, 2);
  assert.equal(ok(await call(`/api/staff-invoices/${booking.id}`, undefined, admin), 200, 'staff invoice persists').data.row.invoice.status, 'approved_for_payment');
  assert.equal(sent.length, 3, 'work review and invoice approvals do not send mail or payment instructions');
});
