import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Stripe from 'stripe';
import { createApplication } from '../server.mjs';
import { digest, token } from '../security.mjs';

// This SDK instance is used only for local signature generation/verification.
// Checkout methods below are offline fakes; no provider HTTP calls are made.
const sdk = new Stripe('sk_test_OfflineServerBoundaryTests');
const signingSecret = 'whsec_OfflineServerBoundaryTests';
const webOrigin = 'http://localhost:8083';
async function fixture(t, { disabled = false, legacy = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'unimate-payment-boundary-')), filename = join(directory, 'test.sqlite');
  const identities = {}, calls = [], now = new Date().toISOString();
  if (legacy) {
    const old = new DatabaseSync(filename);
    old.exec(`CREATE TABLE admins(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','superadmin','admin','moderator','viewer')),active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admins(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);`);
    for (const role of ['owner', 'moderator', 'viewer']) {
      old.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role, `${role}@example.invalid`, role, 'unused-hash', role);
      const raw = token(), csrf = token();
      old.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(raw), role, csrf, Date.now() + 600000);
      identities[role] = { cookie: `unimate_admin=${raw}`, csrf };
    }
    old.close();
  }
  const sessions = new Map();
  const fake = {
    webhooks: sdk.webhooks,
    checkout: { sessions: {
      async create(parameters, options) {
        calls.push({ parameters: structuredClone(parameters), options });
        if (sessions.has(options.idempotencyKey)) return structuredClone(sessions.get(options.idempotencyKey));
        const session = {
          id: 'cs_test_' + options.idempotencyKey.replaceAll('-', ''), livemode: false, mode: 'payment',
          amount_total: parameters.line_items[0].price_data.unit_amount, currency: 'gbp', status: 'open', payment_status: 'unpaid',
          client_reference_id: parameters.client_reference_id, metadata: structuredClone(parameters.metadata),
          url: 'https://checkout.stripe.com/c/pay/testboundary',
        };
        sessions.set(options.idempotencyKey, session); return structuredClone(session);
      },
      async retrieve(id) { return structuredClone([...sessions.values()].find(row => row.id === id)); },
    } },
  };
  const application = await createApplication({ filename, mediaDirectory: join(directory, 'media'),
    stripe: disabled ? null : fake, stripeWebhookSecret: disabled ? null : signingSecret });
  const db = application.db;
  for (const role of ['owner', 'superadmin', 'support', 'admin', 'viewer']) {
    if (identities[role]) continue;
    db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role, `${role}@example.invalid`, role, 'unused-admin-secret-hash', role);
    const raw = token(), csrf = token();
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(raw), role, csrf, Date.now() + 600000);
    identities[role] = { cookie: `unimate_admin=${raw}`, csrf };
  }
  for (const id of ['student-a', 'student-b', 'staff']) {
    db.prepare("INSERT INTO users VALUES(?,?,?,'student','active',?)").run(id, id, `${id}@example.invalid`, now);
    db.prepare('INSERT INTO member_credentials VALUES(?,?,?,?)').run(id, 'unused-member-secret-hash', now, now);
    const raw = token(), csrf = token();
    db.prepare('INSERT INTO member_sessions VALUES(?,?,?,?)').run(digest(raw), id, csrf, Date.now() + 600000);
    identities[id] = { cookie: `unimate_member=${raw}`, csrf };
  }
  db.prepare("INSERT INTO bookings VALUES('booking-a','Test booking','student-a','cleaning','confirmed',12500,?)").run(now);
  db.prepare("INSERT INTO booking_owners VALUES('booking-a','student-a')").run();
  db.prepare("INSERT INTO booking_pricing VALUES('booking-a','confirmed')").run();
  db.prepare("INSERT INTO team_members VALUES('cleaner','cleaners','Staff','staff@example.invalid','active',?)").run(now);
  db.prepare("INSERT INTO staff_user_links VALUES('cleaner','staff')").run();
  db.prepare("INSERT INTO booking_assignments VALUES('booking-a','cleaner',?,?)").run(now, now);
  await new Promise(resolve => application.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${application.server.address().port}`;
  t.after(async () => { await new Promise(resolve => application.server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); });
  async function call(path, { data, raw, who = null, originHeader, headers = {}, method } = {}) {
    const identity = typeof who === 'object' && who ? who : identities[who] || {};
    const hasBody = data !== undefined || raw !== undefined;
    const response = await fetch(origin + path, {
      method: method || (hasBody ? 'POST' : 'GET'),
      headers: {
        ...(identity.cookie ? { Cookie: identity.cookie } : {}),
        ...(hasBody ? { 'Content-Type': 'application/json', 'X-CSRF-Token': identity.csrf || '' } : {}),
        ...(originHeader ? { Origin: originHeader === 'server' ? origin : originHeader } : {}), ...headers,
      },
      body: raw === undefined ? data === undefined ? undefined : JSON.stringify(data) : raw,
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  function event(id = 'evt_boundary', extra = {}) {
    return { id, type: 'test.boundary', livemode: false, data: { object: {} }, ...extra };
  }
  async function sendEvent(value, options = {}) {
    const payload = JSON.stringify(value);
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
    return call('/api/payments/stripe-webhook', { raw: payload, ...options, headers: { 'Stripe-Signature': signature, ...options.headers } });
  }
  return { db, calls, identities, call, event, sendEvent };
}

test('server permits only the exact no-Origin webhook route and requires a valid raw-body signature there', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/payments/stripe-webhook', { data: f.event() })).status, 400);
  assert.equal((await f.sendEvent(f.event(), { headers: { 'Stripe-Signature': 't=1,v1=forged' } })).status, 400);
  const payload = JSON.stringify(f.event());
  const stale = sdk.webhooks.generateTestHeaderString({ payload, secret: signingSecret, timestamp: Math.floor(Date.now() / 1000) - 1000 });
  assert.equal((await f.sendEvent(f.event(), { headers: { 'Stripe-Signature': stale } })).status, 400);
  assert.equal(f.db.prepare('SELECT count(*) n FROM stripe_payment_events').get().n, 0);
  const valid = await f.sendEvent(f.event());
  assert.equal(valid.status, 200); assert.equal(valid.data.ignored, true);
  assert.equal((await f.sendEvent(f.event())).data.duplicate, true);
  assert.equal(f.db.prepare('SELECT count(*) n FROM stripe_payment_events').get().n, 1);
  assert.equal((await f.sendEvent(f.event('evt_live', { livemode: true }))).status, 400);
  assert.equal((await f.sendEvent(f.event('evt_foreign', { account: 'acct_foreign' }))).status, 400);
  assert.equal((await f.sendEvent(f.event('evt_cross'), { originHeader: 'https://untrusted.example' })).status, 403);
  assert.equal((await f.sendEvent(f.event('evt_browser'), { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 403);
  assert.equal((await f.sendEvent(f.event('evt_crossbrowser'), { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
  assert.equal((await f.call('/api/payments/stripe-webhook', { raw: payload + ' ', headers: { 'Stripe-Signature': signature } })).status, 400);
  for (const path of ['/api/login', '/api/setup', '/api/member/login', '/api/member/bookings', '/api/member/bookings/booking-a/checkout',
    '/api/payments', '/api/payments/stripe-webhook/', '/api/payments/stripe-webhook-copy', '/api/payments/%73tripe-webhook',
    '/api/support', '/api/staff-invoices/booking-a/review-work']) {
    assert.equal((await f.call(path, { data: {}, who: 'owner', headers: { 'Stripe-Signature': signature } })).status, 403, path);
  }
  assert.equal(f.calls.length, 0);
});

test('disabled server config exposes readiness without keys or checkout creation', async t => {
  const f = await fixture(t, { disabled: true });
  assert.equal((await f.call('/api/member/payments/config')).status, 401);
  assert.equal((await f.call('/api/member/payments/config', { who: 'owner' })).status, 401);
  const config = await f.call('/api/member/payments/config', { who: 'student-a', originHeader: webOrigin });
  assert.equal(config.status, 200); assert.equal(config.headers.get('access-control-allow-origin'), webOrigin);
  assert.deepEqual(config.data, { enabled: false, mode: 'disabled', supportedKinds: ['booking'] });
  const overview = await f.call('/api/payments', { who: 'owner' });
  assert.equal(overview.status, 200); assert.equal(overview.data.enabled, false); assert.equal(overview.data.mode, 'disabled');
  assert.deepEqual(overview.data.rows, []);
  assert.equal((await f.call('/api/member/bookings/booking-a/checkout', { who: 'student-a', originHeader: webOrigin, data: { amountPence: 1 } })).status, 503);
  assert.equal((await f.sendEvent(f.event())).status, 503);
  assert.equal(f.calls.length, 0); assert.equal(f.db.prepare('SELECT count(*) n FROM stripe_payment_orders').get().n, 0);
  for (const value of [config.data, overview.data]) for (const secret of ['secret', 'whsec_', 'sk_test_', 'rk_test_', 'unused-admin', 'unused-member']) {
    assert.equal(JSON.stringify(value).includes(secret), false, secret);
  }
});

test('integrated checkout respects member ownership, CSRF and mixed cookies, and webhook alone confirms payment', async t => {
  const f = await fixture(t);
  for (const who of ['student-b', 'staff']) {
    assert.equal((await f.call('/api/member/bookings/booking-a/payment', { who })).status, 404);
    assert.equal((await f.call('/api/member/bookings/booking-a/checkout', { who, data: {}, originHeader: webOrigin })).status, 404);
  }
  assert.equal((await f.call('/api/member/bookings/booking-a/checkout', { who: 'owner', data: {}, originHeader: webOrigin })).status, 401);
  assert.equal((await f.call('/api/member/bookings/booking-a/checkout', { who: 'student-a', data: {}, originHeader: webOrigin, headers: { 'X-CSRF-Token': f.identities.owner.csrf } })).status, 403);
  const both = { ...f.identities['student-a'], cookie: `${f.identities.owner.cookie}; ${f.identities['student-a'].cookie}` };
  const checkout = await f.call('/api/member/bookings/booking-a/checkout', { who: both, data: { amountPence: 1, status: 'paid' }, originHeader: webOrigin });
  assert.equal(checkout.status, 200); assert.equal(f.calls[0].parameters.line_items[0].price_data.unit_amount, 12500);
  assert.equal((await f.call('/api/member/bookings/booking-a/payment?payment=success&paid=true', { who: both })).data.payment.status, 'open');
  const stored = f.db.prepare('SELECT * FROM stripe_payment_orders').get();
  const session = {
    id: stored.session_id, mode: 'payment', livemode: false, amount_total: stored.amount_pence,
    currency: stored.currency, client_reference_id: stored.id, metadata: JSON.parse(stored.parameters_json).metadata,
    payment_status: 'paid', status: 'complete',
  };
  assert.equal((await f.sendEvent(f.event('evt_paid', { type: 'checkout.session.completed', data: { object: session } }))).status, 200);
  assert.equal((await f.call('/api/member/bookings/booking-a/payment', { who: both })).data.payment.status, 'paid');
  assert.equal((await f.call('/api/member/bookings/booking-a/checkout', { who: both, data: {}, originHeader: webOrigin })).status, 409);
  const adminBoth = { ...f.identities.owner, cookie: `${f.identities.owner.cookie}; ${f.identities['student-b'].cookie}` };
  assert.equal((await f.call('/api/payments', { who: adminBoth })).data.rows[0].amountPence, 12500);
  assert.equal((await f.call('/api/bookings/booking-a/quote', { who: 'owner', originHeader: 'server', data: { amountPence: 1, expectedStatus: 'confirmed', reason: 'A paid quote cannot be changed.' } })).status, 409);
});

test('support retains only inbox and account access and cannot inspect finance, bookings or oversight', async t => {
  const f = await fixture(t);
  const created = await f.call('/api/member/support', { who: 'student-a', originHeader: webOrigin,
    data: { subject: 'Test support', category: 'general', body: 'A local test question.', clientId: '1c3cf50e-9e95-45f0-a403-014d474e49a4' } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal((await f.call('/api/support', { who: 'support' })).status, 200);
  assert.equal((await f.call('/api/navigation-counts', { who: 'support' })).data.counts.messages, 1);
  for (const path of ['/api/payments', '/api/staff-invoices', '/api/oversight', '/api/users', '/api/admins', '/api/invoices', '/api/teams', '/api/staff-hr?id=cleaner', '/api/dev-mail', '/api/audit']) {
    assert.equal((await f.call(path, { who: 'support' })).status, 403, path);
  }
  for (const role of ['support', 'admin', 'viewer']) assert.equal((await f.call('/api/payments', { who: role })).status, 403, role);
  assert.equal((await f.call('/api/payments', { who: 'superadmin' })).status, 200);
  f.db.prepare("UPDATE admins SET active=0 WHERE id='support'").run();
  assert.equal((await f.call('/api/support', { who: 'support' })).status, 401);
});

test('legacy role migration preserves sessions and foreign keys without granting payment access', async t => {
  const f = await fixture(t, { legacy: true });
  const moderator = await f.call('/api/session', { who: 'moderator' });
  assert.equal(moderator.status, 200); assert.equal(moderator.data.admin.role, 'admin');
  assert.equal((await f.call('/api/session', { who: 'owner' })).data.admin.role, 'owner');
  assert.equal((await f.call('/api/payments', { who: 'moderator' })).status, 403);
  assert.equal((await f.call('/api/support', { who: 'moderator' })).status, 403);
  assert.equal((await f.call('/api/support', { who: 'support' })).status, 200);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(f.db.prepare("SELECT count(*) n FROM admins WHERE role='owner'").get().n, 1);
});

test('Admins cannot read confidential records or manage access, even through direct URLs', async t => {
  const f = await fixture(t);
  const blocked = [
    '/api/payments', '/api/payments/fees/quote?kind=cleaning&amountPence=10000',
    '/api/invoices', '/api/invoices/private/download', '/api/staff-invoices',
    '/api/documents', '/api/documents/private/download', '/api/audit',
    '/api/staff-hr?id=cleaner', '/api/oversight', '/api/oversight/accounts',
    '/api/admins',
    '/api/finance', '/api/accounts',
  ];
  for (const path of blocked) assert.equal((await f.call(path,{who:'admin'})).status,403,path);
  assert.ok([403,404].includes((await f.call('/api/dev-mail',{who:'admin'})).status));
  assert.equal((await f.call('/api/posts',{who:'admin'})).status,200);
  assert.deepEqual(Object.keys((await f.call('/api/overview',{who:'admin'})).data).sort(),['approvals','bookings','reports']);
  assert.equal((await f.call('/api/admins',{who:'superadmin'})).status,200);
  assert.equal((await f.call('/api/payments',{who:'superadmin'})).status,200);
  assert.equal((await f.call('/api/admins',{who:'owner'})).status,200);
  const change={role:'superadmin',active:true,expectedRole:'admin',expectedActive:true,reason:'Attempted self promotion'};
  for(const who of ['admin','superadmin']){
    assert.equal((await f.call('/api/admins/admin',{who,data:change,originHeader:'server'})).status,403);
  }
});
