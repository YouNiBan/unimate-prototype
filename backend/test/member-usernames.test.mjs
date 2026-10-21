import test from 'node:test';import assert from 'node:assert/strict';
import {openDatabase} from '../database.mjs';import {installMemberUsernames,claimMemberUsername,changeMemberUsername,memberUsernameStatus,nextUsernameChange} from '../member-usernames.mjs';
import {createApplication} from '../server.mjs';import {createRestaurantCommunity} from '../restaurant-community.mjs';
test('three-month cooldown clamps month ends, preserves UTC time and opens at the precise boundary',t=>{
 assert.equal(nextUsernameChange('2025-01-31T12:34:56.000Z'),'2025-04-30T12:34:56.000Z');assert.equal(nextUsernameChange('2023-11-30T08:00:00.000Z'),'2024-02-29T08:00:00.000Z');
 const db=openDatabase(':memory:');t.after(()=>db.close());installMemberUsernames(db);db.prepare("INSERT INTO users VALUES('one','One','one@example.invalid','student','active','2025-01-01')").run();const now=Date.parse('2025-01-31T12:34:56Z');claimMemberUsername(db,'one','old.name',now);const next=Date.parse(nextUsernameChange(now));assert.equal(memberUsernameStatus(db,'one',next-1).canChange,false);assert.equal(memberUsernameStatus(db,'one',next).canChange,true);
 changeMemberUsername(db,{id:'one',name:'One'},{username:'new.name',expectedUsername:'old.name'},next);assert.equal(memberUsernameStatus(db,'one',next).canChange,false);
});
test('Friends search accepts @handles, escapes underscores and exposes only public identity for active confirmed members',async t=>{
 const app=await createApplication({filename:':memory:'});t.after(()=>app.db.close());const db=app.db,at=new Date().toISOString();for(const id of ['one','two','three','hidden','pending']){db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,'Same Name',id+'@example.invalid','student',id==='hidden'?'suspended':'active',at);db.prepare('INSERT INTO member_credentials VALUES(?,?,?,?)').run(id,'unused',id==='pending'?null:at,at);claimMemberUsername(db,id,{one:'my.name',two:'jenna_food',three:'jennaXfood',hidden:'jenna_hidden',pending:'jenna_pending'}[id]);}
 const c=createRestaurantCommunity(db);const result=c.connections({id:'one'},' @JENNA_FOOD ');assert.deepEqual(result.matches.map(m=>m.id),['two']);assert.deepEqual(Object.keys(result.matches[0]).sort(),['id','name','username']);assert.equal(c.connections({id:'one'},'jenna_').matches.length,1);
 c.connect({id:'one'},{userId:'two',action:'request'});assert.equal(c.connections({id:'one'}).rows[0].username,'jenna_food');
});
