import {randomInt,randomUUID} from 'node:crypto';
import {transaction, audit} from './database.mjs';
import {token,digest, hashPassword} from './security.mjs';
import {memberPasswordValid} from './public/member-password-policy.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function createAdminAccess(db,{sendMail=null,requireEmailVerification=false,now=Date.now}={}) {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_access_requests(
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
    password_hash TEXT, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','approved','rejected')),
    created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT REFERENCES admins(id),
    review_reason TEXT, admin_id TEXT REFERENCES admins(id));`);
  if(!db.prepare('PRAGMA table_info(admin_access_requests)').all().some(c=>c.name==='email_verified_at'))db.exec('ALTER TABLE admin_access_requests ADD COLUMN email_verified_at TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS admin_access_codes(request_id TEXT PRIMARY KEY REFERENCES admin_access_requests(id),handle_hash TEXT NOT NULL UNIQUE,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,resend_after INTEGER NOT NULL);`);
  const rate=(address,email)=>{const keys=['admin-email-ip:'+address,'admin-email-address:'+digest(email)];db.prepare('DELETE FROM login_limits WHERE expires<=?').run(now());if(keys.some(key=>(db.prepare('SELECT count FROM login_limits WHERE key=?').get(key)?.count||0)>=5))fail(429,'Too many requests. Try again in 15 minutes.');for(const key of keys)db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now()+15*60*1000);};
  async function issue(row,handle=token()){
    if(!sendMail)fail(503,'Administrator email verification is awaiting email setup. Please contact UniMate Support.');
    if(!row||row.status!=='pending'||row.email_verified_at)return {ok:true,requiresEmailVerification:true,verificationToken:handle};
    const existing=db.prepare('SELECT resend_after FROM admin_access_codes WHERE request_id=?').get(row.id);if(existing&&existing.resend_after>now())fail(429,'Wait one minute before requesting another email code.');
    const code=String(randomInt(0,1000000)).padStart(6,'0'),codeHash=digest(row.id+':'+code);
    db.prepare('INSERT OR REPLACE INTO admin_access_codes VALUES(?,?,?,?,0,?)').run(row.id,digest(handle),codeHash,now()+10*60*1000,now()+60000);
    try{await sendMail({to:row.email,subject:'Your UniMate administrator verification code',text:'Your UniMate email verification code is '+code+'. It expires in 10 minutes. This verifies your email only; the Owner must still approve access, and authenticator two-factor authentication is required. If you did not request this, ignore this email.'});}catch{db.prepare('DELETE FROM admin_access_codes WHERE request_id=? AND code_hash=?').run(row.id,codeHash);fail(503,'The verification email could not be sent. Please try again later.');}
    return {ok:true,requiresEmailVerification:true,verificationToken:handle};
  }
  let hashing=0;
  const safe='id,email,name,reason,status,created_at,reviewed_at,review_reason,admin_id,email_verified_at';
  return {
    async request(data,address) {
      if(requireEmailVerification&&!sendMail)fail(503,'Administrator email verification is awaiting email setup. Please contact UniMate Support.');
      if(!db.prepare("SELECT id FROM admins WHERE role='owner' AND active=1").get())fail(503,'Admin access requests are not available yet.');
      const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
      const name=typeof data.name==='string'?data.name.trim():'';
      const reason=typeof data.reason==='string'?data.reason.trim():'';
      if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email address.');
      if(name.length<2||name.length>80||reason.length<5||reason.length>500)fail(400,'Enter your name and why you need admin access (5–500 characters).');
      if(!memberPasswordValid(data.password))fail(400,'Use 10–128 characters, including uppercase and lowercase letters, a number and a special character.');
      if(data.password!==data.confirmPassword)fail(400,'Passwords do not match.');
      const now=Date.now(), keys=['admin-request-ip:'+address,'admin-request-email:'+digest(email)];
      db.prepare('DELETE FROM login_limits WHERE expires<?').run(now);
      if(keys.some(key=>(db.prepare('SELECT count FROM login_limits WHERE key=?').get(key)?.count||0)>=5))fail(429,'Too many requests. Try again in 15 minutes.');
      if(hashing>=2)fail(429,'Please try again shortly.');
      for(const key of keys)db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+15*60*1000);
      hashing++;let hash;try{hash=await hashPassword(data.password);}finally{hashing--;}
      transaction(db,()=>{
        // A repeat request never replaces somebody else's pending credentials.
        if(db.prepare('SELECT id FROM admins WHERE lower(email)=?').get(email)||db.prepare('SELECT id FROM admin_access_requests WHERE email=? COLLATE NOCASE').get(email))return;
        const id=randomUUID();
        db.prepare('INSERT INTO admin_access_requests(id,email,name,password_hash,reason,created_at) VALUES(?,?,?,?,?,?)').run(id,email,name,hash,reason,new Date().toISOString());
        audit(db,null,'admin_access.requested','admin_access_requests',id,null,{status:'pending'},'Admin access requested');
      });
      if(requireEmailVerification)return issue(db.prepare('SELECT * FROM admin_access_requests WHERE email=? COLLATE NOCASE').get(email));
      return {ok:true,message:'Your request has been received. You can sign in only after the UniMate Owner verifies and approves your access. If you already have an account or a pending request, it has not been changed.'};
    },
    verify(data,address){
      const handle=typeof data.verificationToken==='string'&&/^[a-f0-9]{64}$/.test(data.verificationToken)?data.verificationToken:'';
      const key='admin-code-ip:'+address;db.prepare('DELETE FROM login_limits WHERE expires<=?').run(now());if((db.prepare('SELECT count FROM login_limits WHERE key=?').get(key)?.count||0)>=20)fail(429,'Too many attempts. Try again in 15 minutes.');db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now()+15*60*1000);
      const row=db.prepare('SELECT * FROM admin_access_codes WHERE handle_hash=?').get(digest(handle));
      if(!row||row.expires<=now())fail(400,'Email code expired. Request a new code.');
      if(row.attempts>=5)fail(429,'Too many code attempts. Request a new code.');
      db.prepare('UPDATE admin_access_codes SET attempts=attempts+1 WHERE request_id=?').run(row.request_id);
      if(typeof data.code!=='string'||!/^\d{6}$/.test(data.code)||digest(row.request_id+':'+data.code)!==row.code_hash)fail(400,'The email verification code is incorrect.');
      return transaction(db,()=>{const result=db.prepare("UPDATE admin_access_requests SET email_verified_at=? WHERE id=? AND status='pending' AND email_verified_at IS NULL").run(new Date(now()).toISOString(),row.request_id);if(!result.changes)fail(409,'This request is no longer awaiting email verification.');db.prepare('DELETE FROM admin_access_codes WHERE request_id=?').run(row.request_id);audit(db,null,'admin_access.email_verified','admin_access_requests',row.request_id,null,null,'Email code verified; Owner approval still required');return {ok:true,message:'Email verified. Your request is awaiting Owner approval. After approval, set up your authenticator app before accessing administration.'};});
    },
    async resend(data,address){const handle=typeof data.verificationToken==='string'?data.verificationToken:'';const row=db.prepare('SELECT r.* FROM admin_access_requests r JOIN admin_access_codes c ON c.request_id=r.id WHERE c.handle_hash=?').get(digest(handle));rate(address,row?.email||digest(handle));return issue(row,handle);},
    list(actor) {
      if(!['owner','superadmin'].includes(actor?.role))fail(403,'Owner or SuperAdmin access required.');
      return {requiresEmailVerification:requireEmailVerification,rows:db.prepare(`SELECT ${safe} FROM admin_access_requests ORDER BY status='pending' DESC,created_at DESC LIMIT 100`).all()};
    },
    review(actor,session,id,data) {
      if(actor?.role!=='owner')fail(403,'Only UniMate Owner can review admin access requests.');
      if(!['approve','reject'].includes(data.action))fail(400,'Choose approve or reject.');
      const reason=typeof data.reason==='string'?data.reason.trim():'';
      if(reason.length<5||reason.length>500)fail(400,'Enter a review reason (5–500 characters).');
      if(data.action==='approve'&&data.identityVerified!==true)fail(400,'Verify the applicant’s identity and email with them before approval.');
      return transaction(db,()=>{
        const owner=db.prepare('SELECT role,active FROM admins WHERE id=?').get(actor.id);
        const currentSession=db.prepare('SELECT expires FROM sessions WHERE token_hash=?').get(session.token_hash);
        if(owner?.role!=='owner'||!owner.active||!currentSession||currentSession.expires<=Date.now())fail(403,'Your access changed. Sign in again.');
        const row=db.prepare('SELECT * FROM admin_access_requests WHERE id=?').get(id);
        if(!row)fail(404,'Request not found.');
        if(row.status!=='pending')fail(409,'This request has already been reviewed.');
        if(data.action==='approve'&&requireEmailVerification&&!row.email_verified_at)fail(400,'The applicant must verify their email code before approval.');
        let adminId=null;
        if(data.action==='approve'){
          if(db.prepare('SELECT id FROM admins WHERE lower(email)=?').get(row.email))fail(409,'An account with this email already exists.');
          adminId=randomUUID();
          // Public requests can only become regular Admins. Role promotion stays Owner-only.
          db.prepare("INSERT INTO admins VALUES(?,?,?,?,'admin',1)").run(adminId,row.email,row.name,row.password_hash);
        }
        const status=data.action==='approve'?'approved':'rejected';
        db.prepare('UPDATE admin_access_requests SET status=?,password_hash=NULL,reviewed_at=?,reviewed_by=?,review_reason=?,admin_id=? WHERE id=?').run(status,new Date().toISOString(),actor.id,reason,adminId,id);
        audit(db,actor,'admin_access.'+status,'admin_access_requests',id,{status:'pending'},{status,adminId,role:adminId?'admin':null,identityVerified:data.identityVerified===true},reason);
        return {ok:true,status,admin:adminId?{id:adminId,name:row.name,email:row.email,role:'admin',active:1}:null};
      });
    },
  };
}
