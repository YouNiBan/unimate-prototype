import {profilePhoto} from './social-profiles.mjs';
import {teamForService} from './departments.mjs';
import { randomUUID } from 'node:crypto';
import {recordReference} from './references.mjs';
import { audit, transaction } from './database.mjs';
import { digest } from './security.mjs';

const staffRoles = new Set(['owner', 'superadmin', 'support']);
const categories = new Set(['general', 'booking', 'technical']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const maximumAttachmentBytes = 5 * 1024 * 1024;
const maximumRequestBytes = 22 * 1024 * 1024;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const reply = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
  return true;
};
function plainText(value, min, max, label) {
  if (typeof value !== 'string' || value.length > max) fail(400, `Use ${min}–${max} characters for ${label}.`);
  const result = value.replace(/\r\n/g, '\n').trim();
  if (result.length < min || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)
    || /<\s*[a-z/!][^>]*>/i.test(result)) fail(400, `Enter ${label} as plain text.`);
  return result;
}
function clientId(value) {
  if (typeof value !== 'string' || !uuid.test(value)) fail(400, 'A valid message reference is required.');
  return value.toLowerCase();
}
function pagination(url) {
  const value = url.searchParams.get('page') || '1';
  if (!/^[1-9][0-9]{0,4}$/.test(value)) fail(400, 'Choose a valid page.');
  return Number(value);
}
function search(url) {
  const q = url.searchParams.get('q') || '';
  if (q.length > 100) fail(400, 'Search is too long.');
  return '%' + q.trim().replace(/[\\%_]/g, '\\$&') + '%';
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON required.');
  if (Number(req.headers['content-length']) > maximumRequestBytes) fail(413, 'Request too large.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximumRequestBytes) fail(413, 'Request too large.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
    return data;
  } catch { fail(400, 'Invalid request.'); }
}
function validPng(bytes) {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8, sawData = false, first = true;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) return false;
    const kind = bytes.toString('latin1', offset + 4, offset + 8);
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
export function decodeSupportAttachments(value) { return attachments(value); }
function attachments(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) fail(400, 'Attach up to 3 files per message.');
  return value.map(file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) fail(400, 'Invalid attachment.');
    const mime = typeof file.mime === 'string' ? file.mime.toLowerCase() : '';
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(mime)) fail(400, 'Use PNG, JPEG, WebP or PDF attachments.');
    if (typeof file.filename !== 'string' || !file.filename.length || file.filename.length > 180 || !file.filename.isWellFormed()
      || /[\u0000-\u001f\u007f]/.test(file.filename)) fail(400, 'Check the attachment filename.');
    const filename = file.filename.split(/[/\\]/).pop().trim();
    if (!filename || filename === '.' || filename === '..') fail(400, 'Check the attachment filename.');
    const encoded = file.base64;
    if (typeof encoded !== 'string') fail(400, 'Invalid attachment data.');
    if (encoded.length > Math.ceil(maximumAttachmentBytes / 3) * 4) fail(413, 'Each attachment must be 5 MB or smaller.');
    if (!encoded.length || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail(400, 'Invalid attachment data.');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > maximumAttachmentBytes) fail(413, 'Each attachment must be 5 MB or smaller.');
    if (bytes.toString('base64') !== encoded) fail(400, 'Invalid attachment data.');
    const valid = mime === 'image/png' ? validPng(bytes)
      : mime === 'image/jpeg' ? bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
      : mime === 'image/webp' ? bytes.length >= 20 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.readUInt32LE(4) + 8 === bytes.length && bytes.toString('latin1', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('latin1', 12, 16))
      : bytes.length >= 20 && /^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(bytes.toString('latin1', 0, 12)) && /%%EOF[\t\r\n ]*$/.test(bytes.subarray(Math.max(0, bytes.length - 1024)).toString('latin1'));
    if (!valid) fail(400, 'The attachment does not match its file format or is incomplete.');
    return { filename, mime, bytes, sha256: digest(bytes) };
  });
}

