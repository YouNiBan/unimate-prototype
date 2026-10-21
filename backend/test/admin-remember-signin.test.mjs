import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../server.mjs';
import {hashPassword} from '../security.mjs';
import {totp} from '../admin-mfa.mjs';

test('remembered sign-in is opt-in, survives MFA and refresh, and cannot be changed during MFA',async t=>{
 const a=await createApplication({filename:':memory:',requireAdminMfa:true});
 await new Promise(r=>a.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>a.server.close(r));a.db.close();});
 const password='ExamplePass1!',email='admin@example.invalid';
 a.db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run('admin',email,'Admin',await hashPassword(password),'admin');
 const origin='http://127.0.0.1:'+a.server.address().port;
 const call=async(path,data,auth={})=>{const r=await fetch(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,Cookie:auth.cookie||'','X-CSRF-Token':auth.csrf||'','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json(),cookies:r.headers.getSetCookie()};};
 const anonymous=(await call('session')).data;
 const assertPersistence=(response,persistent)=>{assert.equal(response.status,200);const cookie=response.cookies.find(c=>c.startsWith('unimate_admin='));assert.ok(cookie);assert.match(cookie,/HttpOnly; SameSite=Strict; Path=\//);assert.equal(/Max-Age=|Expires=/i.test(cookie),persistent);if(persistent)assert.match(cookie,/Max-Age=259\d+/);return cookie.split(';')[0];};
 assert.equal((await call('login',{email,password,keepSignedIn:'true'},anonymous)).status,400);
 const first=await call('login',{email,password},anonymous),cookie=assertPersistence(first,false);
 const sessionResponse=await call('session',null,{cookie});assertPersistence(sessionResponse,false);
 const session={...sessionResponse.data,cookie};assert.equal(session.mfaRequired,true);
 const setup=await call('settings/2fa/begin',{currentPassword:password},session);
 const confirm=await call('settings/2fa/confirm',{code:totp(setup.data.secret,Math.floor(Date.now()/30000))},session);
 assert.equal(confirm.status,200);
 await call('logout',{},session);assert.equal((await call('session',null,{cookie})).data.admin,null);
 for(const [i,persistent] of [true,false].entries()){
  const challenge=await call('login',{email,password,keepSignedIn:persistent},anonymous);assert.equal(challenge.data.requiresTwoFactor,true);
  const browserCookies=challenge.cookies.filter(c=>c.startsWith('unimate_mfa=')||c.startsWith('unimate_mfa_browser=')).map(c=>c.split(';')[0]).join('; ');
  const verified=await call('login/2fa',{code:confirm.data.recoveryCodes[i],keepSignedIn:!persistent},{...anonymous,cookie:browserCookies});
  const finalCookie=assertPersistence(verified,persistent),refreshed=await call('session',null,{cookie:finalCookie});
  assertPersistence(refreshed,persistent);assert.equal(refreshed.data.mfaRequired,false);
  await call('logout',{}, {...refreshed.data,cookie:finalCookie});
  assert.equal((await call('session',null,{cookie:finalCookie})).data.admin,null);
 }
 assert.equal(a.db.prepare('SELECT count(*) n FROM admin_session_preferences').get().n,0);
});
