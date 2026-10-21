import { randomUUID, randomInt } from 'node:crypto';
import { audit, transaction } from './database.mjs';
import { digest } from './security.mjs';
import { serviceFeeSplit } from './service-fees.mjs';
import { feePolicies, quoteFee, FEE_POLICY_VERSION } from './fee-policy.mjs';
import {recordReference} from './references.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const sessionId = /^cs_test_[A-Za-z0-9]+$/;
const eventTypes = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired']);
const reply = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
  return true;
};
export function stripeRuntimeConfig(env = process.env) {
  const mode = env.UNIMATE_STRIPE_MODE || '', secretKey = env.STRIPE_SECRET_KEY || '', webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
  if (/^(sk|rk)_live_/.test(secretKey) || mode === 'live') throw new Error('Live Stripe payments are not supported by this sandbox integration.');
  if (!mode && !secretKey && !webhookSecret) return { enabled: false, mode: 'disabled', secretKey: null, webhookSecret: null };
  if (mode !== 'test' || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(secretKey) || !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)) {
    throw new Error('Stripe sandbox requires UNIMATE_STRIPE_MODE=test, a test secret key and a webhook signing secret.');
  }
  return { enabled: true, mode: 'test', secretKey, webhookSecret };
}
async function readRaw(req, maximum) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) fail(413, 'Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON required.');
  const raw = await readRaw(req, 4096);
  try {
    const data = JSON.parse(raw.toString('utf8'));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw Error();
    return data;
  } catch { fail(400, 'Invalid request.'); }
}
function websiteOrigin(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || url.hostname.includes('*') || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Payments require an exact HTTPS website origin, or localhost for sandbox testing.');
  }
  return url.origin;
}
function checkoutUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail(502, 'Stripe returned an invalid checkout address.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port || url.username || url.password) fail(502, 'Stripe returned an invalid checkout address.');
  return url.href;
}

