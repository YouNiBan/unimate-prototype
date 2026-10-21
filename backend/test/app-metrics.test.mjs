import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createAppMetrics} from '../app-metrics.mjs';
import {createApplication} from '../server.mjs';
import {digest} from '../security.mjs';
test('bounded metrics exclude monitoring and discard identities and old samples',()=>{
 let now=1000000,tick=0;const m=createAppMetrics({clock:()=>now,monotonic:()=>tick});
 function record(url,status,finished=true){const res=new EventEmitter();res.statusCode=status;res.writableFinished=finished;m.observe({url},res);tick+=120;res.emit('finish');res.emit('close');}
 record('/api/health',200);record('/api/app-metrics',200);record('/app.js',200);record('/api/bookings/private-id?email=private@example.com',200);record('/api/login',401);record('/api/bookings',500);
 let s=m.snapshot();assert.equal(s.requests,3);assert.equal(s.serverErrors,1);assert.equal(s.clientErrors,1);assert.equal(s.averageMs,120);assert.equal(s.p95UpperBoundMs,250);assert.equal(s.history.length,15);assert.ok(!JSON.stringify(s).includes('private'));
 now+=16*60000;s=m.snapshot();assert.equal(s.requests,0);assert.equal(s.averageMs,null);assert.equal(s.errorPercent,null);
});
test('only Owner and SuperAdmin can read metrics',async t=>{
 const app=await createApplication({filename:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();});
 const origin=`http://127.0.0.1:${app.server.address().port}`;
 app.db.prepare("INSERT INTO admin_access_requests(id,email,name,password_hash,reason,created_at) VALUES(?,?,?,?,?,?)").run('request','applicant@example.invalid','Applicant','unused','Testing owner approval count',new Date().toISOString());
 app.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('recent','Recent','recent@example.invalid','student','active',new Date().toISOString());
 app.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('old','Old','old@example.invalid','student','active','2020-01-01T00:00:00.000Z');
 app.db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run('open-booking','Open job','Customer','cleaning','confirmed',10000,new Date().toISOString());
 app.db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run('done-booking','Done job','Customer','cleaning','completed',10000,new Date().toISOString());
 app.db.prepare('INSERT INTO invoices VALUES(?,?,?,?,?,?,?,?,?,?)').run('invoice','UM-INV-TEST','done-booking','Customer','Cleaning',10000,'2026-10-01','2026-10-01','open',new Date().toISOString());
 assert.equal((await fetch(origin+'/api/app-metrics')).status,401);
 assert.equal((await fetch(origin+'/api/visitor-metrics')).status,401);
 for(const [i,role] of ['owner','superadmin','admin','support','viewer'].entries()){
 app.db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role,role+'@example.invalid',role,'unused',role);
 const token=String(i+1).repeat(64);app.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),role,'csrf',Date.now()+60000);
 const r=await fetch(origin+'/api/app-metrics',{headers:{Cookie:'unimate_admin='+token}});assert.equal(r.status,['owner','superadmin'].includes(role)?200:403);
 assert.equal((await fetch(origin+'/api/visitor-metrics',{headers:{Cookie:'unimate_admin='+token}})).status,['owner','superadmin'].includes(role)?200:403);
 const overview=await fetch(origin+'/api/overview',{headers:{Cookie:'unimate_admin='+token}});
 if(overview.ok){const o=await overview.json();assert.equal(o.adminApprovals,role==='owner'?1:undefined);if(['owner','superadmin'].includes(role)){assert.equal(o.business.newMembers,1);assert.equal(o.business.activeBookings,1);assert.equal(o.business.outstandingPence,10000);}else assert.equal(o.business,undefined);}
 if(r.ok){const d=await r.json();assert.equal(d.database,'reachable');assert.equal(d.history.length,15);}
 }
});
