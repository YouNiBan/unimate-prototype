import {randomInt} from 'node:crypto';
import {audit,transaction} from './database.mjs';
const reserved=new Set(['admin','administrator','superadmin','owner','unimate','support','help','official','deleted','system','security','moderator']);
export const normalizeMemberUsername=value=>typeof value==='string'?value.trim().replace(/^@/,'').toLowerCase():'';
export const validMemberUsername=value=>/^[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$/.test(value)&&!value.includes('..')&&!reserved.has(value);
export function installMemberUsernames(db){db.exec(`CREATE TABLE IF NOT EXISTS member_usernames(user_id TEXT PRIMARY KEY REFERENCES users(id),username TEXT NOT NULL UNIQUE COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS member_username_times(user_id TEXT PRIMARY KEY REFERENCES users(id),changed_at TEXT NOT NULL);`);
if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='member_credentials'").get())db.exec(`INSERT OR IGNORE INTO member_username_times SELECT n.user_id,c.created_at FROM member_usernames n JOIN member_credentials c ON c.user_id=n.user_id;`);}
export function usernameAvailability(db,value){
 const username=normalizeMemberUsername(value),valid=validMemberUsername(username);
 const available=name=>validMemberUsername(name)&&!db.prepare('SELECT 1 FROM member_usernames WHERE username=? COLLATE NOCASE').get(name);
 const base=(username.replace(/[^a-z0-9._]/g,'').replace(/\.+/g,'.').replace(/^\.+|\.+$/g,'')||'student').slice(0,23);
 const suggestions=[];for(let attempt=0;attempt<40&&suggestions.length<3;attempt++){const candidate=base+'_'+randomInt(10,10000);if(available(candidate)&&!suggestions.includes(candidate))suggestions.push(candidate);}
 return {username,valid,available:valid&&available(username),suggestions,message:!valid?'Use 3–30 letters, numbers, dots or underscores. Dots cannot repeat or appear at either end.':available(username)?'Username available':'Username unavailable'};
}
export function claimMemberUsername(db,id,value,now=Date.now()){const username=normalizeMemberUsername(value);if(!validMemberUsername(username))throw Object.assign(new Error('Use a username of 3–30 letters, numbers, dots or underscores. Dots cannot repeat or appear at either end.'),{status:400});const taken=db.prepare('SELECT user_id FROM member_usernames WHERE username=? COLLATE NOCASE').get(username);if(taken&&taken.user_id!==id)throw Object.assign(new Error('Username unavailable. Please choose another username.'),{status:409});db.prepare('INSERT INTO member_usernames VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username').run(id,username);db.prepare('INSERT INTO member_username_times VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET changed_at=excluded.changed_at').run(id,new Date(now).toISOString());return username;}

export function nextUsernameChange(changedAt){
 const date=new Date(changedAt);if(!Number.isFinite(date.getTime()))return null;
 const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+3);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date.toISOString();
}
export function memberUsernameStatus(db,id,now=Date.now()){
 const row=db.prepare('SELECT n.username,t.changed_at FROM member_usernames n LEFT JOIN member_username_times t ON t.user_id=n.user_id WHERE n.user_id=?').get(id);
 const nextChangeAt=row?.changed_at?nextUsernameChange(row.changed_at):null;
 return {username:row?.username||null,changedAt:row?.changed_at||null,nextChangeAt,canChange:!nextChangeAt||now>=Date.parse(nextChangeAt)};
}
export function changeMemberUsername(db,user,data,now=Date.now()){
 return transaction(db,()=>{
  const before=memberUsernameStatus(db,user.id,now),username=normalizeMemberUsername(data.username);
  if(data.expectedUsername!==(before.username||''))throw Object.assign(new Error('Your username changed in another session. Reload and try again.'),{status:409});
  if(!validMemberUsername(username))throw Object.assign(new Error('Use a username of 3–30 letters, numbers, dots or underscores. Dots cannot repeat or appear at either end.'),{status:400});
  if(username===before.username)return before;
  if(!before.canChange)throw Object.assign(new Error('You can change your username once every three months. Check your next available date.'),{status:409});
  claimMemberUsername(db,user.id,username,now);
  audit(db,{id:user.id,name:user.name},'member.username_changed','users',user.id,{username:before.username},{username},'Member confirmed their password and changed their username');
  return memberUsernameStatus(db,user.id,now);
 });
}