// stripe is a trusted dependency, constructed ONLY from stripeRuntimeConfig's
// test key by the server. Tests inject an offline SDK; this module reads no keys.
export function createStripePayments({ db, memberAuth, webOrigin = 'http://localhost:8083', stripe = null, webhookSecret = null }) {
  if (!db || !memberAuth?.authenticate || !memberAuth?.requireMutation) throw new Error('Payments require member authentication and a database.');
  const website = websiteOrigin(webOrigin);
  if ((stripe && !webhookSecret) || (!stripe && webhookSecret)) throw new Error('Both the sandbox client and webhook signing secret must be configured.');
  if (stripe && (!stripe.checkout?.sessions?.create || !stripe.checkout?.sessions?.retrieve || !stripe.webhooks?.constructEvent
    || !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret))) throw new Error('Invalid Stripe sandbox configuration.');
  const enabled = !!stripe;
  const readiness = () => ({ enabled, mode: enabled ? 'test' : 'disabled', supportedKinds: ['booking'] });
  db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_payment_orders(
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK(kind='booking'),
      amount_pence INTEGER NOT NULL CHECK(amount_pence>=30),
      currency TEXT NOT NULL CHECK(currency='gbp'),
      status TEXT NOT NULL CHECK(status IN ('creating','open','processing','paid','expired','failed')),
      session_id TEXT UNIQUE,
      checkout_url TEXT,
      parameters_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS stripe_one_active_booking_order ON stripe_payment_orders(booking_id) WHERE status<>'expired';
    CREATE INDEX IF NOT EXISTS stripe_orders_user_idx ON stripe_payment_orders(user_id,created_at DESC,id);
    CREATE TABLE IF NOT EXISTS stripe_payment_events(
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      order_id TEXT REFERENCES stripe_payment_orders(id),
      payload_hash TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stripe_payment_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
  `);
  db.exec('CREATE TABLE IF NOT EXISTS stripe_payment_links(order_id TEXT PRIMARY KEY REFERENCES stripe_payment_orders(id),payment_intent_id TEXT NOT NULL UNIQUE)');
  const inFlight = new Map();
  const latest = bookingId => db.prepare("SELECT * FROM stripe_payment_orders WHERE booking_id=? ORDER BY CASE WHEN status<>'expired' THEN 0 ELSE 1 END,created_at DESC,rowid DESC LIMIT 1").get(bookingId);
  const safe = order => order ? { orderId: order.id, reference:recordReference(db,'payment',order.id,order.created_at), status: order.status, amountPence: order.amount_pence, currency: order.currency, mode: 'test' } : null;
  const bookingPayment = bookingId => safe(latest(bookingId));
  function savedFeeAllocation(order) {
    // Read the immutable checkout snapshot, never recalculate old orders at today's rate.
    try {
      const saved = JSON.parse(order.parameters_json).metadata;
      if (!saved.fee_policy_version || !/^\d+$/.test(saved.service_commission_pence)
        || !/^\d+$/.test(saved.service_provider_share_pence) || !/^\d+$/.test(saved.service_commission_bps)) return null;
      const commissionPence = Number(saved.service_commission_pence), partnerSharePence = Number(saved.service_provider_share_pence);
      if (!Number.isSafeInteger(commissionPence) || !Number.isSafeInteger(partnerSharePence)
        || commissionPence + partnerSharePence !== order.amount_pence) return null;
      return { policyVersion: saved.fee_policy_version, rateBps: Number(saved.service_commission_bps),
        commissionPence, partnerSharePence, stripeFeePence: null, netEarningsPence: null,
        payoutStatus: 'not_started' };
    } catch { return null; }
  }
  function assertRequoteAllowed(bookingId) {
    if (db.prepare("SELECT id FROM stripe_payment_orders WHERE booking_id=? AND status<>'expired' LIMIT 1").get(bookingId)) {
      fail(409, 'This booking has a payment or checkout awaiting reconciliation. Resolve it before changing the quote.');
    }
  }
  function member(req, bookingId, mutation = false) {
    const session = memberAuth.authenticate(req);
    if (!session?.user) fail(401, 'Sign in to view payments.');
    if (mutation) memberAuth.requireMutation(req, session);
    if (!bookingId) return { session };
    const booking = db.prepare(`SELECT b.*,p.status pricing_status FROM bookings b
      JOIN booking_owners o ON o.booking_id=b.id LEFT JOIN booking_pricing p ON p.booking_id=b.id
      WHERE b.id=? AND o.user_id=?`).get(bookingId, session.user.id);
    if (!booking) fail(404, 'Booking not found.');
    return { session, booking };
  }
  function eligible(booking) {
    if (!['cleaning', 'moving', 'airport_transfer'].includes(booking.service)) fail(400, 'Only service bookings support sandbox checkout.');
    if (booking.pricing_status !== 'confirmed' || !['confirmed', 'assigned'].includes(booking.status)) fail(409, 'This booking needs a confirmed quote before payment.');
    if (!Number.isSafeInteger(booking.amount_pence) || booking.amount_pence < 30 || booking.amount_pence > 10000000) fail(409, 'The confirmed quote must be between £0.30 and £100,000.');
  }
  function metadata(order) {
    return { order_id: order.id, booking_id: order.booking_id, user_id: order.user_id, kind: 'booking' };
  }
  function validateSession(session, order) {
    const savedMetadata=JSON.parse(order.parameters_json).metadata||{};
    if(['unimate_reference','invoice_reference'].some(key=>savedMetadata[key]&&session?.metadata?.[key]!==savedMetadata[key]))fail(400,'The Stripe reference does not match this order.');
    if (!session || !sessionId.test(session.id || '') || session.livemode !== false || session.mode !== 'payment'
      || session.amount_total !== order.amount_pence || session.currency !== order.currency
      || session.client_reference_id !== order.id
      || Object.entries(metadata(order)).some(([key, value]) => session.metadata?.[key] !== value)
      || (order.session_id && session.id !== order.session_id)) {
      fail(400, 'The Stripe session does not match this sandbox order.');
    }
  }
  function rateLimit(userId) {
    const now = Date.now(), key = 'checkout:' + userId;
    transaction(db, () => {
      db.prepare('DELETE FROM stripe_payment_limits WHERE expires<=?').run(now);
      if ((db.prepare('SELECT count FROM stripe_payment_limits WHERE key=?').get(key)?.count || 0) >= 20) fail(429, 'Please wait before retrying checkout.');
      db.prepare('INSERT INTO stripe_payment_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 60000);
    });
  }
  function reserve(booking, userId) {
    let order;
    transaction(db, () => {
      order = db.prepare("SELECT * FROM stripe_payment_orders WHERE booking_id=? AND status<>'expired'").get(booking.id);
      if (order) return;
      const id = randomUUID(), now = new Date().toISOString();
      const snapshot = { id, booking_id: booking.id, user_id: userId, amount_pence: booking.amount_pence, currency: 'gbp' };
      const fees = serviceFeeSplit(booking.service, booking.amount_pence);
      const orderMetadata = {
        ...metadata(snapshot),
        unimate_reference: recordReference(db,'payment',id,now),
        ...(db.prepare('SELECT reference FROM invoices WHERE booking_id=?').get(booking.id)?.reference?{invoice_reference:db.prepare('SELECT reference FROM invoices WHERE booking_id=?').get(booking.id).reference}:{}),
        service_commission_bps: String(fees.rateBps),
        service_commission_pence: String(fees.commissionPence),
        service_provider_share_pence: String(fees.providerPence),
        processing_fee_bearer: 'unimate',
        fee_policy_version: FEE_POLICY_VERSION,
      };
      const parameters = {
        mode: 'payment',
        integration_identifier: 'unimate-booking-' + Array.from({ length: 8 }, () => String.fromCharCode(97 + randomInt(26))).join(''),
        client_reference_id: id,
        line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: booking.amount_pence, product_data: { name: `UniMate ${booking.service.replaceAll('_', ' ')} booking` } } }],
        metadata: orderMetadata,
        payment_intent_data: { metadata: orderMetadata, description: orderMetadata.unimate_reference },
        success_url: `${website}/?payment=return&order_id=${id}#/bookings`,
        cancel_url: `${website}/?payment=cancelled&order_id=${id}#/bookings`,
      };
      db.prepare("INSERT INTO stripe_payment_orders VALUES(?,?,?,'booking',?,'gbp','creating',NULL,NULL,?,?,?)")
        .run(id, booking.id, userId, booking.amount_pence, JSON.stringify(parameters), now, now);
      audit(db, { id: userId, name: 'Member' }, 'payment.checkout_reserved', 'stripe_payment_orders', id, null,
        { bookingId: booking.id, amountPence: booking.amount_pence, currency: 'gbp', mode: 'test' }, 'Sandbox checkout reserved');
      order = db.prepare('SELECT * FROM stripe_payment_orders WHERE id=?').get(id);
    });
    return order;
  }
  function expire(order, source) {
    transaction(db, () => {
      const current = db.prepare('SELECT * FROM stripe_payment_orders WHERE id=?').get(order.id);
      if (current.status === 'paid' || current.status === 'expired') return;
      db.prepare("UPDATE stripe_payment_orders SET status='expired',updated_at=? WHERE id=?").run(new Date().toISOString(), order.id);
      audit(db, null, 'payment.checkout_expired', 'stripe_payment_orders', order.id, { status: current.status }, { status: 'expired', mode: 'test' }, source);
    });
  }
  async function obtainSession(order) {
    if (inFlight.has(order.id)) return inFlight.get(order.id);
    if (inFlight.size >= 4) fail(429, 'Please retry checkout shortly.');
    const operation = (async () => {
      let provider;
      if (!order.session_id && Date.now() - Date.parse(order.created_at) >= 23 * 3600000) fail(409, 'This checkout needs manual reconciliation before retrying.');
      try {
        if (order.session_id) provider = await stripe.checkout.sessions.retrieve(order.session_id);
        else {
          provider = await stripe.checkout.sessions.create(JSON.parse(order.parameters_json), { idempotencyKey: order.id });
        }
      } catch {
        fail(502, 'Stripe could not confirm checkout. Retry safely; no replacement order has been created.');
      }
      validateSession(provider, order);
      const url = provider.status === 'open' && provider.payment_status === 'unpaid' ? checkoutUrl(provider.url) : null;
      transaction(db, () => {
        const current = db.prepare('SELECT * FROM stripe_payment_orders WHERE id=?').get(order.id);
        if (current.session_id && current.session_id !== provider.id) fail(409, 'Checkout needs reconciliation.');
        const status = current.status === 'paid' || current.status === 'failed' || current.status === 'expired'
          ? current.status : provider.status === 'open' && provider.payment_status === 'unpaid' ? 'open' : 'processing';
        db.prepare('UPDATE stripe_payment_orders SET session_id=?,checkout_url=?,status=?,updated_at=? WHERE id=?')
          .run(provider.id, url, status, new Date().toISOString(), order.id);
      });
      if (provider.status === 'expired' && provider.payment_status !== 'paid') expire(order, 'Stripe confirmed sandbox session expiration');
      return provider;
    })();
    inFlight.set(order.id, operation);
    try { return await operation; } finally { inFlight.delete(order.id); }
  }
  async function webhook(req, res) {
    if (req.method !== 'POST') fail(405, 'Method not allowed.');
    if (!enabled) fail(503, 'Stripe sandbox is not connected.');
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || signature.length > 4096) fail(400, 'Missing Stripe signature.');
    const raw = await readRaw(req, 128 * 1024);
    let event;
    try { event = stripe.webhooks.constructEvent(raw, signature, webhookSecret); } catch { fail(400, 'Invalid Stripe signature.'); }
    if (!event || event.livemode !== false || event.account || typeof event.id !== 'string' || event.id.length > 200
      || !/^evt_[A-Za-z0-9]+$/.test(event.id) || typeof event.type !== 'string' || event.type.length > 100) fail(400, 'Only sandbox events for this account are accepted.');
    const hash = digest(raw);
    const previous = db.prepare('SELECT payload_hash FROM stripe_payment_events WHERE event_id=?').get(event.id);
    if (previous) {
      if (previous.payload_hash !== hash) fail(400, 'Event reference already used.');
      return reply(res, 200, { received: true, duplicate: true });
    }
    const session = event.data?.object;
    if (session?.livemode === true) fail(400, 'Live Stripe objects are not accepted.');
    const order = eventTypes.has(event.type) && typeof session?.metadata?.order_id === 'string'
      ? db.prepare('SELECT * FROM stripe_payment_orders WHERE id=?').get(session.metadata.order_id) : null;
    if (order) {
      validateSession(session, order);
      if (!order.session_id || order.session_id !== session.id) fail(409, 'Checkout creation is awaiting reconciliation. Retry this event.');
    }
    transaction(db, () => {
      if (db.prepare('SELECT 1 FROM stripe_payment_events WHERE event_id=?').get(event.id)) return;
      if (order) {
        const current = db.prepare('SELECT * FROM stripe_payment_orders WHERE id=?').get(order.id);
        if(typeof session.payment_intent==='string'&&/^pi_[A-Za-z0-9]+$/.test(session.payment_intent)){
          const existingLink=db.prepare('SELECT payment_intent_id FROM stripe_payment_links WHERE order_id=?').get(order.id);
          if(existingLink&&existingLink.payment_intent_id!==session.payment_intent)fail(400,'Stripe payment identity changed.');
          db.prepare('INSERT OR IGNORE INTO stripe_payment_links VALUES(?,?)').run(order.id,session.payment_intent);
        }
        let status = current.status;
        const isPaidEvent = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type);
        if (isPaidEvent && session.payment_status === 'paid' && session.status === 'complete') status = 'paid';
        else if (current.status !== 'paid') {
          if (event.type === 'checkout.session.expired' && session.status === 'expired' && session.payment_status !== 'paid') status = 'expired';
          else if (event.type === 'checkout.session.async_payment_failed' && current.status !== 'expired') status = 'failed';
          else if (event.type === 'checkout.session.completed' && current.status === 'open') status = 'processing';
        }
        if (status === 'paid' && current.status === 'expired'
          && db.prepare("SELECT 1 FROM stripe_payment_orders WHERE booking_id=? AND id<>? AND status<>'expired'").get(current.booking_id, current.id)) {
          fail(409, 'Conflicting payment outcomes require reconciliation.');
        }
        if (status !== current.status) {
          db.prepare('UPDATE stripe_payment_orders SET status=?,updated_at=? WHERE id=?').run(status, new Date().toISOString(), order.id);
          audit(db, null, 'payment.' + status, 'stripe_payment_orders', order.id, { status: current.status },
            { status, amountPence: order.amount_pence, currency: 'gbp', mode: 'test', eventId: event.id }, 'Verified sandbox Stripe event');
        }
      }
      db.prepare('INSERT INTO stripe_payment_events VALUES(?,?,?,?,?)').run(event.id, String(event.type || ''), order?.id || null, hash, new Date().toISOString());
    });
    return reply(res, 200, { received: true, ...(order ? {} : { ignored: true }) });
  }
  async function handle(req, res, url, actor = null) {
    const path = url.pathname;
    if (path === '/api/payments/stripe-webhook') return webhook(req, res);
    if (path === '/api/payments' || path === '/api/payments/fees/quote') {
      if (req.method !== 'GET') fail(405, 'Method not allowed.');
      if (!actor) fail(401, 'Please sign in.');
      const admin = db.prepare('SELECT role,active FROM admins WHERE id=?').get(actor.id);
      if (!admin?.active || !['owner', 'superadmin'].includes(admin.role)) fail(403, 'Owner or SuperAdmin access required.');
      if (path === '/api/payments/fees/quote') {
        try {
          const number = key => {
            const value = url.searchParams.get(key) ?? '0';
            if (!/^(0|[1-9][0-9]{0,8})$/.test(value)) throw new RangeError('Use non-negative whole numbers.');
            return Number(value);
          };
          return reply(res, 200, { quote: quoteFee({
            kind: url.searchParams.get('kind'),
            amountPence: number('amountPence'), deliveryPence: number('deliveryPence'),
            attendedGuests: number('attendedGuests'),
          }) });
        } catch (error) {
          if (error instanceof RangeError) fail(400, error.message);
          throw error;
        }
      }
      const value = url.searchParams.get('page') || '1';
      if (!/^[1-9][0-9]{0,4}$/.test(value)) fail(400, 'Choose a valid page.');
      const page = Number(value);
      const rows = db.prepare('SELECT * FROM stripe_payment_orders ORDER BY created_at DESC,rowid DESC LIMIT 25 OFFSET ?').all((page - 1) * 25)
        .map(order => ({ ...safe(order), bookingId: order.booking_id, memberId: order.user_id, createdAt: order.created_at, updatedAt: order.updated_at, feeAllocation: savedFeeAllocation(order), stripeSessionId:order.session_id, stripePaymentIntentId:db.prepare('SELECT payment_intent_id FROM stripe_payment_links WHERE order_id=?').get(order.id)?.payment_intent_id||null, invoiceReference:db.prepare('SELECT reference FROM invoices WHERE booking_id=?').get(order.booking_id)?.reference||null }));
      return reply(res, 200, { rows, total: db.prepare('SELECT count(*) n FROM stripe_payment_orders').get().n, page, enabled, mode: enabled ? 'test' : 'disabled', feePolicy: { version: FEE_POLICY_VERSION, rows: feePolicies } });
    }
    if (path === '/api/member/payments/config') {
      if (req.method !== 'GET') fail(405, 'Method not allowed.');
      member(req);
      return reply(res, 200, readiness());
    }
    const match = /^\/api\/member\/bookings\/([A-Za-z0-9_-]{1,100})\/(checkout|payment)$/.exec(path);
    if (!match) return false;
    const [, bookingId, action] = match;
    if (action === 'payment') {
      if (req.method !== 'GET') fail(405, 'Method not allowed.');
      member(req, bookingId);
      return reply(res, 200, { payment: bookingPayment(bookingId) });
    }
    if (req.method !== 'POST') fail(405, 'Method not allowed.');
    member(req, bookingId, true);
    await readJson(req);
    let { session, booking } = member(req, bookingId, true);
    if (!enabled) fail(503, 'Stripe sandbox is not connected.');
    eligible(booking);
    rateLimit(session.user.id);
    for (let attempt = 0; attempt < 2; attempt++) {
      const order = reserve(booking, session.user.id);
      if (order.user_id !== session.user.id || order.amount_pence !== booking.amount_pence) fail(409, 'The booking and its checkout require reconciliation.');
      if (order.status === 'paid') fail(409, 'This booking already has a confirmed sandbox payment.');
      if (['processing', 'failed'].includes(order.status)) fail(409, 'This checkout is awaiting payment confirmation or reconciliation.');
      const provider = await obtainSession(order);
      const fresh = member(req, bookingId, true);
      if (fresh.session.user.id !== session.user.id) fail(401, 'Sign in again.');
      session = fresh.session; booking = fresh.booking;
      eligible(booking);
      if (booking.amount_pence !== order.amount_pence) fail(409, 'The booking quote changed. Checkout requires reconciliation.');
      const current = db.prepare('SELECT * FROM stripe_payment_orders WHERE id=?').get(order.id);
      if (current.status === 'expired') continue;
      if (current.status !== 'open') fail(409, 'Waiting for Stripe to confirm this sandbox payment.');
      return reply(res, 200, { url: checkoutUrl(provider.url), orderId: order.id, mode: 'test' });
    }
    fail(409, 'Checkout expired. Refresh before trying again.');
  }
  return { handle, readiness, bookingPayment, assertRequoteAllowed };
}
