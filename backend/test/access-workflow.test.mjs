import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../server.mjs';

test('owner provisions limited support accounts and approves verified staff access through real endpoints',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'unimate-access-test-'));
  const app=await createApplication({filename:join(directory,'test.sqlite')});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.db.close();rmSync(directory,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+app.server.address().port,password='Test-Only-Password!123';
  async function call(path,data,actor={}){
    const response=await fetch(origin+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{Cookie:actor.cookie||'',...(data===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':actor.csrf||''})},body:data===undefined?undefined:JSON.stringify(data)});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const setup=await call('session');
  assert.equal((await call('setup',{name:'Local test owner',email:'owner@example.invalid',password,confirmPassword:password},{csrf:setup.data.csrf})).status,201);
  async function login(email){
    const anon=await call('session');
    const logged=await call('login',{email,password},{csrf:anon.data.csrf});
    assert.equal(logged.status,200);
    const session=await call('session',undefined,{cookie:logged.cookie});
    return {...session.data,cookie:logged.cookie};
  }
  const owner=await login('owner@example.invalid');
  assert.equal(owner.admin.role,'owner');
  assert.equal((await call('member/owner-preview?path='+encodeURIComponent('/api/oversight/accounts'),undefined,owner)).status,200);
  assert.equal((await call('member/owner-preview?path='+encodeURIComponent('/api/users'),undefined,owner)).status,404);
  assert.equal((await call('member/owner-preview?path='+encodeURIComponent('/api/session'),{},owner)).status,405);
  const input={name:'Local support teammate',email:'support@example.invalid',password,confirmPassword:password,role:'support',reason:'Customer care team access'};
  assert.equal((await call('admins',input,owner)).status,201);
  const support=await login(input.email);
  assert.equal(support.admin.role,'support');
  assert.equal((await call('member/owner-preview?path='+encodeURIComponent('/api/oversight/accounts'),undefined,support)).status,403);
  assert.equal((await call('support',undefined,support)).status,200);
  for(const path of ['users','teams','admins','audit','oversight','documents','invoices','conversations','dev-mail']){
    assert.equal((await call(path,undefined,support)).status,403,path);
  }
  assert.equal((await call('admins',{...input,email:'forged@example.invalid',role:'superadmin'},support)).status,403);
  assert.equal((await call('tasks',undefined,support)).status,200);
  assert.equal((await call('tasks/seen',{resource:'approvals',record_id:'no-access'},support)).status,403);
  assert.equal((await call('navigation-counts',undefined,support)).status,200);
  assert.equal((await call('member/support',undefined,support)).status,401);
  const user={id:'verified-staff-candidate',name:'Test cleaner',email:'cleaner@example.invalid'};
  app.db.prepare("INSERT INTO users VALUES(?,?,?,'student','active',?)").run(user.id,user.name,user.email,new Date().toISOString());
  const storedHash=app.db.prepare('SELECT password_hash FROM admins WHERE id=?').get(owner.admin.id).password_hash;
  app.db.prepare('INSERT INTO member_credentials VALUES(?,?,NULL,?)').run(user.id,storedHash,new Date().toISOString());
  const application={userId:user.id,service:'cleaning',jobTitle:'Cleaning professional',reason:'Approved identity and local service onboarding'};
  assert.equal((await call('staff-applications',application,owner)).status,400);
  app.db.prepare('UPDATE member_credentials SET verified_at=? WHERE user_id=?').run(new Date().toISOString(),user.id);
  assert.equal((await call('staff-applications',application,support)).status,403);
  const pending=await call('staff-applications',application,owner);
  assert.equal(pending.status,201,JSON.stringify(pending.data));
  assert.equal(app.db.prepare('SELECT count(*) n FROM staff_user_links').get().n,0);
  assert.equal((await call('staff-applications',application,owner)).status,409);
  assert.equal((await call('approvals/'+pending.data.id,{status:'approved',expectedStatus:'pending',reason:'Checked staff identity and service eligibility'},owner)).status,200);
  const linked=app.db.prepare('SELECT l.user_id,m.team FROM staff_user_links l JOIN team_members m ON m.id=l.member_id').get();
  assert.equal(linked.user_id,user.id);assert.equal(linked.team,'cleaners');
  const accounts=await call('admins',undefined,owner);
  const supportRow=accounts.data.rows.find(row=>row.role==='support');
  assert.equal((await call('admins/'+supportRow.id,{role:'support',active:false,expectedRole:'support',expectedActive:true,reason:'Revoke temporary support access'},owner)).status,200);
  assert.equal((await call('support',undefined,support)).status,401);
  assert.equal((await call('member/support',{body:'attempt'},support)).status,401);
  assert.equal(app.db.prepare('PRAGMA foreign_key_check').all().length,0);
});
