import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createApplication} from './server.mjs';
import {runtimeConfig} from './runtime-config.mjs';
import {hashPassword} from './security.mjs';
import {seedDemo,demoAccounts} from './demo-seed.mjs';
process.umask(0o077);
const root=dirname(fileURLToPath(import.meta.url)),hosted=process.env.UNIMATE_MODE==='hosted';
const origin=hosted?process.env.RENDER_EXTERNAL_URL:'http://localhost:'+(process.env.PORT||8091);
const data=process.env.UNIMATE_DATA_DIR||resolve(root,'data/developer-demo');
mkdirSync(data,{recursive:true,mode:0o700});
const config=runtimeConfig({...process.env,PORT:process.env.PORT||'8091',UNIMATE_DATA_DIR:data,UNIMATE_API_ORIGIN:origin,UNIMATE_ADMIN_ORIGIN:process.env.UNIMATE_ADMIN_ORIGIN||(hosted?'https://admin.hellounimate.com':origin),UNIMATE_WEB_ORIGIN:process.env.UNIMATE_WEB_ORIGIN||(hosted?'https://hellounimate.com':origin),UNIMATE_EXTRA_WEB_ORIGINS:process.env.UNIMATE_EXTRA_WEB_ORIGINS||(hosted?'https://www.hellounimate.com':''),UNIMATE_TRUST_PROXY:hosted?'1':'0',UNIMATE_REGISTRATION_ENABLED:'false'});
if(process.env.STRIPE_SECRET_KEY&&!/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY))throw Error('The demo cannot use live Stripe credentials.');
// Persist the demo's authenticator encryption key separately from application source.
const keyFile=resolve(data,'demo-mfa-key');
if(!existsSync(keyFile))writeFileSync(keyFile,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
process.env.UNIMATE_MFA_KEY=readFileSync(keyFile,'utf8').trim();
const app=await createApplication({...config,runtime:config,demo:true,webDirectory:process.env.UNIMATE_DEMO_WEB_DIR||resolve(root,'web')});
const initialized=app.db.prepare("SELECT 1 FROM sqlite_master WHERE name='demo_installation'").get()&&app.db.prepare('SELECT 1 FROM demo_installation').get();
if(!initialized){
 let hashes;
 if(process.env.UNIMATE_DEMO_PASSWORD_HASHES)hashes=JSON.parse(process.env.UNIMATE_DEMO_PASSWORD_HASHES);
 else if(hosted)throw Error('Set UNIMATE_DEMO_PASSWORD_HASHES before the first deployment.');
 else{
  hashes={};const credentials=[];
  for(const [id,name,role,username]of demoAccounts){const password='Demo!'+randomBytes(12).toString('base64url');hashes[id]=await hashPassword(password);credentials.push({name,role,username,email:id+'@demo.hellounimate.com',password});}
  writeFileSync(resolve(data,'demo-credentials.json'),JSON.stringify({origin,admin:origin+'/admin',credentials},null,2),{mode:0o600,flag:'wx'});
  writeFileSync(resolve(data,'render-demo.env'),'UNIMATE_DEMO_PASSWORD_HASHES='+JSON.stringify(hashes)+'\n',{mode:0o600,flag:'wx'});
 }
 seedDemo(app.db,hashes);
}
app.server.listen(config.port,hosted?'0.0.0.0':'127.0.0.1',()=>console.log('UniMate isolated developer demo ready on port '+config.port));
const close=()=>app.server.close(()=>{app.db.close();process.exit(0);});process.on('SIGINT',close);process.on('SIGTERM',close);
