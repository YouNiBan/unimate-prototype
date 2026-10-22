const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function socialProfile(db,id){
 if(typeof id!=='string'||!id||id.length>150)fail(404,'Profile not found.');
 const u=db.prepare("SELECT u.id,u.name FROM users u JOIN member_credentials c ON c.user_id=u.id LEFT JOIN member_controls mc ON mc.user_id=u.id WHERE u.id=? AND u.status='active' AND c.verified_at IS NOT NULL AND mc.deleted_at IS NULL").get(id);if(!u)fail(404,'Profile not found.');
 const p=db.prepare('SELECT bio,interests,avatar,banner,revision FROM member_profile_content WHERE user_id=?').get(id),university=db.prepare('SELECT university FROM student_verifications WHERE user_id=?').get(id)?.university||'',username=db.prepare('SELECT username FROM member_usernames WHERE user_id=?').get(id)?.username||'';
 return {id:u.id,name:u.name,username,university,bio:p?.bio||'',interests:JSON.parse(p?.interests||'[]'),verified:!!(university||db.prepare('SELECT verified_at FROM member_controls WHERE user_id=?').get(id)?.verified_at),avatarUrl:p?.avatar?`/api/member/people/${encodeURIComponent(id)}/avatar?v=${p.revision}`:null,bannerUrl:p?.banner?`/api/member/people/${encodeURIComponent(id)}/banner?v=${p.revision}`:null};
}
export function profilePhoto(db,id,kind='avatar'){
 socialProfile(db,id);if(!['avatar','banner'].includes(kind))fail(404,'Photo not found.');const value=db.prepare(`SELECT ${kind} image FROM member_profile_content WHERE user_id=?`).get(id)?.image||'',match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)fail(404,'Photo not found.');return {mime:match[1],bytes:Buffer.from(match[2],'base64')};
}
