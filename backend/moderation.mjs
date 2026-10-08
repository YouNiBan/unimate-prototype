import {randomUUID} from 'node:crypto';
import {transaction,audit} from './database.mjs';

export const REPORT_THRESHOLD=3;
// Trusted service only: reporterId must come from the verified app session.
export function recordAccountReport(db,{reporterId,userId,reason}){
  if(typeof reason!=='string'||reason.trim().length<5||reason.length>500)throw Error('Report reason must be 5–500 characters.');
  return transaction(db,()=>{const reporter=db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(reporterId),target=db.prepare('SELECT id,name FROM users WHERE id=?').get(userId);if(!reporter||!target||reporterId===userId)throw Error('Valid reporter and target accounts required.');
    const existing=db.prepare("SELECT id FROM account_reports WHERE user_id=? AND reporter=? AND status='open'").get(userId,reporterId);if(existing)return {id:existing.id,duplicate:true};
    const id=randomUUID();db.prepare("INSERT INTO account_reports VALUES(?,?,?,?,?,'open',?)").run(id,userId,'Account report · '+target.name,reporterId,reason.trim(),new Date().toISOString());audit(db,null,'review.queued','account_reports',id,null,{user_id:userId},'Account report received');return {id,duplicate:false};});
}
export const reportCountSql='(SELECT count(*) FROM report_votes WHERE report_votes.post_id=reports.post_id)';
export const reviewEligibleSql=`${reportCountSql}>=${REPORT_THRESHOLD}`;

// Trusted service boundary, NOT a public endpoint. userId must come from the
// future app's verified login session, never a client-supplied identity field.
export function recordContentReport(db,{userId,postId,reason}){
  if(typeof reason!=='string'||reason.trim().length<5||reason.length>500)throw Error('Report reason must be 5–500 characters.');
  return transaction(db,()=>{
    const user=db.prepare('SELECT id,status FROM users WHERE id=?').get(userId);
    if(!user||user.status!=='active')throw Error('An active authenticated user is required.');
    const post=db.prepare('SELECT id,title FROM posts WHERE id=?').get(postId);
    if(!post)throw Error('Content not found.');
    const now=new Date().toISOString();
    const result=db.prepare('INSERT OR IGNORE INTO report_votes VALUES(?,?,?,?)').run(postId,userId,reason.trim(),now);
    const count=db.prepare('SELECT count(*) AS n FROM report_votes WHERE post_id=?').get(postId).n;
    let review=db.prepare('SELECT id,status FROM reports WHERE post_id=? ORDER BY created_at DESC,id LIMIT 1').get(postId);
    if(count>=REPORT_THRESHOLD&&!review){
      const id=randomUUID();
      db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?)').run(id,postId,post.title,'Community reports','Review triggered by 3 distinct user reports.','open',now);
      audit(db,null,'review.queued','reports',id,null,{post_id:postId,unique_reports:count},'Distinct-user reporting threshold reached');
      review={id,status:'open'};
    }
    // Reporting never hides content. Closed reviews do not reopen automatically.
    return {count,duplicate:result.changes===0,queued:count>=REPORT_THRESHOLD&&review?.status==='open'};
  });
}
