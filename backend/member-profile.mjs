import {decodePhoto} from './shared-bookings.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installMemberProfile(db){db.exec(`CREATE TABLE IF NOT EXISTS member_profile_content(user_id TEXT PRIMARY KEY REFERENCES users(id),bio TEXT NOT NULL DEFAULT '',interests TEXT NOT NULL DEFAULT '[]',avatar TEXT NOT NULL DEFAULT '',banner TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0)`);}
export function readMemberProfile(db,id){const row=db.prepare('SELECT bio,interests,avatar,banner,revision FROM member_profile_content WHERE user_id=?').get(id);return {bio:row?.bio||'',interests:JSON.parse(row?.interests||'[]'),avatar:row?.avatar||'',banner:row?.banner||'',revision:row?.revision||0,profileEditorEnabled:true};}
export function validateMemberProfile(data){
 const out={};
 if(data.bio!==undefined){if(typeof data.bio!=='string'||data.bio.length>500)fail(400,'Your bio must be 500 characters or fewer.');out.bio=data.bio.trim();}
 if(data.interests!==undefined){if(!Array.isArray(data.interests)||data.interests.length>12||data.interests.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>30||/[\x00-\x1f\x7f]/.test(v)))fail(400,'Choose up to 12 interests, each 1–30 characters.');out.interests=[...new Set(data.interests.map(v=>v.trim()))];}
 for(const key of ['avatar','banner'])if(data[key]!==undefined){const value=data[key];if(value===''){out[key]='';continue;}if(typeof value!=='string'||value.length>700000)fail(413,'Please choose a smaller profile image.');const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)fail(400,'Use a JPEG, PNG or WebP image.');const photo=decodePhoto({mime:match[1],base64:match[2],filename:key});if(photo.bytes.length>512000)fail(413,'Please choose a smaller profile image.');out[key]=value;}
 if(Object.keys(out).length&&(!Number.isSafeInteger(data.revision)||data.revision<0))fail(400,'Refresh your profile before saving.');
 return out;
}
// Called inside the same transaction as name and private details, never as a separate partial save.
export function saveMemberProfile(db,id,data,changes){if(!Object.keys(changes).length)return;const before=readMemberProfile(db,id);if(before.revision!==data.revision)fail(409,'Your profile changed elsewhere. Reload before saving.');const next={...before,...changes};db.prepare(`INSERT INTO member_profile_content(user_id,bio,interests,avatar,banner,revision) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,interests=excluded.interests,avatar=excluded.avatar,banner=excluded.banner,revision=excluded.revision`).run(id,next.bio,JSON.stringify(next.interests),next.avatar,next.banner,before.revision+1);}