// The server enforces exact origins and administrator CSRF before this handler.
// Member endpoints always authenticate a member, even when an admin cookie exists.
export function createSupportChat({ db, memberAuth, scopes = null }) {
  if (!db || !memberAuth?.authenticate || !memberAuth?.requireMutation) throw new Error('Support requires member authentication and a database.');
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_conversations(
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL REFERENCES users(id),
      subject TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('general','booking','technical')),
      status TEXT NOT NULL CHECK(status IN ('open','closed')),
      booking_id TEXT REFERENCES bookings(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS support_participant_idx ON support_conversations(participant_id,status,updated_at DESC,id);
    CREATE INDEX IF NOT EXISTS support_status_idx ON support_conversations(status,updated_at DESC,id);
    CREATE TABLE IF NOT EXISTS support_messages(
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL REFERENCES support_conversations(id),
      sender_kind TEXT NOT NULL CHECK(sender_kind IN ('member','support')),
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      body TEXT NOT NULL,
      client_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('create','reply')),
      created_at TEXT NOT NULL,
      UNIQUE(sender_kind,sender_id,client_id)
    );
    CREATE INDEX IF NOT EXISTS support_message_conversation_idx ON support_messages(conversation_id,sequence DESC);
    CREATE TABLE IF NOT EXISTS support_attachments(
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES support_messages(id),
      filename TEXT NOT NULL,
      mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','application/pdf')),
      byte_length INTEGER NOT NULL CHECK(byte_length>0 AND byte_length<=5242880),
      sha256 TEXT NOT NULL,
      bytes BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS support_attachment_message_idx ON support_attachments(message_id);
    CREATE TABLE IF NOT EXISTS support_read_state(
      conversation_id TEXT NOT NULL REFERENCES support_conversations(id),
      reader_kind TEXT NOT NULL CHECK(reader_kind IN ('member','support')),
      reader_id TEXT NOT NULL,
      last_sequence INTEGER NOT NULL,
      PRIMARY KEY(conversation_id,reader_kind,reader_id)
    );
    CREATE TABLE IF NOT EXISTS support_rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
  `);
  const tableExists = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const roleSql = () => tableExists('staff_user_links')
    ? "CASE WHEN EXISTS(SELECT 1 FROM staff_user_links l JOIN team_members t ON t.id=l.member_id WHERE l.user_id=u.id AND t.status='active' AND t.team IN ('cleaners','drivers','movers')) THEN 'staff' ELSE 'student' END"
    : "'student'";
  db.exec('CREATE TABLE IF NOT EXISTS support_conversation_teams(conversation_id TEXT PRIMARY KEY REFERENCES support_conversations(id),team_id TEXT NOT NULL)');
  function participant(id, requireActive = false) {
    const row = db.prepare(`SELECT u.id,u.name,u.status,c.verified_at,${roleSql()} role
      FROM users u LEFT JOIN member_credentials c ON c.user_id=u.id WHERE u.id=?`).get(id);
    if (!row || (requireActive && (row.status !== 'active' || !row.verified_at))) fail(400, 'Choose an active, email-confirmed account.');
    return { id: row.id, name: row.name, role: row.role };
  }
  function authenticate(req, memberRoute, adminActor) {
    if (memberRoute) {
      const session = memberAuth.authenticate(req);
      if (!session?.user) fail(401, 'Sign in to contact support.');
      participant(session.user.id, true);
      if (req.method === 'POST') memberAuth.requireMutation(req, session);
      return { id: session.user.id, name: session.user.name, kind: 'member', session };
    }
    if (!adminActor) fail(401, 'Please sign in.');
    const current = db.prepare('SELECT id,name,role,active FROM admins WHERE id=?').get(adminActor.id);
    if (!current?.active || !(staffRoles.has(current.role)||(current.role==='admin'&&scopes?.enabled))) fail(403, 'Support team access required.');
    if(scopes?.enabled&&!scopes.access(current).inboxes.length)fail(403,'No team inbox has been approved for your account.');
    return { id: current.id, name: current.name, role:current.role, kind: 'support' };
  }
  function accessible(id, actor) {
    const row = db.prepare('SELECT * FROM support_conversations WHERE id=?').get(id);
    if (!row || (actor.kind === 'member' && row.participant_id !== actor.id)) fail(404, 'Conversation not found.');
    if (actor.kind === 'member' && row.booking_id && !canAccessBooking(row.booking_id, actor.id)) fail(404, 'Conversation not found.');
    if(actor.kind==='support'&&scopes?.enabled&&!scopes.access(actor).inboxes.includes(conversationTeam(row).id))fail(404,'Conversation not found.');
    return row;
  }
  function unread(id, actor) {
    return db.prepare(`SELECT count(*) n FROM support_messages
      WHERE conversation_id=? AND sender_kind<>?
      AND sequence>COALESCE((SELECT last_sequence FROM support_read_state WHERE conversation_id=? AND reader_kind=? AND reader_id=?),0)`)
      .get(id, actor.kind, id, actor.kind, actor.id).n;
  }
  function conversationTeam(row){const assigned=db.prepare('SELECT team_id FROM support_conversation_teams WHERE conversation_id=?').get(row.id);if(assigned)return teamForService(db,assigned.team_id);const service=row.booking_id?db.prepare('SELECT service FROM bookings WHERE id=?').get(row.booking_id)?.service:null;return teamForService(db,service)||teamForService(db,row.category==='technical'?'technical':'support');}
  function avatarUrl(row,actor){if(!tableExists('member_profile_content'))return null;const p=db.prepare('SELECT length(avatar) size,revision FROM member_profile_content WHERE user_id=?').get(row.participant_id);return p?.size?`/api/${actor.kind==='member'?'member/':''}support/${row.id}/avatar?v=${p.revision}`:null;}
  function rowValue(row, actor) {
    const last = db.prepare('SELECT body FROM support_messages WHERE conversation_id=? ORDER BY sequence DESC LIMIT 1').get(row.id);
    return {
      id: row.id, reference:recordReference(db,'support',row.id,row.created_at), subject: row.subject, category: row.category, status: row.status,
      teamName:conversationTeam(row)?.name,teamId:conversationTeam(row)?.id,participant: {...participant(row.participant_id),avatarUrl:avatarUrl(row,actor)}, updatedAt: row.updated_at,
      lastMessage: last ? last.body || 'Attachment' : '',
      unreadCount: unread(row.id, actor), bookingId: row.booking_id,
      bookingReference: row.booking_id ? recordReference(db,'booking',row.booking_id,db.prepare('SELECT created_at FROM bookings WHERE id=?').get(row.booking_id)?.created_at) : null,
      audience: row.booking_id && !db.prepare('SELECT 1 FROM booking_owners WHERE booking_id=? AND user_id=?').get(row.booking_id,row.participant_id) ? 'staff_internal' : 'client_team',
    };
  }
  function messageValue(row, actor) {
    const prefix = actor.kind === 'member' ? '/api/member/support/' : '/api/support/';
    const files = db.prepare('SELECT id,filename,mime,byte_length FROM support_attachments WHERE message_id=? ORDER BY rowid').all(row.id).map(file => ({
      id: file.id, filename: file.filename, mime: file.mime, bytes: file.byte_length,
      url: `${prefix}${row.conversation_id}/attachments/${file.id}`,
    }));
    return { id: row.id, reference:recordReference(db,'message',row.id,row.created_at), body: row.body, createdAt: row.created_at, sender: { id:actor.kind==='member'&&row.sender_kind==='support'?'team:'+conversationTeam(db.prepare('SELECT * FROM support_conversations WHERE id=?').get(row.conversation_id)).id:row.sender_id, name:actor.kind==='member'&&row.sender_kind==='support'?conversationTeam(db.prepare('SELECT * FROM support_conversations WHERE id=?').get(row.conversation_id)).name:(db.prepare('SELECT name FROM users WHERE id=?').get(row.sender_id)?.name||row.sender_name), avatarUrl:row.sender_kind==='member'?avatarUrl(db.prepare('SELECT * FROM support_conversations WHERE id=?').get(row.conversation_id),actor):null, kind: row.sender_kind }, clientId: row.client_id, attachments: files };
  }
  function detail(row, actor, page = 1) {
    return {
      conversation: rowValue(row, actor),
      messages: db.prepare('SELECT * FROM support_messages WHERE conversation_id=? ORDER BY sequence DESC LIMIT 50 OFFSET ?').all(row.id, (page - 1) * 50).reverse().map(message => messageValue(message, actor)),
      total: db.prepare('SELECT count(*) n FROM support_messages WHERE conversation_id=?').get(row.id).n,
      page,
    };
  }
  function limit(actor, action) {
    const now = Date.now(), key = `${actor.kind}:${actor.id}:${action}`;
    const maximum = action === 'create' ? 20 : action === 'reply' ? 120 : 240;
    const duration = action === 'create' ? 3600000 : 60000;
    db.prepare('DELETE FROM support_rate_limits WHERE expires<=?').run(now);
    if ((db.prepare('SELECT count FROM support_rate_limits WHERE key=?').get(key)?.count || 0) >= maximum) fail(429, 'Please wait before sending more support requests.');
    db.prepare('INSERT INTO support_rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + duration);
  }
  function bookingAccessSql(booking, user) {
    if (!tableExists('booking_owners')) return '0';
    const owner = `EXISTS(SELECT 1 FROM booking_owners o WHERE o.booking_id=${booking} AND o.user_id=${user})`;
    if (!tableExists('staff_user_links')) return owner;
    return `(${owner} OR EXISTS(SELECT 1 FROM booking_assignments a JOIN bookings b ON b.id=a.booking_id
      JOIN team_members t ON t.id=a.member_id JOIN staff_user_links l ON l.member_id=t.id
      WHERE a.booking_id=${booking} AND l.user_id=${user} AND t.status='active'
      AND t.team=CASE b.service WHEN 'cleaning' THEN 'cleaners' WHEN 'moving' THEN 'movers' WHEN 'airport_transfer' THEN 'drivers' ELSE '' END))`;
  }
  function canAccessBooking(bookingId, userId) {
    return !!db.prepare(`SELECT 1 FROM bookings job WHERE job.id=? AND ${bookingAccessSql('job.id','?')}`).get(bookingId,...(tableExists('staff_user_links')?[userId,userId]:tableExists('booking_owners')?[userId]:[]));
  }
  function bookingAllowed(bookingId, userId) {
    if (!bookingId) return;
    if (typeof bookingId !== 'string' || bookingId.length > 100 || !canAccessBooking(bookingId,userId)) fail(400, 'Choose one of this account’s bookings.');
  }
  function existing(actor, reference) {
    return db.prepare('SELECT * FROM support_messages WHERE sender_kind=? AND sender_id=? AND client_id=?').get(actor.kind, actor.id, reference);
  }
  function sameAttachments(messageId, files) {
    const saved = db.prepare('SELECT filename,mime,sha256 FROM support_attachments WHERE message_id=? ORDER BY rowid').all(messageId);
    return saved.length === files.length && saved.every((file, index) => file.filename === files[index].filename && file.mime === files[index].mime && file.sha256 === files[index].sha256);
  }
  function addMessage(conversationId, actor, messageBody, reference, operation, now, files) {
    const id = randomUUID();
    db.prepare('INSERT INTO support_messages(id,conversation_id,sender_kind,sender_id,sender_name,body,client_id,operation,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, conversationId, actor.kind, actor.id, actor.name, messageBody, reference, operation, now);
    for (const file of files) db.prepare('INSERT INTO support_attachments VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(), id, file.filename, file.mime, file.bytes.length, file.sha256, file.bytes);
    db.prepare('UPDATE support_conversations SET updated_at=? WHERE id=?').run(now, conversationId);
    return db.prepare('SELECT * FROM support_messages WHERE id=?').get(id);
  }
  async function handle(req, res, url, adminActor = null) {
    const match = /^\/api\/(member\/)?support(?:\/([^/]+)(?:\/(messages|read|status|attachments|avatar)(?:\/([^/]+))?)?)?$/.exec(url.pathname);
    if (!match) return false;
    if (!['GET', 'POST'].includes(req.method)) fail(405, 'Method not allowed.');
    const memberRoute = !!match[1], id = match[2], action = match[3], attachmentId = match[4];
    let actor = authenticate(req, memberRoute, adminActor);
    const page = pagination(url);
    if (id === 'recipients' && !action && req.method === 'GET' && !memberRoute) {
      const q = search(url);
      const where = "u.status='active' AND c.verified_at IS NOT NULL AND u.name LIKE ? ESCAPE '\\'";
      return reply(res, 200, {
        rows: db.prepare(`SELECT u.id,u.name,${roleSql()} role FROM users u JOIN member_credentials c ON c.user_id=u.id WHERE ${where} ORDER BY u.name,u.id LIMIT 25 OFFSET ?`).all(q, (page - 1) * 25),
        total: db.prepare(`SELECT count(*) n FROM users u JOIN member_credentials c ON c.user_id=u.id WHERE ${where}`).get(q).n,
        page,
      });
    }
    if (!id && req.method === 'GET') {
      const status = url.searchParams.get('status') || 'all';
      if (!['all', 'open', 'closed'].includes(status)) fail(400, 'Choose open, closed or all conversations.');
      const q = search(url), parameters = [];
      const conditions = ["(c.subject LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM record_references ref WHERE ref.kind='booking' AND ref.record_id=c.booking_id AND ref.reference LIKE ? ESCAPE '\\'))"];
      parameters.push(q, q, q);
      if (actor.kind === 'member') { conditions.push('c.participant_id=?'); parameters.push(actor.id); }
      if (actor.kind === 'member') conditions.push(`(c.booking_id IS NULL OR ${bookingAccessSql('c.booking_id','c.participant_id')})`);
      if(actor.kind==='support'&&scopes?.enabled)conditions.push(scopes.inboxSql(actor));
      const team=url.searchParams.get('team')||'';if(team){if(!['cleaning','moving','airport_transfer','technical','support'].includes(team))fail(400,'Choose a valid service team.');conditions.push("COALESCE((SELECT team_id FROM support_conversation_teams WHERE conversation_id=c.id),(SELECT service FROM bookings WHERE id=c.booking_id),CASE c.category WHEN 'technical' THEN 'technical' ELSE 'support' END)=?");parameters.push(team);}
      const base = ' FROM support_conversations c JOIN users u ON u.id=c.participant_id WHERE ' + conditions.join(' AND ');
      const counts = { open: 0, closed: 0 };
      for (const row of db.prepare(`SELECT c.status,count(*) n${base} GROUP BY c.status`).all(...parameters)) counts[row.status] = row.n;
      const unreadTotal = db.prepare(`SELECT count(*) n FROM support_messages m JOIN support_conversations c ON c.id=m.conversation_id JOIN users u ON u.id=c.participant_id
        WHERE ${conditions.join(' AND ')} AND m.sender_kind<>?
        AND m.sequence>COALESCE((SELECT r.last_sequence FROM support_read_state r WHERE r.conversation_id=c.id AND r.reader_kind=? AND r.reader_id=?),0)`)
        .get(...parameters, actor.kind, actor.kind, actor.id).n;
      const filtered = base + (status === 'all' ? '' : ' AND c.status=?');
      const values = status === 'all' ? parameters : [...parameters, status];
      return reply(res, 200, {
        rows: db.prepare(`SELECT c.*${filtered} ORDER BY c.updated_at DESC,c.id LIMIT 25 OFFSET ?`).all(...values, (page - 1) * 25).map(row => rowValue(row, actor)),
        total: db.prepare(`SELECT count(*) n${filtered}`).get(...values).n, page, counts, unread: unreadTotal,
      });
    }
    if (id && !uuid.test(id)) fail(404, 'Conversation not found.');
    if(action==='avatar'){if(req.method!=='GET'||attachmentId)fail(405,'Method not allowed.');const conversation=accessible(id,actor),photo=profilePhoto(db,conversation.participant_id);res.writeHead(200,{'Content-Type':photo.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});res.end(photo.bytes);return true;}
    if (action === 'attachments') {
      if (req.method !== 'GET') fail(405, 'Method not allowed.');
      accessible(id, actor);
      if (!attachmentId || !uuid.test(attachmentId)) fail(404, 'Attachment not found.');
      const file = db.prepare(`SELECT a.* FROM support_attachments a JOIN support_messages m ON m.id=a.message_id WHERE a.id=? AND m.conversation_id=?`).get(attachmentId, id);
      if (!file) fail(404, 'Attachment not found.');
      const name = encodeURIComponent(file.filename).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
      res.writeHead(200, {
        'Content-Type': file.mime, 'Content-Length': file.byte_length,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
        'Content-Disposition': `${file.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename="attachment${file.mime === 'application/pdf' ? '.pdf' : ''}"; filename*=UTF-8''${name}`,
      });
      res.end(Buffer.from(file.bytes));
      return true;
    }
    if (attachmentId) fail(404, 'Not found.');
    if (id && !action && req.method === 'GET') return reply(res, 200, detail(accessible(id, actor), actor, page));
    if (req.method !== 'POST') fail(405, 'Method not allowed.');
    const data = await body(req);
    // Reading a request body yields; validate the current session and account again.
    actor = authenticate(req, memberRoute, adminActor);
    if (!id) {
      const subject = plainText(data.subject, 2, 120, 'the subject');
      const files = attachments(data.attachments);
      const messageBody = plainText(data.body ?? '', files.length ? 0 : 1, 4000, 'the message'), reference = clientId(data.clientId);
      if (!categories.has(data.category)) fail(400, 'Choose a support category.');
      const recipientId = actor.kind === 'member' ? actor.id : data.recipientId;
      if (typeof recipientId !== 'string' || recipientId.length > 100) fail(400, 'Choose an account.');
      participant(recipientId, true);
      let bookingId = data.bookingId == null || data.bookingId === '' ? null : data.bookingId;
      if(data.bookingReference!=null&&data.bookingReference!==''){
        const code=typeof data.bookingReference==='string'?data.bookingReference.trim().toUpperCase():'';
        if(!/^UM-\d{6,20}$/.test(code))fail(400,'Enter a job code such as UM-000001.');
        const linked=db.prepare("SELECT record_id FROM record_references WHERE kind='booking' AND reference=?").get(code)?.record_id;
        if(!linked||(bookingId&&bookingId!==linked)||!canAccessBooking(linked,recipientId))fail(400,'Choose one of this account’s bookings.');
        bookingId=linked;
      }
      bookingAllowed(bookingId, recipientId);
      const requestedTeam=data.teamId||null;if(requestedTeam&&(actor.kind!=='support'||!['support','technical','cleaning','moving','airport_transfer'].includes(requestedTeam)))fail(400,'Choose a valid sending team.');if(requestedTeam&&bookingId&&requestedTeam!==teamForService(db,db.prepare('SELECT service FROM bookings WHERE id=?').get(bookingId)?.service)?.id)fail(400,'Sending team must match the booking service.');
      const sendingTeam=requestedTeam||(bookingId?teamForService(db,db.prepare('SELECT service FROM bookings WHERE id=?').get(bookingId)?.service)?.id:null)||(data.category==='technical'?'technical':'support');
      if(actor.kind==='support'&&scopes?.enabled&&!scopes.access(actor).inboxes.includes(sendingTeam))fail(403,'This sending team has not been approved for your account.');
      const previous = existing(actor, reference);
      if (previous) {
        const conversation = accessible(previous.conversation_id, actor);
        if (previous.operation !== 'create' || previous.body !== messageBody || !sameAttachments(previous.id, files) || conversation.subject !== subject
          || conversationTeam(conversation).id!==(requestedTeam||(bookingId?teamForService(db,db.prepare('SELECT service FROM bookings WHERE id=?').get(bookingId)?.service)?.id:null)||(data.category==='technical'?'technical':'support')) || conversation.participant_id !== recipientId || conversation.category !== data.category || conversation.booking_id !== bookingId) fail(409, 'This message reference was already used for different content.');
        return reply(res, 200, detail(conversation, actor));
      }
      const conversationId = randomUUID(), now = new Date().toISOString();
      transaction(db, () => {
        limit(actor, 'create');
        db.prepare("INSERT INTO support_conversations VALUES(?,?,?,?,'open',?,?,?)").run(conversationId, recipientId, subject, data.category, bookingId, now, now);
        if(requestedTeam)db.prepare('INSERT INTO support_conversation_teams VALUES(?,?)').run(conversationId,requestedTeam);
        addMessage(conversationId, actor, messageBody, reference, 'create', now, files);
        audit(db, actor, 'support.created', 'support_conversations', conversationId, null, { participantId: recipientId, category: data.category, bookingId, attachmentCount: files.length }, 'Support conversation created');
      });
      return reply(res, 201, detail(accessible(conversationId, actor), actor));
    }
    const conversation = accessible(id, actor);
    if (action === 'messages') {
      const files = attachments(data.attachments);
      const messageBody = plainText(data.body ?? '', files.length ? 0 : 1, 4000, 'the message'), reference = clientId(data.clientId);
      const previous = existing(actor, reference);
      if (previous) {
        if (previous.conversation_id !== id || previous.operation !== 'reply' || previous.body !== messageBody || !sameAttachments(previous.id, files)) fail(409, 'This message reference was already used for different content.');
        return reply(res, 200, { message: messageValue(previous, actor), conversation: rowValue(conversation, actor) });
      }
      if (conversation.status !== 'open') fail(409, 'This conversation is closed. Reopen it before sending a message.');
      participant(conversation.participant_id, true);
      let message;
      transaction(db, () => {
        if (accessible(id, actor).status !== 'open') fail(409, 'This conversation is closed. Reopen it before sending a message.');
        participant(conversation.participant_id, true);
        limit(actor, 'reply');
        message = addMessage(id, actor, messageBody, reference, 'reply', new Date().toISOString(), files);
        audit(db, actor, 'support.replied', 'support_conversations', id, null, { messageId: message.id, senderKind: actor.kind, attachmentCount: files.length }, 'Support reply added');
      });
      return reply(res, 201, { message: messageValue(message, actor), conversation: rowValue(accessible(id, actor), actor) });
    }
    if (action === 'read') {
      transaction(db, () => {
        limit(actor, 'read');
        const latest = db.prepare('SELECT COALESCE(max(sequence),0) n FROM support_messages WHERE conversation_id=?').get(id).n;
        const previous = db.prepare('SELECT last_sequence FROM support_read_state WHERE conversation_id=? AND reader_kind=? AND reader_id=?').get(id, actor.kind, actor.id)?.last_sequence || 0;
        if (latest > previous) {
          db.prepare('INSERT INTO support_read_state VALUES(?,?,?,?) ON CONFLICT(conversation_id,reader_kind,reader_id) DO UPDATE SET last_sequence=MAX(last_sequence,excluded.last_sequence)').run(id, actor.kind, actor.id, latest);
          audit(db, actor, 'support.read', 'support_conversations', id, null, { throughSequence: latest }, 'Support conversation marked read');
        }
      });
      return reply(res, 200, { ok: true, conversation: rowValue(conversation, actor) });
    }
    if (action === 'status') {
      if (!['open', 'closed'].includes(data.status) || !['open', 'closed'].includes(data.expectedStatus)) fail(400, 'Choose a valid conversation status.');
      if (actor.kind === 'member' && data.status !== 'open') fail(403, 'Only the support team can close a conversation.');
      if (conversation.status !== data.expectedStatus) fail(409, 'The conversation changed. Refresh before trying again.');
      participant(conversation.participant_id, true);
      transaction(db, () => {
        if (accessible(id, actor).status !== data.expectedStatus) fail(409, 'The conversation changed. Refresh before trying again.');
        limit(actor, 'status');
        if (conversation.status !== data.status) {
          db.prepare('UPDATE support_conversations SET status=?,updated_at=? WHERE id=?').run(data.status, new Date().toISOString(), id);
          audit(db, actor, 'support.status_changed', 'support_conversations', id, { status: conversation.status }, { status: data.status }, 'Support conversation status updated');
        }
      });
      return reply(res, 200, { ok: true, conversation: rowValue(accessible(id, actor), actor) });
    }
    fail(405, 'Method not allowed.');
  }
  function bookingThread(bookingId){const booking=db.prepare('SELECT b.*,o.user_id FROM bookings b JOIN booking_owners o ON o.booking_id=b.id WHERE b.id=?').get(bookingId);if(!booking)return null;const existing=db.prepare("SELECT id FROM support_conversations WHERE booking_id=? AND participant_id=? AND category='booking' ORDER BY created_at,id LIMIT 1").get(bookingId,booking.user_id);if(existing)return existing.id;const id=randomUUID(),now=new Date().toISOString(),team=teamForService(db,booking.service);db.prepare("INSERT INTO support_conversations VALUES(?,?,?,'booking','open',?,?,?)").run(id,booking.user_id,(team?.name||'UniMate Support')+' · '+booking.title,bookingId,now,now);return id;}
  function bookingConversationForMember(bookingId,userId) {
    participant(userId,true);
    if(!canAccessBooking(bookingId,userId))fail(404,'Booking not found.');
    if(db.prepare('SELECT 1 FROM booking_owners WHERE booking_id=? AND user_id=?').get(bookingId,userId))return bookingThread(bookingId);
    // A staff member is the sole participant of this internal thread. Never reuse the client's thread.
    return transaction(db,()=>{
      const existing=db.prepare("SELECT id FROM support_conversations WHERE booking_id=? AND participant_id=? AND category='booking' ORDER BY created_at,id LIMIT 1").get(bookingId,userId);
      if(existing)return existing.id;
      const booking=db.prepare('SELECT * FROM bookings WHERE id=?').get(bookingId),id=randomUUID(),now=new Date().toISOString();
      const reference=recordReference(db,'booking',booking.id,booking.created_at),team=teamForService(db,booking.service);
      db.prepare("INSERT INTO support_conversations VALUES(?,?,?,'booking','open',?,?,?)").run(id,userId,`Internal job · ${reference} · ${team?.name||'UniMate Support'}`,bookingId,now,now);
      audit(db,{id:userId,kind:'member'},'support.internal_job_created','support_conversations',id,null,{bookingId},'Private assigned-job conversation created');
      return id;
    });
  }
  return { handle,bookingThread,bookingConversationForMember };
}
