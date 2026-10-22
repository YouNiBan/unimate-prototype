import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../server.mjs';
import {taskList} from '../tasks.mjs';
import {recordReference} from '../references.mjs';
import {memberDetails} from '../member-management.mjs';

test('new account applications and all three service bookings notify immediately; seen state is individual and retained',async t=>{
 const {db}=await createApplication({filename:':memory:'});t.after(()=>db.close());const now=new Date().toISOString();
 for(const role of ['owner','superadmin','support'])db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role,role+'@example.invalid',role,'unused',role);
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('applicant','New applicant','applicant@example.invalid','student','active',now);
 db.prepare('INSERT INTO member_account_requests(user_id,account_type) VALUES(?,?)').run('applicant','student');
 for(const service of ['cleaning','moving','airport_transfer'])db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run(service,service+' request','New applicant',service,'requested',0,now);
 const owner={id:'owner',role:'owner'},first=taskList(db,owner);assert.equal(first.unseen,4);assert.equal(first.rows.find(r=>r.resource==='users').category,'student_signup');
 for(const row of first.rows)db.prepare('INSERT INTO task_seen VALUES(?,?,?)').run('owner',row.resource,row.record_id);
 assert.equal(taskList(db,owner,1,'new').rows.length,0);assert.equal(taskList(db,owner,1,'seen').rows.length,4);assert.equal(taskList(db,{id:'superadmin',role:'superadmin'}).unseen,4);
 db.prepare("UPDATE bookings SET status='completed'").run();assert.equal(taskList(db,owner,1,'seen').rows.length,4);
 assert.equal(taskList(db,{id:'support',role:'support'}).rows.some(r=>r.resource==='users'),false);
 const row=db.prepare('SELECT * FROM users WHERE id=?').get('applicant'),details=memberDetails(db,row);assert.match(details.accountId,/^UMU-\d{6}$/);assert.equal(memberDetails(db,row).accountId,details.accountId);assert.match(recordReference(db,'member',row.id,now),/^UM-MEM-/);
});

test('notifications combine reviews and inbound conversations with per-person read state and role restrictions',async t=>{
  const {db}=await createApplication({filename:':memory:'});t.after(()=>db.close());
  const now='2026-10-20T12:00:00Z';
  for(const role of ['owner','support','admin'])db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(role,role+'@example.invalid',role,'unused',role);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('student','Student','student@example.invalid','student','active',now);
  db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?)').run('event','Event review','event','Student','Details','pending',now);
  db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?)').run('seller','Seller review','seller','Student','Details','pending',now);
  db.prepare('INSERT INTO support_conversations VALUES(?,?,?,?,?,?,?,?)').run('chat','student','Booking question','general','open',null,now,now);
  const insert=db.prepare('INSERT INTO support_messages(id,conversation_id,sender_kind,sender_id,sender_name,body,client_id,operation,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
  insert.run('message','chat','member','student','Student','Hello','first','create',now);
  let owner=taskList(db,{id:'owner',role:'owner'});assert.equal(owner.unseen,3);assert.equal(owner.rows.find(r=>r.resource==='support').unread_count,1);
  assert.deepEqual(taskList(db,{id:'admin',role:'admin'}).rows.map(r=>r.resource),['approvals','approvals']);
  assert.deepEqual(taskList(db,{id:'support',role:'support'}).rows.map(r=>r.resource),['support']);
  db.prepare('INSERT INTO support_read_state VALUES(?,?,?,?)').run('chat','support','owner',1);
  assert.equal(taskList(db,{id:'owner',role:'owner'}).rows.find(r=>r.resource==='support').is_new,0);
  assert.equal(taskList(db,{id:'support',role:'support'}).unseen,1);
  insert.run('reply','chat','support','owner','Owner','Reply','second','reply',now);
  assert.equal(taskList(db,{id:'owner',role:'owner'}).rows.find(r=>r.resource==='support').is_new,0);
  insert.run('new','chat','member','student','Student','Follow up','third','reply',now);
  assert.equal(taskList(db,{id:'owner',role:'owner'}).rows.find(r=>r.resource==='support').is_new,1);
});
