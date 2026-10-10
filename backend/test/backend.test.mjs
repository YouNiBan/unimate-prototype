import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createApplication } from '../server.mjs';
import { seed } from '../seed.mjs';
import { openDatabase } from '../database.mjs';
import { passwordValid } from '../security.mjs';
import { DatabaseSync } from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import { hashPassword, verifyPassword } from '../security.mjs';

test('password settings verify ownership, enforce policy and revoke all sessions',async t=>{
  const {server,db}=await createApplication({filename:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const origin='http://127.0.0.1:'+server.address().port,oldPassword='TestOld!123',newPassword='TestNew!456';
  const hash=await hashPassword(oldPassword);
  db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run('owner','owner@example.invalid','Owner',hash,'superadmin');
  db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run('normal','normal@example.invalid','Normal',hash,'admin');
  const call=async(path,data,cookie='',csrf='')=>{const response=await fetch(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Cookie:cookie,...(data?{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},body:data?JSON.stringify(data):undefined});return {response,data:await response.json()};};
  const login=async(email,password)=>{const anonymous=await call('session');const result=await call('login',{email,password},'',anonymous.data.csrf);const cookie=result.response.headers.get('set-cookie')?.split(';')[0]||'';return {...result,cookie,csrf:(await call('session',undefined,cookie)).data.csrf};};
  const one=await login('owner@example.invalid',oldPassword),two=await login('owner@example.invalid',oldPassword);
  const payload={currentPassword:oldPassword,password:newPassword,confirmPassword:newPassword};
  assert.equal((await call('settings/password',payload)).response.status,401);
  assert.equal((await call('settings/password',payload,one.cookie,'bad')).response.status,403);
  for(const invalid of [{...payload,password:'short',confirmPassword:'short'},{...payload,confirmPassword:'different'},{...payload,password:oldPassword,confirmPassword:oldPassword},{...payload,currentPassword:'Incorrect!123'}])assert.equal((await call('settings/password',invalid,one.cookie,one.csrf)).response.status,400);
  assert.equal((await call('settings/password',payload,one.cookie,one.csrf)).response.status,200);
  for(const cookie of [one.cookie,two.cookie])assert.equal((await call('overview',undefined,cookie)).response.status,401);
  assert.equal((await login('owner@example.invalid',oldPassword)).response.status,401);
  assert.equal((await login('owner@example.invalid',newPassword)).response.status,200);
  assert.equal(await verifyPassword(oldPassword,db.prepare("SELECT password_hash FROM admins WHERE id='normal'").get().password_hash),true);
  const logs=db.prepare("SELECT * FROM audit WHERE action='password.changed'").all();assert.equal(logs.length,1);assert.equal(logs[0].before_state,null);assert.equal(logs[0].after_state,null);assert.equal(JSON.stringify(logs).includes(newPassword),false);
  const normal=await login('normal@example.invalid',oldPassword);
  // Extra identity fields cannot select another account: endpoint always uses the session owner.
  assert.equal((await call('settings/password',{...payload,id:'owner',role:'superadmin'},normal.cookie,normal.csrf)).response.status,200);
  assert.equal(db.prepare("SELECT role FROM admins WHERE id='normal'").get().role,'admin');
  const limited=await login('normal@example.invalid',newPassword),bad={currentPassword:'Incorrect!123',password:'NextPass!789',confirmPassword:'NextPass!789'};
  for(let i=0;i<5;i++)assert.equal((await call('settings/password',bad,limited.cookie,limited.csrf)).response.status,400);
  assert.equal((await call('settings/password',bad,limited.cookie,limited.csrf)).response.status,429);
});

test('password policy accepts eight characters and enforces boundaries',()=>{
  assert.equal(passwordValid('Abcdef!'),false);
  assert.equal(passwordValid('Abcdefg!'),true);
  assert.equal(passwordValid('abcdefg!'),false);
  assert.equal(passwordValid('Abcdefgh'),false);
  assert.equal(passwordValid('A!'+'x'.repeat(126)),true);
  assert.equal(passwordValid('A!'+'x'.repeat(127)),false);
});

test('authentication, permissions, moderation, persistence and audit integrity',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'unimate-admin-test-')),filename=join(dir,'test.sqlite');
  const {server,db}=await createApplication({filename});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
  async function request(path,data,extra={}){const res=await fetch(origin+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json',Origin:origin,'X-CSRF-Token':csrf}:{}),Cookie:cookie,...extra},body:data?JSON.stringify(data):undefined});return {res,data:await res.json()};}
  const account={name:'Test Admin',email:'test@example.invalid',password:'Abcdefg!',confirmPassword:'Abcdefg!'};
  await t.test('anonymous access and first-run setup',async()=>{
    assert.equal((await request('/api/users')).res.status,401);
    csrf=(await request('/api/session')).data.csrf;
    assert.equal((await request('/api/setup',account,{Origin:'https://evil.invalid'})).res.status,403);
    assert.equal((await request('/api/setup',account,{'X-CSRF-Token':'bad'})).res.status,403);
    assert.equal((await request('/api/setup',{...account,password:'short'})).res.status,400);
    for(const password of ['lowercase-password!', 'MissingSpecial123', 'Spaces Are Not Special']){
      const invalid=await request('/api/setup',{...account,password,confirmPassword:password});
      assert.equal(invalid.res.status,400);assert.match(invalid.data.error,/capital letter/);
    }
    for(const confirmPassword of [undefined,'Different-password!']){
      const mismatch=await request('/api/setup',{...account,confirmPassword});
      assert.equal(mismatch.res.status,400);assert.equal(mismatch.data.error,'Passwords do not match.');
    }
    assert.equal((await request('/api/setup',account)).res.status,201);
    assert.equal((await request('/api/setup',account)).res.status,409);
    assert.notEqual(db.prepare('SELECT password_hash FROM admins').get().password_hash,account.password);
  });
  await t.test('login creates a protected session',async()=>{
    assert.equal((await request('/api/login',{...account,password:'wrong'})).res.status,401);
    const login=await request('/api/login',account);assert.equal(login.res.status,200);const header=login.res.headers.get('set-cookie');assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);cookie=header.split(';')[0];
    const session=(await request('/api/session')).data;csrf=session.csrf;assert.equal(session.admin.role,'superadmin');assert.equal(session.admin.password_hash,undefined);
    assert.equal(db.prepare('SELECT token_hash FROM sessions').get().token_hash.includes(cookie.split('=')[1]),false);
  });
  seed(db);seed(db);
  await t.test('task notifications track seen state without resolving reviews',async()=>{
    const tasks=(await request('/api/tasks')).data;assert.equal(tasks.total,2);assert.equal(tasks.unseen,2);
    const task=tasks.rows[0];assert.equal((await request('/api/tasks/seen',task,{'X-CSRF-Token':'bad'})).res.status,403);
    assert.equal((await request('/api/'+task.resource+'/'+task.record_id)).res.status,200);
    assert.equal((await request('/api/tasks/seen',task)).res.status,200);assert.equal((await request('/api/tasks')).data.unseen,1);assert.equal((await request('/api/tasks')).data.total,2);
    assert.equal((await request('/api/tasks/seen',task)).res.status,200);assert.equal((await request('/api/tasks/seen',{resource:'users',record_id:'sample-user'})).res.status,400);
    db.exec("UPDATE admins SET role='admin'");assert.equal((await request('/api/tasks')).data.total,1);assert.equal((await request('/api/approvals/sample-approval')).res.status,403);assert.equal((await request('/api/tasks/seen',{resource:'approvals',record_id:'sample-approval'})).res.status,404);db.exec("UPDATE admins SET role='superadmin'");
  });
  await t.test('navigation badges count complete queues and booking divisions',async()=>{
    const {counts}=(await request('/api/navigation-counts')).data;
    assert.equal(counts.bookings.all,db.prepare('SELECT count(*) n FROM bookings').get().n);
    assert.equal(counts.bookings.all,['cleaning','moving','airport_transfer','other'].reduce((n,k)=>n+counts.bookings[k],0));
    assert.equal(counts.students,db.prepare("SELECT count(*) n FROM approvals WHERE status='pending' AND kind IN ('student','staff','society','organisation','seller')").get().n);
    assert.equal(counts.teams,db.prepare("SELECT count(*) n FROM approvals WHERE status='pending' AND kind='staff'").get().n);
    assert.equal(counts.reports,(await request('/api/reports?type=post&status=open')).data.total);
    assert.equal(counts.comment_reports,(await request('/api/reports?type=comment&status=open')).data.total);
    assert.equal(counts.account_reports,(await request('/api/account_reports?status=open')).data.total);
    assert.equal(counts.messages,db.prepare('SELECT count(*) n FROM messages').get().n);
  });
  await t.test('messages are saved locally, idempotent and restricted to privileged admins',async()=>{
    const input={recipientId:'sample-user',subject:'Booking support',message:'Private sample conversation text',messageId:randomUUID()};
    assert.equal((await request('/api/conversations',input,{'X-CSRF-Token':'bad'})).res.status,403);
    assert.equal((await request('/api/conversations',{...input,recipientId:'unknown'})).res.status,400);
    const result=await request('/api/conversations',input);assert.equal(result.res.status,201);assert.equal(result.data.delivery_status,'local_only');
    const id=result.data.id;assert.equal((await request('/api/conversations',input)).data.id,id);assert.equal((await request('/api/conversations')).data.total,1);
    assert.equal((await request('/api/conversations',{...input,message:'Changed retry text'})).res.status,409);
    assert.equal((await request('/api/conversations',{...input,category:'support'})).res.status,409);
    assert.equal((await request('/api/conversations?category=support')).data.total,0);
    assert.equal((await request('/api/conversations?category=general')).data.total,1);
    assert.equal((await request('/api/conversations?category=invalid')).res.status,400);
    const summary=(await request('/api/conversations')).data.rows[0];assert.equal(summary.last_message,input.message);assert.ok(summary.last_message_at);
    const reply={message:'Local follow-up only',messageId:randomUUID()};assert.equal((await request('/api/conversations/'+id,reply)).res.status,201);assert.equal((await request('/api/conversations/'+id,reply)).res.status,201);
    const thread=(await request('/api/conversations/'+id)).data;assert.equal(thread.total,2);assert.ok(thread.rows.every(r=>r.delivery_status==='local_only'));assert.equal(thread.conversation.recipient_name,'Alex Sample');
    assert.equal((await request('/api/conversations/'+id,{...reply,messageId:randomUUID(),message:'x'.repeat(4001)})).res.status,400);
    assert.equal(JSON.stringify(db.prepare("SELECT * FROM audit WHERE action='message.saved'").all()).includes(input.message),false);
    assert.equal((await request('/api/conversations/'+id,{status:'closed'},{'X-CSRF-Token':'bad'})).res.status,403);
    assert.equal((await request('/api/conversations/'+id,{status:'invalid'})).res.status,400);
    assert.equal((await request('/api/conversations/'+id,{status:'closed'})).res.status,200);
    assert.equal((await request('/api/conversations?status=closed')).data.total,1);
    assert.equal((await request('/api/conversations?status=open')).data.total,0);
    assert.equal((await request('/api/conversations/'+id,{message:'Blocked closed reply',messageId:randomUUID()})).res.status,409);
    db.prepare("UPDATE conversations SET status='request' WHERE id=?").run(id);
    assert.equal((await request('/api/conversations?status=request')).data.counts.request,1);
    assert.equal((await request('/api/conversations/'+id,{status:'open'})).res.status,200);
    assert.equal((await request('/api/conversations?status=open')).data.total,1);
    db.exec("UPDATE admins SET role='admin'");assert.equal((await request('/api/conversations/'+id,{status:'closed'})).res.status,403);db.exec("UPDATE admins SET role='superadmin'");
    db.exec("UPDATE admins SET role='admin'");for(const path of ['/api/conversations','/api/conversations/'+id]){assert.equal((await request(path)).res.status,403);assert.equal((await request(path,input)).res.status,403);}db.exec("UPDATE admins SET role='superadmin'");
    db.prepare("UPDATE users SET status='suspended' WHERE id='sample-user'").run();assert.equal((await request('/api/conversations/'+id,{message:'Blocked delivery',messageId:randomUUID()})).res.status,409);db.prepare("UPDATE users SET status='active' WHERE id='sample-user'").run();
  });
  await t.test('read records and reject invalid changes',async()=>{
    const users=await request('/api/users');assert.equal(users.data.total,3);assert.equal(users.data.canManage,true);
    assert.equal((await request('/api/users?page=-1')).res.status,400);
    const change={status:'suspended',expectedStatus:'active',reason:'Test moderation decision'};
    assert.equal((await request('/api/users/sample-user',change,{'X-CSRF-Token':'bad'})).res.status,403);
    assert.equal((await request('/api/users/sample-user',{...change,reason:'x'})).res.status,400);
    assert.equal((await request('/api/users/sample-user',{...change,status:'deleted'})).res.status,400);
    assert.equal((await request('/api/users/sample-user',change)).res.status,200);
    assert.equal((await request('/api/users/sample-user',change)).res.status,409);
    assert.equal((await request('/api/bookings/sample-booking',change)).res.status,403);
    const log=db.prepare("SELECT * FROM audit WHERE resource='users'").get();assert.equal(JSON.parse(log.before_state).status,'active');assert.equal(JSON.parse(log.after_state).status,'suspended');assert.equal(log.reason,change.reason);
    assert.throws(()=>db.exec('DELETE FROM audit'),/cannot be deleted/);assert.throws(()=>db.exec("UPDATE audit SET reason='tampered'"),/cannot be updated/);
  });
  await t.test('roles are checked server-side on every request',async()=>{
    db.exec("UPDATE admins SET role='viewer'");assert.equal((await request('/api/posts/sample-post',{status:'hidden',expectedStatus:'published',reason:'Test reason'})).res.status,403);assert.equal((await request('/api/audit')).res.status,403);
    db.exec("UPDATE admins SET role='admin'");assert.equal((await request('/api/users')).res.status,403);assert.equal((await request('/api/bookings')).res.status,403);assert.equal((await request('/api/approvals')).res.status,200);
    assert.deepEqual(Object.keys((await request('/api/overview')).data).sort(),['approvals','reports']);
    assert.deepEqual(Object.keys((await request('/api/navigation-counts')).data.counts),['events','reports','comment_reports']);
    assert.equal((await request('/api/posts/sample-post',{status:'hidden',expectedStatus:'published',reason:'Sample moderation'})).res.status,200);
    db.exec("UPDATE admins SET role='superadmin'");
  });
  await t.test('booking divisions and event approvals are filtered and access-controlled',async()=>{
    const now=new Date().toISOString();
    for(const [id,service] of [['clean','Cleaning'],['move','moving'],['airport','airport_transfer']])db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run(id,id,'Fictional customer',service,'confirmed',1000,now);
    const all=await request('/api/bookings');assert.deepEqual(all.data.divisionCounts,{all:4,cleaning:1,moving:1,airport_transfer:1,other:1});
    for(const division of ['cleaning','moving','airport_transfer','other'])assert.equal((await request('/api/bookings?division='+division)).data.total,1);
    assert.equal((await request('/api/bookings?division=invalid')).res.status,400);
    for(const kind of ['event','student','staff'])db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?)').run(kind,kind,kind,'Sample applicant','Test details','pending',now);
    assert.equal((await request('/api/approvals?kind=event')).data.total,1);
    db.exec("UPDATE admins SET role='admin'");
    assert.equal((await request('/api/approvals')).data.total,1);
    assert.equal((await request('/api/approvals?kind=staff')).data.total,0);
    assert.equal((await request('/api/bookings?division=cleaning')).res.status,403);
    assert.equal((await request('/api/approvals/student',{status:'approved',expectedStatus:'pending',reason:'Forbidden student approval'})).res.status,403);
    assert.equal((await request('/api/approvals/event',{status:'approved',expectedStatus:'pending',reason:'Event details checked'})).res.status,200);
    db.exec("UPDATE admins SET role='superadmin'");
    const reports=await request('/api/reports');assert.equal(reports.data.rows[0].unique_reports,3);assert.equal(reports.data.reportThreshold,3);
  });
  await t.test('review queues close once and persist',async()=>{
    assert.equal((await request('/api/approvals/sample-approval',{status:'approved',expectedStatus:'pending',reason:'Sample verified'})).res.status,200);
    assert.equal((await request('/api/approvals/sample-approval',{status:'rejected',expectedStatus:'approved',reason:'Cannot change closed review'})).res.status,409);
    assert.equal((await request('/api/reports/sample-report',{status:'resolved',expectedStatus:'open',reason:'Post has been reviewed'})).res.status,200);
    const other=openDatabase(filename);assert.equal(other.prepare('SELECT status FROM posts').get().status,'hidden');other.close();
  });
  await t.test('Superadmin provisions roles; Normal admin cannot read or change accounts or finance',async()=>{
    const newAdmin={name:'Normal Admin',email:'unimate.support',password:'Testing!2026',confirmPassword:'Testing!2026',role:'admin',reason:'Test username-only normal admin access'};
    assert.equal((await request('/api/admins',{...newAdmin,email:'invalid username'})).res.status,400);
    assert.equal((await request('/api/admins',{...newAdmin,role:'owner'})).res.status,400);
    assert.equal((await request('/api/admins',{...newAdmin,confirmPassword:'wrong'})).res.status,400);
    assert.equal((await request('/api/admins',newAdmin,{'X-CSRF-Token':'wrong'})).res.status,403);
    assert.equal((await request('/api/admins',newAdmin)).res.status,201);
    assert.equal((await request('/api/admins',newAdmin)).res.status,409);
    const rows=(await request('/api/admins')).data.rows,normal=rows.find(r=>r.email===newAdmin.email),self=rows.find(r=>r.email===account.email);
    assert.ok(normal);assert.ok(rows.every(r=>!('password_hash' in r)));
    const ownerCookie=cookie,ownerCsrf=csrf;
    cookie='';csrf=(await request('/api/session')).data.csrf;
    const login=await request('/api/login',newAdmin);assert.equal(login.res.status,200);cookie=login.res.headers.get('set-cookie').split(';')[0];csrf=(await request('/api/session')).data.csrf;
    for(const path of ['users','bookings','admins','audit','invoices','finance','accounts']){
      assert.equal((await request('/api/'+path)).res.status,403,path);
      assert.equal((await request('/api/'+path+'/sample',{role:'superadmin',reason:'Attempt escalation'})).res.status,403,path);
    }
    assert.equal((await request('/api/admins',{...newAdmin,email:'escalate@example.invalid',role:'superadmin'})).res.status,403);
    assert.deepEqual(Object.keys((await request('/api/overview')).data).sort(),['approvals','reports']);
    assert.equal((await request('/api/posts')).res.status,200);
    assert.equal((await request('/api/posts/sample-post',{status:'published',expectedStatus:'hidden',reason:'Restore test content'})).res.status,200);
    const normalCookie=cookie;
    cookie=ownerCookie;csrf=ownerCsrf;
    assert.equal((await request('/api/admins/'+self.id,{role:'admin',active:true,expectedRole:'superadmin',expectedActive:true,reason:'Test protected access'})).res.status,403);
    const update={role:'admin',active:false,expectedRole:'admin',expectedActive:true,reason:'Remove sample access'};
    assert.equal((await request('/api/admins/'+normal.id,{...update,expectedActive:false})).res.status,409);
    assert.equal((await request('/api/admins/'+normal.id,update)).res.status,200);
    assert.equal((await request('/api/admins?status=deactivated')).data.rows[0].id,normal.id);
    assert.equal((await request('/api/admins?status=active')).data.rows.some(r=>r.id===normal.id),false);
    assert.equal((await request('/api/admins?status=unknown')).res.status,400);
    cookie=normalCookie;assert.equal((await request('/api/posts')).res.status,401);cookie=ownerCookie;
    assert.equal((await request('/api/admins',{...newAdmin,email:'second-owner@example.invalid',role:'superadmin'})).res.status,403);
    db.prepare("UPDATE admins SET role='owner' WHERE id=?").run(self.id);
    assert.equal((await request('/api/admins',{...newAdmin,email:'second-owner@example.invalid',role:'superadmin'})).res.status,201);
    assert.equal((await request('/api/users')).res.status,200);
    assert.equal((await request('/api/overview')).data.users,3);
    assert.equal((await request('/api/admins/'+self.id,{role:'admin',active:false,expectedRole:'owner',expectedActive:true,reason:'Owner is protected'})).res.status,403);
    const second=db.prepare("SELECT id FROM admins WHERE email='second-owner@example.invalid'").get();
    assert.equal((await request('/api/admins/'+second.id,{role:'admin',active:true,expectedRole:'superadmin',expectedActive:true,reason:'Owner may manage superadmins'})).res.status,200);
    assert.equal((await request('/api/admins',{...newAdmin,email:'illegal-owner@example.invalid',role:'owner'})).res.status,400);
    const log=(await request('/api/audit')).data.rows;assert.ok(log.some(r=>r.action==='admin.access.changed'));assert.equal(JSON.stringify(log).includes(newAdmin.password),false);assert.equal(JSON.stringify(log).includes('password_hash'),false);
  });
  await t.test('500 users: bounded pages, stable traversal, search, filters and concurrent reads',async()=>{
    const insert=db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)');db.exec('BEGIN');
    for(let i=1;i<498;i++)insert.run('load-'+i,'Sample Member '+String(i).padStart(3,'0'),'member'+i+'@example.invalid','student',i%5===0?'suspended':'active','2026-01-01T00:00:00.000Z');db.exec('COMMIT');
    const start=performance.now(),seen=new Set();
    for(let p=1;p<=20;p++){const result=await request('/api/users?page='+p);assert.equal(result.data.total,500);assert.equal(result.data.rows.length,25);result.data.rows.forEach(r=>seen.add(r.id));}assert.equal(seen.size,500);
    const search=await request('/api/users?q=member123%40example.invalid');assert.equal(search.data.total,1);assert.equal(search.data.rows[0].id,'load-123');
    assert.equal((await request('/api/users?status=suspended')).data.total,100);
    assert.equal((await request('/api/users?q=%25')).data.total,0);
    assert.equal((await request('/api/users?q='+ 'a'.repeat(101))).res.status,400);
    const parallel=await Promise.all(Array.from({length:20},()=>request('/api/users?page=10')));assert.ok(parallel.every(r=>r.res.status===200&&r.data.rows.length===25));
    t.diagnostic('500-user check: 20 pages + search/filter checks + 20 concurrent reads in '+Math.round(performance.now()-start)+'ms (local test only).');
  });
  await t.test('disabled and expired sessions cannot access data; logout revokes session',async()=>{
    db.exec('UPDATE admins SET active=0');assert.equal((await request('/api/posts')).res.status,401);db.exec('UPDATE admins SET active=1');
    assert.equal((await request('/api/logout',{})).res.status,200);assert.equal((await request('/api/posts')).res.status,401);
    cookie='';csrf=(await request('/api/session')).data.csrf;const login=await request('/api/login',account);cookie=login.res.headers.get('set-cookie').split(';')[0];db.exec('UPDATE sessions SET expires=0');assert.equal((await request('/api/posts')).res.status,401);
  });
  await t.test('repeated failed login is limited',async()=>{
    cookie='';csrf=(await request('/api/session')).data.csrf;
    for(let i=0;i<10;i++)assert.equal((await request('/api/login',{...account,password:'wrong'})).res.status,401);
    assert.equal((await request('/api/login',account)).res.status,429);
  });
  await t.test('dashboard assets and browser security headers',async()=>{
    const logo=await fetch(origin+'/unimate-logo.png');assert.equal(logo.status,200);assert.equal(logo.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await logo.arrayBuffer()),await readFile(new URL('../../assets/unimate-logo.png',import.meta.url)));
    for(const path of ['/','/app.js','/styles.css']){const res=await fetch(origin+path);assert.equal(res.status,200);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);}
    const status=await new Promise((resolve,reject)=>{http.get(origin+'/api/health',{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
    assert.equal(status,403);
  });
});

test('legacy role migration preserves accounts and sessions',()=>{
  const dir=mkdtempSync(join(tmpdir(),'unimate-role-migration-')),file=join(dir,'legacy.sqlite');
  try{
    const old=new DatabaseSync(file);old.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE admins(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('superadmin','moderator','viewer')),active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admins(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
      INSERT INTO admins VALUES('legacy','legacy@example.invalid','Legacy','test-hash','moderator',1);
      INSERT INTO sessions VALUES('test-token','legacy','test-csrf',9999999999999);`);old.close();
    const migrated=openDatabase(file);assert.equal(migrated.prepare('SELECT role FROM admins').get().role,'admin');assert.equal(migrated.prepare('SELECT count(*) AS n FROM sessions').get().n,1);assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(),[]);migrated.close();
    const again=openDatabase(file);assert.equal(again.prepare('SELECT count(*) AS n FROM admins').get().n,1);again.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
