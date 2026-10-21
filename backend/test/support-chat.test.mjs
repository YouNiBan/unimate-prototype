import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../database.mjs';
import { createMemberAuth } from '../member-auth.mjs';
import { createSupportChat } from '../support-chat.mjs';
import { digest, token } from '../security.mjs';

async function fixture(t) {
  const db = openDatabase(':memory:');
  const memberAuth = createMemberAuth({ db });
  const now = new Date().toISOString();
  const identities = {};
  for (const id of ['student-a', 'student-b', 'staff-a', 'unverified', 'suspended']) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, id, id + '@example.invalid', id === 'staff-a' ? 'owner' : 'student', id === 'suspended' ? 'suspended' : 'active', now);
    db.prepare('INSERT INTO member_credentials VALUES(?,?,?,?)').run(id, 'test-unused-hash', id === 'unverified' ? null : now, now);
    const raw = token(), csrf = token();
    db.prepare('INSERT INTO member_sessions VALUES(?,?,?,?)').run(digest(raw), id, csrf, Date.now() + 600000);
    identities[id] = { cookie: 'unimate_member=' + raw, csrf, raw };
  }
  for (const role of ['owner', 'superadmin', 'support', 'admin', 'viewer']) {
    db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role, role + '@example.invalid', 'Team ' + role, 'test-unused-hash', role);
    const raw = token(), csrf = token();
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(raw), role, csrf, Date.now() + 600000);
    identities[role] = { cookie: 'unimate_admin=' + raw, csrf, raw };
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS booking_owners(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS staff_user_links(member_id TEXT PRIMARY KEY REFERENCES team_members(id),user_id TEXT NOT NULL REFERENCES users(id));
  `);
  db.prepare("INSERT INTO team_members VALUES('cleaner','cleaners','Test cleaner','cleaner@example.invalid','active',?)").run(now);
  db.prepare("INSERT INTO staff_user_links VALUES('cleaner','staff-a')").run();
  for (const id of ['booking-a', 'booking-b']) {
    db.prepare("INSERT INTO bookings VALUES(?,?,?,'cleaning','requested',0,?)").run(id, 'Private service details', id === 'booking-a' ? 'student-a' : 'student-b', now);
    db.prepare('INSERT INTO booking_owners VALUES(?,?)').run(id, id === 'booking-a' ? 'student-a' : 'student-b');
  }
  db.prepare("INSERT INTO booking_assignments VALUES('booking-a','cleaner',?,?)").run(now, now);
  const support = createSupportChat({ db, memberAuth });
  const server = http.createServer(async (req, res) => {
    try {
      const raw = /(?:^|;\s*)unimate_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const actor = raw ? db.prepare('SELECT a.*,s.csrf FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires>? AND a.active=1').get(digest(raw), Date.now()) : null;
      // Exactly as the real server: admin CSRF is enforced before this module.
      if (req.url.startsWith('/api/support') && req.method === 'POST' && actor && req.headers['x-csrf-token'] !== actor.csrf) {
        throw Object.assign(new Error('Invalid administrator CSRF.'), { status: 403 });
      }
      if (await support.handle(req, res, new URL(req.url, 'http://localhost'), actor)) return;
      res.writeHead(404); res.end();
    } catch (error) {
      res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.status ? error.message : 'Unexpected test server error.' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = async (path = '', data, who = 'student-a', extra = {}) => {
    const identity = identities[who] || {};
    const headers = {
      ...(identity.cookie ? { Cookie: identity.cookie } : {}),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': identity.csrf }),
      ...extra.headers,
    };
    for (const key of Object.keys(headers)) if (headers[key] === undefined) delete headers[key];
    const response = await fetch(origin + (path.startsWith('/api/') ? path : '/api/member/support' + path), {
      method: extra.method || (data === undefined ? 'GET' : 'POST'), headers,
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, buffer,
      data: response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(buffer.toString()) : buffer.length ? buffer : null };
  };
  const create = async (who = 'student-a', extra = {}) => call(who in identities && ['owner', 'superadmin', 'support', 'admin', 'viewer'].includes(who) ? '/api/support' : '',
    { subject: 'A support question', category: 'general', body: 'Please help with my account.', clientId: randomUUID(), ...extra }, who);
  return { db, memberAuth, support, call, create, identities };
}

test('members see only their own conversations and admin cookies never authenticate a member route', async t => {
  const f = await fixture(t);
  const created = await f.create('student-a', { recipientId: 'student-b', sender: { id: 'owner', kind: 'support' }, role: 'owner' });
  assert.equal(created.status, 201);
  const id = created.data.conversation.id;
  assert.equal(created.data.conversation.participant.id, 'student-a');
  assert.deepEqual(created.data.messages[0].sender, { id: 'student-a', name: 'student-a', kind: 'member' });
  assert.equal((await f.call()).data.rows.length, 1);
  assert.equal((await f.call('', undefined, 'student-b')).data.rows.length, 0);
  assert.equal((await f.call('/' + id, undefined, 'student-b')).status, 404);
  for (const action of ['messages', 'read', 'status']) {
    assert.equal((await f.call(`/${id}/${action}`, { body: 'Forged', clientId: randomUUID(), status: 'open', expectedStatus: 'open' }, 'student-b')).status, 404);
  }
  assert.equal((await f.call('/' + id, undefined, 'owner')).status, 401);
  const both = `${f.identities['student-b'].cookie}; ${f.identities.owner.cookie}`;
  assert.equal((await f.call('/' + id, undefined, 'student-b', { headers: { Cookie: both } })).status, 404);
  assert.equal((await f.call('/api/support/' + id, undefined, 'student-a')).status, 401);
  assert.equal((await f.call('/api/support/' + id, undefined, 'owner')).status, 200);
  assert.equal((await f.call('', undefined, null)).status, 401);
});

test('support role is allowed but ordinary admins and viewers are denied, including stale role claims', async t => {
  const f = await fixture(t), id = (await f.create()).data.conversation.id;
  for (const role of ['owner', 'superadmin', 'support']) assert.equal((await f.call('/api/support/' + id, undefined, role)).status, 200);
  for (const role of ['admin', 'viewer']) assert.equal((await f.call('/api/support', undefined, role)).status, 403);
  f.db.prepare("UPDATE admins SET role='viewer' WHERE id='support'").run();
  assert.equal((await f.call('/api/support/' + id, undefined, 'support')).status, 403);
  f.db.prepare("UPDATE admins SET active=0 WHERE id='owner'").run();
  assert.equal((await f.call('/api/support/' + id, undefined, 'owner')).status, 401);
});

test('CSRF, suspension, unverified accounts and session revocation block reads and mutations', async t => {
  const f = await fixture(t), id = (await f.create()).data.conversation.id;
  const draft = { body: 'Need more help.', clientId: randomUUID() };
  assert.equal((await f.call(`/${id}/messages`, draft, 'student-a', { headers: { 'X-CSRF-Token': 'bad' } })).status, 403);
  assert.equal((await f.call(`/${id}/read`, {}, 'student-a', { headers: { 'X-CSRF-Token': undefined } })).status, 403);
  assert.equal((await f.call('/api/support/' + id + '/messages', draft, 'support', { headers: { 'X-CSRF-Token': 'bad' } })).status, 403);
  for (const who of ['suspended', 'unverified']) assert.equal((await f.call('', undefined, who)).status, 401);
  f.db.prepare("UPDATE users SET status='suspended' WHERE id='student-a'").run();
  assert.equal((await f.call('/' + id)).status, 401);
  assert.equal((await f.call('/api/support/' + id + '/messages', draft, 'support')).status, 400);
  f.db.prepare("UPDATE users SET status='active' WHERE id='student-a'").run();
  f.db.prepare("DELETE FROM member_sessions WHERE user_id='student-a'").run();
  assert.equal((await f.call('/' + id)).status, 401);
  f.db.prepare("DELETE FROM sessions WHERE admin_id='support'").run();
  assert.equal((await f.call('/api/support/' + id, undefined, 'support')).status, 401);
});

test('create and reply retries are idempotent only for the same sender and content', async t => {
  const f = await fixture(t), createId = randomUUID();
  const created = await f.create('student-a', { clientId: createId });
  const id = created.data.conversation.id;
  const replay = await f.create('student-a', { clientId: createId });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.conversation.id, id);
  assert.equal((await f.create('student-a', { clientId: createId, body: 'Changed content' })).status, 409);
  assert.equal((await f.create('student-b', { clientId: createId })).status, 201);
  const draft = { body: 'A reply from the support team.', clientId: randomUUID(), senderId: 'student-a', sender: { kind: 'member' } };
  const replied = await f.call('/api/support/' + id + '/messages', draft, 'support');
  assert.equal(replied.status, 201);
  assert.deepEqual(replied.data.message.sender, { id: 'support', name: 'Team support', kind: 'support' });
  const duplicate = await f.call('/api/support/' + id + '/messages', draft, 'support');
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.message.id, replied.data.message.id);
  assert.equal((await f.call('/api/support/' + id + '/messages', { ...draft, body: 'Different' }, 'support')).status, 409);
  assert.equal((await f.call(`/${id}/messages`, { body: 'Please help with my account.', clientId: createId })).status, 409);
  const other = (await f.create()).data.conversation.id;
  assert.equal((await f.call('/api/support/' + other + '/messages', draft, 'support')).status, 409);
  assert.equal((await f.call('/' + id)).data.total, 2);
  const logs = JSON.stringify(f.db.prepare('SELECT * FROM audit').all());
  assert.ok(!logs.includes(draft.body));
  assert.ok(!logs.includes('Please help with my account.'));
  assert.ok(!logs.includes(createId));
});

test('reads are explicit, inbound-only and independent for each support teammate', async t => {
  const f = await fixture(t), id = (await f.create()).data.conversation.id;
  for (const role of ['owner', 'support']) assert.equal((await f.call('/api/support', undefined, role)).data.unread, 1);
  assert.equal((await f.call()).data.unread, 0);
  assert.equal((await f.call('/api/support/' + id, undefined, 'support')).data.conversation.unreadCount, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_read_state').get().n, 0);
  assert.equal((await f.call('/api/support/' + id + '/read', {}, 'support')).data.conversation.unreadCount, 0);
  assert.equal((await f.call('/api/support', undefined, 'owner')).data.unread, 1);
  await f.call('/api/support/' + id + '/messages', { body: 'Hello from support.', clientId: randomUUID() }, 'support');
  assert.equal((await f.call('/' + id)).data.conversation.unreadCount, 1);
  assert.equal((await f.call('/' + id)).data.conversation.unreadCount, 1);
  assert.equal((await f.call(`/${id}/read`, {})).data.conversation.unreadCount, 0);
  const reads = f.db.prepare("SELECT count(*) n FROM audit WHERE action='support.read'").get().n;
  await f.call(`/${id}/read`, {});
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit WHERE action='support.read'").get().n, reads);
});

test('only the team closes, members can reopen their own, and stale changes fail', async t => {
  const f = await fixture(t), id = (await f.create()).data.conversation.id;
  const closed = { status: 'closed', expectedStatus: 'open' };
  assert.equal((await f.call(`/${id}/status`, closed)).status, 403);
  assert.equal((await f.call('/api/support/' + id + '/status', closed, 'support')).status, 200);
  assert.equal((await f.call('/api/support/' + id + '/status', closed, 'owner')).status, 409);
  const blocked = await f.call(`/${id}/messages`, { body: 'Another question', clientId: randomUUID() });
  assert.equal(blocked.status, 409); assert.match(blocked.data.error, /Reopen/);
  assert.deepEqual((await f.call('?status=closed')).data.counts, { open: 0, closed: 1 });
  assert.equal((await f.call('?status=open')).data.total, 0);
  assert.equal((await f.call(`/${id}/status`, { status: 'open', expectedStatus: 'closed' }, 'student-b')).status, 404);
  assert.equal((await f.call(`/${id}/status`, { status: 'open', expectedStatus: 'closed' })).status, 200);
  assert.equal((await f.call(`/${id}/messages`, { body: 'Now reopened', clientId: randomUUID() })).status, 201);
});

test('booking references are restricted to the participant’s owned or currently assigned services', async t => {
  const f = await fixture(t);
  const own = await f.create('student-a', { category: 'booking', bookingId: 'booking-a' });
  assert.equal(own.status, 201);
  assert.equal(own.data.conversation.bookingId, 'booking-a');
  assert.ok(!JSON.stringify(own.data).includes('Private service details'));
  assert.equal((await f.create('student-a', { bookingId: 'booking-b' })).status, 400);
  assert.equal((await f.create('staff-a', { bookingId: 'booking-a' })).status, 201);
  assert.equal((await f.create('staff-a', { bookingId: 'booking-b' })).status, 400);
  assert.equal((await f.create('support', { recipientId: 'student-a', bookingId: 'booking-b' })).status, 400);
  f.db.prepare("UPDATE team_members SET status='deactivated' WHERE id='cleaner'").run();
  assert.equal((await f.create('staff-a', { bookingId: 'booking-a' })).status, 400);
  const noBooking = await f.create('staff-a');
  assert.equal(noBooking.data.conversation.participant.role, 'student');
});

test('recipient lookup includes only active verified accounts and creates as the actual support identity', async t => {
  const f = await fixture(t);
  const recipients = await f.call('/api/support/recipients', undefined, 'support');
  assert.equal(recipients.status, 200);
  assert.equal(recipients.data.total, 3);
  assert.deepEqual(recipients.data.rows.find(row => row.id === 'staff-a'), { id: 'staff-a', name: 'staff-a', role: 'staff' });
  assert.ok(recipients.data.rows.every(row => !('email' in row) && !('password_hash' in row)));
  assert.equal((await f.call('/api/support/recipients?q=student-a', undefined, 'support')).data.total, 1);
  assert.equal((await f.call('/api/support/recipients?q=%25', undefined, 'support')).data.total, 0);
  assert.equal((await f.call('/recipients')).status, 404);
  for (const recipientId of ['unverified', 'suspended', 'missing']) assert.equal((await f.create('support', { recipientId })).status, 400);
  const created = await f.create('support', { recipientId: 'student-b' });
  assert.equal(created.status, 201);
  assert.equal(created.data.messages[0].sender.kind, 'support');
  assert.equal(created.data.conversation.unreadCount, 0);
  assert.equal((await f.call('', undefined, 'student-b')).data.unread, 1);
  assert.equal((await f.call()).data.total, 0);
});

test('message pages return the newest chunk chronologically and support lists paginate and search safely', async t => {
  const f = await fixture(t), id = (await f.create()).data.conversation.id;
  for (let index = 1; index <= 52; index++) {
    assert.equal((await f.call(`/${id}/messages`, { body: `Message ${index}`, clientId: randomUUID() })).status, 201);
  }
  const newest = await f.call('/' + id);
  assert.equal(newest.data.total, 53);
  assert.equal(newest.data.messages.length, 50);
  assert.equal(newest.data.messages[0].body, 'Message 3');
  assert.equal(newest.data.messages.at(-1).body, 'Message 52');
  const older = await f.call('/' + id + '?page=2');
  assert.equal(older.data.messages.length, 3);
  assert.equal(older.data.messages.at(-1).body, 'Message 2');
  assert.equal((await f.call('/' + id + '?page=3')).data.messages.length, 0);
  for (let index = 0; index < 25; index++) {
    f.db.prepare('DELETE FROM support_rate_limits WHERE key=?').run('member:student-a:create');
    assert.equal((await f.create('student-a', { subject: `Searchable case ${index}` })).status, 201);
  }
  assert.equal((await f.call()).data.rows.length, 25);
  assert.equal((await f.call('?page=2')).data.rows.length, 1);
  assert.equal((await f.call('?q=Searchable')).data.total, 25);
  assert.equal((await f.call('?q=%25')).data.total, 0);
  assert.equal((await f.call('?q=%27%20OR%201%3D1%20--')).data.total, 0);
  assert.equal((await f.call('', undefined, 'student-b')).data.total, 0);
});

test('validation and per-account limits bound abuse without altering legacy tables', async t => {
  const f = await fixture(t);
  for (const extra of [
    { body: '' }, { body: 'x'.repeat(4001) }, { subject: 'x' }, { subject: 'x'.repeat(121) },
    { body: '<script>alert(1)</script>' }, { body: 'bad\u0000value' }, { category: 'internal' },
    { clientId: 'not-a-uuid' }, { bookingId: { id: 'booking-a' } },
  ]) assert.equal((await f.create('student-a', extra)).status, 400);
  for (const path of ['?page=0', '?page=-1', '?page=1.5', '?page=100000', '?status=invalid', '?q=' + 'a'.repeat(101)]) {
    assert.equal((await f.call(path)).status, 400);
  }
  assert.equal((await f.call('', undefined, 'student-a', { method: 'DELETE' })).status, 405);
  assert.equal((await f.create('student-a', { body: 'x'.repeat(40000) })).status, 400);
  for (let index = 0; index < 20; index++) assert.equal((await f.create()).status, 201);
  assert.equal((await f.create()).status, 429);
  assert.equal((await f.create('student-b')).status, 201);
  f.db.prepare('UPDATE support_rate_limits SET expires=0').run();
  assert.equal((await f.create()).status, 201);
  assert.equal(f.db.prepare('SELECT count(*) n FROM conversations').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM messages').get().n, 0);
});

const png = { filename: '../../snapshot.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6qjEAAAAASUVORK5CYII=' };
const pdf = { filename: 'booking receipt.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n').toString('base64') };

test('attachment-only messages share private images and PDFs without exposing bytes in JSON', async t => {
  const f = await fixture(t);
  const created = await f.create('student-a', { body: undefined, attachments: [png, pdf] });
  assert.equal(created.status, 201);
  const conversationId = created.data.conversation.id, message = created.data.messages[0];
  assert.equal(message.body, '');
  assert.equal(created.data.conversation.lastMessage, 'Attachment');
  assert.equal(message.attachments.length, 2);
  assert.equal(message.attachments[0].filename, 'snapshot.png');
  assert.equal(message.attachments[0].bytes, Buffer.from(png.base64, 'base64').length);
  assert.ok(!JSON.stringify(created.data).includes(png.base64));
  assert.ok(!JSON.stringify(created.data).includes('sha256'));
  const image = await f.call(message.attachments[0].url);
  assert.equal(image.status, 200);
  assert.deepEqual(image.buffer, Buffer.from(png.base64, 'base64'));
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.match(image.headers.get('content-security-policy'), /sandbox/);
  assert.match(image.headers.get('content-disposition'), /^inline;/);
  const document = await f.call(message.attachments[1].url);
  assert.equal(document.status, 200);
  assert.match(document.headers.get('content-disposition'), /^attachment;/);
  assert.match(document.headers.get('content-disposition'), /booking%20receipt.pdf/);
  const adminDetail = await f.call('/api/support/' + conversationId, undefined, 'support');
  const adminUrl = adminDetail.data.messages[0].attachments[0].url;
  assert.match(adminUrl, /^\/api\/support\//);
  assert.equal((await f.call(adminUrl, undefined, 'support')).status, 200);
  assert.equal((await f.call(adminUrl)).status, 401);
  await f.call('/api/support/' + conversationId + '/status', { status: 'closed', expectedStatus: 'open' }, 'support');
  assert.equal((await f.call(message.attachments[0].url)).status, 200);
  const audit = JSON.stringify(f.db.prepare('SELECT * FROM audit').all());
  assert.ok(!audit.includes(png.base64));
  assert.ok(!audit.includes(pdf.filename));
});

test('every download rechecks participant, conversation, current role and session without admin fallback', async t => {
  const f = await fixture(t);
  const created = await f.create('student-a', { attachments: [png] });
  const message = created.data.messages[0], url = message.attachments[0].url;
  assert.equal((await f.call(url, undefined, 'student-b')).status, 404);
  assert.equal((await f.call(url, undefined, 'owner')).status, 401);
  const both = `${f.identities['student-b'].cookie}; ${f.identities.owner.cookie}`;
  assert.equal((await f.call(url, undefined, 'student-b', { headers: { Cookie: both } })).status, 404);
  const otherId = (await f.create()).data.conversation.id;
  assert.equal((await f.call(url.replace(created.data.conversation.id, otherId))).status, 404);
  for (const who of ['unverified', 'suspended']) assert.equal((await f.call(url, undefined, who)).status, 401);
  const adminUrl = url.replace('/api/member/', '/api/');
  assert.equal((await f.call(adminUrl, undefined, 'admin')).status, 403);
  assert.equal((await f.call(adminUrl, undefined, 'support')).status, 200);
  f.db.prepare("UPDATE admins SET role='viewer' WHERE id='support'").run();
  assert.equal((await f.call(adminUrl, undefined, 'support')).status, 403);
  f.db.prepare("UPDATE users SET status='suspended' WHERE id='student-a'").run();
  assert.equal((await f.call(url)).status, 401);
  f.db.prepare("UPDATE users SET status='active' WHERE id='student-a'").run();
  f.db.prepare("DELETE FROM member_sessions WHERE user_id='student-a'").run();
  assert.equal((await f.call(url)).status, 401);
});

test('attachment replay compares ordered hashes, filenames and MIME types for creates and replies', async t => {
  const f = await fixture(t), reference = randomUUID();
  const input = { body: '', clientId: reference, attachments: [png, pdf] };
  const original = await f.create('student-a', input);
  assert.equal(original.status, 201);
  const retry = await f.create('student-a', input);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.data.messages[0].attachments, original.data.messages[0].attachments);
  const changedPdf = { ...pdf, base64: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Version /1.7 >>\nendobj\n%%EOF\n').toString('base64') };
  for (const files of [[pdf, png], [png], [png, changedPdf], [{ ...png, filename: 'changed.png' }, pdf]]) {
    assert.equal((await f.create('student-a', { ...input, attachments: files })).status, 409);
  }
  const id = original.data.conversation.id;
  const reply = { clientId: randomUUID(), attachments: [pdf] };
  const sent = await f.call(`/${id}/messages`, reply);
  assert.equal(sent.status, 201);
  assert.equal(sent.data.message.body, '');
  assert.equal((await f.call(`/${id}/messages`, reply)).status, 200);
  assert.equal((await f.call(`/${id}/messages`, { ...reply, attachments: [changedPdf] })).status, 409);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_messages').get().n, 2);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_attachments').get().n, 3);
});

test('attachment format and size limits reject the whole message before inserting any file', async t => {
  const f = await fixture(t);
  const highBitPdf = Buffer.from(pdf.base64, 'base64');
  highBitPdf[0] |= 0x80;
  const highBitPng = Buffer.from(png.base64, 'base64');
  highBitPng[12] |= 0x80;
  const invalid = [
    { ...png, mime: 'image/svg+xml' },
    { ...png, mime: 'text/html' },
    { ...png, mime: 'application/pdf' },
    { ...png, filename: 'bad\nheader.png' },
    { ...png, filename: 'bad\ud800name.png' },
    { ...png, filename: '../' },
    { ...png, base64: '!!!!' },
    { ...png, base64: png.base64.slice(0, -4) },
    { ...pdf, base64: Buffer.from('%PDF-1.7\nmissing end of file').toString('base64') },
    { ...pdf, base64: Buffer.from('%PDF-1.7\n%%EOF<script>HTML</script>').toString('base64') },
    { ...pdf, base64: highBitPdf.toString('base64') },
    { ...png, base64: highBitPng.toString('base64') },
  ];
  for (const file of invalid) assert.equal((await f.create('student-a', { attachments: [png, file] })).status, 400);
  assert.equal((await f.create('student-a', { attachments: [png, png, png, png] })).status, 400);
  assert.equal((await f.create('student-a', { body: '', attachments: [] })).status, 400);
  const tooLarge = { ...png, base64: 'A'.repeat(Math.ceil(5 * 1024 * 1024 / 3) * 4 + 4) };
  assert.equal((await f.create('student-a', { attachments: [tooLarge] })).status, 413);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_conversations').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_messages').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_attachments').get().n, 0);
  // Simulate a storage failure after the first valid file: the transaction also
  // rolls back the message, conversation, first file and audit entry.
  f.db.exec("CREATE TRIGGER fail_second_support_file BEFORE INSERT ON support_attachments WHEN NEW.filename='booking receipt.pdf' BEGIN SELECT RAISE(ABORT,'Test storage failure'); END;");
  assert.equal((await f.create('student-a', { attachments: [png, pdf] })).status, 500);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_conversations').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_messages').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM support_attachments').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get().n, 0);
});
