import test from 'node:test';import assert from 'node:assert/strict';
import {openDatabase} from '../database.mjs';
import {installMemberUsernames,validMemberUsername,claimMemberUsername,changeMemberUsername,usernameAvailability} from '../member-usernames.mjs';
import {unsafeUsername} from '../public/member-username-policy.mjs';
test('username policy rejects profanity, hate and common separated or leetspeak disguises',()=>{
 for(const word of ['fuck','f.u.c.k','f_u_c_k','fucker','f4gg0t','n1gg3r','nazi','white.power','white_power88','shit123','you.bitch','killalljews']){assert.equal(unsafeUsername(word),true,word);assert.equal(validMemberUsername(word),false,word);}
 for(const name of ['yan','jenney.he','ting_jin','scunthorpe','cassidy','shi_ting','nigel','dickinson','class_of_2026','sophia123'])assert.equal(validMemberUsername(name),true,name);
});
test('server claiming and changing enforce policy; suggestions never repeat harmful base or change existing identity',t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());installMemberUsernames(db);db.prepare("INSERT INTO users VALUES('member','Member','member@example.invalid','student','active','2020-01-01')").run();claimMemberUsername(db,'member','safe.name',Date.parse('2020-01-01'));
 assert.throws(()=>claimMemberUsername(db,'member','f.u.c.k'),{status:400});assert.throws(()=>changeMemberUsername(db,{id:'member',name:'Member'},{username:'white.power',expectedUsername:'safe.name'}),{status:400});
 const result=usernameAvailability(db,'f.u.c.k');assert.equal(result.available,false);assert.match(result.message,/respectful/);assert.equal(result.suggestions.length,3);for(const s of result.suggestions){assert.equal(validMemberUsername(s),true);assert.match(s,/^student_/);}
 assert.equal(db.prepare("SELECT username FROM member_usernames WHERE user_id='member'").get().username,'safe.name');
});
