import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDatabase } from '../database.mjs';
import { createMemberAuth } from '../member-auth.mjs';
import { digest } from '../security.mjs';

const password = 'Example-Password!123';
const replacement = 'Another-Password!456';

async function fixture(t, options = {}) {
  const db = openDatabase(':memory:');
  const sent = [];
  const auth = createMemberAuth({
    db, allowRegistration: true, secureCookies: true,
    publicWebOrigin: 'https://hellounimate.com',
    sendMail: async message => { sent.push(message); },
    ...options,
  });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (await auth.handle(req, res, url)) return;
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (action, data, { cookie = '', csrf, method } = {}) => {
    const response = await fetch(`${origin}/api/member/${action}`, {
      method: method || (data === undefined ? 'GET' : 'POST'),
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf !== undefined ? { 'X-CSRF-Token': csrf } : {}),
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const anonymous = await call('session');
  const csrf = anonymous.data.csrf;
  const signup = (email, extra = {}) => call('signup', { email, name: 'Example Student', password, confirmPassword: password, ...extra }, { csrf });
  const mailToken = (index = sent.length - 1) => new URL(sent[index].text.match(/https:\/\/[^\s]+/)[0]).searchParams.get('token');
  const verify = (raw = mailToken()) => call('verify', { token: raw }, { csrf });
  const login = async (email, value = password) => {
    const response = await call('login', { email, password: value }, { csrf });
    return { ...response, cookie: response.headers.get('set-cookie')?.split(';')[0] || '', csrf: response.data.csrf };
  };
  return { db, auth, sent, call, csrf, anonymous, signup, mailToken, verify, login };
}

test('registration stays closed without mail or explicit enablement and creates no accounts', async t => {
  for (const options of [{ sendMail: null }, { allowRegistration: false }]) {
    await t.test(JSON.stringify(options), async t => {
      const f = await fixture(t, options);
      assert.equal(f.anonymous.data.configured, true);
      assert.equal(f.anonymous.data.registrationEnabled, false);
      assert.equal(f.anonymous.data.mailConfigured, options.sendMail !== null);
      assert.equal((await f.signup('new@example.invalid')).status, 503);
      assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 0);
      assert.equal(f.sent.length, 0);
    });
  }
});

test('local mail mode is exposed only when the injected local sender is configured', async t => {
  for (const options of [{}, { mailMode: 'local' }, { mailMode: 'local', sendMail: null }]) {
    await t.test(JSON.stringify(options), async t => {
      const f = await fixture(t, options);
      assert.equal(f.anonymous.data.mailMode, options.mailMode === 'local' && options.sendMail !== null ? 'local' : 'smtp');
    });
  }
});

test('email confirmation is explicit, single-use and cannot grant client-supplied roles', async t => {
  const f = await fixture(t);
  assert.equal(f.anonymous.data.user, null);
  assert.equal(f.anonymous.data.registrationEnabled, true);
  assert.equal((await f.call('signup', { email: 'member@example.invalid', name: 'Member', password, confirmPassword: password })).status, 403);
  assert.equal((await f.signup(' MEMBER@example.invalid ', { role: 'owner', kind: 'staff_cleaning', verified_at: '2026-01-01', staffTeams: ['office'] })).status, 202);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, 'member@example.invalid');
  assert.match(f.sent[0].text, /https:\/\/hellounimate.com\/\?member_action=verify&token=/);
  const raw = f.mailToken();
  const saved = f.db.prepare('SELECT * FROM member_email_tokens').get();
  assert.equal(saved.token_hash, digest(raw));
  assert.ok(!JSON.stringify(saved).includes(raw));
  const credential = f.db.prepare('SELECT * FROM member_credentials').get();
  assert.notEqual(credential.password_hash, password);
  assert.equal(credential.verified_at, null);
  assert.equal((await f.login('member@example.invalid')).status, 401);
  assert.equal((await f.call('verify', undefined)).status, 405);
  assert.equal((await f.call('verify', { token: raw }, { csrf: 'not-a-csrf-token' })).status, 403);
  assert.equal((await f.verify(raw)).status, 200);
  assert.equal((await f.verify(raw)).status, 400);
  const login = await f.login('member@example.invalid');
  assert.equal(login.status, 200);
  assert.deepEqual(Object.keys(login.data.user).sort(), ['badge','email','id','name','permissions','profileComplete','role','staffTeams','studentVerified']);
  assert.equal(login.data.user.role, 'student');
  assert.deepEqual(login.data.user.staffTeams, []);
  assert.equal(f.db.prepare('SELECT kind FROM users').get().kind, 'student');
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
  assert.match(login.headers.get('set-cookie'), /Secure/);
  assert.equal(f.db.prepare('SELECT token_hash FROM member_sessions').get().token_hash, digest(login.cookie.split('=')[1]));
  assert.ok(!JSON.stringify(login.data).includes('password_hash'));
  assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM audit').all()).includes(password));
});

