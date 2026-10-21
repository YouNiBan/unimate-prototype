import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { openDatabase } from '../database.mjs';
import { createMemberAuth } from '../member-auth.mjs';
import { createStripePayments, stripeRuntimeConfig } from '../stripe-payments.mjs';
import { digest, token } from '../security.mjs';

const signingSecret = 'whsec_OfflineUnitTestsOnly';
// The SDK here is used only for local webhook signatures; no SDK HTTP method runs.
const signatureSdk = new Stripe('sk_test_OfflineUnitTestsOnly');
function fakeStripe() {
  const sessions = new Map(), parameters = new Map(), calls = [];
  const fake = {
    sessions, parameters, calls, beforeCreate: null, throwAfterCreate: false, override: null,
    webhooks: signatureSdk.webhooks,
    checkout: { sessions: {
      async create(input, options) {
        calls.push({ action: 'create', input: structuredClone(input), options: { ...options } });
        if (fake.beforeCreate) await fake.beforeCreate();
        const key = options.idempotencyKey;
        if (sessions.has(key)) {
          assert.deepEqual(input, parameters.get(key), 'persisted retries must use identical Stripe parameters');
          return structuredClone(sessions.get(key));
        }
        const session = {
          id: 'cs_test_' + randomUUID().replaceAll('-', ''), object: 'checkout.session',
          livemode: false, mode: 'payment', payment_status: 'unpaid', status: 'open',
          amount_total: input.line_items[0].price_data.unit_amount, currency: 'gbp',
          client_reference_id: input.client_reference_id, metadata: structuredClone(input.metadata),
          url: 'https://checkout.stripe.com/c/pay/test',
          ...fake.override,
        };
        sessions.set(key, session); parameters.set(key, structuredClone(input));
        if (fake.throwAfterCreate) { fake.throwAfterCreate = false; throw new Error('Simulated lost response: never expose provider detail'); }
        return structuredClone(session);
      },
      async retrieve(id) {
        calls.push({ action: 'retrieve', id });
        return structuredClone([...sessions.values()].find(value => value.id === id));
      },
    } },
  };
  return fake;
}
async function fixture(t, { disabled = false } = {}) {
  const db = openDatabase(':memory:'), memberAuth = createMemberAuth({ db }), identities = {};
  const now = new Date().toISOString();
  for (const id of ['student-a', 'student-b', 'assigned-staff']) {
    db.prepare("INSERT INTO users VALUES(?,?,?,'student','active',?)").run(id, id, id + '@example.invalid', now);
    db.prepare('INSERT INTO member_credentials VALUES(?,?,?,?)').run(id, 'unused-test-hash', now, now);
    const raw = token(), csrf = token();
    db.prepare('INSERT INTO member_sessions VALUES(?,?,?,?)').run(digest(raw), id, csrf, Date.now() + 600000);
    identities[id] = { cookie: 'unimate_member=' + raw, csrf };
  }
  for (const role of ['owner', 'superadmin', 'support', 'admin']) {
    db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role, role + '@example.invalid', role, 'unused-test-hash', role);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS booking_owners(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS booking_pricing(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),status TEXT NOT NULL);
  `);
  db.prepare("INSERT INTO bookings VALUES('booking-a','Private address is not sent to Stripe','student-a','cleaning','confirmed',12500,?)").run(now);
  db.prepare("INSERT INTO booking_owners VALUES('booking-a','student-a')").run();
  db.prepare("INSERT INTO booking_pricing VALUES('booking-a','confirmed')").run();
  db.prepare("INSERT INTO team_members VALUES('cleaner','cleaners','Cleaner','cleaner@example.invalid','active',?)").run(now);
  db.prepare("INSERT INTO booking_assignments VALUES('booking-a','cleaner',?,?)").run(now, now);
  const fake = fakeStripe();
  let payments = createStripePayments({ db, memberAuth, webOrigin: 'http://localhost:8083', stripe: disabled ? null : fake, webhookSecret: disabled ? null : signingSecret });
  const server = http.createServer(async (req, res) => {
    try {
      const actor = req.headers['x-test-admin'] ? { id: req.headers['x-test-admin'] } : null;
      if (await payments.handle(req, res, new URL(req.url, 'http://localhost'), actor)) return;
      res.writeHead(404); res.end();
    } catch (error) {
      res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.status ? error.message : 'Unexpected test error.' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = async (path, data, who = 'student-a', extra = {}) => {
    const identity = identities[who] || {};
    const headers = {
      ...(identity.cookie ? { Cookie: identity.cookie } : {}),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': identity.csrf }),
      ...(who && !identity.cookie ? { 'X-Test-Admin': who } : {}), ...extra.headers,
    };
    for (const key of Object.keys(headers)) if (headers[key] === undefined) delete headers[key];
    const response = await fetch(origin + path, {
      method: extra.method || (data === undefined ? 'GET' : 'POST'), headers,
      ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };
  const checkout = (data = {}, who = 'student-a', extra = {}) => call('/api/member/bookings/booking-a/checkout', data, who, extra);
  const payment = who => call('/api/member/bookings/booking-a/payment', undefined, who);
  const event = (type, overrides = {}, id = 'evt_' + randomUUID().replaceAll('-', '')) => ({
    id, object: 'event', type, livemode: false,
    data: { object: { ...structuredClone([...fake.sessions.values()].at(-1)), ...overrides } },
  });
  const sendEvent = (value, headerOverride) => {
    const payload = JSON.stringify(value);
    const signature = signatureSdk.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
    return call('/api/payments/stripe-webhook', payload, null, { headers: { 'Stripe-Signature': headerOverride ?? signature } });
  };
  return { db, fake, memberAuth, identities, call, checkout, payment, event, sendEvent,
    get payments() { return payments; },
    recreate() { payments = createStripePayments({ db, memberAuth, webOrigin: 'http://localhost:8083', stripe: fake, webhookSecret: signingSecret }); },
  };
}

test('configuration is disabled by default and refuses live or partial settings', async t => {
  assert.deepEqual(stripeRuntimeConfig({}), { enabled: false, mode: 'disabled', secretKey: null, webhookSecret: null });
  assert.equal(stripeRuntimeConfig({ UNIMATE_STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_Offline', STRIPE_WEBHOOK_SECRET: signingSecret }).enabled, true);
  assert.equal(stripeRuntimeConfig({ UNIMATE_STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'rk_test_Offline', STRIPE_WEBHOOK_SECRET: signingSecret }).enabled, true);
  for (const env of [
    { UNIMATE_STRIPE_MODE: 'live' }, { STRIPE_SECRET_KEY: 'sk_live_Offline' },
    { UNIMATE_STRIPE_MODE: 'test' }, { STRIPE_SECRET_KEY: 'sk_test_Offline', STRIPE_WEBHOOK_SECRET: signingSecret },
    { UNIMATE_STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'rk_live_Offline', STRIPE_WEBHOOK_SECRET: signingSecret },
  ]) assert.throws(() => stripeRuntimeConfig(env));
  const f = await fixture(t, { disabled: true });
  assert.deepEqual((await f.call('/api/member/payments/config')).data, { enabled: false, mode: 'disabled', supportedKinds: ['booking'] });
  assert.equal((await f.checkout()).status, 503);
  assert.equal((await f.payment()).data.payment, null);
  assert.equal(f.fake.calls.length, 0);
  assert.equal((await f.sendEvent({ id: 'evt_disabled', livemode: false, type: 'anything' })).status, 503);
});

test('only authenticated booking owners can view or create checkout and CSRF is mandatory', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/member/payments/config', undefined, null)).status, 401);
  for (const who of ['student-b', 'assigned-staff']) {
    assert.equal((await f.checkout({}, who)).status, 404);
    assert.equal((await f.payment(who)).status, 404);
  }
  assert.equal((await f.checkout({}, 'owner')).status, 401);
  assert.equal((await f.checkout({}, 'student-a', { headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
  f.db.prepare("UPDATE users SET status='suspended' WHERE id='student-a'").run();
  assert.equal((await f.checkout()).status, 401);
  assert.equal(f.fake.calls.length, 0);
});

test('checkout snapshots the confirmed server quote and ignores forged amounts and customer details', async t => {
  const f = await fixture(t);
  const result = await f.checkout({ amount: 1, amount_pence: 1, currency: 'usd', userId: 'student-b', customer: 'cus_forged', success_url: 'https://attacker.invalid' });
  assert.equal(result.status, 200);
  assert.equal(result.data.mode, 'test');
  assert.equal(new URL(result.data.url).origin, 'https://checkout.stripe.com');
  const call = f.fake.calls[0];
  assert.equal(call.input.line_items[0].price_data.unit_amount, 12500);
  assert.equal(call.input.line_items[0].price_data.currency, 'gbp');
  assert.equal(call.input.metadata.service_commission_bps, '2000');
  assert.equal(call.input.metadata.service_commission_pence, '2500');
  assert.equal(call.input.metadata.service_provider_share_pence, '10000');
  assert.equal(call.input.metadata.processing_fee_bearer, 'unimate');
  assert.deepEqual(call.input.payment_intent_data.metadata, call.input.metadata);
  assert.equal(call.input.payment_intent_data.application_fee_amount, undefined);
  assert.equal(call.input.metadata.user_id, 'student-a');
  assert.equal(call.input.metadata.order_id, result.data.orderId);
  assert.equal(call.options.idempotencyKey, result.data.orderId);
  assert.equal(call.input.customer, undefined);
  assert.equal(call.input.customer_email, undefined);
  assert.equal(call.input.payment_method_types, undefined);
  assert.match(call.input.integration_identifier, /^unimate-booking-[a-z]{8}$/);
  assert.ok(!JSON.stringify(call).includes('Private address'));
  assert.equal(new URL(call.input.success_url).origin, 'http://localhost:8083');
  assert.equal(f.payments.bookingPayment('booking-a').status, 'open');
  assert.throws(() => f.payments.assertRequoteAllowed('booking-a'), /reconciliation/);
  assert.equal((await f.call('/api/member/bookings/booking-a/payment?payment=success&paid=true')).data.payment.status, 'open');
  assert.equal(f.db.prepare('SELECT count(*) n FROM invoices').get().n, 0);
});

test('unconfirmed, ineligible and too-small amounts never reach Stripe', async t => {
  const f = await fixture(t);
  for (const [sql, restore] of [
    ["UPDATE booking_pricing SET status='unquoted'", "UPDATE booking_pricing SET status='confirmed'"],
    ["UPDATE bookings SET status='requested'", "UPDATE bookings SET status='confirmed'"],
    ["UPDATE bookings SET amount_pence=29", "UPDATE bookings SET amount_pence=12500"],
    ["UPDATE bookings SET amount_pence=12500.5", "UPDATE bookings SET amount_pence=12500"],
    ["UPDATE bookings SET service='event'", "UPDATE bookings SET service='cleaning'"],
  ]) {
    f.db.exec(sql);
    assert.ok([400, 409].includes((await f.checkout()).status));
    f.db.exec(restore);
  }
  assert.equal(f.fake.calls.length, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM stripe_payment_orders').get().n, 0);
});

test('concurrent retries and unknown responses reuse one persisted order and Stripe idempotency key', async t => {
  const f = await fixture(t);
  let release, entered;
  const seen = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.fake.beforeCreate = async () => { entered(); await gate; };
  const first = f.checkout();
  await seen;
  const second = f.checkout();
  release();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].status, 200);
  assert.equal(results[1].status, 200);
  assert.equal(results[0].data.orderId, results[1].data.orderId);
  assert.equal(f.fake.calls.filter(call => call.action === 'create').length, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM stripe_payment_orders').get().n, 1);
  f.recreate();
  assert.equal((await f.checkout()).data.orderId, results[0].data.orderId);
  assert.equal(f.fake.calls.filter(call => call.action === 'create').length, 1);
});

test('lost creation outcome is recovered with the same key and never retried beyond safe retention', async t => {
  const f = await fixture(t);
  f.fake.throwAfterCreate = true;
  const failure = await f.checkout();
  assert.equal(failure.status, 502);
  assert.ok(!JSON.stringify(failure).includes('Simulated'));
  const order = f.db.prepare('SELECT * FROM stripe_payment_orders').get();
  assert.equal(order.status, 'creating'); assert.equal(order.session_id, null);
  assert.throws(() => f.payments.assertRequoteAllowed('booking-a'));
  f.recreate();
  const retry = await f.checkout();
  assert.equal(retry.status, 200); assert.equal(retry.data.orderId, order.id);
  assert.equal(f.fake.sessions.size, 1);
  assert.equal(f.fake.calls[0].options.idempotencyKey, f.fake.calls[1].options.idempotencyKey);
  assert.deepEqual(f.fake.calls[0].input, f.fake.calls[1].input);
  f.db.prepare("UPDATE stripe_payment_orders SET session_id=NULL,status='creating',created_at=?").run(new Date(Date.now() - 24 * 3600000).toISOString());
  const calls = f.fake.calls.length;
  assert.equal((await f.checkout()).status, 409);
  assert.equal(f.fake.calls.length, calls);
});

test('signed paid webhook is the only fulfillment signal and retries cannot duplicate or downgrade it', async t => {
  const f = await fixture(t);
  await f.checkout();
  const unpaid = f.event('checkout.session.completed', { status: 'complete', payment_status: 'unpaid' });
  assert.equal((await f.sendEvent(unpaid)).status, 200);
  assert.equal(f.payments.bookingPayment('booking-a').status, 'processing');
  const paid = f.event('checkout.session.async_payment_succeeded', { status: 'complete', payment_status: 'paid' });
  assert.equal((await f.sendEvent(paid)).status, 200);
  assert.equal(f.payments.bookingPayment('booking-a').status, 'paid');
  assert.equal((await f.sendEvent(paid)).data.duplicate, true);
  assert.equal((await f.sendEvent(f.event('checkout.session.expired', { status: 'expired', payment_status: 'unpaid' }))).status, 200);
  assert.equal((await f.sendEvent(f.event('checkout.session.async_payment_failed', { status: 'complete', payment_status: 'unpaid' }))).status, 200);
  assert.equal(f.payments.bookingPayment('booking-a').status, 'paid');
  assert.equal((await f.checkout()).status, 409);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit WHERE action='payment.paid'").get().n, 1);
  assert.equal(f.db.prepare('SELECT status FROM bookings').get().status, 'confirmed');
  assert.equal(f.db.prepare('SELECT count(*) n FROM invoices').get().n, 0);
});

test('webhooks wait for an unknown creation to be recovered and then fulfill once', async t => {
  const f = await fixture(t);
  f.fake.throwAfterCreate = true;
  assert.equal((await f.checkout()).status, 502);
  const paid = f.event('checkout.session.completed', { status: 'complete', payment_status: 'paid' });
  assert.equal((await f.sendEvent(paid)).status, 409);
  assert.equal(f.db.prepare('SELECT count(*) n FROM stripe_payment_events').get().n, 0);
  assert.equal((await f.checkout()).status, 200);
  assert.equal((await f.sendEvent(paid)).status, 200);
  assert.equal(f.payments.bookingPayment('booking-a').status, 'paid');
});

test('webhook signature, live mode, session metadata, amount and currency must all match', async t => {
  const f = await fixture(t);
  await f.checkout();
  const valid = f.event('checkout.session.completed', { status: 'complete', payment_status: 'paid' });
  assert.equal((await f.sendEvent(valid, 't=1,v1=forged')).status, 400);
  assert.equal((await f.sendEvent({ ...valid, livemode: true })).status, 400);
  assert.equal((await f.sendEvent({ ...valid, account: 'acct_unexpected' })).status, 400);
  for (const change of [
    { amount_total: 1 }, { currency: 'usd' }, { livemode: true }, { mode: 'subscription' },
    { id: 'cs_test_unknown' }, { client_reference_id: 'another-order' },
    { metadata: { ...valid.data.object.metadata, user_id: 'student-b' } },
    { metadata: { ...valid.data.object.metadata, booking_id: 'booking-b' } },
  ]) assert.equal((await f.sendEvent(f.event('checkout.session.completed', { ...valid.data.object, ...change }))).status, 400);
  assert.equal(f.payments.bookingPayment('booking-a').status, 'open');
  assert.equal((await f.sendEvent(valid)).status, 200);
  const changedReplay = { ...valid, data: { object: { ...valid.data.object, amount_total: 1 } } };
  assert.equal((await f.sendEvent(changedReplay)).status, 400);
  const stalePayload = JSON.stringify(f.event('checkout.session.completed'));
  const staleHeader = signatureSdk.webhooks.generateTestHeaderString({ payload: stalePayload, secret: signingSecret, timestamp: Math.floor(Date.now() / 1000) - 1000 });
  assert.equal((await f.call('/api/payments/stripe-webhook', stalePayload, null, { headers: { 'Stripe-Signature': staleHeader } })).status, 400);
});

test('expiration requires Stripe confirmation and failed payments stay locked for reconciliation', async t => {
  const f = await fixture(t);
  const first = await f.checkout();
  assert.equal((await f.checkout()).data.orderId, first.data.orderId);
  f.fake.sessions.get(first.data.orderId).status = 'expired';
  const second = await f.checkout();
  assert.equal(second.status, 200);
  assert.notEqual(second.data.orderId, first.data.orderId);
  assert.equal(f.db.prepare('SELECT status FROM stripe_payment_orders WHERE id=?').get(first.data.orderId).status, 'expired');
  const failed = f.event('checkout.session.async_payment_failed', { status: 'complete', payment_status: 'unpaid' });
  assert.equal((await f.sendEvent(failed)).status, 200);
  assert.equal(f.payments.bookingPayment('booking-a').status, 'failed');
  const count = f.fake.calls.length;
  assert.equal((await f.checkout()).status, 409);
  assert.equal(f.fake.calls.length, count);
});

test('a confirmed paid order is displayed ahead of newer expired orders', async t => {
  const f = await fixture(t);
  const first = await f.checkout();
  const firstSession = structuredClone(f.fake.sessions.get(first.data.orderId));
  await f.sendEvent(f.event('checkout.session.expired', { status: 'expired' }));
  assert.doesNotThrow(() => f.payments.assertRequoteAllowed('booking-a'));
  const second = await f.checkout();
  assert.notEqual(second.data.orderId, first.data.orderId);
  await f.sendEvent(f.event('checkout.session.expired', { status: 'expired' }));
  const earlierPaid = f.event('checkout.session.completed', { ...firstSession, status: 'complete', payment_status: 'paid' });
  assert.equal((await f.sendEvent(earlierPaid)).status, 200);
  assert.equal(f.payments.bookingPayment('booking-a').orderId, first.data.orderId);
  assert.equal(f.payments.bookingPayment('booking-a').status, 'paid');
  assert.throws(() => f.payments.assertRequoteAllowed('booking-a'));
});

test('provider URL validation and live session checks refuse unsafe redirects', async t => {
  for (const override of [
    { url: 'https://checkout.stripe.com.attacker.invalid/pay' },
    { url: 'javascript:alert(1)' },
    { url: 'http://checkout.stripe.com/pay' },
    { url: 'https://user:password@checkout.stripe.com/pay' },
    { livemode: true }, { id: 'cs_live_fake' },
  ]) await t.test(JSON.stringify(override), async t => {
    const f = await fixture(t); f.fake.override = override;
    assert.ok([400, 502].includes((await f.checkout()).status));
    assert.equal(f.payments.bookingPayment('booking-a').status, 'creating');
  });
});

test('session revocation during provider work blocks URL disclosure but keeps the recoverable order', async t => {
  const f = await fixture(t);
  f.fake.beforeCreate = async () => { f.db.prepare("DELETE FROM member_sessions WHERE user_id='student-a'").run(); };
  assert.equal((await f.checkout()).status, 401);
  assert.equal(f.payments.bookingPayment('booking-a').status, 'open');
  assert.equal(f.fake.sessions.size, 1);
});

test('admin payment overview is restricted and excludes secrets, provider identifiers and personal details', async t => {
  const f = await fixture(t);
  await f.checkout();
  for (const who of ['support', 'admin']) assert.equal((await f.call('/api/payments', undefined, who)).status, 403);
  assert.equal((await f.call('/api/payments', undefined, 'student-a')).status, 401);
  const result = await f.call('/api/payments', undefined, 'owner');
  assert.equal(result.status, 200); assert.equal(result.data.total, 1);
  assert.equal(result.data.rows[0].amountPence, 12500);
  assert.equal(result.data.rows[0].feeAllocation.commissionPence, 2500);
  assert.equal(result.data.rows[0].feeAllocation.partnerSharePence, 10000);
  assert.equal(result.data.rows[0].feeAllocation.stripeFeePence, null);
  assert.equal(result.data.rows[0].feeAllocation.netEarningsPence, null);
  assert.equal(result.data.rows[0].feeAllocation.payoutStatus, 'not_started');
  const serialized = JSON.stringify(result.data);
  for (const secret of ['session_id', 'parameters_json', 'checkout_url', signingSecret, '@example.invalid', 'sk_test_']) assert.ok(!serialized.includes(secret));
  f.db.prepare("UPDATE admins SET role='support' WHERE id='owner'").run();
  assert.equal((await f.call('/api/payments', undefined, 'owner')).status, 403);
  const large = JSON.stringify({ body: 'x'.repeat(140000) });
  assert.equal((await f.call('/api/payments/stripe-webhook', large, null, { headers: { 'Stripe-Signature': 't=123,v1=unused' } })).status, 413);
});

test('fee previews are confidential, do not create orders, and validate amounts', async t => {
  const f = await fixture(t);
  const path = '/api/payments/fees/quote?kind=event_ticket&amountPence=2000';
  for (const who of ['admin','support','student-a']) {
    assert.ok([401,403].includes((await f.call(path,undefined,who)).status));
  }
  for (const who of ['owner','superadmin']) {
    const result = await f.call(path,undefined,who);
    assert.equal(result.status,200);
    assert.equal(result.data.quote.commissionPence,200);
  }
  assert.equal((await f.call('/api/payments/fees/quote?kind=event_ticket&amountPence=-1',undefined,'owner')).status,400);
  assert.equal((await f.call(path,{},'owner')).status,405);
  assert.equal(f.fake.calls.length,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM stripe_payment_orders').get().n,0);
});

test('tracked fees use their saved checkout values and leave older missing allocations unknown', async t => {
  const f=await fixture(t);
  await f.checkout();
  const order=f.db.prepare('SELECT * FROM stripe_payment_orders').get();
  const params=JSON.parse(order.parameters_json);
  params.metadata.service_commission_bps='1000';
  params.metadata.service_commission_pence='1250';
  params.metadata.service_provider_share_pence='11250';
  params.metadata.fee_policy_version='historical-fixture';
  f.db.prepare('UPDATE stripe_payment_orders SET parameters_json=? WHERE id=?').run(JSON.stringify(params),order.id);
  f.recreate();
  let result=await f.call('/api/payments',undefined,'owner');
  assert.equal(result.data.rows[0].feeAllocation.commissionPence,1250);
  delete params.metadata.fee_policy_version;
  f.db.prepare('UPDATE stripe_payment_orders SET parameters_json=? WHERE id=?').run(JSON.stringify(params),order.id);
  result=await f.call('/api/payments',undefined,'owner');
  assert.equal(result.data.rows[0].feeAllocation,null);
});
