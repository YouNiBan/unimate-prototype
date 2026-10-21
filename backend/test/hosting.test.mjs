import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server.mjs';
import { runtimeConfig, requestAddress } from '../runtime-config.mjs';
import { createOwner } from '../create-owner.mjs';
import { createLocalMailbox } from '../local-mailbox.mjs';
import { openDatabase } from '../database.mjs';
import { verifyPassword } from '../security.mjs';

const password = 'Test-Owner-Password!123';
const account = { name: 'Test Owner', email: 'owner@example.invalid', password, confirmPassword: password };
const apiOrigin = 'https://api.example.invalid';
const adminOrigin = 'https://admin.example.invalid';
const webOrigin = 'https://app.example.invalid';
const hostedEnvironment = {
  NODE_ENV: 'production',
  UNIMATE_MODE: 'hosted',
  UNIMATE_DATA_DIR: '/tmp/unimate-test-config-only',
  UNIMATE_API_ORIGIN: apiOrigin,
  UNIMATE_ADMIN_ORIGIN: adminOrigin,
  UNIMATE_WEB_ORIGIN: webOrigin,
  UNIMATE_TRUST_PROXY: '1',
};

async function fixture(t, { hosted = true, mailbox = false, ...options } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'unimate-hosting-test-'));
  const runtime = hosted ? runtimeConfig(hostedEnvironment) : null;
  const sent = [];
  const localMailbox = mailbox ? createLocalMailbox('http://localhost:8083') : null;
  const app = await createApplication({
    filename: ':memory:', mediaDirectory: join(directory, 'media'), runtime,
    sendMail: localMailbox?.send || (async message => { sent.push(message); }),
    allowRegistration: true, localMailbox, ...options,
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const port = app.server.address().port;
  const origin = hosted ? apiOrigin : `http://127.0.0.1:${port}`;
  const call = (path, data, extra = {}) => new Promise((resolve, reject) => {
    const payload = data === undefined ? undefined : JSON.stringify(data);
    const headers = {
      Host: new URL(origin).host,
      ...(hosted ? { 'X-Forwarded-Proto': 'https' } : {}),
      ...(payload === undefined ? {} : {
        Origin: path.startsWith('/api/member/') ? (hosted ? webOrigin : 'http://localhost:8083') : origin,
        'Content-Type': 'application/json',
      }),
      ...extra.headers,
    };
    for (const key of Object.keys(headers)) if (headers[key] === undefined) delete headers[key];
    const request = http.request({
      hostname: '127.0.0.1', port, path,
      method: extra.method || (data === undefined ? 'GET' : 'POST'), headers,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        let value = body.toString();
        if (response.headers['content-type']?.startsWith('application/json')) value = JSON.parse(value);
        resolve({ status: response.statusCode, headers: response.headers, data: value, buffer: body });
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
  const adminLogin = async (email = account.email) => {
    const anonymous = await call('/api/session');
    const result = await call('/api/login', { email, password, keepSignedIn: true }, { headers: { 'X-CSRF-Token': anonymous.data.csrf } });
    const cookie = result.headers['set-cookie']?.[0]?.split(';')[0] || '';
    const session = await call('/api/session', undefined, { headers: { Cookie: cookie } });
    return { ...result, cookie, csrf: session.data.csrf };
  };
  const member = async email => {
    const session = await call('/api/member/session');
    const headers = { 'X-CSRF-Token': session.data.csrf };
    assert.equal((await call('/api/member/signup', { name: 'Test Member', email, password, confirmPassword: password }, { headers })).status, 202);
    const messages = localMailbox ? localMailbox.rows() : sent;
    const message = messages.find(item => item.to === email);
    const token = new URL(message.text.match(/https?:\/\/[^\s]+/)[0]).searchParams.get('token');
    assert.equal((await call('/api/member/verify', { token }, { headers })).status, 200);
    const login = await call('/api/member/login', { email, password }, { headers });
    assert.equal(login.status, 200);
    return { ...login, cookie: login.headers['set-cookie'][0].split(';')[0], csrf: login.data.csrf };
  };
  return { ...app, call, member, adminLogin, sent, origin, localMailbox, runtime };
}

test('hosted configuration requires explicit HTTPS origins and persistent storage', () => {
  const config = runtimeConfig(hostedEnvironment);
  assert.equal(config.hosted, true);
  assert.equal(config.trustProxy, true);
  assert.equal(config.webOrigin, webOrigin);
  assert.equal(config.filename, '/tmp/unimate-test-config-only/unimate.sqlite');
  for (const change of [
    { UNIMATE_MODE: '' },
    { UNIMATE_DATA_DIR: '' },
    { UNIMATE_DATA_DIR: 'relative/data' },
    { UNIMATE_API_ORIGIN: '' },
    { UNIMATE_WEB_ORIGIN: '' },
    { UNIMATE_WEB_ORIGIN: 'http://app.example.invalid' },
    { UNIMATE_API_ORIGIN: 'https://user:password@api.example.invalid' },
    { UNIMATE_ADMIN_ORIGIN: adminOrigin + '/admin' },
    { UNIMATE_WEB_ORIGIN: webOrigin + '?anything=1' },
    { UNIMATE_WEB_ORIGIN: webOrigin + '#anything' },
    { UNIMATE_EXTRA_WEB_ORIGINS: 'https://*.example.invalid' },
    { PORT: 'not-a-port' },
    { RENDER_EXTERNAL_HOSTNAME: 'fake.onrender.com.attacker.invalid' },
  ]) assert.throws(() => runtimeConfig({ ...hostedEnvironment, ...change }), JSON.stringify(change));
  const local = runtimeConfig({});
  assert.equal(local.hosted, false);
  assert.equal(local.trustProxy, false);
  assert.equal(local.allowRegistration, false);
  assert.equal(runtimeConfig({ UNIMATE_TRUST_PROXY: '1' }).trustProxy, false);
});

test('forwarded addresses are ignored locally and only the final trusted proxy address is used', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.2' } };
  assert.equal(requestAddress(request), '127.0.0.1');
  assert.equal(requestAddress(request, true), '203.0.113.2');
  request.headers['x-forwarded-for'] = '203.0.113.2, forged-value';
  assert.equal(requestAddress(request, true), '127.0.0.1');
});

test('exact Host, Origin, HTTPS and member-only CORS checks apply before routing', async t => {
  const f = await fixture(t);
  for (const host of ['attacker.invalid', 'api.example.invalid.attacker.invalid', 'api.example.invalid:443']) {
    assert.equal((await f.call('/api/member/session', undefined, { headers: { Host: host } })).status, 403);
  }
  for (const origin of ['null', 'https://app.example.invalid.attacker.invalid', 'http://app.example.invalid', webOrigin + '/', webOrigin + ':443']) {
    const rejected = await f.call('/api/member/session', undefined, { headers: { Origin: origin } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers['access-control-allow-origin'], undefined);
  }
  const permitted = await f.call('/api/member/session', undefined, { headers: { Origin: webOrigin } });
  assert.equal(permitted.status, 200);
  assert.equal(permitted.headers['access-control-allow-origin'], webOrigin);
  assert.equal(permitted.headers['access-control-allow-credentials'], 'true');
  assert.equal(permitted.headers.vary, 'Origin');
  assert.match(permitted.headers['strict-transport-security'], /max-age=/);
  assert.equal((await f.call('/api/session', undefined, { headers: { Origin: webOrigin } })).status, 403);
  assert.equal((await f.call('/api/session', undefined, { headers: { Origin: apiOrigin, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await f.call('/api/member/session', undefined, { headers: { 'X-Forwarded-Proto': undefined } })).status, 403);
  assert.equal((await f.call('/api/member/session', undefined, { headers: { 'X-Forwarded-Proto': 'https,http' } })).status, 403);
  assert.equal((await f.call('/api/member/session', undefined, { method: 'DELETE' })).status, 405);
  const preflight = { Origin: webOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' };
  const success = await f.call('/api/member/login', undefined, { method: 'OPTIONS', headers: preflight });
  assert.equal(success.status, 204);
  assert.equal(success.headers['access-control-allow-origin'], webOrigin);
  for (const headers of [
    { ...preflight, Origin: 'https://attacker.invalid' },
    { ...preflight, 'Access-Control-Request-Method': 'DELETE' },
    { ...preflight, 'Access-Control-Request-Headers': 'authorization' },
  ]) assert.equal((await f.call('/api/member/login', undefined, { method: 'OPTIONS', headers })).status, 403);
  assert.equal((await f.call('/api/login', undefined, { method: 'OPTIONS', headers: { ...preflight, Origin: apiOrigin } })).status, 403);
});

test('dashboard CSP permits only the configured website for embedded account views and keeps attachment isolation', async t => {
  const f = await fixture(t);
  const response = await f.call('/');
  assert.equal(response.status, 200);
  const directives = Object.fromEntries(response.headers['content-security-policy'].split(';').map(part => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
  assert.deepEqual(directives, {
    'default-src': ["'self'"],
    'frame-src': ['https://app.example.invalid'],
    'script-src': ["'self'", "'wasm-unsafe-eval'"],
    'worker-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
  });
  assert.deepEqual(Object.entries(directives).filter(([, values]) => values.includes('blob:')).map(([name]) => name), ['img-src']);
});

test('hosted setup stays closed and health host exceptions reveal no accounts', async t => {
  const runtime = runtimeConfig({ ...hostedEnvironment, RENDER_EXTERNAL_HOSTNAME: 'unimate-test.onrender.com' });
  const f = await fixture(t, { runtime });
  const session = await f.call('/api/session');
  assert.equal(session.data.needsSetup, false);
  const attempted = await f.call('/api/setup', account, { headers: { 'X-CSRF-Token': session.data.csrf } });
  assert.equal(attempted.status, 403);
  assert.equal(f.db.prepare('SELECT count(*) n FROM admins').get().n, 0);
  const health = await f.call('/api/health', undefined, { headers: { Host: runtime.healthHost, 'X-Forwarded-Proto': undefined } });
  assert.equal(health.status, 200);
  assert.deepEqual(health.data, { ok: true, mode: 'hosted' });
  assert.equal((await f.call('/api/session', undefined, { headers: { Host: runtime.healthHost } })).status, 403);
});

test('private owner creation validates inputs, hashes credentials and cannot overwrite an existing account', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  for (const change of [{ email: 'invalid' }, { name: 'X' }, { password: 'Short!A', confirmPassword: 'Short!A' }, { confirmPassword: 'mismatch' }]) {
    await assert.rejects(() => createOwner(db, { ...account, ...change }));
  }
  assert.equal(db.prepare('SELECT count(*) n FROM admins').get().n, 0);
  await createOwner(db, { ...account, email: '  OWNER@example.invalid  ', name: ' Test Owner ' });
  const saved = db.prepare('SELECT * FROM admins').get();
  assert.equal(saved.role, 'owner');
  assert.equal(saved.email, account.email);
  assert.equal(saved.name, account.name);
  assert.equal(saved.active, 1);
  assert.notEqual(saved.password_hash, password);
  assert.equal(await verifyPassword(password, saved.password_hash), true);
  await assert.rejects(() => createOwner(db, { ...account, email: 'another@example.invalid' }), /already exist/);
  assert.deepEqual(db.prepare('SELECT * FROM admins').get(), saved);
  const logs = JSON.stringify(db.prepare('SELECT * FROM audit').all());
  assert.equal(logs.includes(password), false);
  assert.equal(logs.includes(saved.password_hash), false);
  assert.equal(db.prepare('SELECT count(*) n FROM admins').get().n, 1);
});

test('concurrent private setup can create only one owner', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const attempts = await Promise.allSettled([
    createOwner(db, account),
    createOwner(db, { ...account, email: 'second-owner@example.invalid' }),
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
  assert.equal(db.prepare('SELECT count(*) n FROM admins').get().n, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM audit WHERE action='owner.created'").get().n, 1);
});

test('hosted administrator and member sessions stay separate and require their own CSRF tokens', async t => {
  const f = await fixture(t);
  await createOwner(f.db, account);
  const admin = await f.adminLogin();
  assert.equal(admin.status, 200);
  assert.match(admin.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Path=\/; Max-Age=259(?:1999|2000); Secure/);
  const student = await f.member('student@example.invalid');
  assert.match(student.headers['set-cookie'][0], /HttpOnly; SameSite=Lax; Path=\/; Max-Age=604800; Secure/);
  assert.equal((await f.call('/api/users', undefined, { headers: { Cookie: student.cookie } })).status, 401);
  assert.equal((await f.call('/api/member/session', undefined, { headers: { Cookie: admin.cookie } })).data.user, null);
  assert.equal((await f.call('/api/session', undefined, { headers: { Cookie: student.cookie } })).data.admin, null);
  const memberMutation = { Cookie: student.cookie, 'X-CSRF-Token': admin.csrf };
  assert.equal((await f.call('/api/member/logout', {}, { headers: memberMutation })).status, 403);
  assert.equal((await f.call('/api/logout', {}, { headers: { Cookie: admin.cookie, 'X-CSRF-Token': student.csrf } })).status, 403);
  assert.equal((await f.call('/api/member/logout', {}, { headers: { Cookie: student.cookie, 'X-CSRF-Token': student.csrf, Origin: undefined } })).status, 403);
  const memberLogout = await f.call('/api/member/logout', {}, { headers: { Cookie: student.cookie, 'X-CSRF-Token': student.csrf } });
  assert.equal(memberLogout.status, 200);
  assert.match(memberLogout.headers['set-cookie'][0], /Max-Age=0; Secure/);
  assert.equal((await f.call('/api/overview', undefined, { headers: { Cookie: admin.cookie } })).status, 200);
  const adminLogout = await f.call('/api/logout', {}, { headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf } });
  assert.equal(adminLogout.status, 200);
  assert.match(adminLogout.headers['set-cookie'][0], /Max-Age=0; Secure/);
});

test('integrated booking routes cannot cross student ownership or inherit an additional admin cookie', async t => {
  const f = await fixture(t);
  await createOwner(f.db, account);
  const admin = await f.adminLogin();
  const first = await f.member('first@example.invalid');
  const second = await f.member('second@example.invalid');
  const payload = { service: 'cleaning', requestedDate: '2026-11-01', address: 'Fictional test address', notes: 'Integration test' };
  const created = await f.call('/api/member/bookings', { ...payload, userId: second.data.user.id }, { headers: { Cookie: first.cookie, 'X-CSRF-Token': first.csrf } });
  assert.equal(created.status, 201);
  const id = created.data.row.id;
  assert.equal(f.db.prepare('SELECT user_id FROM booking_owners WHERE booking_id=?').get(id).user_id, first.data.user.id);
  const detail = '/api/member/bookings/' + id;
  assert.equal((await f.call(detail, undefined, { headers: { Cookie: second.cookie } })).status, 404);
  assert.equal((await f.call(detail, undefined, { headers: { Cookie: `${second.cookie}; ${admin.cookie}` } })).status, 404);
  assert.equal((await f.call(detail, undefined, { headers: { Cookie: admin.cookie } })).status, 200);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6qjEAAAAASUVORK5CYII=';
  const photoPayload = { group: 'request', filename: 'test.png', mime: 'image/png', base64: png };
  assert.equal((await f.call(detail + '/photos', photoPayload, { headers: { Cookie: admin.cookie, 'X-CSRF-Token': first.csrf } })).status, 403);
  const upload = await f.call(detail + '/photos', photoPayload, { headers: { Cookie: first.cookie, 'X-CSRF-Token': first.csrf } });
  assert.equal(upload.status, 201);
  assert.equal((await f.call(upload.data.photo.url, undefined, { headers: { Cookie: second.cookie } })).status, 404);
  assert.equal((await f.call(upload.data.photo.url, undefined, { headers: { Cookie: first.cookie } })).status, 200);
  const adminPhoto = upload.data.photo.url.replace('/api/member/', '/api/');
  assert.equal((await f.call(adminPhoto, undefined, { headers: { Cookie: first.cookie } })).status, 401);
  assert.equal((await f.call(adminPhoto, undefined, { headers: { Cookie: admin.cookie } })).status, 200);
  assert.equal((await f.call(adminPhoto, undefined, { headers: { Cookie: admin.cookie, Origin: webOrigin } })).status, 403);
  f.db.prepare("UPDATE admins SET role='admin'").run();
  assert.equal((await f.call(detail, undefined, { headers: { Cookie: admin.cookie } })).status, 200);
  assert.equal((await f.call(adminPhoto, undefined, { headers: { Cookie: admin.cookie } })).status, 200);
  assert.equal((await f.call('/api/users', undefined, { headers: { Cookie: admin.cookie } })).status, 200);
});

test('local test mail is never exposed to members, unprivileged admins, other origins or hosted mode', async t => {
  const f = await fixture(t, { hosted: false, mailbox: true });
  await createOwner(f.db, account);
  const owner = await f.adminLogin();
  const student = await f.member('mail-test@example.invalid');
  assert.equal(student.data.mailMode, 'local');
  assert.equal((await f.call('/api/dev-mail')).status, 401);
  assert.equal((await f.call('/api/dev-mail', undefined, { headers: { Cookie: student.cookie } })).status, 401);
  assert.equal((await f.call('/test-mail')).status, 302);
  assert.equal((await f.call('/api/dev-mail', undefined, { headers: { Cookie: owner.cookie, Origin: 'http://localhost:8083' } })).status, 403);
  const messages = await f.call('/api/dev-mail', undefined, { headers: { Cookie: owner.cookie } });
  assert.equal(messages.status, 200);
  assert.equal(messages.data.rows.length, 1);
  assert.equal((await f.call('/api/session', undefined, { headers: { Cookie: owner.cookie } })).data.localMailbox, true);
  await f.localMailbox.send({ to: '<script>bad()</script>', subject: '<img src=x>', text: '<script>test()</script>' });
  const page = await f.call('/test-mail', undefined, { headers: { Cookie: owner.cookie } });
  assert.equal(page.status, 200);
  assert.ok(page.data.includes('&lt;script&gt;'));
  assert.ok(!page.data.includes('<script>'));
  f.db.prepare("UPDATE admins SET role='admin'").run();
  assert.equal((await f.call('/api/dev-mail', undefined, { headers: { Cookie: owner.cookie } })).status, 403);
  assert.equal((await f.call('/test-mail', undefined, { headers: { Cookie: owner.cookie } })).status, 403);
  await assert.rejects(() => createApplication({ filename: ':memory:', runtime: runtimeConfig(hostedEnvironment), localMailbox: f.localMailbox }), /cannot run in hosted mode/);
  assert.throws(() => createLocalMailbox(webOrigin), /localhost/);
});


test('demo custom admin root opens administration while same-origin account previews remain available', async t => {
  const webDirectory = mkdtempSync(join(tmpdir(), 'unimate-demo-web-'));
  t.after(() => rmSync(webDirectory, {recursive:true, force:true}));
  writeFileSync(join(webDirectory, 'index.html'), '<html>Demo frontend marker</html>');
  const f = await fixture(t, {demo:true, webDirectory});
  const headers = {Host:new URL(adminOrigin).host};
  const root = await f.call('/', undefined, {headers});
  assert.equal(root.status, 200);
  assert.ok(root.data.includes('app.js'));
  assert.ok(!root.data.includes('Demo frontend marker'));
  const preview = await f.call('/index.html', undefined, {headers});
  assert.equal(preview.status, 200);
  assert.ok(preview.data.includes('Demo frontend marker'));
  const session = await f.call('/api/session', undefined, {headers});
  assert.equal(session.data.webOrigin, adminOrigin);
  assert.equal(session.data.webPreviewUrl, adminOrigin+'/index.html');
  assert.equal((await f.call('/')).data, '<html>Demo frontend marker</html>');
});
