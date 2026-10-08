import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../database.mjs';
import {recordContentReport,recordAccountReport,reviewEligibleSql} from '../moderation.mjs';

test('account reports deduplicate open complaints and never suspend accounts',()=>{
  const db=openDatabase(':memory:');try{for(const id of ['a','b'])db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,id,id+'@example.invalid','student','active',new Date().toISOString());
  const first=recordAccountReport(db,{reporterId:'a',userId:'b',reason:'Sample account complaint'});assert.equal(first.duplicate,false);
  assert.equal(recordAccountReport(db,{reporterId:'a',userId:'b',reason:'Repeated complaint'}).duplicate,true);
  assert.equal(db.prepare('SELECT status FROM users WHERE id=?').get('b').status,'active');
  assert.throws(()=>recordAccountReport(db,{reporterId:'b',userId:'b',reason:'Self report invalid'}));
  }finally{db.close();}
});

test('three distinct reporters trigger review for moments, forums and comments without hiding content',()=>{
  const db=openDatabase(':memory:');
  try{
    const now=new Date().toISOString();
    for(let i=1;i<=4;i++)db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('user'+i,'Test '+i,'test'+i+'@example.invalid','student','active',now);
    for(const kind of ['moment','forum','comment']){
      db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?)').run(kind,'Test '+kind,'Test Author','Test body','published',now);
      db.prepare('INSERT INTO moderation_targets VALUES(?,?)').run(kind,kind);
      const report=userId=>recordContentReport(db,{userId,postId:kind,reason:'Test report reason'});
      assert.deepEqual(report('user1'),{count:1,duplicate:false,queued:false});
      assert.deepEqual(report('user1'),{count:1,duplicate:true,queued:false});
      assert.equal(report('user2').queued,false);
      assert.equal(db.prepare('SELECT count(*) AS n FROM reports WHERE post_id=?').get(kind).n,0);
      assert.equal(report('user3').queued,true);
      assert.equal(report('user4').count,4);
      assert.equal(db.prepare(`SELECT count(*) AS n FROM reports WHERE post_id=? AND ${reviewEligibleSql}`).get(kind).n,1);
      assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(kind).status,'published');
      db.prepare("UPDATE reports SET status='dismissed' WHERE post_id=?").run(kind);
      assert.equal(report('user1').queued,false);
      assert.equal(db.prepare('SELECT count(*) AS n FROM reports WHERE post_id=?').get(kind).n,1);
    }
    assert.throws(()=>recordContentReport(db,{userId:'missing',postId:'moment',reason:'Test reason'}),/authenticated/);
    db.prepare("UPDATE users SET status='suspended' WHERE id='user1'").run();
    assert.throws(()=>recordContentReport(db,{userId:'user1',postId:'moment',reason:'Test reason'}),/authenticated/);
    assert.throws(()=>recordContentReport(db,{userId:'user2',postId:'missing',reason:'Test reason'}),/not found/);
    assert.throws(()=>recordContentReport(db,{userId:'user2',postId:'moment',reason:'x'}),/reason/);
  }finally{db.close();}
});
