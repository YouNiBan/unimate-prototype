import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../server.mjs';
import {taskList} from '../tasks.mjs';

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