test('expired and superseded verification links fail and signup retries use the current password', async t => {
  const f = await fixture(t);
  await f.signup('retry@example.invalid');
  const original = f.mailToken();
  await f.signup('retry@example.invalid', { password: replacement, confirmPassword: replacement });
  assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 1);
  assert.equal((await f.verify(original)).status, 400);
  const renewed = f.mailToken();
  f.db.prepare('UPDATE member_email_tokens SET expires=? WHERE token_hash=?').run(Date.now() - 1, digest(renewed));
  assert.equal((await f.verify(renewed)).status, 400);
  await f.signup('retry@example.invalid', { password: replacement, confirmPassword: replacement });
  assert.equal((await f.verify()).status, 200);
  assert.equal((await f.login('retry@example.invalid', password)).status, 401);
  assert.equal((await f.login('retry@example.invalid', replacement)).status, 200);
});

test('signup never claims a legacy account and existing-account responses do not enumerate accounts', async t => {
  const f = await fixture(t);
  f.db.prepare('INSERT INTO users(id,name,email,kind,status,created_at) VALUES(?,?,?,?,?,?)')
    .run('legacy', 'Existing Person', 'legacy@example.invalid', 'staff_cleaning', 'active', new Date().toISOString());
  const legacy = await f.signup('legacy@example.invalid');
  assert.equal(legacy.status, 202);
  assert.equal(f.sent.length, 0);
  assert.equal(f.db.prepare("SELECT * FROM member_credentials WHERE user_id='legacy'").get(), undefined);
  assert.equal(f.db.prepare("SELECT name FROM users WHERE id='legacy'").get().name, 'Existing Person');
  const fresh = await f.signup('fresh@example.invalid');
  await f.verify();
  const duplicate = await f.signup('fresh@example.invalid', { password: replacement, confirmPassword: replacement });
  assert.deepEqual(legacy.data, fresh.data);
  assert.deepEqual(duplicate.data, fresh.data);
  assert.equal(f.sent.length, 1);
  assert.equal((await f.login('fresh@example.invalid', password)).status, 200);
  assert.equal((await f.login('fresh@example.invalid', replacement)).status, 401);
});

test('member sessions are isolated, staff role requires an active trusted link, and suspension revokes access', async t => {
  const f = await fixture(t);
  for (const email of ['one@example.invalid', 'two@example.invalid']) {
    await f.signup(email); await f.verify();
  }
  const one = await f.login('one@example.invalid'), two = await f.login('two@example.invalid');
  assert.notEqual(one.data.user.id, two.data.user.id);
  assert.notEqual(one.csrf, two.csrf);
  assert.equal((await f.call('session', undefined, { cookie: one.cookie })).data.user.id, one.data.user.id);
  assert.equal((await f.call('session', undefined, { cookie: two.cookie })).data.user.id, two.data.user.id);
  assert.equal((await f.call('logout', {}, { cookie: one.cookie, csrf: two.csrf })).status, 403);
  assert.equal((await f.call('logout', {}, { cookie: one.cookie, csrf: 'é'.repeat(64) })).status, 403);
  f.db.exec('CREATE TABLE staff_user_links(member_id TEXT PRIMARY KEY REFERENCES team_members(id),user_id TEXT NOT NULL REFERENCES users(id))');
  f.db.prepare('INSERT INTO team_members(id,team,name,email,status,created_at) VALUES(?,?,?,?,?,?)')
    .run('cleaner', 'cleaners', 'Example Staff', 'one@example.invalid', 'active', new Date().toISOString());
  f.db.prepare('INSERT INTO staff_user_links(member_id,user_id) VALUES(?,?)').run('cleaner', one.data.user.id);
  const staff = (await f.call('session', undefined, { cookie: one.cookie })).data.user;
  assert.equal(staff.role, 'staff');
  assert.deepEqual(staff.staffTeams, ['cleaners']);
  f.db.prepare("UPDATE team_members SET status='deactivated' WHERE id='cleaner'").run();
  assert.equal((await f.call('session', undefined, { cookie: one.cookie })).data.user.role, 'student');
  f.db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(one.data.user.id);
  assert.equal((await f.call('session', undefined, { cookie: one.cookie })).data.user, null);
  assert.equal((await f.login('one@example.invalid')).status, 401);
  assert.equal((await f.call('logout', {}, { cookie: two.cookie, csrf: two.csrf })).status, 200);
  assert.equal((await f.call('session', undefined, { cookie: two.cookie })).data.user, null);
});

