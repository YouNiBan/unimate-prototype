import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../database.mjs';
import { createMemberAuth } from '../member-auth.mjs';
import { createSharedBookings } from '../shared-bookings.mjs';
import { createOversight } from '../oversight.mjs';

async function fixture(t, withSupport = false) {
  const directory = mkdtempSync(join(tmpdir(), 'unimate-oversight-test-')), db = openDatabase(':memory:');
  const memberAuth = createMemberAuth({ db }), shared = createSharedBookings({ db, mediaDirectory: join(directory, 'media'), memberAuth });
  const calls = [];
  const oversight = createOversight({ db, sharedBookings: { detail(id, options) { calls.push({ id, options }); return shared.detail(id, options); } } });
  const now = new Date().toISOString();
  const insertUser = (id, kind, status, verified) => {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, `Name ${id}`, `${id}@example.invalid`, kind, status, now);
    if (verified !== null) db.prepare('INSERT INTO member_credentials VALUES(?,?,?,?)').run(id, 'secret-password-hash', verified ? now : null, now);
  };
  insertUser('student', 'student', 'active', true);
  insertUser('unverified', 'student', 'active', false);
  insertUser('staff', 'student', 'active', true);
  insertUser('inactive-staff', 'staff_cleaning', 'active', true);
  insertUser('organisation', 'organisation', 'active', null);
  insertUser('suspended', 'student', 'suspended', true);
  for (const [id, status] of [['staff', 'active'], ['inactive-staff', 'deactivated']]) {
    db.prepare("INSERT INTO team_members VALUES(?,'cleaners',?,?,?,?)").run(`team-${id}`, `Staff ${id}`, `${id}@example.invalid`, status, now);
    db.prepare('INSERT INTO staff_user_links VALUES(?,?)').run(`team-${id}`, id);
  }
  for (const [id, service, status, price] of [['request', 'cleaning', 'requested', 0], ['confirmed', 'cleaning', 'confirmed', 5000], ['assigned', 'cleaning', 'confirmed', 7000], ['done', 'moving', 'completed', 10000]]) {
    db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run(id, `Booking ${id}`, 'Name student', service, status, price, now);
    db.prepare('INSERT INTO booking_owners VALUES(?,?)').run(id, 'student');
    db.prepare('INSERT INTO booking_pricing VALUES(?,?)').run(id, id === 'request' ? 'unquoted' : 'confirmed');
  }
  db.prepare("INSERT INTO submission_details VALUES('bookings','request',?)").run(JSON.stringify({ intake: { fields: [{ label: 'Requested date', value: '2000-01-01' }, { label: 'Special instructions', value: 'Saved booking instruction' }] } }));
  db.prepare("INSERT INTO submission_details VALUES('bookings','confirmed','{broken')").run();
  db.prepare("INSERT INTO booking_assignments VALUES('assigned','team-staff',?,?)").run(now, now);
  db.prepare("INSERT INTO booking_media VALUES('photo1','request','request','private-disk-name.image','request.png','image/png',50,'student',?)").run(now);
  db.prepare("INSERT INTO member_sessions VALUES('secret-session-hash','student','secret-csrf-token',?)").run(Date.now() + 100000);
  db.prepare("INSERT INTO member_email_tokens VALUES('secret-email-token-hash','student','verify',?,NULL,?)").run(Date.now() + 100000, Date.now());
  if (withSupport) {
    db.exec("CREATE TABLE support_conversations(id TEXT PRIMARY KEY,participant_id TEXT,subject TEXT,category TEXT,status TEXT,booking_id TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE support_messages(id TEXT PRIMARY KEY,conversation_id TEXT,body TEXT);");
    for (const [id, state] of [['support-open', 'open'], ['support-closed', 'closed']]) {
      db.prepare('INSERT INTO support_conversations VALUES(?,?,?,?,?,?,?,?)').run(id, 'student', 'PRIVATE SUBJECT SENTINEL', 'booking', state, 'request', now, now);
      db.prepare('INSERT INTO support_messages VALUES(?,?,?)').run(`message-${id}`, id, 'PRIVATE CONVERSATION BODY SENTINEL');
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const role = req.headers['x-test-role'];
      const handled = await oversight.handle(req, res, new URL(req.url, 'http://localhost'), role ? { id: 'reviewer', name: 'Administrator', role } : null);
      if (!handled) { res.writeHead(404); res.end(); }
    } catch (error) { res.writeHead(error.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = async (path = '', role = 'owner', method = 'GET') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/oversight${path}`, { method, headers: role ? { 'x-test-role': role } : {} });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); });
  return { db, call, calls, insertUser };
}
function assertNoSecrets(value) {
  const serialized = JSON.stringify(value);
  for (const secret of ['secret-password-hash', 'secret-session-hash', 'secret-csrf-token', 'secret-email-token-hash', 'PRIVATE SUBJECT SENTINEL', 'PRIVATE CONVERSATION BODY SENTINEL', 'private-disk-name.image']) assert.equal(serialized.includes(secret), false, secret);
}

test('oversight requires privileged administrator access and rejects mutations', async t => {
  const f = await fixture(t);
  for (const path of ['', '/accounts', '/accounts/student']) {
    assert.equal((await f.call(path, null)).status, 401);
    for (const role of ['student', 'staff', 'admin', 'viewer']) assert.equal((await f.call(path, role)).status, 403);
    assert.equal((await f.call(path, 'owner', 'POST')).status, 405);
  }
  assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get().n, 0);
  assert.equal((await f.call('', 'superadmin')).status, 200);
});

test('workflow counts are real, service-filtered and honest about unavailable workspaces', async t => {
  const f = await fixture(t);
  const overview = await f.call();
  assert.equal(overview.status, 200); assert.equal(overview.headers.get('cache-control'), 'no-store');
  assert.deepEqual(overview.data.counts, { bookings: 4, activeVerifiedStudents: 1, activeVerifiedStaff: 1, organisationRecords: 1, suspendedAccounts: 1 });
  assert.deepEqual(overview.data.byStatus, { requested: 1, confirmed: 2, completed: 1 });
  const issue = key => overview.data.issues.find(item => item.key === key);
  assert.equal(issue('unquoted').count, 1); assert.equal(issue('unassigned').count, 1); assert.equal(issue('past_request_date').count, 1);
  assert.equal(issue('unassigned').rows[0].id, 'confirmed'); assert.equal(issue('suspended_accounts').count, 1);
  assert.equal(issue('open_support').available, false);
  assert.equal(overview.data.capabilities.find(item => item.id === 'organisations').status, 'not_connected');
  assert.match(overview.data.note, /not automated bug detection/);
  const moving = (await f.call('?service=moving')).data;
  assert.equal(moving.counts.bookings, 1); assert.deepEqual(moving.byStatus, { completed: 1 }); assert.equal(moving.issues.find(item => item.key === 'unquoted').count, 0);
  assert.equal((await f.call('?service=forged')).status, 400);
  assertNoSecrets(overview.data);
});

test('account search is paginated, role-aware and exposes only safe account summaries', async t => {
  const f = await fixture(t);
  const staff = (await f.call('/accounts?role=staff')).data;
  assert.equal(staff.total, 2); assert.deepEqual(staff.rows.map(row => row.id).sort(), ['inactive-staff', 'staff']);
  assert.equal(staff.rows.find(row => row.id === 'inactive-staff').staffMemberships[0].status, 'deactivated');
  assert.equal(staff.rows.find(row => row.id === 'staff').appAccess, 'staff');
  const organisation = (await f.call('/accounts?role=organisation')).data;
  assert.equal(organisation.total, 1); assert.equal(organisation.rows[0].appAccess, 'no_account');
  const matched = (await f.call('/accounts?q=STUDENT@EXAMPLE.INVALID')).data;
  assert.equal(matched.total, 1); assert.equal(matched.rows[0].id, 'student');
  for (let i = 0; i < 30; i++) f.insertUser(`pagination-${String(i).padStart(2, '0')}`, 'student', 'active', null);
  const first = (await f.call('/accounts?q=pagination&page=1')).data, second = (await f.call('/accounts?q=pagination&page=2')).data;
  assert.equal(first.total, 30); assert.equal(first.rows.length, 25); assert.equal(second.rows.length, 5);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 30);
  for (const path of ['/accounts?role=owner', '/accounts?page=0', '/accounts?page=NaN', '/accounts?q=' + 'x'.repeat(101)]) assert.equal((await f.call(path)).status, 400);
  assertNoSecrets(staff); assertNoSecrets(matched);
  assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get().n, 0);
});

test('account inspection uses shared booking records and logs review without exposing messages or changing access', async t => {
  const f = await fixture(t, true);
  const beforeUsers = f.db.prepare('SELECT * FROM users ORDER BY id').all(), beforeSessions = f.db.prepare('SELECT * FROM member_sessions').all();
  const result = await f.call('/accounts/student');
  assert.equal(result.status, 200); assert.equal(result.data.reviewMode, 'administrator');
  assert.equal(result.data.ownedTotal, 4); assert.equal(result.data.assignedTotal, 0); assert.equal(result.data.ownedBookings.length, 4);
  assert.ok(f.calls.every(call => call.options.admin === true));
  const requested = result.data.ownedBookings.find(row => row.id === 'request');
  assert.equal(requested.pricingStatus, 'unquoted'); assert.equal(requested.photos[0].url, '/api/bookings/request/photos/photo1');
  assert.equal(result.data.support.total, 2); assert.equal(result.data.support.open, 1);
  assert.deepEqual(Object.keys(result.data.support.rows[0]).sort(), ['bookingId', 'category', 'createdAt', 'id', 'status', 'updatedAt']);
  assertNoSecrets(result.data);
  const audit = f.db.prepare("SELECT * FROM audit WHERE action='oversight.account_viewed'").all();
  assert.equal(audit.length, 1); assert.equal(audit[0].actor_id, 'reviewer'); assert.equal(audit[0].resource_id, 'student');
  assert.deepEqual(f.db.prepare('SELECT * FROM users ORDER BY id').all(), beforeUsers);
  assert.deepEqual(f.db.prepare('SELECT * FROM member_sessions').all(), beforeSessions);
  const assigned = (await f.call('/accounts/staff')).data;
  assert.equal(assigned.ownedTotal, 0); assert.equal(assigned.assignedTotal, 1); assert.equal(assigned.assignedBookings[0].id, 'assigned');
  assert.equal((await f.call('/accounts/missing')).status, 404);
  assert.equal((await f.call()).data.issues.find(item => item.key === 'open_support').count, 1);
});
