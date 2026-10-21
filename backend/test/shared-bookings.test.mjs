import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../database.mjs';
import { createSharedBookings } from '../shared-bookings.mjs';
import { normalizeBookingDetails } from '../public/booking-details.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6qjEAAAAASUVORK5CYII=';
const error = (status, message) => Object.assign(new Error(message), { status });
const request = { service: 'cleaning', requestedDate: '2026-11-01', address: 'Fictional test address', notes: 'Test booking' };
async function harness(t, persistent = false) {
  const directory = mkdtempSync(join(tmpdir(), 'unimate-shared-test-'));
  const filename = persistent ? join(directory, 'test.sqlite') : ':memory:';
  let db = openDatabase(filename);
  for (const id of ['student-a', 'student-b', 'staff-a', 'staff-b']) db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, id, `${id}@example.invalid`, id.startsWith('staff') ? 'staff' : 'student', 'active', new Date().toISOString());
  for (const id of ['staff-a', 'staff-b']) db.prepare("INSERT INTO team_members VALUES(?,'cleaners',?,?,'active',?)").run(`team-${id}`, id, `${id}@example.invalid`, new Date().toISOString());
  const memberAuth = {
    authenticate(req) {
      const id = req.headers['x-test-user'];
      const user = id && db.prepare('SELECT * FROM users WHERE id=?').get(id);
      return user ? { user: { id: user.id, name: user.name, email: user.email, role: user.kind, staffTeams: ['cleaners'] }, csrf: 'test-csrf', tokenHash: 'test' } : null;
    },
    requireMutation(req, session) { if (!session || req.headers['x-csrf-token'] !== session.csrf) throw error(403, 'Invalid CSRF.'); },
  };
  let shared = createSharedBookings({ db, mediaDirectory: join(directory, 'media'), memberAuth });
  for (const id of ['staff-a', 'staff-b']) db.prepare('INSERT INTO staff_user_links VALUES(?,?)').run(`team-${id}`, id);
  const server = http.createServer(async (req, res) => {
    try {
      const role = req.headers['x-test-admin'];
      if (role && req.method === 'POST' && req.headers['x-csrf-token'] !== 'test-csrf') throw error(403, 'Invalid admin CSRF.');
      const handled = await shared.handle(req, res, new URL(req.url, 'http://localhost'), role ? { id: 'test-admin', name: 'Test admin', role } : null);
      if (!handled) { res.writeHead(404); res.end(); }
    } catch (e) { if (!res.headersSent) { res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); } else res.destroy(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (path = '', data, user = 'student-a', headers = {}) => {
    const response = await fetch(origin + (/^\/(?:api|media)\//.test(path) ? path : '/api/member/bookings' + path), {
      method: data === undefined ? 'GET' : 'POST',
      headers: { ...(user ? { 'x-test-user': user } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' }), ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { response, data: response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(buffer.toString()) : buffer };
  };
  const assign = (id, user = 'staff-a') => db.prepare('INSERT INTO booking_assignments VALUES(?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET member_id=excluded.member_id').run(id, `team-${user}`, '2026-11-01T09:00:00Z', '2026-11-01T12:00:00Z');
  t.after(async () => { await new Promise(done => server.close(done)); db.close(); rmSync(directory, { recursive: true, force: true }); });
  return {
    get db() { return db; }, get shared() { return shared; }, directory, call, assign,
    reopen() { db.close(); db = openDatabase(filename); shared = createSharedBookings({ db, mediaDirectory: join(directory, 'media'), memberAuth }); },
  };
}

test('requests are owned by the authenticated student, unquoted and private', async t => {
  const h = await harness(t);
  assert.equal((await h.call('', undefined, null)).response.status, 401);
  assert.equal((await h.call('', request, 'student-a', { 'X-CSRF-Token': 'bad' })).response.status, 403);
  const created = await h.call('', { ...request, id: 'forged', userId: 'student-b', owner: 'student-b', customer: 'Forged', status: 'completed', amount_pence: 1, amountPence: 1, pricingStatus: 'confirmed' });
  assert.equal(created.response.status, 201);
  const { row } = created.data;
  assert.notEqual(row.id, 'forged'); assert.equal(row.customer, 'student-a'); assert.equal(row.status, 'requested');
  assert.equal(row.amount_pence, 0); assert.equal(row.pricingStatus, 'unquoted');
  assert.equal(h.db.prepare('SELECT user_id FROM booking_owners WHERE booking_id=?').get(row.id).user_id, 'student-a');
  assert.equal(h.db.prepare('SELECT count(*) n FROM invoices').get().n, 0);
  assert.equal((await h.call()).data.rows.length, 1);
  assert.equal((await h.call('', undefined, 'student-b')).data.rows.length, 0);
  assert.equal((await h.call('/' + row.id, undefined, 'student-b')).response.status, 404);
  assert.equal((await h.call('/' + row.id, undefined, 'staff-a')).response.status, 404);
  assert.equal((await h.call('', request, 'staff-a')).response.status, 403);
  const model = normalizeBookingDetails(row);
  assert.ok(model.fields.some(f => f.value === 'Awaiting quote'));
  assert.ok(!model.fields.some(f => f.value === '£0.00'));
});

test('only active currently assigned linked staff can read bookings and private photos', async t => {
  const h = await harness(t), id = (await h.call('', request)).data.row.id;
  h.assign(id);
  assert.equal((await h.call('/' + id, undefined, 'staff-a')).response.status, 200);
  assert.equal((await h.call('', undefined, 'staff-a')).data.rows.length, 1);
  const uploaded = await h.call(`/${id}/photos`, { group: 'request', filename: 'test.png', mime: 'image/png', base64: png });
  const url = uploaded.data.photo.url;
  assert.equal((await h.call(url, undefined, 'staff-a')).response.status, 200);
  h.assign(id, 'staff-b');
  assert.equal((await h.call('/' + id, undefined, 'staff-a')).response.status, 404);
  assert.equal((await h.call(url, undefined, 'staff-a')).response.status, 404);
  assert.equal((await h.call(url, undefined, 'staff-b')).response.status, 200);
  h.db.prepare("UPDATE team_members SET status='deactivated' WHERE id='team-staff-b'").run();
  assert.equal((await h.call(url, undefined, 'staff-b')).response.status, 404);
  assert.equal((await h.call('', undefined, 'staff-b')).data.rows.length, 0);
  h.db.prepare("UPDATE users SET status='suspended' WHERE id='student-a'").run();
  assert.equal((await h.call(url)).response.status, 401);
});

test('private files survive reopen and never expose disk paths or public URLs', async t => {
  const h = await harness(t, true), id = (await h.call('', request)).data.row.id;
  const uploaded = await h.call(`/${id}/photos`, { group: 'request', filename: '../../test.png', mime: 'image/png', base64: png });
  assert.equal(uploaded.response.status, 201); assert.equal(uploaded.data.photo.filename, 'test.png');
  assert.equal(JSON.stringify(uploaded.data).includes(h.directory), false);
  const files = readdirSync(join(h.directory, 'media'));
  assert.equal(files.length, 1); assert.match(files[0], /^[a-f0-9-]{36}\.image$/);
  assert.equal(statSync(join(h.directory, 'media', files[0])).mode & 0o777, 0o600);
  const url = uploaded.data.photo.url;
  assert.equal((await h.call('/media/' + files[0])).response.status, 404);
  assert.equal((await h.call('/api/member/bookings/' + id + '/photos/' + files[0])).response.status, 404);
  h.reopen();
  const loaded = await h.call(url);
  assert.equal(loaded.response.status, 200); assert.deepEqual(loaded.data, Buffer.from(png, 'base64'));
  assert.equal(loaded.response.headers.get('cache-control'), 'private, no-store');
  assert.equal(loaded.response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await h.call(url, undefined, null)).response.status, 401);
  assert.equal((await h.call(url, undefined, 'student-b')).response.status, 404);
  const detail = (await h.call('/' + id)).data;
  assert.equal(detail.photos.length, 1);
  assert.equal(normalizeBookingDetails(detail.row).photoGroups[0].photos[0].src, url);
  assert.equal(JSON.stringify(detail).includes('stored_name'), false);
  const adminDetail = h.shared.detail(id, { admin: true });
  const adminUrl = `/api/bookings/${id}/photos/${uploaded.data.photo.id}`;
  assert.equal(adminDetail.photos[0].url, adminUrl);
  assert.equal(adminDetail.row.photos[0].url, adminUrl);
  assert.equal(normalizeBookingDetails(adminDetail.row).photoGroups[0].photos[0].src, adminUrl);
  assert.equal(h.shared.detail(id).photos[0].url, url);
});

test('photo upload validates file format, limits and stage permissions without partial writes', async t => {
  const h = await harness(t), id = (await h.call('', request)).data.row.id;
  h.assign(id);
  const upload = { group: 'request', filename: 'photo.png', mime: 'image/png', base64: png };
  for (const data of [
    { ...upload, mime: 'image/svg+xml' }, { ...upload, base64: 'AAAA' }, { ...upload, base64: '!!!!' },
    { ...upload, base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') },
    { ...upload, mime: 'image/jpeg' }, { ...upload, group: 'other' },
  ]) assert.equal((await h.call(`/${id}/photos`, data)).response.status, 400);
  assert.equal((await h.call(`/${id}/photos`, { ...upload, base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') })).response.status, 413);
  assert.equal((await h.call(`/${id}/photos`, { ...upload, group: 'before' })).response.status, 403);
  assert.equal((await h.call(`/${id}/photos`, upload, 'staff-a')).response.status, 403);
  assert.equal((await h.call(`/${id}/photos`, upload, 'student-b')).response.status, 404);
  assert.equal(h.db.prepare('SELECT count(*) n FROM booking_media').get().n, 0);
  assert.deepEqual(readdirSync(join(h.directory, 'media')), []);
  assert.equal((await h.call(`/${id}/photos`, { ...upload, group: 'before' }, 'staff-a')).response.status, 201);
  assert.equal((await h.call(`/${id}/photos`, { ...upload, group: 'completion' }, 'staff-a')).response.status, 201);
  assert.equal(h.db.prepare('SELECT count(*) n FROM booking_media').get().n, 2);
});

test('progress uses current assignment and expected status, preserves completion without photo gates and invoices only confirmed prices', async t => {
  const h = await harness(t), id = (await h.call('', request)).data.row.id;
  h.assign(id);
  const set = (status, expectedStatus, user = 'staff-a') => h.call(`/${id}/status`, { status, expectedStatus }, user);
  assert.equal((await set('in_progress', 'requested')).response.status, 409);
  h.db.prepare("UPDATE bookings SET status='assigned' WHERE id=?").run(id);
  assert.equal((await set('in_progress', 'assigned', 'student-a')).response.status, 403);
  assert.equal((await set('in_progress', 'requested')).response.status, 409);
  assert.equal((await set('in_progress', 'assigned')).response.status, 409);
  assert.equal((await set('completed', 'assigned')).response.status, 409);
  // Existing legacy records have no new quote metadata; their status flow remains available.
  h.db.prepare('DELETE FROM booking_pricing WHERE booking_id=?').run(id);
  assert.equal((await set('in_progress', 'assigned')).response.status, 200);
  assert.equal((await set('completed', 'in_progress')).data.invoice, null);
  assert.equal(h.db.prepare('SELECT count(*) n FROM invoices').get().n, 0);
  assert.equal((await set('completed', 'in_progress')).response.status, 409);
  const quoted = (await h.call('', request)).data.row.id; h.assign(quoted);
  h.db.prepare("UPDATE bookings SET status='confirmed',amount_pence=8500 WHERE id=?").run(quoted);
  h.db.prepare("UPDATE booking_pricing SET status='confirmed' WHERE booking_id=?").run(quoted);
  assert.equal((await h.call(`/${quoted}/status`, { action: 'start', expectedStatus: 'confirmed' }, 'staff-a')).response.status, 200);
  const completed = await h.call(`/${quoted}/status`, { action: 'complete', expectedStatus: 'in_progress' }, 'staff-a');
  assert.equal(completed.response.status, 200); assert.ok(completed.data.invoice.reference);
  assert.equal(h.db.prepare('SELECT amount_pence FROM invoices WHERE booking_id=?').get(quoted).amount_pence, 8500);
  h.assign(quoted, 'staff-b');
  assert.equal((await h.call(`/${quoted}/status`, { action: 'complete', expectedStatus: 'completed' }, 'staff-a')).response.status, 404);
  assert.equal(h.db.prepare('SELECT count(*) n FROM invoices').get().n, 1);
});

test('legacy records stay admin-only; standard admin cannot use the member endpoint to escalate', async t => {
  const h = await harness(t);
  h.db.prepare("INSERT INTO bookings VALUES('legacy','Legacy','A name','cleaning','confirmed',5000,?)").run(new Date().toISOString());
  assert.equal((await h.call('/legacy')).response.status, 404);
  for (const role of ['admin', 'viewer']) assert.equal((await h.call('/legacy', undefined, null, { 'x-test-admin': role })).response.status, 403);
  for (const role of ['owner', 'superadmin']) assert.equal((await h.call('/legacy', undefined, null, { 'x-test-admin': role })).response.status, 200);
  const id = (await h.call('', request)).data.row.id;
  const uploaded = await h.call(`/${id}/photos`, { group: 'before', filename: 'admin.png', mime: 'image/png', base64: png }, null, { 'x-test-admin': 'owner' });
  assert.equal(uploaded.response.status, 201);
  assert.equal((await h.call(uploaded.data.photo.url, undefined, null, { 'x-test-admin': 'owner' })).response.status, 200);
  assert.equal((await h.call(uploaded.data.photo.url, undefined, null, { 'x-test-admin': 'admin' })).response.status, 403);
});

test('photo serializer allows only the current booking private endpoint, and public storage is rejected', async t => {
  const h = await harness(t);
  for (const url of ['https://example.invalid/image.png', '//example.invalid/image.png', '/uploads/image.png', '/api/member/bookings/other/photos/p1', '/api/bookings/other/photos/p1', '/api/bookings/b1/photos/other', '/api/bookings/b1/photos/p1?redirect=https://example.invalid']) {
    const model = normalizeBookingDetails({ id: 'b1', photos: [{ id: 'p1', group: 'request', url }] });
    assert.equal(model.photoGroups[0].photos[0].src, undefined);
  }
  assert.throws(() => createSharedBookings({ db: h.db, mediaDirectory: fileURLToPath(new URL('../public/photos', import.meta.url)), memberAuth: { authenticate() {}, requireMutation() {} } }), /outside the public/);
  assert.throws(() => createSharedBookings({ db: h.db, mediaDirectory: fileURLToPath(new URL('../public/..private', import.meta.url)), memberAuth: { authenticate() {}, requireMutation() {} } }), /outside the public/);
});
