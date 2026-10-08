import {reviewEligibleSql} from './moderation.mjs';
export function taskQuery(fullAccess){return `SELECT 'approvals' AS resource,id AS record_id,title,kind AS category,created_at FROM approvals WHERE status='pending' ${fullAccess?'':"AND kind='event'"}
  UNION ALL SELECT 'reports' AS resource,id AS record_id,title,'reported_content' AS category,created_at FROM reports WHERE status='open' AND ${reviewEligibleSql}
  ${fullAccess?"UNION ALL SELECT 'account_reports',id,title,'reported_account',created_at FROM account_reports WHERE status='open'":''}`;}
export function taskList(db,actor,page=1){
  const query=taskQuery(['owner','superadmin'].includes(actor.role));
  const counts=db.prepare(`SELECT count(*) AS total,COALESCE(sum(CASE WHEN s.record_id IS NULL THEN 1 ELSE 0 END),0) AS unseen FROM (${query}) t LEFT JOIN task_seen s ON s.admin_id=? AND s.resource=t.resource AND s.record_id=t.record_id`).get(actor.id);
  const rows=db.prepare(`SELECT t.*,s.record_id IS NULL AS is_new FROM (${query}) t LEFT JOIN task_seen s ON s.admin_id=? AND s.resource=t.resource AND s.record_id=t.record_id ORDER BY t.created_at DESC,t.resource,t.record_id LIMIT 25 OFFSET ?`).all(actor.id,(page-1)*25);
  return {...counts,rows,page};
}
