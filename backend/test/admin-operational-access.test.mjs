import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../server.mjs';
import {digest} from '../security.mjs';

test('Admin can review the pictured queues and read user/product records while confidential areas remain restricted',async t=>{
 const app=await createApplication({filename:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();});
 const origin=`http://127.0.0.1:${app.server.address().port}`,now=new Date().toISOString(),tokens=Object.fromEntries(['owner','admin','support','viewer'].map((r,i)=>[r,String(i+1).repeat(64)]));
 for(const role of ['owner','admin','support','viewer']){app.db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role,role+'@example.invalid',role,'unused',role);app.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(tokens[role]),role,'csrf',Date.now()+60000);}
 app.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('member','Member','member@example.invalid','student','active',now);
 for(const kind of ['event','student','staff','seller','organisation'])app.db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?)').run(kind,kind,kind,'Applicant','Application details','pending',now);
 app.db.prepare('INSERT INTO account_reports VALUES(?,?,?,?,?,?,?)').run('report','member','Reported account','member','Review the account','open',now);
 app.db.prepare('INSERT INTO marketplace_products VALUES(?,?,?,?,?,?,?,?,?,?)').run('product','Notebook','Student notebook',500,4,'','draft',1,now,now);
 async function call(path,data,role='admin'){const r=await fetch(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,Cookie:'unimate_admin='+tokens[role],'X-CSRF-Token':'csrf','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json()};}
 for(const path of ['approvals?accounts=1','approvals?kind=staff','approvals?kind=seller','users','users/member','account_reports','account_reports/report','marketplace'])assert.equal((await call(path)).status,200,path);
 assert.equal((await call('users')).data.canManage,false);
 const counts=(await call('navigation-counts')).data.counts;assert.equal(counts.sellers,1);assert.equal(counts.teams,1);assert.equal(counts.account_reports,1);assert.equal(counts.bookings.all,0);
 const tasks=(await call('tasks')).data.rows;assert.ok(tasks.some(r=>r.category==='seller'));assert.ok(tasks.some(r=>r.category==='staff'));assert.ok(tasks.some(r=>r.resource==='account_reports'));
 assert.equal((await call('tasks/seen',{resource:'approvals',record_id:'seller'})).status,200);
 assert.equal((await call('approvals/seller',{status:'approved',expectedStatus:'pending',reason:'Seller application reviewed'})).status,200);
 assert.equal((await call('approvals/staff',{status:'rejected',expectedStatus:'pending',reason:'Staff application reviewed'})).status,200);
 assert.equal((await call('account_reports/report',{status:'resolved',expectedStatus:'open',reason:'Account report reviewed'})).status,200);
 for(const path of ['payments','payments/fees/quote?kind=student_marketplace&amountPence=1000','invoices','staff-invoices','documents','audit','admins','admin-access','teams','staff-hr?id=anything','app-metrics','visitor-metrics'])assert.equal((await call(path)).status,403,path);
 assert.equal((await call('users/member',{status:'suspended',expectedStatus:'active',reason:'Unapproved permission change'})).status,403);
 assert.equal((await call('marketplace',{title:'Changed price'})).status,403);
 for(const role of ['viewer','support'])for(const path of ['users','approvals?accounts=1','approvals/seller','account_reports','marketplace'])assert.equal((await call(path,null,role)).status,403,role+' '+path);
 assert.equal((await call('marketplace',null,'owner')).status,200);
 assert.equal(app.db.prepare('SELECT status FROM approvals WHERE id=?').get('seller').status,'approved');
 assert.equal(app.db.prepare('SELECT price_pence FROM marketplace_products').get().price_pence,500);
});
