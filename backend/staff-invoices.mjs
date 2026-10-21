import { randomUUID } from 'node:crypto';
import { audit, transaction } from './database.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const fullAccess = actor => actor && ['owner', 'superadmin'].includes(actor.role);
const serviceTeams = { cleaning: 'cleaners', moving: 'movers', airport_transfer: 'drivers' };
const filters = new Set(['all', 'pending_work', 'changes_requested', 'awaiting_invoice_review', 'approved_for_payment']);
const hasTable = (db, name) => Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
const dateInLondon = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

function installSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_reviews(
      booking_id TEXT PRIMARY KEY REFERENCES bookings(id),member_id TEXT NOT NULL REFERENCES team_members(id),
      staff_user_id TEXT REFERENCES users(id),staff_name TEXT NOT NULL,service TEXT NOT NULL,job_date TEXT NOT NULL,
      completed_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','changes_requested','approved')),
      review_reason TEXT NOT NULL DEFAULT '',reviewed_by TEXT,reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS work_reviews_staff_idx ON work_reviews(staff_user_id,completed_at);
    CREATE TABLE IF NOT EXISTS staff_invoice_counters(year TEXT PRIMARY KEY,next_number INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS staff_invoices(
      id TEXT PRIMARY KEY,reference TEXT NOT NULL UNIQUE,booking_id TEXT NOT NULL REFERENCES work_reviews(booking_id),
      revision INTEGER NOT NULL CHECK(revision>0),member_id TEXT NOT NULL REFERENCES team_members(id),
      staff_user_id TEXT REFERENCES users(id),staff_name TEXT NOT NULL,service TEXT NOT NULL,job_date TEXT NOT NULL,
      amount_pence INTEGER NOT NULL CHECK(amount_pence>=0),currency TEXT NOT NULL CHECK(currency='GBP'),
      bill_to TEXT NOT NULL CHECK(bill_to='UniMate'),issued_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('awaiting_invoice_review','changes_requested','approved_for_payment','superseded')),
      review_reason TEXT NOT NULL DEFAULT '',reviewed_by TEXT,reviewed_at TEXT,
      UNIQUE(booking_id,revision)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS staff_invoice_current_idx ON staff_invoices(booking_id) WHERE status!='superseded';
    CREATE TRIGGER IF NOT EXISTS staff_invoice_terms_no_update BEFORE UPDATE OF
      id,reference,booking_id,revision,member_id,staff_user_id,staff_name,service,job_date,amount_pence,currency,bill_to,issued_at
      ON staff_invoices BEGIN SELECT RAISE(ABORT,'Issued staff invoice terms cannot be changed; create a reviewed revision'); END;
    CREATE TRIGGER IF NOT EXISTS staff_invoice_no_delete BEFORE DELETE ON staff_invoices
      BEGIN SELECT RAISE(ABORT,'Issued staff invoices cannot be deleted'); END;
    CREATE TRIGGER IF NOT EXISTS work_review_snapshot_no_update BEFORE UPDATE OF
      booking_id,member_id,staff_user_id,staff_name,service,job_date,completed_at
      ON work_reviews BEGIN SELECT RAISE(ABORT,'Completed work snapshots cannot be changed'); END;
  `);
}

// Called synchronously inside the booking-completion transaction, after its status update.
// This records work for review; it does not create an invoice or determine staff pay.
export function submitCompletion(db, actor, booking) {
  const saved = db.prepare('SELECT id,status,service FROM bookings WHERE id=?').get(booking.id);
  if (!saved || saved.status !== 'completed') fail(409, 'Complete the booking before submitting work for review.');
  const existing = db.prepare('SELECT * FROM work_reviews WHERE booking_id=?').get(saved.id);
  if (existing) return existing;
  const assignment = db.prepare(`SELECT a.member_id,a.starts_at,m.name,m.team,m.status
    FROM booking_assignments a JOIN team_members m ON m.id=a.member_id WHERE a.booking_id=?`).get(saved.id);
  if (!assignment || assignment.status !== 'active' || assignment.team !== serviceTeams[saved.service]) return null;
  const linked = hasTable(db, 'staff_user_links')
    ? db.prepare('SELECT user_id FROM staff_user_links WHERE member_id=?').get(assignment.member_id) : null;
  const completedAt = new Date().toISOString();
  const jobDate = Number.isFinite(Date.parse(assignment.starts_at)) ? dateInLondon(assignment.starts_at) : dateInLondon(completedAt);
  db.prepare(`INSERT INTO work_reviews(booking_id,member_id,staff_user_id,staff_name,service,job_date,completed_at,status)
    VALUES(?,?,?,?,?,?,?,'pending')`).run(saved.id, assignment.member_id, linked?.user_id || null, assignment.name, saved.service, jobDate, completedAt);
  audit(db, actor, 'staff_work.submitted', 'work_reviews', saved.id, null,
    { status: 'pending', memberId: assignment.member_id, staffUserId: linked?.user_id || null }, 'Completed job submitted for UniMate work review; staff fee not set');
  return db.prepare('SELECT * FROM work_reviews WHERE booking_id=?').get(saved.id);
}

function text(value, label, min = 1, max = 1000) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, `Check ${label}.`);
  return value.trim();
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'JSON required.');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) fail(413, 'Request too large.');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Invalid request.');
  return value;
}
function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value)); return true;
}
function invoiceSummary(row) {
  return row ? {
    id: row.id, reference: row.reference, revision: row.revision, status: row.status, amountPence: row.amount_pence,
    currency: row.currency, billTo: row.bill_to, issuedAt: row.issued_at, reviewReason: row.review_reason,
    reviewedAt: row.reviewed_at,
  } : null;
}
function serialize(db, review, { history = false } = {}) {
  const booking = db.prepare('SELECT title FROM bookings WHERE id=?').get(review.booking_id);
  const invoices = db.prepare('SELECT * FROM staff_invoices WHERE booking_id=? ORDER BY revision DESC').all(review.booking_id);
  return {
    bookingId: review.booking_id, title: booking.title, service: review.service, jobDate: review.job_date,
    completedAt: review.completed_at, staff: { memberId: review.member_id, name: review.staff_name },
    workStatus: review.status, reviewReason: review.review_reason, reviewedAt: review.reviewed_at,
    invoice: invoiceSummary(invoices.find(row => row.status !== 'superseded')),
    ...(history ? { invoiceHistory: invoices.map(invoiceSummary) } : {}),
  };
}
function requireReviewableAssignment(db, review) {
  const booking = db.prepare('SELECT status,service FROM bookings WHERE id=?').get(review.booking_id);
  const current = db.prepare(`SELECT a.member_id,m.status,m.team FROM booking_assignments a
    JOIN team_members m ON m.id=a.member_id WHERE a.booking_id=?`).get(review.booking_id);
  if (booking?.status !== 'completed' || booking.service !== review.service || current?.member_id !== review.member_id
    || current.status !== 'active' || current.team !== serviceTeams[review.service]) {
    fail(409, 'The completed job or its staff assignment changed. Review the booking before approving.');
  }
  const linked = hasTable(db, 'staff_user_links') ? db.prepare('SELECT user_id FROM staff_user_links WHERE member_id=?').get(review.member_id) : null;
  if ((linked?.user_id || null) !== review.staff_user_id) fail(409, 'The staff account link changed after completion. Review the original staff record before approving.');
}
function createInvoice(db, actor, review, amountPence, reason) {
  const now = new Date().toISOString(), year = dateInLondon(now).slice(0, 4);
  const current = db.prepare("SELECT * FROM staff_invoices WHERE booking_id=? AND status!='superseded'").get(review.booking_id);
  if (current) {
    if (current.status !== 'changes_requested') fail(409, 'An active invoice already exists for this work.');
    db.prepare("UPDATE staff_invoices SET status='superseded' WHERE id=?").run(current.id);
    audit(db, actor, 'staff_invoice.superseded', 'staff_invoices', current.id,
      { status: current.status, amountPence: current.amount_pence }, { status: 'superseded' }, reason);
  }
  const revision = db.prepare('SELECT COALESCE(MAX(revision),0)+1 n FROM staff_invoices WHERE booking_id=?').get(review.booking_id).n;
  db.prepare('INSERT INTO staff_invoice_counters(year,next_number) VALUES(?,1) ON CONFLICT(year) DO NOTHING').run(year);
  const number = db.prepare('SELECT next_number FROM staff_invoice_counters WHERE year=?').get(year).next_number;
  db.prepare('UPDATE staff_invoice_counters SET next_number=next_number+1 WHERE year=?').run(year);
  const id = randomUUID(), reference = `UM-STAFF-${year}-${String(number).padStart(5, '0')}`;
  db.prepare(`INSERT INTO staff_invoices(id,reference,booking_id,revision,member_id,staff_user_id,staff_name,service,job_date,
    amount_pence,currency,bill_to,issued_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,'GBP','UniMate',?,'awaiting_invoice_review')`)
    .run(id, reference, review.booking_id, revision, review.member_id, review.staff_user_id, review.staff_name, review.service, review.job_date, amountPence, now);
  audit(db, actor, 'staff_invoice.created', 'staff_invoices', id, null,
    { reference, bookingId: review.booking_id, revision, amountPence, currency: 'GBP', status: 'awaiting_invoice_review' }, reason);
}

export function createStaffInvoices({ db, memberAuth }) {
  if (!db || !memberAuth?.authenticate) throw new Error('Staff invoices require a database and member authentication.');
  installSchema(db);
  async function handle(req, res, url, actor = null) {
    const match = /^\/api\/(member\/)?staff-invoices(?:\/([^/]+)(?:\/(review-work|review-invoice))?)?$/.exec(url.pathname);
    if (!match) return false;
    const memberRoute = Boolean(match[1]), id = match[2] ? decodeURIComponent(match[2]) : null, action = match[3];
    let userId = null;
    if (memberRoute) {
      const session = memberAuth.authenticate(req);
      if (!session?.user) fail(401, 'Sign in to view staff invoices.');
      if (session.user.role !== 'staff') fail(403, 'Staff access is required.');
      if (req.method !== 'GET' || action) fail(405, 'Staff invoice records are read only.');
      userId = session.user.id;
    } else {
      if (!actor) fail(401, 'Sign in to review staff invoices.');
      if (!fullAccess(actor)) fail(403, 'Only the owner or a SuperAdmin can review staff invoices.');
    }
    if (!id && req.method === 'GET') {
      const filter = url.searchParams.get('status') || 'all', rawPage = url.searchParams.get('page') || '1', page = Number(rawPage);
      if (!filters.has(filter) || !/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(page) || page > 1000000) fail(400, 'Check the invoice filter and page.');
      const query=(url.searchParams.get('q')||'').trim().toLowerCase(),department=url.searchParams.get('department')||'all';
      if(query.length>100||!['all','cleaning','moving','airport_transfer'].includes(department))fail(400,'Check the staff search and department.');
      const all = (userId
        ? db.prepare('SELECT * FROM work_reviews WHERE staff_user_id=? ORDER BY completed_at DESC,booking_id').all(userId)
        : db.prepare('SELECT * FROM work_reviews ORDER BY completed_at DESC,booking_id').all()).map(row => serialize(db, row)).filter(row=>(department==='all'||row.service===department)&&(!query||[row.staff.name,row.invoice?.reference||''].some(value=>value.toLowerCase().includes(query))));
      const counts = {
        pendingWork: all.filter(row => row.workStatus === 'pending').length,
        changesRequested: all.filter(row => row.workStatus === 'changes_requested').length,
        awaitingInvoiceReview: all.filter(row => row.invoice?.status === 'awaiting_invoice_review').length,
        approvedForPayment: all.filter(row => row.invoice?.status === 'approved_for_payment').length,
      };
      const filtered = all.filter(row => filter === 'all' || (filter === 'pending_work' ? row.workStatus === 'pending'
        : filter === 'changes_requested' ? row.workStatus === 'changes_requested' : row.invoice?.status === filter));
      return reply(res, 200, { rows: filtered.slice((page - 1) * 25, page * 25), total: filtered.length, page, pageSize: 25, counts, paymentConnected: false });
    }
    if (!id) fail(405, 'Method not allowed.');
    const lookup = () => {
      const review = db.prepare('SELECT * FROM work_reviews WHERE booking_id=?').get(id);
      if (!review || (userId && review.staff_user_id !== userId)) fail(404, 'Staff work record not found.');
      return review;
    };
    const review = lookup();
    if (!action && req.method === 'GET') return reply(res, 200, { row: serialize(db, review, { history: !memberRoute }), paymentConnected: false });
    if (memberRoute || req.method !== 'POST' || !action) fail(405, 'Method not allowed.');
    const data = await body(req), reason = text(data.reason, 'review reason', 5);
    if (!['approve', 'changes_requested'].includes(data.decision)) fail(400, 'Choose approve or request changes.');
    const expected = text(data.expectedStatus, 'current review status', 1, 40);
    // Only work review may set a fee. Invoice approval never accepts changed financial terms.
    if (action === 'review-invoice' && Object.hasOwn(data, 'amountPence')) fail(400, 'Request changes and review the work fee before issuing a revised invoice.');
    if (action === 'review-work' && data.decision === 'approve' && (!Number.isSafeInteger(data.amountPence) || data.amountPence < 0)) fail(400, 'Enter the independently agreed staff fee in whole pence.');
    if (action === 'review-work' && data.decision === 'changes_requested' && Object.hasOwn(data, 'amountPence')) fail(400, 'A fee is set only when approving the work.');
    const expectedInvoiceId = action === 'review-invoice' ? text(data.expectedInvoiceId, 'invoice revision', 1, 100) : null;
    transaction(db, () => {
      const current = lookup(), now = new Date().toISOString();
      if (action === 'review-work') {
        if (current.status !== expected || !['pending', 'changes_requested'].includes(current.status)) fail(409, 'Work review changed. Refresh before deciding.');
        const status = data.decision === 'approve' ? 'approved' : 'changes_requested';
        if (status === 'approved') {
          requireReviewableAssignment(db, current);
          createInvoice(db, actor, current, data.amountPence, reason);
        }
        db.prepare('UPDATE work_reviews SET status=?,review_reason=?,reviewed_by=?,reviewed_at=? WHERE booking_id=?').run(status, reason, actor.id, now, id);
        audit(db, actor, `staff_work.${status}`, 'work_reviews', id, { status: current.status },
          { status, ...(status === 'approved' ? { amountPence: data.amountPence } : {}) }, reason);
      } else {
        const invoice = db.prepare("SELECT * FROM staff_invoices WHERE booking_id=? AND status!='superseded'").get(id);
        if (current.status !== 'approved' || !invoice || invoice.id !== expectedInvoiceId || invoice.status !== expected || invoice.status !== 'awaiting_invoice_review') fail(409, 'Invoice review changed. Refresh and check the current invoice.');
        const status = data.decision === 'approve' ? 'approved_for_payment' : 'changes_requested';
        if (status === 'approved_for_payment') requireReviewableAssignment(db, current);
        db.prepare('UPDATE staff_invoices SET status=?,review_reason=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(status, reason, actor.id, now, invoice.id);
        if (status === 'changes_requested') db.prepare("UPDATE work_reviews SET status='changes_requested',review_reason=?,reviewed_by=?,reviewed_at=? WHERE booking_id=?").run(reason, actor.id, now, id);
        audit(db, actor, `staff_invoice.${status}`, 'staff_invoices', invoice.id,
          { status: invoice.status, amountPence: invoice.amount_pence }, { status, amountPence: invoice.amount_pence }, reason);
      }
    });
    return reply(res, 200, { row: serialize(db, lookup(), { history: true }), paymentConnected: false });
  }
  return { handle };
}
