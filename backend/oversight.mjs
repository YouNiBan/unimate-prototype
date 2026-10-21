import { audit } from './database.mjs';
import { readBookingSubmission } from './public/booking-details.mjs';

const fullAccess = actor => actor && ['owner', 'superadmin'].includes(actor.role);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const tableExists = (db, name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const organisationKind = kind => /^(?:organisation|organization|society|restaurant)(?:_|$)/i.test(kind || '');
const serviceOf = value => {
  const name = String(value || '').toLowerCase().replaceAll('_', ' ');
  if (['cleaning', 'cleaning service'].includes(name)) return 'cleaning';
  if (['moving', 'moving service'].includes(name)) return 'moving';
  if (['airport transfer', 'airport transfers', 'airport'].includes(name)) return 'airport_transfer';
  return 'other';
};
const serviceTitles = { all: 'All services', cleaning: 'Cleaning', moving: 'Moving', airport_transfer: 'Airport transfers', other: 'Other bookings' };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const todayInLondon = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const reply = (res, value) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); return true; };

function staffMemberships(db, userId) {
  if (!tableExists(db, 'staff_user_links')) return [];
  return db.prepare(`SELECT m.id,m.team,m.status FROM staff_user_links l JOIN team_members m ON m.id=l.member_id
    WHERE l.user_id=? ORDER BY m.team,m.id`).all(userId);
}
function accountSummary(db, user) {
  const credentials = tableExists(db, 'member_credentials') ? db.prepare('SELECT verified_at FROM member_credentials WHERE user_id=?').get(user.id) : null;
  const staff = staffMemberships(db, user.id), activeTeams = [...new Set(staff.filter(member => member.status === 'active' && ['cleaners', 'drivers', 'movers'].includes(member.team)).map(member => member.team))];
  const emailVerified = !!credentials?.verified_at;
  const requested=tableExists(db,'member_account_requests')?db.prepare('SELECT r.account_type,a.status FROM member_account_requests r LEFT JOIN approvals a ON a.id=r.approval_id WHERE r.user_id=?').get(user.id):null;
  const recordType = requested&&['organisation','seller','staff'].includes(requested.account_type)?requested.account_type:organisationKind(user.kind) ? 'organisation' : staff.length || /^staff(?:_|$)/i.test(user.kind) ? 'staff' : user.kind === 'student' ? 'student' : 'other';
  const appAccess = user.status !== 'active' ? 'suspended' : !credentials ? 'no_account' : !emailVerified ? 'unverified' : activeTeams.length ? 'staff' : 'student';
  return { id: user.id, name: user.name, email: user.email, recordType, recordedKind: user.kind, approvalStatus:requested?.status||null, status: user.status, createdAt: user.created_at, emailVerified, appAccess, staffTeams: activeTeams, staffMemberships: staff };
}
function capabilities(db) {
  const support = tableExists(db, 'support_conversations');
  return [
    { id: 'accounts', label: 'Member accounts', status: tableExists(db, 'member_credentials') ? 'available' : 'not_connected', detail: 'Verification and account state are shown from saved records.' },
    { id: 'bookings', label: 'Student and staff bookings', status: tableExists(db, 'booking_owners') ? 'available' : 'not_connected', detail: 'Review the same saved booking records, assignments and private photos used by connected accounts.' },
    { id: 'support', label: 'Support conversations', status: support ? 'available' : 'not_connected', detail: support ? 'Conversation status and references are available. Open the support workspace to review messages.' : 'Shared support conversations are not connected to this installation yet.' },
    { id: 'organisations', label: 'Organisation workspace', status: 'not_connected', detail: 'Organisation records may be saved here. A connected organisation app workspace is not available yet.' },
  ];
}
function requestedDate(submission) {
  const saved = readBookingSubmission(submission);
  if (!saved) return null;
  for (const value of [saved.requestedDate, saved.requested_date, saved.intake?.requestedDate]) if (validDate(value)) return value;
  const fields = [...(Array.isArray(saved.intake?.fields) ? saved.intake.fields : []), ...(Array.isArray(saved.fields) ? saved.fields : [])];
  const field = fields.find(field => field && typeof field.label === 'string' && field.label.toLowerCase().trim() === 'requested date' && validDate(field.value));
  return field?.value || null;
}
function supportFor(db, userId) {
  if (!tableExists(db, 'support_conversations')) return { available: false, total: 0, open: 0, rows: [] };
  const total = db.prepare('SELECT count(*) n FROM support_conversations WHERE participant_id=?').get(userId).n;
  const open = db.prepare("SELECT count(*) n FROM support_conversations WHERE participant_id=? AND status='open'").get(userId).n;
  const rows = db.prepare('SELECT id,category,status,booking_id,created_at,updated_at FROM support_conversations WHERE participant_id=? ORDER BY updated_at DESC,id LIMIT 50').all(userId).map(row => ({
    id: row.id, category: row.category, status: row.status, bookingId: row.booking_id, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  return { available: true, total, open, rows };
}

export function createOversight({ db, sharedBookings }) {
  if (!db || !sharedBookings?.detail) throw new Error('Oversight requires the shared booking serializer.');
  function accounts() {
    return db.prepare('SELECT id,name,email,kind,status,created_at FROM users ORDER BY name,id').all().map(user => accountSummary(db, user));
  }
  async function handle(req, res, url, actor) {
    const match = /^\/api\/oversight(?:\/accounts(?:\/([^/]+))?)?$/.exec(url.pathname);
    if (!match) return false;
    if (!actor) fail(401, 'Please sign in.');
    if (!fullAccess(actor)) fail(403, 'Owner or SuperAdmin access required.');
    if (req.method !== 'GET') fail(405, 'Oversight is read only.');
    const id = match[1];
    if (id) {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) fail(404, 'Account not found.');
      const user = db.prepare('SELECT id,name,email,kind,status,created_at FROM users WHERE id=?').get(id);
      if (!user) fail(404, 'Account not found.');
      const ownedIds = tableExists(db, 'booking_owners') ? db.prepare('SELECT b.id FROM booking_owners o JOIN bookings b ON b.id=o.booking_id WHERE o.user_id=? ORDER BY b.created_at DESC,b.id').all(id) : [];
      const assignedIds = tableExists(db, 'staff_user_links') ? db.prepare(`SELECT DISTINCT b.id,b.created_at FROM staff_user_links l
        JOIN booking_assignments a ON a.member_id=l.member_id JOIN bookings b ON b.id=a.booking_id
        WHERE l.user_id=? ORDER BY b.created_at DESC,b.id`).all(id) : [];
      const ownedBookings = ownedIds.slice(0, 50).map(row => sharedBookings.detail(row.id, { admin: true })?.row).filter(Boolean);
      const assignedBookings = assignedIds.slice(0, 50).map(row => sharedBookings.detail(row.id, { admin: true })?.row).filter(Boolean);
      const support = supportFor(db, id);
      audit(db, actor, 'oversight.account_viewed', 'users', id, null, { owned_bookings: ownedIds.length, assigned_bookings: assignedIds.length, support_conversations: support.total }, 'Administrator inspected account records without impersonation');
      return reply(res, { account: accountSummary(db, user), ownedBookings, assignedBookings, ownedTotal: ownedIds.length, assignedTotal: assignedIds.length, bookingLimit: 50, support, capabilities: capabilities(db), reviewMode: 'administrator' });
    }
    if (url.pathname.endsWith('/accounts')) {
      const q = (url.searchParams.get('q') || '').trim(), role = url.searchParams.get('role') || 'all', page = Number(url.searchParams.get('page') || 1);
      if (q.length > 100 || !['all', 'student', 'staff', 'seller', 'organisation'].includes(role) || !Number.isSafeInteger(page) || page < 1 || page > 100000) fail(400, 'Check the account filters.');
      const query = q.toLocaleLowerCase('en-GB');
      const rows = accounts().filter(account => (role === 'all' || account.recordType === role) && (!query || `${account.name}\n${account.email}`.toLocaleLowerCase('en-GB').includes(query)));
      return reply(res, { rows: rows.slice((page - 1) * 25, page * 25), total: rows.length, page, pageSize: 25, role, q, reviewMode: 'administrator' });
    }
    const service = url.searchParams.get('service') || 'all';
    if (!Object.hasOwn(serviceTitles, service)) fail(400, 'Choose a service.');
    const allAccounts = accounts(), allBookings = db.prepare('SELECT id,title,customer,service,status,created_at FROM bookings ORDER BY created_at DESC,id').all();
    const bookings = allBookings.filter(row => service === 'all' || serviceOf(row.service) === service);
    const byService = Object.entries(serviceTitles).filter(([key]) => key !== 'all').map(([key, label]) => {
      const rows = allBookings.filter(row => serviceOf(row.service) === key), statuses = {};
      for (const row of rows) statuses[row.status] = (statuses[row.status] || 0) + 1;
      return { service: key, label, total: rows.length, statuses };
    });
    const byStatus = {};
    for (const row of bookings) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    const issues = [];
    const bookingIssue = (key, title, description, rows) => issues.push({ key, title, description, count: rows.length, rows: rows.slice(0, 6).map(row => ({ type: 'booking', id: row.id, title: row.title, status: row.status, service: serviceOf(row.service) })) });
    const hasPricing = tableExists(db, 'booking_pricing');
    const needsQuote = hasPricing ? bookings.filter(row => !['completed', 'cancelled', 'canceled'].includes(row.status) && db.prepare("SELECT 1 FROM booking_pricing WHERE booking_id=? AND status='unquoted'").get(row.id)) : [];
    bookingIssue('unquoted', 'Requests awaiting a quote', 'Review the service details and confirm the price before work starts.', needsQuote);
    const unassigned = bookings.filter(row => row.status === 'confirmed' && !db.prepare("SELECT 1 FROM booking_assignments a JOIN team_members m ON m.id=a.member_id WHERE a.booking_id=? AND m.status='active'").get(row.id));
    bookingIssue('unassigned', 'Confirmed bookings without active staff', 'Assign an active member of the service team.', unassigned);
    const today = todayInLondon();
    const pastRequests = bookings.filter(row => {
      if (!['requested', 'pending'].includes(row.status)) return false;
      const saved = db.prepare("SELECT details_json FROM submission_details WHERE resource='bookings' AND record_id=?").get(row.id);
      const date = requestedDate(saved?.details_json);
      return date && date < today;
    });
    bookingIssue('past_request_date', 'Requests with a date in the past', 'Check the requested date and agree the next step with the customer.', pastRequests);
    const suspended = allAccounts.filter(account => account.status === 'suspended');
    issues.push({ key: 'suspended_accounts', title: 'Suspended accounts', description: 'These accounts cannot access the app. Review their saved account state when needed.', count: suspended.length, rows: suspended.slice(0, 6).map(account => ({ type: 'account', id: account.id, title: account.name, status: account.status })) });
    const supportAvailable = tableExists(db, 'support_conversations');
    const supportRows = supportAvailable ? db.prepare("SELECT id,category,status,booking_id,updated_at FROM support_conversations WHERE status='open' ORDER BY updated_at,id").all() : [];
    issues.push({ key: 'open_support', title: 'Open support conversations', description: supportAvailable ? 'Review open conversations in the support workspace.' : 'Shared support is not connected yet.', count: supportRows.length, available: supportAvailable, rows: supportRows.slice(0, 6).map(row => ({ type: 'support', id: row.id, title: `${row.category} support`, status: row.status, bookingId: row.booking_id, updatedAt: row.updated_at })) });
    const activeVerified = allAccounts.filter(account => account.status === 'active' && account.emailVerified);
    return reply(res, {
      reviewMode: 'administrator', service, serviceLabel: serviceTitles[service], today,
      counts: { bookings: bookings.length, activeVerifiedStudents: activeVerified.filter(account => account.appAccess === 'student' && account.recordType === 'student').length, activeVerifiedStaff: activeVerified.filter(account => account.appAccess === 'staff').length, organisationRecords: allAccounts.filter(account => account.recordType === 'organisation').length, suspendedAccounts: suspended.length },
      byService, byStatus, issues, capabilities: capabilities(db),
      note: 'These are checks of saved workflow records, not automated bug detection or a signed-in user preview.',
    });
  }
  return { handle };
}
