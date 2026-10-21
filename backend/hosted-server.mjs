import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createApplication} from './server.mjs';
import {runtimeConfig} from './runtime-config.mjs';
import {createMailer} from './mailer.mjs';
import {stripeRuntimeConfig} from './stripe-payments.mjs';

// Uses the privately migrated database. Never seeds or adopts demonstration data.
process.umask(0o077);
const root=dirname(fileURLToPath(import.meta.url));
const data=resolve(process.env.UNIMATE_LIVE_DATA_DIR||'/var/data/unimate/live');
const filename=resolve(data,'unimate.sqlite');
if(!existsSync(filename))throw Error('The original account database must be migrated before starting.');
const original=new DatabaseSync(filename,{readOnly:true});
try{
 if(original.prepare("SELECT 1 FROM sqlite_master WHERE name='demo_installation'").get())throw Error('Refusing to use a demonstration database.');
 if(!original.prepare("SELECT 1 FROM admins WHERE role='owner' AND active=1").get())throw Error('An active original Owner account is required.');
}finally{original.close();}
const key=readFileSync(resolve(data,'admin-mfa.key'));
if(key.length!==32)throw Error('The original authenticator encryption key is required.');
process.env.UNIMATE_MFA_KEY=key.toString('hex');
const config=runtimeConfig({...process.env,UNIMATE_MODE:'hosted',UNIMATE_DATA_DIR:data,
 UNIMATE_API_ORIGIN:process.env.RENDER_EXTERNAL_URL,
 UNIMATE_ADMIN_ORIGIN:'https://admin.hellounimate.com',
 UNIMATE_WEB_ORIGIN:'https://hellounimate.com',
 UNIMATE_EXTRA_WEB_ORIGINS:'https://www.hellounimate.com',
 UNIMATE_TRUST_PROXY:'1'});
const sendMail=await createMailer();
if(config.allowRegistration&&!sendMail)throw Error('Registration requires configured account email.');
if(sendMail)await sendMail.verify();
const stripeConfig=stripeRuntimeConfig();
const stripe=stripeConfig.enabled?new(await import('stripe')).default(stripeConfig.secretKey,{maxNetworkRetries:2,timeout:10000}):null;
const app=await createApplication({...config,runtime:config,requireAdminMfa:true,requireAdminEmailVerification:true,enforceAdminScopes:true,sendMail,stripe,stripeWebhookSecret:stripeConfig.webhookSecret,webDirectory:resolve(root,'web')});
app.server.listen(config.port,'0.0.0.0',()=>console.log('UniMate hosted backend ready.'));
const close=()=>app.server.close(()=>{sendMail?.close();app.db.close();process.exit(0);});
process.on('SIGINT',close);process.on('SIGTERM',close);
