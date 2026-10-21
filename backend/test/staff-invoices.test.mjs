import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, transaction } from '../database.mjs';
import { createMemberAuth } from '../member-auth.mjs';
import { digest } from '../security.mjs';
import { createStaffInvoices, submitCompletion } from '../staff-invoices.mjs';

const actor = { id: 'owner', name: 'Test owner', role: 'owner' };
const reason = 'Reviewed completed work and agreed staff fee.';
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'unimate-staff-invoice-test-')), filename = join(directory, 'test.sqlite');
  let db = openDatabase(filename), memberAuth = createMemberAuth({ db }), module = createStaffInvoices({ db, memberAuth });
  db.exec('CREATE TABLE staff_user_links(member_id TEXT PRIMARY KEY REFERENCES team_members(id),user_id TEXT NOT NULL REFERENCES users(id))');
  const now = new Date().toISOString(), cookies = {};
  for (const id of ['student', 'staff-a', 'staff-b']) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, `Test ${id}`, `${id}@example.invalid`, 'student', 'active', now);
    db.prepare('INSERT INTO member_credentials VALUES(?,?,?,?)').run(id, 'secret-hash', now, now);
    const raw = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO member_sessions VALUES(?,?,?,?)').run(digest(raw), id, 'secret-csrf', Date.now() + 1000000);
    cookies[id] = `unimate_member=${raw}`;
    if (id.startsWith('staff')) {
      db.prepare("INSERT INTO team_members VALUES(?,'cleaners',?,?,'active',?)").run(`member-${id}`, `Staff ${id}`, `${id}@example.invalid`, now);
      db.prepare('INSERT INTO staff_user_links VALUES(?,?)').run(`member-${id}`, id);
    }
  }
  function booking(id = 'job-a', staff = 'staff-a', status = 'completed') {
    db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run(id, `Job ${id}`, 'Student customer', 'cleaning', status, 99999, now);
    if (staff) db.prepare('INSERT INTO booking_assignments VALUES(?,?,?,?)').run(id, `member-${staff}`, '2026-10-20T09:00:00Z', '2026-10-20T11:00:00Z');
    return { id };
  }
  function submit(id = 'job-a') { return transaction(db, () => submitCompletion(db, actor, { id })); }
  const server = http.createServer(async (req, res) => {
    try {
      const role = req.headers['x-test-admin'];
      if (role && req.method === 'POST' && req.headers['x-csrf-token'] !== 'test-admin-csrf') throw Object.assign(Error('Invalid CSRF.'), { status: 403 });
      const handled = await module.handle(req, res, new URL(req.url, 'http://localhost'), role ? { ...actor, role } : null);
      if (!handled) { res.writeHead(404); res.end('{}'); }
    } catch (error) { res.writeHead(error.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  async function call(path = '', data, role = 'owner', user = null, extraHeaders = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path.startsWith('/api/') ? path : '/api/staff-invoices' + path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { ...(role ? { 'X-Test-Admin': role } : {}), ...(user ? { Cookie: cookies[user] } : {}),
        ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-admin-csrf' }), ...extraHeaders },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  const approveWork = async (id = 'job-a', amountPence = 4200, expectedStatus = 'pending') =>
    call(`/${id}/review-work`, { decision: 'approve', expectedStatus, amountPence, reason });
  const reviewInvoice = async (invoice, decision = 'approve', id = 'job-a', extra = {}) =>
    call(`/${id}/review-invoice`, { decision, expectedStatus: invoice.status, expectedInvoiceId: invoice.id, reason, ...extra });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); });
  return {
    get db() { return db; }, call, booking, submit, approveWork, reviewInvoice,
    reopen() { db.close(); db = openDatabase(filename); memberAuth = createMemberAuth({ db }); module = createStaffInvoices({ db, memberAuth }); },
  };
}

test('completion snapshots assigned work once, without inferring staff pay or creating an invoice', async t => {
  const f = await fixture(t);
  f.booking();
  const review = f.submit();
  assert.equal(review.status, 'pending'); assert.equal(review.staff_user_id, 'staff-a');
  assert.equal(review.staff_name, 'Staff staff-a'); assert.equal(review.job_date, '2026-10-20');
  assert.deepEqual(f.submit(), review);
  assert.equal(f.db.prepare('SELECT count(*) n FROM work_reviews').get().n, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM staff_invoices').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM invoices').get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit WHERE action='staff_work.submitted'").get().n, 1);
  f.booking('legacy-unassigned', null); assert.equal(f.submit('legacy-unassigned'), null);
  f.booking('not-complete', 'staff-a', 'in_progress');
  assert.throws(() => f.submit('not-complete'), /Complete the booking/);
  const data = (await f.call()).data;
  assert.equal(data.rows[0].invoice, null); assert.equal(data.counts.pendingWork, 1); assert.equal(data.paymentConnected, false);
  assert.equal(JSON.stringify(data).includes('99999'), false);
});

test('only privileged administrators can review, while active staff see only their own read-only records', async t => {
  const f = await fixture(t); f.booking(); f.submit(); f.booking('job-b', 'staff-b'); f.submit('job-b');
  for (const role of ['support', 'admin', 'viewer', 'student', 'staff']) {
    assert.equal((await f.call('', undefined, role)).status, 403);
    assert.equal((await f.call('/job-a/review-work', { decision: 'approve', expectedStatus: 'pending', amountPence: 1, reason }, role)).status, 403);
  }
  assert.equal((await f.call('', undefined, null)).status, 401);
  assert.equal((await f.call('', undefined, 'superadmin')).status, 200);
  assert.equal((await f.call('/job-a/review-work', { decision: 'approve', expectedStatus: 'pending', amountPence: 1, reason }, 'owner', null, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await f.call('/api/member/staff-invoices', undefined, 'owner')).status, 401);
  assert.equal((await f.call('/api/member/staff-invoices', undefined, 'owner', 'student')).status, 403);
  const own = await f.call('/api/member/staff-invoices', undefined, 'owner', 'staff-a');
  assert.equal(own.status, 200); assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.deepEqual(own.data.rows.map(row => row.bookingId), ['job-a']); assert.equal(own.data.counts.pendingWork, 1);
  for (const secret of ['secret-hash', 'secret-csrf', 'Student customer', '@example.invalid']) assert.equal(JSON.stringify(own.data).includes(secret), false);
  assert.equal((await f.call('/api/member/staff-invoices/job-b', undefined, 'owner', 'staff-a')).status, 404);
  assert.equal((await f.call('/api/member/staff-invoices/job-a/review-work', { decision: 'approve' }, 'owner', 'staff-a')).status, 405);
  f.db.prepare("UPDATE team_members SET status='deactivated' WHERE id='member-staff-a'").run();
  assert.equal((await f.call('/api/member/staff-invoices', undefined, null, 'staff-a')).status, 403);
});

test('work approval creates a separate fee invoice, then invoice review records readiness without payment', async t => {
  const f = await fixture(t); f.booking(); f.submit();
  assert.equal((await f.call('/job-a/review-invoice', { decision: 'approve', expectedStatus: 'awaiting_invoice_review', expectedInvoiceId: 'forged', reason })).status, 409);
  const work = await f.approveWork(); assert.equal(work.status, 200);
  const invoice = work.data.row.invoice;
  assert.equal(work.data.row.workStatus, 'approved'); assert.equal(invoice.status, 'awaiting_invoice_review');
  assert.equal(invoice.amountPence, 4200); assert.equal(invoice.billTo, 'UniMate'); assert.equal(invoice.currency, 'GBP');
  assert.match(invoice.reference, /^UM-STAFF-\d{4}-\d{5}$/); assert.equal(invoice.revision, 1);
  assert.equal(f.db.prepare("SELECT amount_pence FROM bookings WHERE id='job-a'").get().amount_pence, 99999);
  assert.equal((await f.approveWork()).status, 409);
  assert.equal((await f.reviewInvoice(invoice, 'approve', 'job-a', { expectedInvoiceId: 'foreign-revision' })).status, 409);
  const approved = await f.reviewInvoice(invoice); assert.equal(approved.status, 200);
  assert.equal(approved.data.row.invoice.status, 'approved_for_payment'); assert.equal(approved.data.paymentConnected, false);
  assert.equal((await f.reviewInvoice(invoice)).status, 409);
  assert.equal(f.db.prepare('SELECT count(*) n FROM staff_invoices').get().n, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM invoices').get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit WHERE action LIKE '%paid%' OR action LIKE '%payout%'").get().n, 0);
  const own = (await f.call('/api/member/staff-invoices/job-a', undefined, null, 'staff-a')).data.row;
  assert.equal(own.invoice.amountPence, 4200); assert.equal(own.invoiceHistory, undefined);
});

test('invoice changes require renewed work approval and a new immutable fee revision', async t => {
  const f = await fixture(t); f.booking(); f.submit();
  const first = (await f.approveWork()).data.row.invoice;
  assert.equal((await f.reviewInvoice(first, 'approve', 'job-a', { amountPence: 1 })).status, 400);
  assert.equal(f.db.prepare('SELECT amount_pence FROM staff_invoices WHERE id=?').get(first.id).amount_pence, 4200);
  const returned = await f.reviewInvoice(first, 'changes_requested');
  assert.equal(returned.status, 200); assert.equal(returned.data.row.workStatus, 'changes_requested'); assert.equal(returned.data.row.invoice.status, 'changes_requested');
  assert.equal((await f.reviewInvoice(returned.data.row.invoice)).status, 409);
  assert.equal((await f.approveWork('job-a', 5000, 'pending')).status, 409);
  const revised = await f.approveWork('job-a', 5000, 'changes_requested');
  assert.equal(revised.status, 200);
  const second = revised.data.row.invoice;
  assert.notEqual(second.id, first.id); assert.notEqual(second.reference, first.reference);
  assert.equal(second.revision, 2); assert.equal(second.amountPence, 5000); assert.equal(second.status, 'awaiting_invoice_review');
  assert.deepEqual(revised.data.row.invoiceHistory.map(row => [row.amountPence, row.status]), [[5000, 'awaiting_invoice_review'], [4200, 'superseded']]);
  assert.equal((await f.reviewInvoice(first)).status, 409);
  assert.throws(() => f.db.prepare('UPDATE staff_invoices SET amount_pence=1 WHERE id=?').run(first.id), /cannot be changed/);
  assert.throws(() => f.db.prepare('DELETE FROM staff_invoices WHERE id=?').run(first.id), /cannot be deleted/);
  assert.equal((await f.reviewInvoice(second)).status, 200);
  assert.equal((await f.approveWork('job-a', 1, 'approved')).status, 409);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit WHERE action='staff_invoice.superseded'").get().n, 1);
});

test('assignment, account-link and staff deactivation changes cannot redirect or approve a payable', async t => {
  const f = await fixture(t); f.booking(); f.submit();
  f.db.prepare("UPDATE booking_assignments SET member_id='member-staff-b' WHERE booking_id='job-a'").run();
  assert.equal((await f.approveWork()).status, 409);
  const ownB = (await f.call('/api/member/staff-invoices', undefined, null, 'staff-b')).data;
  assert.equal(ownB.total, 0);
  assert.equal(f.submit().member_id, 'member-staff-a');
  f.db.prepare("UPDATE booking_assignments SET member_id='member-staff-a' WHERE booking_id='job-a'").run();
  f.db.prepare("UPDATE staff_user_links SET user_id='staff-b' WHERE member_id='member-staff-a'").run();
  assert.equal((await f.approveWork()).status, 409);
  f.db.prepare("UPDATE staff_user_links SET user_id='staff-a' WHERE member_id='member-staff-a'").run();
  f.db.prepare("UPDATE team_members SET status='deactivated' WHERE id='member-staff-a'").run();
  assert.equal((await f.approveWork()).status, 409);
  f.db.prepare("UPDATE team_members SET status='active' WHERE id='member-staff-a'").run();
  const invoice = (await f.approveWork()).data.row.invoice;
  f.db.prepare("UPDATE bookings SET status='cancelled' WHERE id='job-a'").run();
  assert.equal((await f.reviewInvoice(invoice)).status, 409);
  assert.equal(f.db.prepare('SELECT status FROM staff_invoices WHERE id=?').get(invoice.id).status, 'awaiting_invoice_review');
});

test('fees and optimistic state are validated, duplicate approval cannot issue two invoices', async t => {
  const f = await fixture(t); f.booking(); f.submit();
  for (const amount of [-1, 1.5, '4200', null, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await f.approveWork('job-a', amount)).status, 400);
  assert.equal((await f.call('/job-a/review-work', { decision: 'approve', expectedStatus: 'pending', reason })).status, 400);
  assert.equal((await f.call('/job-a/review-work', { decision: 'approve', expectedStatus: 'pending', amountPence: 1, reason: 'x' })).status, 400);
  assert.equal((await f.call('/job-a/review-work', { decision: 'changes_requested', expectedStatus: 'pending', amountPence: 1, reason })).status, 400);
  const results = await Promise.all([f.approveWork('job-a', 0), f.approveWork('job-a', 0)]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  assert.equal(f.db.prepare('SELECT count(*) n FROM staff_invoices').get().n, 1);
  assert.equal(f.db.prepare('SELECT amount_pence FROM staff_invoices').get().amount_pence, 0);
  assert.equal((await f.call('?status=paid')).status, 400); assert.equal((await f.call('?page=0')).status, 400);
  assert.equal((await f.call('?status=awaiting_invoice_review')).data.total, 1);
  assert.equal((await f.call('?status=pending_work')).data.total, 0);
  assert.equal((await f.call('/job-a/review-invoice', { decision: 'paid', expectedStatus: 'awaiting_invoice_review', expectedInvoiceId: 'x', reason })).status, 400);
});

test('work snapshot and invoice changes roll back with their transaction', async t => {
  const f = await fixture(t); f.booking('job-a', 'staff-a', 'in_progress');
  assert.throws(() => transaction(f.db, () => {
    f.db.prepare("UPDATE bookings SET status='completed' WHERE id='job-a'").run();
    submitCompletion(f.db, actor, { id: 'job-a' });
    throw Error('Simulated completion failure');
  }), /Simulated/);
  assert.equal(f.db.prepare("SELECT status FROM bookings WHERE id='job-a'").get().status, 'in_progress');
  assert.equal(f.db.prepare('SELECT count(*) n FROM work_reviews').get().n, 0);
  f.db.prepare("UPDATE bookings SET status='completed' WHERE id='job-a'").run(); f.submit();
  f.db.exec("CREATE TRIGGER test_invoice_failure BEFORE INSERT ON staff_invoices BEGIN SELECT RAISE(ABORT,'Simulated invoice failure'); END");
  assert.equal((await f.approveWork()).status, 500);
  assert.equal(f.db.prepare("SELECT status FROM work_reviews WHERE booking_id='job-a'").get().status, 'pending');
  assert.equal(f.db.prepare('SELECT count(*) n FROM staff_invoices').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM staff_invoice_counters').get().n, 0);
});

test('reviews, references and staff ownership persist when the local app is reopened', async t => {
  const f = await fixture(t); f.booking(); f.submit();
  const before = (await f.approveWork()).data.row.invoice;
  f.reopen();
  const row = (await f.call('/api/member/staff-invoices/job-a', undefined, null, 'staff-a')).data.row;
  assert.deepEqual(row.invoice, before); assert.equal(row.staff.name, 'Staff staff-a');
  assert.equal((await f.reviewInvoice(row.invoice)).status, 200);
  f.reopen();
  assert.equal((await f.call('/job-a')).data.row.invoice.status, 'approved_for_payment');
  assert.equal((await f.call('/api/member/staff-invoices/job-a', undefined, null, 'staff-b')).status, 404);
});