test('password recovery is single-use, expires, revokes all sessions and cannot affect another user', async t => {
  const f = await fixture(t);
  for (const email of ['reset@example.invalid', 'other@example.invalid']) {
    await f.signup(email); await f.verify();
  }
  const first = await f.login('reset@example.invalid'), second = await f.login('reset@example.invalid');
  const other = await f.login('other@example.invalid');
  const count = f.sent.length;
  const unknown = await f.call('forgot-password', { email: 'unknown@example.invalid' }, { csrf: f.csrf });
  assert.equal(f.sent.length, count);
  const known = await f.call('forgot-password', { email: 'reset@example.invalid' }, { csrf: f.csrf });
  assert.deepEqual(unknown.data, known.data);
  assert.match(f.sent.at(-1).text, /\?member_action=reset&token=/);
  const expired = f.mailToken();
  f.db.prepare('UPDATE member_email_tokens SET expires=? WHERE token_hash=?').run(Date.now() - 1, digest(expired));
  const reset = raw => f.call('reset-password', { token: raw, password: replacement, confirmPassword: replacement, userId: other.data.user.id }, { csrf: f.csrf });
  assert.equal((await reset(expired)).status, 400);
  await f.call('forgot-password', { email: 'reset@example.invalid' }, { csrf: f.csrf });
  const raw = f.mailToken();
  assert.equal((await f.call('reset-password', undefined)).status, 405);
  assert.equal((await reset(raw)).status, 200);
  assert.equal((await reset(raw)).status, 400);
  for (const login of [first, second]) assert.equal((await f.call('session', undefined, { cookie: login.cookie })).data.user, null);
  assert.equal((await f.call('session', undefined, { cookie: other.cookie })).data.user.id, other.data.user.id);
  assert.equal((await f.login('reset@example.invalid')).status, 401);
  assert.equal((await f.login('reset@example.invalid', replacement)).status, 200);
  assert.equal((await f.login('other@example.invalid')).status, 200);
  const audit = JSON.stringify(f.db.prepare('SELECT * FROM audit').all());
  assert.ok(!audit.includes(raw));
  assert.ok(!audit.includes(replacement));
});

test('expired member sessions fail and login limits persist across auth instances', async t => {
  const f = await fixture(t);
  await f.signup('limited@example.invalid'); await f.verify();
  const login = await f.login('limited@example.invalid');
  f.db.prepare('UPDATE member_sessions SET expires=?').run(Date.now() - 1);
  assert.equal((await f.call('session', undefined, { cookie: login.cookie })).data.user, null);
  const key = `login:account:${digest('limited@example.invalid')}`;
  f.db.prepare('INSERT INTO member_rate_limits(key,count,expires) VALUES(?,?,?)').run(key, 10, Date.now() + 60_000);
  assert.equal((await f.login('limited@example.invalid')).status, 429);
  const restarted = createMemberAuth({ db: f.db });
  assert.equal(restarted.authenticate({ headers: { cookie: login.cookie } }), null);
  assert.equal(f.db.prepare('SELECT count FROM member_rate_limits WHERE key=?').get(key).count, 10);
  f.db.prepare('UPDATE member_rate_limits SET expires=?').run(Date.now() - 1);
  assert.equal((await f.login('limited@example.invalid')).status, 200);
});

test('input validation, method boundaries and configured origins are bounded', async t => {
  const f = await fixture(t);
  for (const extra of [
    { email: 'invalid' }, { email: 'x'.repeat(255) }, { name: 'x' }, { name: 'x'.repeat(81) },
    { password: 'short', confirmPassword: 'short' }, { confirmPassword: 'mismatch' },
  ]) assert.equal((await f.signup('valid@example.invalid', extra)).status, 400);
  assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 0);
  assert.equal((await f.call('signup', { name: 'x'.repeat(17000) }, { csrf: f.csrf })).status, 413);
  assert.equal((await f.call('session', {}, { csrf: f.csrf })).status, 405);
  for (const value of ['http://untrusted.example', 'https://example.com/path', 'https://example.com/?next=https://other.invalid', 'https://user:pass@example.com']) {
    assert.throws(() => createMemberAuth({ db: f.db, publicWebOrigin: value }), /publicWebOrigin/);
  }
  assert.equal(await f.auth.handle({ headers: {} }, {}, new URL('https://example.invalid/api/bookings')), false);
});

test('account choices queue verified staff, seller and organisation requests without granting roles',async t=>{
 const f=await fixture(t);
 for(const [accountType,extra] of [['staff',{service:'cleaning'}],['seller',{}],['organisation',{organisation:'Example Society'}]]){
  const email=accountType+'@example.invalid';assert.equal((await f.signup(email,{accountType,...extra})).status,202);
  assert.equal(f.db.prepare('SELECT count(*) n FROM approvals WHERE kind=?').get(accountType).n,0);
  assert.equal((await f.verify()).status,200);
  const user=(await f.login(email)).data.user;assert.equal(user.role,'student');assert.equal(user.requestedAccountType,accountType);assert.equal(user.approvalStatus,'pending');
  assert.equal(f.db.prepare("SELECT count(*) n FROM approvals WHERE kind=? AND status='pending'").get(accountType).n,1);
 }
 assert.equal(f.db.prepare('SELECT count(*) n FROM staff_applications').get().n,1);
 assert.equal(f.db.prepare('SELECT count(*) n FROM team_members').get().n,0);
 assert.equal((await f.signup('owner-choice@example.invalid',{accountType:'owner'})).status,400);
 assert.equal((await f.signup('bad-team@example.invalid',{accountType:'staff',service:'admin'})).status,400);
});
