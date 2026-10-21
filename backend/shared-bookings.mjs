import {teamForService} from './departments.mjs';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, lstatSync, realpathSync, constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { audit, transaction } from './database.mjs';
import { createBookingInvoice } from './invoices.mjs';
import { readBookingSubmission } from './public/booking-details.mjs';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS_PER_GROUP = 12;
const services = new Set(['cleaning', 'moving', 'airport_transfer']);
const groups = new Set(['request', 'before', 'completion']);
const fullAccess = actor => actor && ['owner', 'superadmin'].includes(actor.role);
const inside = path => !path || (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path));
const serviceTeams = { cleaning: 'cleaners', moving: 'movers', airport_transfer: 'drivers' };
const serviceTitles = { cleaning: 'Cleaning', moving: 'Moving', airport_transfer: 'Airport transfer' };
const londonDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function text(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, `Check ${label}.`);
  return value.trim();
}
async function jsonBody(req, max = 16384) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'JSON required.');
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > max) fail(413, 'Request too large.');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) fail(413, 'Request too large.');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid request.'); }
  if (!object(value)) fail(400, 'Invalid request.');
  return value;
}
function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value)); return true;
}
function requestedDate(value) {
  const date = text(value, 10, 10, 'requested date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail(400, 'Enter a valid requested date.');
  return date;
}
function validPng(bytes) {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8, sawData = false, first = true;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) return false;
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (first) {
      if (kind !== 'IHDR' || length !== 13) return false;
      const width = bytes.readUInt32BE(offset + 8), height = bytes.readUInt32BE(offset + 12);
      if (!width || !height || width > 20000 || height > 20000 || width * height > 100000000) return false;
      first = false;
    }
    if (kind === 'IDAT') sawData = true;
    if (kind === 'IEND') return length === 0 && end === bytes.length && sawData;
    offset = end;
  }
  return false;
}
export function decodePhoto(data) {
  const mime = text(data.mime, 9, 20, 'image format').toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) fail(400, 'Use a PNG, JPEG or WebP photo.');
  const encoded = data.base64;
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) fail(413, 'Each photo must be 5 MB or smaller.');
  if (!encoded.length || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail(400, 'Invalid image data.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) fail(413, 'Each photo must be 5 MB or smaller.');
  if (bytes.toString('base64') !== encoded) fail(400, 'Invalid image data.');
  const valid = mime === 'image/png' ? validPng(bytes)
    : mime === 'image/jpeg' ? bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
    : bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.readUInt32LE(4) + 8 === bytes.length && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
  if (!valid) fail(400, 'The file does not match its image format or is incomplete.');
  const filename = text(data.filename, 1, 180, 'photo filename').split(/[/\\]/).pop();
  if (!filename || filename === '.' || filename === '..') fail(400, 'Check photo filename.');
  return { bytes, mime, filename };
}
const mediaUrl = (bookingId, mediaId, admin = false) => `/api/${admin ? '' : 'member/'}bookings/${encodeURIComponent(bookingId)}/photos/${encodeURIComponent(mediaId)}`;
function mediaMetadata(db, id, admin = false) {
  return db.prepare('SELECT id,photo_group,original_name,mime,byte_length,created_at FROM booking_media WHERE booking_id=? ORDER BY created_at,id').all(id).map(row => ({
    id: row.id, group: row.photo_group, filename: row.original_name, mime: row.mime, bytes: row.byte_length, createdAt: row.created_at, url: mediaUrl(id, row.id, admin),
  }));
}

// Trusted server-side serializer. The caller must authorize access before using it.
export function getBookingDetail(db, id, { admin = false } = {}) {
  const row = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
  if (!row) return null;
  const saved = db.prepare("SELECT details_json FROM submission_details WHERE resource='bookings' AND record_id=?").get(id);
  const submission = readBookingSubmission(saved?.details_json);
  const assignment = db.prepare('SELECT a.member_id,a.starts_at,a.ends_at,m.name,m.team,m.status FROM booking_assignments a JOIN team_members m ON m.id=a.member_id WHERE a.booking_id=?').get(id) || null;
  const pricingStatus = db.prepare('SELECT status FROM booking_pricing WHERE booking_id=?').get(id)?.status || 'legacy';
  const photos = mediaMetadata(db, id, admin);
  return {
    row: { ...row, submission, assignment, photos, pricingStatus, team:teamForService(db,row.service), ...(saved && !submission ? { submissionUnavailable: true } : {}) },
    submission, assignment, photos, pricingStatus,
  };
}

export function createSharedBookings({ db, mediaDirectory, memberAuth, scopes = null, onComplete = null, onCreated = null }) {
  if (!db || !mediaDirectory || !memberAuth?.authenticate || !memberAuth?.requireMutation) throw new Error('Shared bookings require a database, private media directory and member authentication.');
  const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));
  const intendedDirectory = resolve(mediaDirectory), publicRelative = relative(publicDirectory, intendedDirectory);
  if (inside(publicRelative)) throw new Error('Booking media must be outside the public directory.');
  mkdirSync(intendedDirectory, { recursive: true, mode: 0o700 });
  if (lstatSync(intendedDirectory).isSymbolicLink()) throw new Error('Private media directory must not be a symbolic link.');
  const mediaRoot = realpathSync(intendedDirectory), realRelative = relative(realpathSync(publicDirectory), mediaRoot);
  if (inside(realRelative)) throw new Error('Booking media must be outside the public directory.');
  chmodSync(mediaRoot, 0o700);
  db.exec(`
    CREATE TABLE IF NOT EXISTS booking_owners(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),user_id TEXT NOT NULL REFERENCES users(id));
    CREATE INDEX IF NOT EXISTS booking_owners_user_idx ON booking_owners(user_id);
    CREATE TABLE IF NOT EXISTS staff_user_links(member_id TEXT PRIMARY KEY REFERENCES team_members(id),user_id TEXT NOT NULL REFERENCES users(id));
    CREATE INDEX IF NOT EXISTS staff_user_links_user_idx ON staff_user_links(user_id);
    CREATE TABLE IF NOT EXISTS booking_pricing(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),status TEXT NOT NULL CHECK(status IN ('unquoted','confirmed')));
    CREATE TABLE IF NOT EXISTS booking_media(
      id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),photo_group TEXT NOT NULL CHECK(photo_group IN ('request','before','completion')),
      stored_name TEXT NOT NULL UNIQUE,original_name TEXT NOT NULL,mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
      byte_length INTEGER NOT NULL CHECK(byte_length>0 AND byte_length<=5242880),uploaded_by TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS booking_media_booking_idx ON booking_media(booking_id,photo_group,created_at);
  `);

  function permissions(id, session, actor) {
    const row = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    if (!row) fail(404, 'Booking not found.');
    if (fullAccess(actor) || scopes?.access(actor).canViewBookings) return { row, admin: true, owner: false, staff: false };
    const user = session?.user;
    if (!user || !db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(user.id)) fail(401, 'Sign in to view your bookings.');
    const owner = !!db.prepare('SELECT 1 FROM booking_owners WHERE booking_id=? AND user_id=?').get(id, user.id);
    // Resolve assignments and activation on every access, rather than trusting session roles or team claims.
    const staff = !!db.prepare(`SELECT 1 FROM booking_assignments a JOIN team_members m ON m.id=a.member_id
      JOIN staff_user_links l ON l.member_id=m.id WHERE a.booking_id=? AND l.user_id=? AND m.status='active' AND m.team=?`).get(id, user.id, serviceTeams[row.service] || '');
    if (!owner && !staff) fail(404, 'Booking not found.');
    return { row, owner, staff, admin: false };
  }
  function requirePhotoWrite(access, group) {
    if (access.admin) return;
    if (group === 'request' && access.owner) return;
    if (group !== 'request' && access.staff) return;
    fail(403, 'You cannot add photos to this booking stage.');
  }
  const detail = (id, options) => getBookingDetail(db, id, options);
  async function handle(req, res, url, adminActor = null) {
    const match = /^\/api\/member\/bookings(?:\/([^/]+)(?:\/(status|photos)(?:\/([^/]+))?)?)?$/.exec(url.pathname);
    if (!match) return false;
    if (!['GET', 'POST'].includes(req.method)) fail(405, 'Method not allowed.');
    if (adminActor && !(fullAccess(adminActor)||(req.method==='GET'&&scopes?.access(adminActor).canViewBookings))) fail(403, 'Owner or SuperAdmin access required.');
    const session = adminActor ? null : await memberAuth.authenticate(req);
    if (!adminActor && (!session?.user || !db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(session.user.id))) fail(401, 'Sign in to view your bookings.');
    if (req.method === 'POST' && !adminActor) await memberAuth.requireMutation(req, session);
    // Admin CSRF and exact-origin checks belong to the server before this handler.
    const actor = adminActor || session.user;
    const [, rawId, action, rawMediaId] = match;
    let id, mediaId;
    try { id = rawId && decodeURIComponent(rawId); mediaId = rawMediaId && decodeURIComponent(rawMediaId); } catch { fail(404, 'Not found.'); }
    if ((id && !/^[A-Za-z0-9_-]{1,100}$/.test(id)) || (mediaId && !/^[A-Za-z0-9_-]{1,100}$/.test(mediaId))) fail(404, 'Not found.');
    if (!id && req.method === 'GET') {
      let rows;
      if (fullAccess(adminActor)||scopes?.access(adminActor).canViewBookings) rows = db.prepare('SELECT id FROM bookings ORDER BY created_at DESC,id').all();
      else rows = db.prepare(`SELECT DISTINCT b.id FROM bookings b
        LEFT JOIN booking_owners o ON o.booking_id=b.id
        LEFT JOIN booking_assignments a ON a.booking_id=b.id
        LEFT JOIN team_members m ON m.id=a.member_id
        LEFT JOIN staff_user_links l ON l.member_id=m.id
        WHERE o.user_id=? OR (l.user_id=? AND m.status='active' AND
          m.team=CASE b.service WHEN 'cleaning' THEN 'cleaners' WHEN 'moving' THEN 'movers' WHEN 'airport_transfer' THEN 'drivers' ELSE '' END)
        ORDER BY b.created_at DESC,b.id`).all(session.user.id, session.user.id);
      return reply(res, 200, { rows: rows.map(row => detail(row.id).row) });
    }
    if (!id && req.method === 'POST') {
      if (!session?.user || session.user.role !== 'student') fail(403, 'Only a student account can request a booking.');
      const data = await jsonBody(req);
      if (!services.has(data.service)) fail(400, 'Choose cleaning, moving or airport transfer.');
      const date = requestedDate(data.requestedDate), address = text(data.address, 3, 500, 'address'), notes = text(data.notes ?? '', 0, 4000, 'booking notes');
      const title = data.title === undefined ? `${serviceTitles[data.service]} request` : text(data.title, 2, 120, 'booking title');
      const bookingId = randomUUID(), now = new Date().toISOString();
      const submission = { intake: { fields: [{ label: 'Requested date', value: date }, { label: 'Address / route', value: address }, ...(notes ? [{ label: 'Special instructions', value: notes }] : [])], photos: [] } };
      transaction(db, () => {
        if (!db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(session.user.id)) fail(401, 'Sign in to request a booking.');
        db.prepare("INSERT INTO bookings(id,title,customer,service,status,amount_pence,created_at) VALUES(?,?,?,?,'requested',0,?)").run(bookingId, title, session.user.name, data.service, now);
        db.prepare('INSERT INTO booking_owners VALUES(?,?)').run(bookingId, session.user.id);
        db.prepare("INSERT INTO booking_pricing VALUES(?,'unquoted')").run(bookingId);
        db.prepare("INSERT INTO submission_details VALUES('bookings',?,?)").run(bookingId, JSON.stringify(submission));
        audit(db, actor, 'booking.requested', 'bookings', bookingId, null, { status: 'requested', pricingStatus: 'unquoted', service: data.service }, 'Member requested a service; quote pending');
      });
      if(onCreated)onCreated(bookingId);
      return reply(res, 201, detail(bookingId));
    }
    if (!id) fail(405, 'Method not allowed.');
    const access = permissions(id, session, adminActor);
    if (!action && req.method === 'GET') return reply(res, 200, detail(id));
    if (action === 'status' && req.method === 'POST' && !mediaId) {
      if (!access.staff && !access.admin) fail(403, 'Only assigned staff can update service progress.');
      const data = await jsonBody(req);
      const status = data.status || ({ start: 'in_progress', complete: 'completed' })[data.action];
      if (!['in_progress', 'completed'].includes(status)) fail(400, 'Choose start or complete.');
      const expected = text(data.expectedStatus, 1, 30, 'current booking status'), note = text(data.notes ?? data.reason ?? '', 0, 2000, 'progress note');
      let invoice = null;
      transaction(db, () => {
        const current = permissions(id, session, adminActor).row;
        if (current.status !== expected) fail(409, 'Booking changed. Refresh first.');
        if (status === 'in_progress' && !['assigned', 'confirmed'].includes(current.status)) fail(409, 'Only an assigned or confirmed booking can be started.');
        if (status === 'completed' && current.status !== 'in_progress') fail(409, 'Start the service before completing it.');
        const details = detail(id);
        if (details.pricingStatus === 'unquoted') fail(409, 'Confirm a booking price before starting or completing the service.');
        db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, id);
        if (status === 'completed' && onComplete) onComplete(actor,current);
        if (status === 'completed' && details.pricingStatus === 'confirmed') invoice = createBookingInvoice(db, actor, current, londonDate());
        audit(db, actor, `booking.${status}`, 'bookings', id, { status: current.status }, { status, invoice_reference: invoice?.reference || null }, note || 'Assigned staff updated service progress');
      });
      return reply(res, 200, { ...detail(id), invoice });
    }
    if (action === 'photos' && req.method === 'POST' && !mediaId) {
      const data = await jsonBody(req, Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 4096);
      if (!groups.has(data.group)) fail(400, 'Choose a request, before-service or completion photo.');
      requirePhotoWrite(access, data.group);
      const photo = decodePhoto(data), photoId = randomUUID(), storedName = `${randomUUID()}.image`, filename = resolve(mediaRoot, storedName);
      let saved = false;
      try {
        const file = await open(filename, 'wx', 0o600);
        try { await file.writeFile(photo.bytes); } finally { await file.close(); }
        transaction(db, () => {
          requirePhotoWrite(permissions(id, session, adminActor), data.group);
          if (db.prepare('SELECT count(*) n FROM booking_media WHERE booking_id=? AND photo_group=?').get(id, data.group).n >= MAX_PHOTOS_PER_GROUP) fail(409, 'This booking stage already has 12 photos.');
          db.prepare('INSERT INTO booking_media VALUES(?,?,?,?,?,?,?,?,?)').run(photoId, id, data.group, storedName, photo.filename, photo.mime, photo.bytes.length, actor.id, new Date().toISOString());
          audit(db, actor, 'booking.photo_added', 'bookings', id, null, { photo_id: photoId, group: data.group }, 'Private booking photo uploaded');
        });
        saved = true;
      } finally { if (!saved) await unlink(filename).catch(() => {}); }
      return reply(res, 201, { photo: mediaMetadata(db, id).find(item => item.id === photoId) });
    }
    if (action === 'photos' && req.method === 'GET' && mediaId) {
      const photo = db.prepare('SELECT * FROM booking_media WHERE id=? AND booking_id=?').get(mediaId, id);
      if (!photo || !/^[a-f0-9-]{36}\.image$/.test(photo.stored_name)) fail(404, 'Photo not found.');
      let file;
      try { file = await open(resolve(mediaRoot, photo.stored_name), constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail(404, 'Photo unavailable.'); }
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size !== photo.byte_length) fail(404, 'Photo unavailable.');
        permissions(id, session, adminActor);
        res.writeHead(200, { 'Content-Type': photo.mime, 'Content-Length': photo.byte_length, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
        await pipeline(file.createReadStream({ autoClose: false }), res);
      } finally { await file.close(); }
      return true;
    }
    fail(405, 'Method not allowed.');
  }
  return { handle, detail };
}
