import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../server.mjs';
import {hashPassword,verifyPassword} from '../security.mjs';
import {memberPasswordValid} from '../public/member-password-policy.mjs';
import {readFileSync} from 'node:fs';

test('member password rules match the prototype and connected frontend',()=>{
  assert.equal(memberPasswordValid('Abcdefg1!x'),true);
  for(const value of ['Abcdef1!x','abcdefgh1!','ABCDEFGH1!','Abcdefghi!','Abcdefgh12','Abcdefg12中','A1!'+'x'.repeat(126)])assert.equal(memberPasswordValid(value),false,value);
  assert.equal(readFileSync(new URL('../public/member-password-policy.mjs',import.meta.url),'utf8'),readFileSync(new URL('../../../unimate-web-v2/member-password-policy.mjs',import.meta.url),'utf8'));
});

test('admin requests require approval, cannot choose privileges and expose no passwords',async t=>{
  const app=await createApplication({filename:':memory:'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();});
  const origin=`http://127.0.0.1:${app.server.address().port}`,password='ExamplePass1!';
  const hash=await hashPassword(password);
  for(const role of ['owner','superadmin','admin'])app.db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role,role+'@example.invalid',role,hash,role);
  const call=async(path,data,auth={})=>{
    const r=await fetch(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':auth.csrf||'',Cookie:auth.cookie||''},body:data?JSON.stringify(data):undefined});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  const anonymous=await call('session'),csrf=anonymous.data.csrf;
  const login=async email=>{const r=await call('login',{email,password},{csrf});const s=await call('session',null,r);return {...r,csrf:s.data.csrf};};
  const payload={name:'Applicant',email:'applicant@example.invalid',reason:'Help with community moderation',password,confirmPassword:password,role:'owner',active:true};
  assert.equal((await call('admin-access/request',payload)).status,403);
  assert.equal((await call('admin-access/request',payload,{csrf})).status,202);
  const row=app.db.prepare('SELECT * FROM admin_access_requests').get();
  assert.equal(row.status,'pending');assert.equal(await verifyPassword(password,row.password_hash),true);
  assert.equal((await login(payload.email)).status,401);
  assert.equal((await call('admin-access')).status,401);
  const owner=await login('owner@example.invalid');
  for(const role of ['superadmin','admin']){
    const auth=await login(role+'@example.invalid');
    assert.equal((await call('admin-access',null,auth)).status,role==='superadmin'?200:403);
    assert.equal((await call('admin-access/'+row.id,{action:'approve',reason:'Identity verified',identityVerified:true},auth)).status,403);
  }
  const listed=await call('admin-access',null,owner);
  assert.equal(listed.status,200);assert.equal(JSON.stringify(listed.data).includes('password'),false);
  assert.equal((await call('admin-access/'+row.id,{action:'approve',reason:'Identity checked'},owner)).status,400);
  const accepted=await call('admin-access/'+row.id,{action:'approve',reason:'Identity and email checked directly',identityVerified:true,role:'owner'},owner);assert.equal(accepted.status,200);assert.equal(accepted.data.admin.role,'admin');assert.equal(accepted.data.admin.email,payload.email);assert.equal(JSON.stringify(accepted.data).includes('password'),false);
  assert.equal(app.db.prepare('SELECT role FROM admins WHERE email=?').get(payload.email).role,'admin');
  assert.equal(app.db.prepare('SELECT password_hash FROM admin_access_requests').get().password_hash,null);
  const approved=await login(payload.email);assert.equal(approved.status,200);
  assert.equal((await call('payments',null,approved)).status,403);
  const roleChange={role:'superadmin',active:true,expectedRole:'admin',expectedActive:true,reason:'Owner selected operational role'};
  assert.equal((await call('admins/'+accepted.data.admin.id,roleChange,approved)).status,403);
  assert.equal((await call('admins/'+accepted.data.admin.id,roleChange,owner)).status,200);
  assert.equal(app.db.prepare('SELECT role FROM admins WHERE id=?').get(accepted.data.admin.id).role,'superadmin');
  assert.equal((await call('payments',null,approved)).status,401);
  assert.equal((await call('admin-access/'+row.id,{action:'reject',reason:'Second review'},owner)).status,409);
  assert.equal((await call('admin-access/request',{...payload,password:'DifferentPass1!',confirmPassword:'DifferentPass1!'},{csrf})).status,202);
  assert.equal((await login(payload.email)).status,200);
  assert.equal((await call('admin-access/request',{...payload,email:'reject@example.invalid'},{csrf})).status,202);
  const rejected=app.db.prepare("SELECT id FROM admin_access_requests WHERE email='reject@example.invalid'").get();
  assert.equal((await call('admin-access/'+rejected.id,{action:'reject',reason:'Not a team member'},owner)).status,200);
  assert.equal((await login('reject@example.invalid')).status,401);
  assert.equal(JSON.stringify(app.db.prepare('SELECT * FROM audit').all()).includes(password),false);
});
