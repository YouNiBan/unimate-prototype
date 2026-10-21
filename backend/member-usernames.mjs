import {randomInt} from 'node:crypto';
const reserved=new Set(['admin','administrator','superadmin','owner','unimate','support','help','official','deleted','system','security','moderator']);
export const normalizeMemberUsername=value=>typeof value==='string'?value.trim().replace(/^@/,'').toLowerCase():'';
export const validMemberUsername=value=>/^[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$/.test(value)&&!value.includes('..')&&!reserved.has(value);
export function installMemberUsernames(db){db.exec(`CREATE TABLE IF NOT EXISTS member_usernames(user_id TEXT PRIMARY KEY REFERENCES users(id),username TEXT NOT NULL UNIQUE COLLATE NOCASE);`);}
export function usernameAvailability(db,value){
 const username=normalizeMemberUsername(value),valid=validMemberUsername(username);
 const available=name=>validMemberUsername(name)&&!db.prepare('SELECT 1 FROM member_usernames WHERE username=? COLLATE NOCASE').get(name);
 const base=(username.replace(/[^a-z0-9._]/g,'').replace(/\.+/g,'.').replace(/^\.+|\.+$/g,'')||'student').slice(0,23);
 const suggestions=[];for(let attempt=0;attempt<40&&suggestions.length<3;attempt++){const candidate=base+'_'+randomInt(10,10000);if(available(candidate)&&!suggestions.includes(candidate))suggestions.push(candidate);}
 return {username,valid,available:valid&&available(username),suggestions,message:!valid?'Use 3–30 letters, numbers, dots or underscores. Dots cannot repeat or appear at either end.':available(username)?'Username available':'Username unavailable'};
}
export function claimMemberUsername(db,id,value){const username=normalizeMemberUsername(value);if(!validMemberUsername(username))throw Object.assign(new Error('Use a username of 3–30 letters, numbers, dots or underscores. Dots cannot repeat or appear at either end.'),{status:400});const taken=db.prepare('SELECT user_id FROM member_usernames WHERE username=? COLLATE NOCASE').get(username);if(taken&&taken.user_id!==id)throw Object.assign(new Error('Username unavailable. Please choose another username.'),{status:409});db.prepare('INSERT INTO member_usernames VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username').run(id,username);return username;}
