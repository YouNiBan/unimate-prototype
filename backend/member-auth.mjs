import {installStudentAccess,studentCapabilities} from './student-access.mjs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { audit, transaction } from './database.mjs';
import { digest, hashPassword, token, verifyPassword } from './security.mjs';
import {memberPasswordValid} from './public/member-password-policy.mjs';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_MS = 24 * 60 * 60 * 1000;
const RESET_MS = 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_MESSAGE = 'If this email can be registered, you will receive a confirmation link. Check your inbox before signing in.';
const RESET_MESSAGE = 'If an active account uses this email, you will receive a password reset link.';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

function equalToken(actual, expected) {
  return typeof actual === 'string' && typeof expected === 'string'
    && actual.length === expected.length
    && Buffer.byteLength(actual) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254) fail(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  return email;
}

function newPassword(data) {
  if (!memberPasswordValid(data.password)) {
    fail(400, 'Use 10–128 characters, including uppercase and lowercase letters, a number and a special character.');
  }
  if (data.confirmPassword !== data.password) fail(400, 'Passwords do not match.');
  return data.password;
}

async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON required.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) fail(413, 'Request too large.');
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error();
    return result;
  } catch { fail(400, 'Invalid request.'); }
}

function installSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_credentials(
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      password_hash TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS member_sessions(
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES member_credentials(user_id),
      csrf TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS member_sessions_user_idx ON member_sessions(user_id);
    CREATE INDEX IF NOT EXISTS member_sessions_expiry_idx ON member_sessions(expires);
    CREATE TABLE IF NOT EXISTS member_email_tokens(
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES member_credentials(user_id),
      purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
      expires INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS member_email_tokens_user_idx ON member_email_tokens(user_id,purpose);
    CREATE TABLE IF NOT EXISTS member_account_requests(user_id TEXT PRIMARY KEY REFERENCES users(id),account_type TEXT NOT NULL,service TEXT NOT NULL DEFAULT '',organisation TEXT NOT NULL DEFAULT '',approval_id TEXT REFERENCES approvals(id));
    CREATE TABLE IF NOT EXISTS member_rate_limits(
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      expires INTEGER NOT NULL
    );
  `);
}

// The caller owns exact-origin/CORS enforcement. Call this before admin auth,
// so a member session never grants access to an administrator endpoint.
export function createMemberAuth({
  db,
  secureCookies = false,
  publicWebOrigin = 'http://localhost:8083',
  sendMail = null,
  mailMode = 'smtp',
  allowRegistration = false,
}) {
  const website = new URL(publicWebOrigin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(website.hostname);
  if ((!local && website.protocol !== 'https:') || !['http:', 'https:'].includes(website.protocol)
    || website.username || website.password || website.pathname !== '/' || website.search || website.hash) {
    throw Error('publicWebOrigin must be an HTTPS origin, or a local development origin.');
  }
  installSchema(db);installStudentAccess(db);
  const mailAvailable = typeof sendMail === 'function';
  const registrationEnabled = allowRegistration === true && mailAvailable;
  const configured = true;
  const configuration = { configured, registrationEnabled, mailConfigured: mailAvailable, mailMode: mailAvailable && mailMode === 'local' ? 'local' : 'smtp' };
  const anonymousCsrf = token();
  // A nonexistent account still performs the same scrypt verification work.
  const dummyHash = `${token()}:${token()}${token()}`;
  let passwordChecks = 0;

  function memberUser(row) {
    if (!row || row.status !== 'active' || !row.verified_at) return null;
    const hasStaffLinks = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='staff_user_links'").get();
    const teams = hasStaffLinks ? db.prepare(`
      SELECT DISTINCT m.team FROM staff_user_links l
      JOIN team_members m ON m.id=l.member_id
      WHERE l.user_id=? AND m.status='active' AND m.team IN ('cleaners','drivers','movers')
      ORDER BY m.team
    `).all(row.id).map(item => item.team) : [];
    const request=db.prepare('SELECT r.account_type,a.status FROM member_account_requests r LEFT JOIN approvals a ON a.id=r.approval_id WHERE r.user_id=?').get(row.id);
    return { id: row.id, email: row.email, name: row.name, role: teams.length ? 'staff' : 'student', staffTeams: teams, ...studentCapabilities(db,row.id), ...(request && request.account_type!=='student'?{requestedAccountType:request.account_type,approvalStatus:request.status||'pending'}:{}) };
  }

  function authenticate(req) {
    const raw = /(?:^|;\s*)unimate_member=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!raw) return null;
    const tokenHash = digest(raw);
    const row = db.prepare(`
      SELECT u.id,u.name,u.email,u.status,c.verified_at,s.csrf,s.expires
      FROM member_sessions s JOIN member_credentials c ON c.user_id=s.user_id
      JOIN users u ON u.id=c.user_id WHERE s.token_hash=? AND s.expires>?
    `).get(tokenHash, Date.now());
    const user = memberUser(row);
    return user ? { user, csrf: row.csrf, tokenHash, expires: row.expires } : null;
  }

  function requireMutation(req, session) {
    if (!equalToken(req.headers['x-csrf-token'], session?.csrf || anonymousCsrf)) {
      fail(403, 'Session verification failed. Reload and try again.');
    }
  }

  function rateLimit(req, action, account = '', accountLimit = 10) {
    const now = Date.now();
    // Only a trusted server may set clientAddress after validating its proxy.
    const address = req.clientAddress || req.socket?.remoteAddress || 'unknown';
    const keys = [{ key: `${action}:ip:${digest(address)}`, limit: 100 }];
    if (account) keys.push({ key: `${action}:account:${digest(account)}`, limit: accountLimit });
    transaction(db, () => {
      db.prepare('DELETE FROM member_rate_limits WHERE expires<=?').run(now);
      if (keys.some(item => (db.prepare('SELECT count FROM member_rate_limits WHERE key=?').get(item.key)?.count || 0) >= item.limit)) {
        fail(429, 'Too many attempts. Try again in 15 minutes.');
      }
      for (const { key } of keys) db.prepare(`
        INSERT INTO member_rate_limits(key,count,expires) VALUES(?,1,?)
        ON CONFLICT(key) DO UPDATE SET count=count+1
      `).run(key, now + RATE_WINDOW_MS);
    });
  }

  async function passwordWork(work) {
    if (passwordChecks >= 2) fail(429, 'Please try again shortly.');
    passwordChecks++;
    try { return await work(); } finally { passwordChecks--; }
  }

  function setCookie(res, raw, clear = false) {
    res.setHeader('Set-Cookie', `unimate_member=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secureCookies ? '; Secure' : ''}`);
  }

  function reply(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }

  function currentCredential(email) {
    return db.prepare(`
      SELECT u.id,u.name,u.email,u.status,c.password_hash,c.verified_at
      FROM users u JOIN member_credentials c ON c.user_id=u.id
      WHERE lower(u.email)=?
    `).get(email);
  }

  async function deliverToken(user, purpose) {
    const raw = token();
    const tokenHash = digest(raw), now = Date.now();
    transaction(db, () => {
      db.prepare('UPDATE member_email_tokens SET consumed_at=? WHERE user_id=? AND purpose=? AND consumed_at IS NULL')
        .run(now, user.id, purpose);
      db.prepare('INSERT INTO member_email_tokens(token_hash,user_id,purpose,expires,consumed_at,created_at) VALUES(?,?,?,?,NULL,?)')
        .run(tokenHash, user.id, purpose, now + (purpose === 'verify' ? VERIFY_MS : RESET_MS), now);
    });
    const link = new URL('/', website);
    link.searchParams.set('member_action', purpose);
    link.searchParams.set('token', raw);
    const verification = purpose === 'verify';
    try {
      await sendMail({
        to: user.email,
        subject: verification ? 'Confirm your UniMate email' : 'Reset your UniMate password',
        text: verification
          ? `Confirm your email to finish creating your UniMate account:\n\n${link.href}\n\nThis link expires in 24 hours. Opening it does not confirm your account until you choose Confirm email. If you did not request an account, you can ignore this email.`
          : `Reset your UniMate password:\n\n${link.href}\n\nThis link expires in 1 hour. Your password will change only after you submit a new password. If you did not request this, you can ignore this email.`,
      });
    } catch {
      db.prepare('DELETE FROM member_email_tokens WHERE token_hash=? AND consumed_at IS NULL').run(tokenHash);
      // Keep the response indistinguishable from an unknown/ineligible email.
      // The unverified account can retry signup to request a fresh link.
      console.error('UniMate member email delivery failed.');
    }
  }

  function tokenRecord(raw, purpose) {
    if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) fail(400, 'This link is invalid or expired. Request a new one.');
    const row = db.prepare(`
      SELECT t.*,u.status,c.verified_at FROM member_email_tokens t
      JOIN member_credentials c ON c.user_id=t.user_id JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=? AND t.purpose=? AND t.consumed_at IS NULL AND t.expires>?
    `).get(digest(raw), purpose, Date.now());
    if (!row || row.status !== 'active' || (purpose === 'reset' && !row.verified_at)) {
      fail(400, 'This link is invalid or expired. Request a new one.');
    }
    return row;
  }

  async function handle(req, res, url) {
    const routes = new Set(['session', 'signup', 'login', 'logout', 'verify', 'forgot-password', 'reset-password']);
    const match = /^\/api\/member\/([^/]+)$/.exec(url.pathname);
    if (!match || !routes.has(match[1])) return false;
    try {
      const action = match[1];
      const session = authenticate(req);
      if (action === 'session') {
        if (req.method !== 'GET') fail(405, 'Method not allowed.');
        reply(res, 200, { user: session?.user || null, csrf: session?.csrf || anonymousCsrf, ...configuration });
        return true;
      }
      if (req.method !== 'POST') fail(405, 'Method not allowed.');
      requireMutation(req, session);
      const data = await readBody(req);
      if (action === 'signup') {
        if (!registrationEnabled) fail(503, 'Account registration is not available yet.');
        const email = emailAddress(data.email), password = newPassword(data);
        if (typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.length > 80) fail(400, 'Enter your name (2–80 characters).');
        const accountType=data.accountType||'student',service=data.service||'',organisation=typeof data.organisation==='string'?data.organisation.trim():'';
        if(!['student','staff','organisation','seller'].includes(accountType))fail(400,'Choose a valid account type.');
        if(accountType==='staff'&&!['cleaning','moving','airport_transfer'].includes(service))fail(400,'Choose your staff service.');
        if(accountType==='organisation'&&(organisation.length<2||organisation.length>120))fail(400,'Enter your organisation name (2–120 characters).');
        rateLimit(req, action, email, 5);
        // Never take a role, verification flag or account ID from signup input.
        const hashed = await passwordWork(() => hashPassword(password));
        let user;
        transaction(db, () => {
          const existing = db.prepare('SELECT id,name,email,status FROM users WHERE lower(email)=?').get(email);
          if (existing) {
            const credential = db.prepare('SELECT verified_at FROM member_credentials WHERE user_id=?').get(existing.id);
            if (credential && !credential.verified_at && existing.status === 'active') {
              // A renewed signup must use the password entered for that request.
              // Previously emailed confirmation links are replaced below.
              db.prepare('UPDATE member_credentials SET password_hash=? WHERE user_id=?').run(hashed, existing.id);
              db.prepare('INSERT INTO member_account_requests(user_id,account_type,service,organisation) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET account_type=excluded.account_type,service=excluded.service,organisation=excluded.organisation').run(existing.id,accountType,accountType==='staff'?service:'',accountType==='organisation'?organisation:'');
              user = existing;
            }
            return;
          }
          const id = randomUUID(), createdAt = new Date().toISOString();
          db.prepare('INSERT INTO users(id,name,email,kind,status,created_at) VALUES(?,?,?,?,?,?)')
            .run(id, data.name.trim(), email, 'student', 'active', createdAt);
          db.prepare('INSERT INTO member_credentials(user_id,password_hash,verified_at,created_at) VALUES(?,?,NULL,?)')
            .run(id, hashed, createdAt);
          db.prepare('INSERT INTO member_account_requests(user_id,account_type,service,organisation) VALUES(?,?,?,?)').run(id,accountType,accountType==='staff'?service:'',accountType==='organisation'?organisation:'');
          audit(db, null, 'member.registered', 'users', id, null, null, 'Unverified member registration');
          user = { id, name: data.name.trim(), email };
        });
        if (user) await deliverToken(user, 'verify');
        reply(res, 202, { ok: true, message: SIGNUP_MESSAGE, needsConfirmation: true });
      } else if (action === 'login') {
        const email = emailAddress(data.email);
        if (typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 128) fail(401, 'Email or password is incorrect, or your email has not been confirmed.');
        rateLimit(req, action, email, 10);
        const before = currentCredential(email);
        const valid = await passwordWork(async () => {
          try { return await verifyPassword(data.password, before?.password_hash || dummyHash); } catch { return false; }
        });
        let user, csrf, raw;
        transaction(db, () => {
          const live = currentCredential(email);
          user = memberUser(live);
          if (!valid || !user || live.password_hash !== before?.password_hash) fail(401, 'Email or password is incorrect, or your email has not been confirmed.');
          raw = token(); csrf = token();
          db.prepare('DELETE FROM member_sessions WHERE expires<=?').run(Date.now());
          db.prepare('INSERT INTO member_sessions(token_hash,user_id,csrf,expires) VALUES(?,?,?,?)')
            .run(digest(raw), user.id, csrf, Date.now() + SESSION_MS);
          db.prepare('DELETE FROM member_rate_limits WHERE key=?').run(`login:account:${digest(email)}`);
          audit(db, { id: user.id, name: user.name }, 'member.login', 'users', user.id, null, null, 'Member signed in');
        });
        setCookie(res, raw);
        reply(res, 200, { user, csrf, ...configuration });
      } else if (action === 'logout') {
        if (session) {
          transaction(db, () => {
            db.prepare('DELETE FROM member_sessions WHERE token_hash=?').run(session.tokenHash);
            audit(db, { id: session.user.id, name: session.user.name }, 'member.logout', 'users', session.user.id, null, null, 'Member signed out');
          });
        }
        setCookie(res, '', true);
        reply(res, 200, { ok: true });
      } else if (action === 'verify') {
        rateLimit(req, action);
        transaction(db, () => {
          const record = tokenRecord(data.token, 'verify'), now = Date.now();
          db.prepare('UPDATE member_email_tokens SET consumed_at=? WHERE user_id=? AND purpose=? AND consumed_at IS NULL')
            .run(now, record.user_id, 'verify');
          db.prepare('UPDATE member_credentials SET verified_at=COALESCE(verified_at,?) WHERE user_id=?')
            .run(new Date(now).toISOString(), record.user_id);
          const request=db.prepare('SELECT r.*,u.name,u.email FROM member_account_requests r JOIN users u ON u.id=r.user_id WHERE r.user_id=?').get(record.user_id);
          if(request&&request.account_type!=='student'&&!request.approval_id){
            const id=randomUUID(),kind=request.account_type;
            db.prepare("INSERT INTO approvals VALUES(?,?,?,?,?,'pending',?)").run(id,kind+' signup · '+request.name,kind,request.name,JSON.stringify({userId:request.user_id,name:request.name,email:request.email,service:request.service,organisation:request.organisation}),new Date(now).toISOString());
            if(kind==='staff')db.prepare('INSERT INTO staff_applications VALUES(?,?,?,?,?,NULL)').run(id,request.name,request.email,request.service,({cleaning:'Cleaner',moving:'Mover',airport_transfer:'Driver'})[request.service]);
            db.prepare('UPDATE member_account_requests SET approval_id=? WHERE user_id=?').run(id,request.user_id);
          }
          audit(db, null, 'member.email_verified', 'users', record.user_id, null, null, 'Member confirmed their email');
        });
        reply(res, 200, { ok: true, message: 'Email confirmed. You can now sign in.' });
      } else if (action === 'forgot-password') {
        if (!mailAvailable) fail(503, 'Account email services are not available yet.');
        const email = emailAddress(data.email);
        rateLimit(req, action, email, 5);
        const user = currentCredential(email);
        if (memberUser(user)) await deliverToken(user, 'reset');
        reply(res, 202, { ok: true, message: RESET_MESSAGE });
      } else if (action === 'reset-password') {
        const password = newPassword(data);
        rateLimit(req, action);
        tokenRecord(data.token, 'reset');
        const hashed = await passwordWork(() => hashPassword(password));
        transaction(db, () => {
          const record = tokenRecord(data.token, 'reset');
          db.prepare('UPDATE member_credentials SET password_hash=? WHERE user_id=?').run(hashed, record.user_id);
          db.prepare('UPDATE member_email_tokens SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL').run(Date.now(), record.user_id);
          db.prepare('DELETE FROM member_sessions WHERE user_id=?').run(record.user_id);
          audit(db, null, 'member.password_reset', 'users', record.user_id, null, null, 'Password reset; member sessions revoked');
        });
        setCookie(res, '', true);
        reply(res, 200, { ok: true, message: 'Password updated. Sign in with your new password.' });
      }
    } catch (error) {
      if (!res.headersSent) reply(res, error.status || 500, { error: error.status ? error.message : 'Account request could not be completed.' });
      else res.end();
    }
    return true;
  }

  return { handle, authenticate, requireMutation, configured };
}
