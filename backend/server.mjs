import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase, transaction, audit } from './database.mjs';
import { token, digest, hashPassword, verifyPassword, passwordValid } from './security.mjs';
import {reportCountSql,reviewEligibleSql,REPORT_THRESHOLD} from './moderation.mjs';
import {taskList,taskQuery} from './tasks.mjs';
import {createBookingInvoice} from './invoices.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const fullAccess=role=>['owner','superadmin'].includes(role);
const londonDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const bookingDivisionSql="CASE WHEN lower(service) IN ('cleaning','cleaning service') THEN 'cleaning' WHEN lower(service) IN ('moving','moving service') THEN 'moving' WHEN lower(replace(service,'_',' ')) IN ('airport transfer','airport transfers') THEN 'airport_transfer' ELSE 'other' END";
export const resources = {
  account_reports: {fields:'id,user_id,title,reporter,details,status,created_at',states:['resolved','dismissed'],roles:['superadmin']},
  users: { fields: 'id,name,email,kind,status,created_at,(SELECT age FROM user_profiles WHERE user_id=users.id) AS age,(SELECT university FROM user_profiles WHERE user_id=users.id) AS university,(SELECT last_online FROM user_profiles WHERE user_id=users.id) AS last_online', states: ['active','suspended'], roles: ['superadmin'] },
  approvals: { fields: 'id,title,kind,applicant,details,status,created_at', states: ['approved','rejected'], roles: ['superadmin','admin'] },
  posts: { fields: 'id,title,author,body,status,created_at', states: ['published','hidden'], roles: ['superadmin','admin'] },
  reports: { fields: `id,post_id,title,reporter,details,status,created_at,${reportCountSql} AS unique_reports,COALESCE((SELECT kind FROM moderation_targets WHERE post_id=reports.post_id),'moment') AS content_type`, states: ['resolved','dismissed'], roles: ['superadmin','admin'] },
  bookings: { fields: 'id,title,customer,service,status,amount_pence,created_at', states: [], roles: [] },
  audit: { fields: '*', states: [], roles: [] },
};
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
function text(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail(400, `Check ${label}.`);
  return value.trim();
}
function listFilter(url,columns,hasStatus=true){
  const q=(url.searchParams.get('q')||'').trim(),status=url.searchParams.get('status')||'';
  if(q.length>100||status.length>30)fail(400,'Search is too long.');
  const parts=[],values=[];
  if(q){parts.push('('+columns.map(c=>`${c} LIKE ? ESCAPE '\\'`).join(' OR ')+')');const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';values.push(...columns.map(()=>pattern));}
  if(status&&hasStatus){parts.push('status=?');values.push(status);}
  return {where:parts.length?' WHERE '+parts.join(' AND '):'',values};
}
async function body(req,limit=16384) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON required.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'Request too large.'); chunks.push(chunk); }
  try { const result = JSON.parse(Buffer.concat(chunks).toString()); if (!result || Array.isArray(result) || typeof result !== 'object') throw Error(); return result; }
  catch { fail(400, 'Invalid request.'); }
}
export async function createApplication({ filename = resolve(root, 'data/unimate.sqlite'), port = 8090 } = {}) {
  const db = openDatabase(filename);
  const setupCsrf = token();
  const dummyHash = await hashPassword(token());
  let passwordChecks = 0;
  const server = http.createServer(async (req, res) => {
    const origin = `http://localhost:${server.address()?.port || port}`;
    const alternateOrigin = origin.replace('localhost','127.0.0.1');
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (![new URL(origin).host, new URL(alternateOrigin).host].includes(req.headers.host)) fail(403, 'Invalid host.');
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site request blocked.');
      if (!['GET','POST'].includes(req.method)) fail(405, 'Method not allowed.');
      const url = new URL(req.url, origin);
      const path = url.pathname;
      if (req.method === 'POST' && ![origin, alternateOrigin].includes(req.headers.origin)) fail(403, 'Same-origin request required.');
      if (!path.startsWith('/api/')) {
        if (req.method === 'GET' && path === '/unimate-logo.png') {
          const logo = await readFile(resolve(root,'../assets/unimate-logo.png'));
          res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(logo); return;
        }
        const files = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/styles.css': ['styles.css','text/css'] };
        if (req.method !== 'GET' || !files[path]) fail(404,'Not found.');
        const [file, type] = files[path];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(await readFile(resolve(root,'public',file))); return;
      }
      if (path === '/api/health' && req.method === 'GET') return reply(200,{ ok: true, mode: 'local-only' });
      const rawToken = /(?:^|;\s*)unimate_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = rawToken ? db.prepare('SELECT s.*, a.name,a.email,a.role,a.active FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires>?').get(digest(rawToken),Date.now()) : null;
      const actor = session?.active ? { id: session.admin_id, name: session.name, email: session.email, role: session.role } : null;
      const needsSetup = !db.prepare('SELECT id FROM admins LIMIT 1').get();
      if (path === '/api/session' && req.method === 'GET') return reply(200,{ admin: actor, csrf: actor ? session.csrf : setupCsrf, needsSetup });
      if (path === '/api/setup' && req.method === 'POST') {
        if (!needsSetup) fail(409,'Setup is already complete.');
        if (req.headers['x-csrf-token'] !== setupCsrf) fail(403,'Reload the setup page.');
        const data = await body(req);
        const email = text(data.email,3,254,'email').toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Enter a valid email.');
        const name = text(data.name,2,80,'name');
        if (!passwordValid(data.password)) fail(400,'Use 8–128 characters, including a capital letter (A–Z) and a special character, such as !, @ or #.');
        if (data.confirmPassword !== data.password) fail(400,'Passwords do not match.');
        if (passwordChecks >= 2) fail(429,'Please try again shortly.');
        passwordChecks++; let hash;
        try { hash = await hashPassword(data.password); } finally { passwordChecks--; }
        transaction(db,() => {
          if (db.prepare('SELECT id FROM admins LIMIT 1').get()) fail(409,'Setup is already complete.');
          const id = randomUUID();
          db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(id,email,name,hash,'superadmin');
          audit(db,{id,name},'admin.created','admins',id,null,{email,role:'superadmin'},'Local first-run setup');
        });
        return reply(201,{ ok: true });
      }
      if (path === '/api/login' && req.method === 'POST') {
        if (req.headers['x-csrf-token'] !== setupCsrf) fail(403,'Reload the login page.');
        const data = await body(req);
        const email = text(data.email,3,254,'email').toLowerCase();
        if (typeof data.password !== 'string' || data.password.length > 128) fail(400,'Invalid credentials.');
        const now = Date.now();
        db.prepare('DELETE FROM login_limits WHERE expires<?').run(now);
        const keys = ['ip:'+req.socket.remoteAddress, 'email:'+digest(email)];
        if (keys.some(key => (db.prepare('SELECT count FROM login_limits WHERE key=?').get(key)?.count || 0) >= 10)) fail(429,'Too many attempts. Try again in 15 minutes.');
        if (passwordChecks >= 2) fail(429,'Please try again shortly.');
        for (const key of keys) db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+15*60*1000);
        const admin = db.prepare('SELECT * FROM admins WHERE email=?').get(email);
        passwordChecks++; let valid;
        try { valid = await verifyPassword(data.password,admin?.password_hash || dummyHash); } finally { passwordChecks--; }
        if (!valid || !admin?.active) fail(401,'Email or password is incorrect.');
        const cookie = token(), csrf = token();
        transaction(db,() => {
          for (const key of keys) db.prepare('DELETE FROM login_limits WHERE key=?').run(key);
          db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
          db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(cookie),admin.id,csrf,now+8*60*60*1000);
          audit(db,admin,'login','admins',admin.id,null,null,'Successful sign-in');
        });
        res.setHeader('Set-Cookie',`unimate_admin=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        return reply(200,{ ok: true });
      }
      if (!actor) fail(401,'Please sign in.');
      if (req.method === 'POST' && req.headers['x-csrf-token'] !== session.csrf) fail(403,'Session verification failed. Reload and try again.');
      if (path === '/api/logout' && req.method === 'POST') {
        transaction(db,() => { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash); audit(db,actor,'logout','admins',actor.id,null,null,'Signed out'); });
        res.setHeader('Set-Cookie','unimate_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return reply(200,{ok:true});
      }
      if (path === '/api/settings/password' && req.method === 'POST') {
        const data=await body(req);
        if(typeof data.currentPassword!=='string'||data.currentPassword.length>128)fail(400,'Enter your current password.');
        if(!passwordValid(data.password))fail(400,'Use 8–128 characters with a capital letter and a special character.');
        if(data.confirmPassword!==data.password)fail(400,'Passwords do not match.');
        if(data.password===data.currentPassword)fail(400,'Choose a different password from your current one.');
        const key='password:'+actor.id,now=Date.now();
        db.prepare('DELETE FROM login_limits WHERE expires<?').run(now);
        if((db.prepare('SELECT count FROM login_limits WHERE key=?').get(key)?.count||0)>=5)fail(429,'Too many attempts. Try again in 15 minutes.');
        if(passwordChecks>=2)fail(429,'Please try again shortly.');
        db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+15*60*1000);
        const before=db.prepare('SELECT password_hash FROM admins WHERE id=?').get(actor.id);
        passwordChecks++;let hash;
        try{
          if(!await verifyPassword(data.currentPassword,before.password_hash))fail(400,'Current password is incorrect.');
          hash=await hashPassword(data.password);
        }finally{passwordChecks--;}
        transaction(db,()=>{
          const live=db.prepare('SELECT active,password_hash FROM admins WHERE id=?').get(actor.id);
          const liveSession=db.prepare('SELECT expires FROM sessions WHERE token_hash=?').get(session.token_hash);
          if(!live?.active||!liveSession||liveSession.expires<=Date.now())fail(401,'Please sign in again.');
          if(live.password_hash!==before.password_hash)fail(409,'Your password changed. Sign in again.');
          db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hash,actor.id);
          db.prepare('DELETE FROM sessions WHERE admin_id=?').run(actor.id);
          db.prepare('DELETE FROM login_limits WHERE key=?').run(key);
          audit(db,actor,'password.changed','admins',actor.id,null,null,'Account owner changed their password; all sessions revoked');
        });
        res.setHeader('Set-Cookie','unimate_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return reply(200,{ok:true});
      }
      if(path==='/api/staff-holidays'){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');
        if(req.method==='GET')return reply(200,{rows:db.prepare("SELECT h.*,m.name,m.team FROM staff_holidays h JOIN team_members m ON m.id=h.member_id WHERE h.status='active' ORDER BY start_date").all()});
        const data=await body(req);
        if(data.id){const before=db.prepare("SELECT * FROM staff_holidays WHERE id=? AND status='active'").get(text(data.id,1,80,'holiday'));if(!before)fail(404,'Holiday not found.');transaction(db,()=>{db.prepare("UPDATE staff_holidays SET status='cancelled' WHERE id=?").run(data.id);audit(db,actor,'holiday.cancelled','staff_holidays',data.id,before,{status:'cancelled'},'Holiday cancelled by administrator');});return reply(200,{ok:true});}
        const memberId=text(data.memberId,1,80,'staff member');if(!db.prepare("SELECT id FROM team_members WHERE id=? AND status='active'").get(memberId))fail(400,'Choose an active staff member.');
        const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
        if(!validDate(data.startDate)||!validDate(data.endDate)||data.endDate<data.startDate)fail(400,'Choose valid holiday dates.');
        const id=randomUUID();transaction(db,()=>{
          if(db.prepare("SELECT id FROM staff_holidays WHERE member_id=? AND status='active' AND start_date<=? AND end_date>=?").get(memberId,data.endDate,data.startDate))fail(409,'Holiday overlaps an existing holiday.');
          if(db.prepare('SELECT starts_at,ends_at FROM booking_assignments WHERE member_id=?').all(memberId).some(r=>londonDate(r.starts_at)<=data.endDate&&londonDate(Date.parse(r.ends_at)-1)>=data.startDate))fail(409,'Reassign overlapping bookings before adding this holiday.');
          db.prepare("INSERT INTO staff_holidays VALUES(?,?,?,?,'active')").run(id,memberId,data.startDate,data.endDate);audit(db,actor,'holiday.added','staff_holidays',id,null,{memberId,startDate:data.startDate,endDate:data.endDate},'Holiday recorded by administrator');});return reply(201,{id});
      }
      if(path==='/api/staff-availability'&&req.method==='GET'){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');
        const booking=db.prepare(`SELECT *,${bookingDivisionSql} division FROM bookings WHERE id=?`).get(url.searchParams.get('bookingId')||'');
        const start=Date.parse(url.searchParams.get('start')),end=Date.parse(url.searchParams.get('end'));
        if(!booking||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)fail(400,'Choose a booking, start and end time.');
        const team=({cleaning:'cleaners',moving:'movers',airport_transfer:'drivers'})[booking.division];if(!team)fail(400,'This booking is not a cleaning, moving or airport service.');
        const rows=db.prepare("SELECT m.id,m.name,COALESCE(a.areas,'Not recorded') areas FROM team_members m LEFT JOIN staff_areas a ON a.member_id=m.id WHERE m.team=? AND m.status='active' ORDER BY m.name").all(team).map(m=>{const busy=db.prepare('SELECT booking_id FROM booking_assignments WHERE member_id=? AND booking_id<>? AND starts_at<? AND ends_at>?').get(m.id,booking.id,new Date(end).toISOString(),new Date(start).toISOString());const holiday=db.prepare("SELECT id FROM staff_holidays WHERE member_id=? AND status='active' AND start_date<=? AND end_date>=?").get(m.id,londonDate(end-1),londonDate(start));return {...m,available:!busy&&!holiday,reason:holiday?'On holiday':busy?'Already booked':'No recorded clashes'};});return reply(200,{rows});
      }
      if(path==='/api/staff-schedule'){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');
        if(req.method==='GET'){
          const from=url.searchParams.get('from'),to=url.searchParams.get('to');let where='',values=[];
          if(from||to){const a=Date.parse(from),b=Date.parse(to);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>62*86400000)fail(400,'Choose a calendar range of at most 62 days.');where=' WHERE a.starts_at<? AND a.ends_at>?';values=[new Date(b).toISOString(),new Date(a).toISOString()];}
          return reply(200,{rows:db.prepare('SELECT a.*,m.name,m.team,b.title,b.service FROM booking_assignments a JOIN team_members m ON m.id=a.member_id JOIN bookings b ON b.id=a.booking_id'+where+' ORDER BY starts_at').all(...values)});
        }
        const data=await body(req),member=db.prepare('SELECT * FROM team_members WHERE id=?').get(text(data.memberId,1,80,'staff member')),booking=db.prepare(`SELECT *,${bookingDivisionSql} division FROM bookings WHERE id=?`).get(text(data.bookingId,1,80,'booking'));
        if(!member||member.status!=='active'||!booking)fail(400,'Choose an active staff member and existing booking.');
        if(member.team!==({cleaning:'cleaners',moving:'movers',airport_transfer:'drivers'})[booking.division])fail(400,'Staff team does not match this service.');
        const start=Date.parse(data.start),end=Date.parse(data.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)fail(400,'Choose a valid start and end time.');
        const starts=new Date(start).toISOString(),ends=new Date(end).toISOString(),reason=text(data.reason,5,500,'reason');
        transaction(db,()=>{if(db.prepare('SELECT booking_id FROM booking_assignments WHERE member_id=? AND booking_id<>? AND starts_at<? AND ends_at>?').get(member.id,booking.id,ends,starts))fail(409,'This staff member already has a booking at that time.');
          if(db.prepare("SELECT id FROM staff_holidays WHERE member_id=? AND status='active' AND start_date<=? AND end_date>=?").get(member.id,londonDate(end-1),londonDate(start)))fail(409,'This staff member is on holiday.');
          const before=db.prepare('SELECT * FROM booking_assignments WHERE booking_id=?').get(booking.id);
          db.prepare('INSERT INTO booking_assignments VALUES(?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET member_id=excluded.member_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at').run(booking.id,member.id,starts,ends);audit(db,actor,'assign_booking','bookings',booking.id,before,{member_id:member.id,starts_at:starts,ends_at:ends},reason);});return reply(200,{ok:true});
      }
      if(path==='/api/teams/areas'&&req.method==='GET'){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');return reply(200,{areas:db.prepare('SELECT areas FROM staff_areas WHERE member_id=?').get(url.searchParams.get('id')||'')?.areas||''});
      }
      if(path==='/api/teams/areas'&&req.method==='POST'){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');const data=await body(req),id=text(data.id,1,80,'member'),areas=text(data.areas,1,500,'work areas');if(!db.prepare('SELECT id FROM team_members WHERE id=?').get(id))fail(404,'Member not found.');
        transaction(db,()=>{const before=db.prepare('SELECT * FROM staff_areas WHERE member_id=?').get(id);db.prepare('INSERT INTO staff_areas VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET areas=excluded.areas').run(id,areas);audit(db,actor,'staff_work_areas','teams',id,before,{areas},'Work areas updated by administrator');});return reply(200,{ok:true});
      }
      if(/^\/api\/bookings\/[^/]+\/complete$/.test(path)&&req.method==='POST'){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');const data=await body(req),id=path.split('/')[3],reason=text(data.reason,5,500,'completion note');let invoice;
        transaction(db,()=>{const booking=db.prepare('SELECT * FROM bookings WHERE id=?').get(id);if(!booking)fail(404,'Booking not found.');if(booking.status==='completed'){invoice=db.prepare('SELECT id,reference FROM invoices WHERE booking_id=?').get(id);if(invoice)return;fail(409,'Legacy completed booking needs invoice reconciliation.');}if(booking.status!==data.expectedStatus)fail(409,'Booking changed. Refresh first.');if(!['confirmed','in_progress','assigned'].includes(booking.status))fail(409,'Only confirmed or in-progress bookings can be completed.');db.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(id);invoice=createBookingInvoice(db,actor,booking,londonDate(Date.now()));audit(db,actor,'booking.completed','bookings',id,{status:booking.status},{status:'completed',invoice_reference:invoice.reference},reason);});return reply(200,{invoice});
      }
      if(path==='/api/invoices'||path.startsWith('/api/invoices/')){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');
        const id=path.split('/')[3],today=londonDate(Date.now());
        if(req.method==='GET'){
          if(id){const row=db.prepare('SELECT * FROM invoices WHERE id=?').get(id);if(!row)fail(404,'Invoice not found.');return reply(200,{row});}
          const state=url.searchParams.get('status')||'open',q=(url.searchParams.get('q')||'').trim(),page=Number(url.searchParams.get('page')||1);
          const filters={all:'1=1',open:"status='open'",due:"status='open' AND due_on>=?",overdue:"status='open' AND due_on<?",closed:"status<>'open'",paid:"status='paid'",paid_off_platform:"status='paid_off_platform'",void:"status='void'"};if(!Object.hasOwn(filters,state)||q.length>100||!Number.isSafeInteger(page)||page<1)fail(400,'Invalid invoice filter.');
          const args=['due','overdue'].includes(state)?[today]:[],pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(pattern,pattern);const where=filters[state]+" AND (reference LIKE ? ESCAPE '\\' OR customer LIKE ? ESCAPE '\\')";
          const rows=db.prepare(`SELECT * FROM invoices WHERE ${where} ORDER BY due_on,id LIMIT 25 OFFSET ?`).all(...args,(page-1)*25),counts={};for(const [key,filter] of Object.entries(filters))counts[key]=db.prepare('SELECT count(*) n FROM invoices WHERE '+filter).get(...(['due','overdue'].includes(key)?[today]:[])).n;
          return reply(200,{rows,total:db.prepare('SELECT count(*) n FROM invoices WHERE '+where).get(...args).n,counts,outstanding_pence:db.prepare("SELECT COALESCE(sum(amount_pence),0) n FROM invoices WHERE status='open'").get().n,today});
        }
        const data=await body(req);
        if(id){if(!['paid','paid_off_platform','void'].includes(data.status))fail(400,'Invalid invoice status.');const reason=text(data.reason,5,500,'reason');transaction(db,()=>{const before=db.prepare('SELECT * FROM invoices WHERE id=?').get(id);if(!before)fail(404,'Invoice not found.');if(before.status!=='open')fail(409,'This invoice is already closed.');db.prepare('UPDATE invoices SET status=? WHERE id=?').run(data.status,id);audit(db,actor,'invoice.status_changed','invoices',id,{status:before.status},{status:data.status},reason);});return reply(200,{ok:true});}
        fail(405,'Invoices are created automatically on service completion.');
      }
      if(path==='/api/documents'||path.startsWith('/api/documents/')){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');
        const id=path.split('/')[3];
        if(req.method==='GET'&&id){const row=db.prepare('SELECT * FROM company_documents WHERE id=?').get(id);if(!row)fail(404,'Document not found.');audit(db,actor,'document.downloaded','documents',id,null,null,'Restricted document downloaded');res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="document.pdf"','Content-Security-Policy':"sandbox; default-src 'none'"});res.end(row.file);return;}
        if(req.method==='GET'){const category=url.searchParams.get('category')||'',page=Number(url.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1)fail(400,'Invalid page.');return reply(200,{rows:db.prepare("SELECT id,title,category,expires_on,filename,created_at FROM company_documents WHERE (?='' OR category=?) ORDER BY created_at DESC,id LIMIT 25 OFFSET ?").all(category,category,(page-1)*25),total:db.prepare("SELECT count(*) n FROM company_documents WHERE (?='' OR category=?)").get(category,category).n});}
        if(id)fail(405,'Unsupported action.');const data=await body(req,7500000),title=text(data.title,2,120,'title'),category=text(data.category,1,40,'category');if(!['invoice','insurance','company','policy','contract','other'].includes(category))fail(400,'Invalid category.');
        const expires=data.expires_on||'';if(expires&&(!/^\d{4}-\d{2}-\d{2}$/.test(expires)||!Number.isFinite(Date.parse(expires))||new Date(expires).toISOString().slice(0,10)!==expires))fail(400,'Invalid expiry date.');
        if(typeof data.base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64))fail(400,'Invalid PDF file.');const file=Buffer.from(data.base64,'base64');if(file.length>5*1024*1024||file.subarray(0,5).toString()!=='%PDF-')fail(400,'Use a PDF up to 5 MB.');
        const filename=text(data.filename,1,180,'filename'),documentId=randomUUID();transaction(db,()=>{db.prepare('INSERT INTO company_documents VALUES(?,?,?,?,?,?,?)').run(documentId,title,category,expires,filename,file,new Date().toISOString());audit(db,actor,'document.uploaded','documents',documentId,null,{category},'Restricted document uploaded');});return reply(201,{id:documentId});
      }
      if(path==='/api/staff-hr'){
        if(!fullAccess(actor.role))fail(403,'HR details require Owner or SuperAdmin access.');
        if(req.method==='GET'){const id=url.searchParams.get('id')||'';if(!db.prepare('SELECT id FROM team_members WHERE id=?').get(id))fail(404,'Staff member not found.');const row=db.prepare('SELECT * FROM staff_hr WHERE member_id=?').get(id)||{job_title:'',start_date:'',emergency_contact:'',notes:'',version:0};row.extra=JSON.parse(db.prepare('SELECT details_json FROM staff_hr_details WHERE member_id=?').get(id)?.details_json||'{}');audit(db,actor,'hr.viewed','staff_hr',id,null,null,'Restricted HR record viewed');return reply(200,{row});}
        const data=await body(req),id=text(data.id,1,80,'staff member');
        const extra={};for(const key of ['phone','address','identification','right_to_work','dbs','driving_licence','vehicle_registration','vehicle_insurance','mot','operator_licensing','training','certificates']){const value=data.extra?.[key]??'';if(typeof value!=='string'||value.length>700)fail(400,'Invalid HR detail: '+key);extra[key]=value.trim();}
        for(const [key,max] of [['job_title',120],['start_date',10],['emergency_contact',300],['notes',2000]])if(typeof data[key]!=='string'||data[key].length>max)fail(400,'Invalid HR field: '+key);
        if(data.start_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.start_date)||!Number.isFinite(Date.parse(data.start_date))||new Date(data.start_date).toISOString().slice(0,10)!==data.start_date))fail(400,'Enter a valid start date.');
        transaction(db,()=>{if(!db.prepare('SELECT id FROM team_members WHERE id=?').get(id))fail(404,'Staff member not found.');const before=db.prepare('SELECT version FROM staff_hr WHERE member_id=?').get(id);if(data.version!==(before?.version||0))fail(409,'HR details changed. Reopen before saving.');db.prepare('INSERT INTO staff_hr VALUES(?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET job_title=excluded.job_title,start_date=excluded.start_date,emergency_contact=excluded.emergency_contact,notes=excluded.notes,version=excluded.version').run(id,data.job_title.trim(),data.start_date,data.emergency_contact.trim(),data.notes.trim(),data.version+1);db.prepare('INSERT INTO staff_hr_details VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET details_json=excluded.details_json').run(id,JSON.stringify(extra));audit(db,actor,'hr.updated','staff_hr',id,null,null,'Restricted HR details updated (contents excluded from audit)');});return reply(200,{ok:true});
      }
      if(path==='/api/teams'){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');
        const teams=['office','cleaners','drivers','movers'];
        if(req.method==='GET'){
          const team=url.searchParams.get('team')||'office',q=(url.searchParams.get('q')||'').trim(),page=Number(url.searchParams.get('page')||1);
          if(!['all',...teams].includes(team)||q.length>100||!Number.isSafeInteger(page)||page<1)fail(400,'Invalid team search.');
          const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
          const where="(?='all' OR team=?) AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')";
          return reply(200,{rows:db.prepare(`SELECT * FROM team_members WHERE ${where} ORDER BY name,id LIMIT 25 OFFSET ?`).all(team,team,pattern,pattern,(page-1)*25),total:db.prepare(`SELECT count(*) n FROM team_members WHERE ${where}`).get(team,team,pattern,pattern).n,counts:db.prepare('SELECT team,count(*) total,sum(status=\'active\') active FROM team_members GROUP BY team').all()});
        }
        const data=await body(req),reason=text(data.reason,5,500,'reason');
        if(data.id){
          const before=db.prepare('SELECT * FROM team_members WHERE id=?').get(text(data.id,1,80,'member'));
          if(!before)fail(404,'Member not found.');
          if(!['active','deactivated'].includes(data.status))fail(400,'Invalid status.');
          transaction(db,()=>{db.prepare('UPDATE team_members SET status=? WHERE id=?').run(data.status,data.id);audit(db,actor,'team_member_status','teams',data.id,before,{...before,status:data.status},reason);});
          return reply(200,{ok:true});
        }
        fail(403,'Staff join teams only after their signup application is approved. Manual team creation is disabled.');
      }
      if(path==='/api/tasks'&&req.method==='GET'){
        const page=Number(url.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'Invalid page.');return reply(200,taskList(db,actor,page));
      }
      if(path==='/api/tasks/seen'&&req.method==='POST'){
        const data=await body(req);if(!['approvals','reports','account_reports'].includes(data.resource)||typeof data.record_id!=='string')fail(400,'Invalid task.');
        const task=db.prepare(`SELECT * FROM (${taskQuery(fullAccess(actor.role))}) WHERE resource=? AND record_id=?`).get(data.resource,data.record_id);
        if(!task)fail(404,'Task is no longer pending or is not accessible.');
        db.prepare('INSERT OR IGNORE INTO task_seen VALUES(?,?,?)').run(actor.id,data.resource,data.record_id);return reply(200,{ok:true});
      }
      const messageRoute=/^\/api\/conversations(?:\/([^/]+))?$/.exec(path);
      if(messageRoute){
        if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');
        const id=messageRoute[1];
        const addStaffApproval=row=>{row.staff_approved=Boolean(db.prepare("SELECT 1 FROM users u JOIN staff_applications s ON s.email=u.email JOIN approvals a ON a.id=s.approval_id JOIN team_members m ON m.id=s.member_id WHERE u.id=? AND u.status='active' AND a.status='approved' AND m.status='active'").get(row.recipient_id));return row;};
        const page=Number(url.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'Invalid page.');
        if(req.method==='GET'&&!id){
          const status=url.searchParams.get('status')||'open';if(!['all','request','open','closed'].includes(status))fail(400,'Invalid conversation status.');
          const category=url.searchParams.get('category')||'all';if(!['all','general','events','support','lost_found','technical'].includes(category))fail(400,'Invalid chat category.');
          const rows=db.prepare(`SELECT c.*,u.name AS recipient_name,u.kind AS recipient_kind,(SELECT team FROM team_members WHERE email=u.email AND status='active' ORDER BY created_at DESC LIMIT 1) AS recipient_team,(SELECT count(*) FROM messages WHERE conversation_id=c.id) AS message_count,(SELECT body FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_message,COALESCE((SELECT max(created_at) FROM messages WHERE conversation_id=c.id),c.created_at) AS last_message_at FROM conversations c JOIN users u ON u.id=c.recipient_id WHERE (?='all' OR c.status=?) AND (?='all' OR c.category=?) ORDER BY last_message_at DESC,c.id LIMIT 25 OFFSET ?`).all(status,status,category,category,(page-1)*25);
          const counts={request:0,open:0,closed:0};for(const row of db.prepare('SELECT status,count(*) AS n FROM conversations GROUP BY status').all())counts[row.status]=row.n;
          rows.forEach(addStaffApproval);
          return reply(200,{rows,page,total:db.prepare("SELECT count(*) AS n FROM conversations WHERE (?='all' OR status=?) AND (?='all' OR category=?)").get(status,status,category,category).n,counts});
        }
        if(req.method==='GET'){
          const conversation=db.prepare("SELECT c.*,u.name AS recipient_name,u.kind AS recipient_kind,(SELECT team FROM team_members WHERE email=u.email AND status='active' ORDER BY created_at DESC LIMIT 1) AS recipient_team FROM conversations c JOIN users u ON u.id=c.recipient_id WHERE c.id=?").get(id);if(!conversation)fail(404,'Conversation not found.');
          const rows=db.prepare('SELECT m.id,m.body,m.delivery_status,m.created_at,a.name AS sender_name FROM messages m JOIN admins a ON a.id=m.sender_id WHERE m.conversation_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 25 OFFSET ?').all(id,(page-1)*25);
          return reply(200,{conversation:addStaffApproval(conversation),rows,page,total:db.prepare('SELECT count(*) AS n FROM messages WHERE conversation_id=?').get(id).n});
        }
        const data=await body(req);
        if(id&&data.status!==undefined){
          if(!['open','closed'].includes(data.status))fail(400,'Choose open or closed.');
          transaction(db,()=>{const before=db.prepare('SELECT status FROM conversations WHERE id=?').get(id);if(!before)fail(404,'Conversation not found.');db.prepare('UPDATE conversations SET status=? WHERE id=?').run(data.status,id);if(before.status!==data.status)audit(db,actor,'conversation.status_changed','conversations',id,before,{status:data.status},'Local conversation status');});
          return reply(200,{id,status:data.status});
        }
        const content=text(data.message,1,4000,'message (1–4000 characters)');
        const messageId=text(data.messageId,36,36,'message reference');if(!/^[0-9a-f-]{36}$/.test(messageId))fail(400,'Invalid message reference.');
        if(!id){
          const subject=text(data.subject,2,120,'subject'),recipientId=text(data.recipientId,1,100,'recipient');
          const category=data.category||'general';if(!['general','events','support','lost_found','technical'].includes(category))fail(400,'Invalid chat category.');
          if(!db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(recipientId))fail(400,'Choose an active user or staff recipient.');
          let conversationId;
          transaction(db,()=>{
            const existing=db.prepare('SELECT m.*,c.recipient_id,c.subject,c.category FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=?').get(messageId);
            if(existing){if(existing.sender_id!==actor.id||existing.body!==content||existing.recipient_id!==recipientId||existing.subject!==subject||existing.category!==category)fail(409,'Message reference already used.');conversationId=existing.conversation_id;return;}
            conversationId=randomUUID();const now=new Date().toISOString();db.prepare('INSERT INTO conversations(id,recipient_id,subject,created_by,created_at) VALUES(?,?,?,?,?)').run(conversationId,recipientId,subject,actor.id,now);
            db.prepare('UPDATE conversations SET category=? WHERE id=?').run(category,conversationId);
            db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(messageId,conversationId,actor.id,content,'local_only',now);
            audit(db,actor,'message.saved','conversations',conversationId,null,{message_id:messageId},'Saved locally; no delivery service connected');
          });return reply(201,{id:conversationId,delivery_status:'local_only'});
        }
        const conversation=db.prepare('SELECT c.id,c.status AS chat_status,u.status FROM conversations c JOIN users u ON u.id=c.recipient_id WHERE c.id=?').get(id);if(!conversation)fail(404,'Conversation not found.');if(conversation.status!=='active')fail(409,'Recipient account is inactive.');if(conversation.chat_status!=='open')fail(409,'Open this conversation before replying.');
        transaction(db,()=>{
          const existing=db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);if(existing){if(existing.sender_id!==actor.id||existing.conversation_id!==id||existing.body!==content)fail(409,'Message reference already used.');return;}
          db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(messageId,id,actor.id,content,'local_only',new Date().toISOString());audit(db,actor,'message.saved','conversations',id,null,{message_id:messageId},'Saved locally; no delivery service connected');
        });return reply(201,{id,delivery_status:'local_only'});
      }
      if(path==='/api/navigation-counts'&&req.method==='GET'){
        const counts={events:db.prepare("SELECT count(*) n FROM approvals WHERE kind='event' AND status='pending'").get().n};
        for(const [key,condition] of [['reports',"IN ('moment','forum')"],['comment_reports',"='comment'"]])counts[key]=db.prepare(`SELECT count(*) n FROM reports WHERE status='open' AND ${reviewEligibleSql} AND COALESCE((SELECT kind FROM moderation_targets WHERE post_id=reports.post_id),'moment') ${condition}`).get().n;
        if(fullAccess(actor.role)){
          counts.account_reports=db.prepare("SELECT count(*) n FROM account_reports WHERE status='open'").get().n;
          counts.messages=db.prepare('SELECT count(*) n FROM messages').get().n;
          counts.students=db.prepare("SELECT count(*) n FROM approvals WHERE kind IN ('student','staff','society','organisation','seller') AND status='pending'").get().n;
          counts.teams=db.prepare("SELECT count(*) n FROM approvals WHERE kind='staff' AND status='pending'").get().n;
          counts.bookings={all:db.prepare('SELECT count(*) n FROM bookings').get().n,cleaning:0,moving:0,airport_transfer:0,other:0};
          for(const row of db.prepare(`SELECT ${bookingDivisionSql} division,count(*) n FROM bookings GROUP BY division`).all())counts.bookings[row.division]=row.n;
        }
        return reply(200,{counts});
      }
      if (path === '/api/overview' && req.method === 'GET') {
        return reply(200,{
          approvals: db.prepare("SELECT count(*) AS n FROM approvals WHERE status='pending'"+(fullAccess(actor.role)?'':" AND kind='event'")).get().n,
          reports: db.prepare(`SELECT count(*) AS n FROM reports WHERE status='open' AND ${reviewEligibleSql}`).get().n,
          ...(fullAccess(actor.role)?{users:db.prepare('SELECT count(*) AS n FROM users').get().n,
            bookings: db.prepare('SELECT count(*) AS n FROM bookings').get().n}: {}) });
      }
      if (/^\/api\/(admins|users|bookings|audit|invoices|finance|accounts)(\/|$)/.test(path) && !fullAccess(actor.role)) fail(403,'Superadmin access required.');
      const adminMatch=/^\/api\/admins(?:\/([^/]+))?$/.exec(path);
      if(adminMatch){
        const id=adminMatch[1];
        const safeFields='id,name,email,role,active';
        if(req.method==='GET'&&!id){
          const page=Number(url.searchParams.get('page')||1);
          if(!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'Invalid page.');
          let {where,values}=listFilter(url,['name','email'],false);
          const status=url.searchParams.get('status');
          if(status){if(!['active','deactivated'].includes(status))fail(400,'Invalid account status.');where+=(where?' AND ':' WHERE ')+'active=?';values.push(status==='active'?1:0);}
          return reply(200,{rows:db.prepare(`SELECT ${safeFields} FROM admins${where} ORDER BY name,id LIMIT 25 OFFSET ?`).all(...values,(page-1)*25),total:db.prepare(`SELECT count(*) AS n FROM admins${where}`).get(...values).n,page});
        }
        if(req.method!=='POST')fail(405,'Method not allowed.');
        const data=await body(req),reason=text(data.reason,5,500,'reason (5–500 characters)');
        if(!['superadmin','admin'].includes(data.role))fail(400,'Choose Superadmin or Normal admin.');
        if(actor.role!=='owner'&&data.role==='superadmin')fail(403,'Only UniMate Owner can appoint Superadmins.');
        if(!id){
          const email=text(data.email,3,254,'email').toLowerCase(),name=text(data.name,2,80,'name');
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&! /^[a-z][a-z0-9._-]{2,39}$/.test(email))fail(400,'Enter an email or a username of 3–40 letters, numbers, dots, underscores or hyphens, starting with a letter.');
          if(!passwordValid(data.password))fail(400,'Use 8–128 characters with a capital letter and a special character.');
          if(data.password!==data.confirmPassword)fail(400,'Passwords do not match.');
          if(passwordChecks>=2)fail(429,'Please try again shortly.');
          passwordChecks++;let hash;
          try{hash=await hashPassword(data.password);}finally{passwordChecks--;}
          transaction(db,()=>{
            // Hashing is asynchronous: recheck access in case another superadmin revoked it.
            const live=db.prepare('SELECT role,active FROM admins WHERE id=?').get(actor.id);
            const liveSession=db.prepare('SELECT expires FROM sessions WHERE token_hash=?').get(session.token_hash);
            if(!fullAccess(live?.role)||!live.active||!liveSession||liveSession.expires<=Date.now()||(data.role==='superadmin'&&live.role!=='owner'))fail(403,'Your access changed. Sign in again.');
            if(db.prepare('SELECT id FROM admins WHERE email=?').get(email))fail(409,'An admin with this email already exists.');
            const newId=randomUUID();db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(newId,email,name,hash,data.role);
            audit(db,actor,'admin.created','admins',newId,null,{id:newId,name,email,role:data.role,active:1},reason);
          });
          return reply(201,{ok:true});
        }
        if(typeof data.active!=='boolean')fail(400,'Choose an account status.');
        transaction(db,()=>{
          const before=db.prepare(`SELECT ${safeFields} FROM admins WHERE id=?`).get(id);
          if(!before)fail(404,'Admin not found.');
          if(before.role==='owner')fail(403,'The UniMate Owner account cannot be changed here.');
          if(actor.role!=='owner'&&before.role==='superadmin')fail(403,'Only UniMate Owner can change Superadmin access.');
          if(data.expectedRole!==before.role||data.expectedActive!==Boolean(before.active))fail(409,'This account changed. Refresh before editing.');
          if(before.role==='superadmin'&&before.active&&(data.role!=='superadmin'||!data.active)&&db.prepare("SELECT count(*) AS n FROM admins WHERE role IN ('owner','superadmin') AND active=1").get().n<=1)fail(409,'Keep at least one active Superadmin.');
          if(id===actor.id&&(data.role!=='superadmin'||!data.active))fail(409,'Another Superadmin must change your access.');
          if(before.role===data.role&&Boolean(before.active)===data.active)fail(409,'No changes to save.');
          db.prepare('UPDATE admins SET role=?,active=? WHERE id=?').run(data.role,Number(data.active),id);
          db.prepare('DELETE FROM sessions WHERE admin_id=?').run(id);
          audit(db,actor,'admin.access.changed','admins',id,before,{...before,role:data.role,active:Number(data.active)},reason);
        });
        return reply(200,{ok:true});
      }
      if(path.startsWith('/api/account_reports')&&!fullAccess(actor.role))fail(403,'Account reviews require Owner or SuperAdmin access.');
      const match = /^\/api\/(users|approvals|posts|reports|account_reports|bookings|audit)(?:\/([^/]+))?$/.exec(path);
      if (!match) fail(404,'Not found.');
      const [, kind, id] = match, config = resources[kind];
      if (!fullAccess(actor.role) && !['admin','viewer'].includes(actor.role)) fail(403,'This role cannot access these records.');
      if(req.method==='GET'&&id){
        const row=db.prepare(`SELECT ${config.fields} FROM ${kind} WHERE id=?`).get(id);if(!row)fail(404,'Record not found.');
        if(kind==='approvals'&&!fullAccess(actor.role)&&row.kind!=='event')fail(403,'Account approvals require SuperAdmin or UniMate Owner access.');
        if(kind==='reports'&&row.unique_reports<REPORT_THRESHOLD)fail(404,'Review threshold not reached.');
        const submission=db.prepare('SELECT details_json FROM submission_details WHERE resource=? AND record_id=?').get(kind,id);
        return reply(200,{row:{...row,...(submission?{submission:JSON.parse(submission.details_json)}:{})},canManage:config.roles.includes(actor.role)||(actor.role==='owner'&&config.roles.includes('superadmin'))});
      }
      if (req.method === 'GET' && !id) {
        const page = Number(url.searchParams.get('page') || 1);
        if (!Number.isSafeInteger(page) || page < 1 || page > 100000) fail(400,'Invalid page.');
        const columns={users:['name','email'],approvals:['title','applicant'],posts:['title','author'],reports:['title','reporter'],account_reports:['title','details'],bookings:['title','customer'],audit:['actor_name','action','resource','resource_id']};
        let {where,values}=listFilter(url,columns[kind],kind!=='audit');
        if(kind==='reports'&&url.searchParams.has('type')){const type=url.searchParams.get('type');if(!['post','comment'].includes(type))fail(400,'Invalid report type.');where+=(where?' AND ':' WHERE ')+"COALESCE((SELECT kind FROM moderation_targets WHERE post_id=reports.post_id),'moment') "+(type==='comment'?"='comment'":"IN ('moment','forum')");}
        if(kind==='reports')where+=(where?' AND ':' WHERE ')+reviewEligibleSql;
        if(kind==='approvals'){
          if(url.searchParams.get('accounts')==='1'){if(!fullAccess(actor.role))fail(403,'Owner or SuperAdmin access required.');where+=(where?' AND ':' WHERE ')+"kind IN ('student','staff','society','organisation','seller')";}
          const category=url.searchParams.get('kind');
          if(category){if(!['event','student','staff','society'].includes(category))fail(400,'Invalid approval category.');where+=(where?' AND ':' WHERE ')+'kind=?';values.push(category);}
          if(!fullAccess(actor.role)){where+=(where?' AND ':' WHERE ')+"kind='event'";}
        }
        let divisionCounts;
        if(kind==='bookings'){
          divisionCounts={all:0,cleaning:0,moving:0,airport_transfer:0,other:0};
          for(const row of db.prepare(`SELECT ${bookingDivisionSql} AS division,count(*) AS n FROM bookings GROUP BY division`).all()){divisionCounts[row.division]=row.n;divisionCounts.all+=row.n;}
          const division=url.searchParams.get('division')||'all';
          if(!Object.hasOwn(divisionCounts,division))fail(400,'Invalid booking division.');
          if(division!=='all'){where+=(where?' AND ':' WHERE ')+`(${bookingDivisionSql})=?`;values.push(division);}
        }
        const total = db.prepare(`SELECT count(*) AS n FROM ${kind}${where}`).get(...values).n;
        const rows = db.prepare(`SELECT ${config.fields} FROM ${kind}${where} ORDER BY created_at DESC,id LIMIT 25 OFFSET ?`).all(...values,(page-1)*25);
        return reply(200,{rows,total,page,...(divisionCounts?{divisionCounts}:{}),...(kind==='reports'?{reportThreshold:REPORT_THRESHOLD}:{}),canManage:config.roles.includes(actor.role)||(actor.role==='owner'&&config.roles.includes('superadmin'))});
      }
      if (req.method !== 'POST' || !id) fail(405,'Method not allowed.');
      if (!config.roles.includes(actor.role)&&!(actor.role==='owner'&&config.roles.includes('superadmin'))) fail(403,'You do not have permission to change this record.');
      const data = await body(req);
      const reason = text(data.reason,5,500,'decision reason (5–500 characters)');
      if (!config.states.includes(data.status)) fail(400,'Invalid status.');
      transaction(db,() => {
        const before = db.prepare(`SELECT ${config.fields} FROM ${kind} WHERE id=?`).get(id);
        if (!before) fail(404,'Record not found.');
        if(kind==='approvals'&&!fullAccess(actor.role)&&before.kind!=='event')fail(403,'Account approvals require SuperAdmin or UniMate Owner access.');
        if(kind==='reports'&&before.unique_reports<REPORT_THRESHOLD)fail(409,'This content has not reached 3 distinct user reports.');
        if (data.expectedStatus !== before.status) fail(409,'This record changed. Refresh before deciding.');
        if (before.status === data.status) fail(409,'This status is already set.');
        if ((kind === 'approvals' && before.status !== 'pending') || (['reports','account_reports'].includes(kind) && before.status !== 'open')) fail(409,'This review is already closed.');
        if(kind==='approvals'&&before.kind==='staff'&&data.status==='approved'){
          const application=db.prepare('SELECT * FROM staff_applications WHERE approval_id=?').get(id);
          if(!application)fail(409,'This legacy application has no linked staff signup. Import the verified signup details before approval.');
          const team=({cleaning:'cleaners',moving:'movers',airport_transfer:'drivers'})[application.service];
          if(db.prepare('SELECT id FROM team_members WHERE email=?').get(application.email))fail(409,'A team record already uses this email. Reconcile that record before approving.');
          const memberId=randomUUID();db.prepare('INSERT INTO team_members VALUES(?,?,?,?,?,?)').run(memberId,team,application.name,application.email,'active',new Date().toISOString());
          if(db.prepare('SELECT id FROM users WHERE email=?').get(application.email))fail(409,'A user account already uses this email. Reconcile it before approval.');
          db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(memberId,application.name,application.email,'staff_'+application.service,'active',new Date().toISOString());
          db.prepare('UPDATE staff_applications SET member_id=? WHERE approval_id=?').run(memberId,id);
          audit(db,actor,'staff.approved_and_joined','teams',memberId,null,{approval_id:id,team},reason);
        }
        db.prepare(`UPDATE ${kind} SET status=? WHERE id=?`).run(data.status,id);
        audit(db,actor,'status.changed',kind,id,before,{...before,status:data.status},reason);
      });
      return reply(200,{ok:true});
    } catch (error) { if (!res.headersSent) reply(error.status || 500,{error:error.status ? error.message : 'Unexpected server error.'}); else res.end(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return { server, db };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') throw Error('Local backend only. Complete the production checklist before deployment.');
  process.umask(0o077);
  const port = Number(process.env.ADMIN_PORT || 8090);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid ADMIN_PORT');
  const {server, db} = await createApplication({port});
  server.listen(port,'127.0.0.1',() => console.log(`UNIMATE 优你伴 Administration: http://localhost:${port} (local only)`));
  const close = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT',close); process.on('SIGTERM',close);
}
