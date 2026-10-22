import {transaction,audit} from './database.mjs';
import {recordReference} from './references.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installMemberManagement(db){db.exec(`CREATE TABLE IF NOT EXISTS member_controls(user_id TEXT PRIMARY KEY REFERENCES users(id),version INTEGER NOT NULL DEFAULT 0,verified_at TEXT,verified_by TEXT REFERENCES admins(id),suspended_until TEXT,deleted_at TEXT);`);}
export function restoreExpiredMembers(db,now=Date.now()){
 const rows=db.prepare("SELECT c.user_id FROM member_controls c JOIN users u ON u.id=c.user_id WHERE c.deleted_at IS NULL AND c.suspended_until<=? AND u.status='suspended'").all(new Date(now).toISOString());
 if(!rows.length)return;
 transaction(db,()=>{for(const row of rows){db.prepare("UPDATE users SET status='active' WHERE id=?").run(row.user_id);db.prepare('UPDATE member_controls SET suspended_until=NULL,version=version+1 WHERE user_id=?').run(row.user_id);audit(db,null,'member.suspension_expired','users',row.user_id,null,{status:'active'},'Temporary suspension ended automatically');}});
}
export function memberDetails(db,row){const c=db.prepare('SELECT * FROM member_controls WHERE user_id=?').get(row.id)||{},v=db.prepare('SELECT verified_at FROM student_verifications WHERE user_id=?').get(row.id),credential=db.prepare('SELECT verified_at FROM member_credentials WHERE user_id=?').get(row.id);return {...row,reference:recordReference(db,'member',row.id,row.created_at),accountId:recordReference(db,'account',row.id,row.created_at),username:db.prepare('SELECT username FROM member_usernames WHERE user_id=?').get(row.id)?.username||null,version:c.version||0,studentVerified:!!(v||c.verified_at),verificationSource:v?'University email':c.verified_at?'Admin approval':null,verifiedAt:v?.verified_at||c.verified_at||null,verifiedBy:c.verified_by?db.prepare('SELECT name FROM admins WHERE id=?').get(c.verified_by)?.name||'Administrator':null,loginEmailConfirmed:!!credential?.verified_at,suspendedUntil:c.suspended_until||null};}
export function manageMember(db,actor,id,data){return transaction(db,()=>{
 const live=db.prepare('SELECT role,active FROM admins WHERE id=?').get(actor.id);if(!live?.active||!['owner','superadmin'].includes(live.role))fail(403,'Owner or SuperAdmin access required.');
 const row=db.prepare('SELECT * FROM users WHERE id=?').get(id),c=db.prepare('SELECT * FROM member_controls WHERE user_id=?').get(id)||{};
 if(!row||c.deleted_at)fail(404,'Member not found.');
 if(data.version!==(c.version||0)||data.expectedStatus!==row.status)fail(409,'This account changed. Refresh before deciding.');
 const reason=typeof data.reason==='string'?data.reason.trim():'';if(reason.length<5||reason.length>500)fail(400,'Enter a reason of 5–500 characters.');
 if(!['verify','suspend','restore','delete'].includes(data.action))fail(400,'Choose a valid account action.');
 db.prepare('INSERT OR IGNORE INTO member_controls(user_id) VALUES(?)').run(id);
 const before={status:row.status,studentVerified:memberDetails(db,row).studentVerified},at=new Date().toISOString();
 if(data.action==='verify'){
 if(!db.prepare('SELECT verified_at FROM member_credentials WHERE user_id=?').get(id)?.verified_at)fail(409,'The member must confirm their personal login email first.');
 if(before.studentVerified)fail(409,'This member is already verified.');
 db.prepare('UPDATE member_controls SET verified_at=?,verified_by=? WHERE user_id=?').run(at,actor.id,id);
 }else if(data.action==='suspend'){
 const until=Date.parse(data.suspendedUntil);if(!Number.isFinite(until)||until<=Date.now()+60000||until>Date.now()+366*86400000)fail(400,'Choose a suspension end time between one minute and one year from now.');
 db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(id);db.prepare('UPDATE member_controls SET suspended_until=? WHERE user_id=?').run(new Date(until).toISOString(),id);
 db.prepare('DELETE FROM member_sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM member_email_tokens WHERE user_id=?').run(id);db.prepare('DELETE FROM student_verification_codes WHERE user_id=?').run(id);
 }else if(data.action==='restore'){
 if(row.status!=='suspended')fail(409,'This member is already active.');
 db.prepare("UPDATE users SET status='active' WHERE id=?").run(id);db.prepare('UPDATE member_controls SET suspended_until=NULL WHERE user_id=?').run(id);
 }else{
 const reference=recordReference(db,'member',id,row.created_at);if(data.confirmation!==reference)fail(400,'Type the member ID to confirm permanent account deletion.');
 // Keep a minimal tombstone for booking, payment and audit references. The account cannot be restored.
 for(const table of ['member_sessions','member_email_tokens','student_verification_codes','student_verifications','student_profiles','member_profile_content','user_profiles','member_credentials'])db.prepare('DELETE FROM '+table+' WHERE user_id=?').run(id);
 db.prepare('DELETE FROM restaurant_review_votes WHERE user_id=? OR review_id IN (SELECT id FROM restaurant_student_reviews WHERE user_id=?)').run(id,id);
 db.prepare('DELETE FROM restaurant_student_reviews WHERE user_id=?').run(id);db.prepare('DELETE FROM student_connections WHERE sender_id=? OR recipient_id=?').run(id,id);
 db.prepare('DELETE FROM report_votes WHERE user_id=?').run(id);
 const request=db.prepare('SELECT approval_id FROM member_account_requests WHERE user_id=?').get(id);if(request?.approval_id){db.prepare("UPDATE approvals SET applicant='Deleted member',details='Account permanently deleted',status=CASE WHEN status='pending' THEN 'rejected' ELSE status END WHERE id=?").run(request.approval_id);db.prepare("UPDATE staff_applications SET name='Deleted member',email=? WHERE approval_id=?").run('deleted+'+id+'@example.invalid',request.approval_id);}
 db.prepare('DELETE FROM member_account_requests WHERE user_id=?').run(id);
 db.prepare("UPDATE support_messages SET sender_name='Deleted member' WHERE sender_kind='member' AND sender_id=?").run(id);
 db.prepare("UPDATE team_members SET status='deactivated' WHERE id IN (SELECT member_id FROM staff_user_links WHERE user_id=?)").run(id);
 db.prepare('DELETE FROM staff_user_links WHERE user_id=?').run(id);
 db.prepare("UPDATE users SET name='Deleted member',email=?,kind='deleted',status='suspended' WHERE id=?").run('deleted+'+id+'@example.invalid',id);
 db.prepare('UPDATE member_controls SET deleted_at=?,verified_at=NULL,verified_by=NULL,suspended_until=NULL WHERE user_id=?').run(at,id);
 }
 db.prepare('UPDATE member_controls SET version=version+1 WHERE user_id=?').run(id);
 const after=data.action==='delete'?{deleted:true}:memberDetails(db,db.prepare('SELECT * FROM users WHERE id=?').get(id));
 audit(db,actor,'member.'+({verify:'verified_by_admin',suspend:'suspended',restore:'restored',delete:'account_deleted'})[data.action],'users',id,before,data.action==='delete'?after:{status:after.status,studentVerified:after.studentVerified,suspendedUntil:after.suspendedUntil},reason);
 return {ok:true};
 });}
