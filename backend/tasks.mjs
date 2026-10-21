import {reviewEligibleSql} from './moderation.mjs';
export function taskQuery(fullAccess,scopes=null,actor=null){return `SELECT 'approvals' AS resource,id AS record_id,title,kind AS category,created_at FROM approvals WHERE status='pending' AND (${scopes?.approvalSql(actor)||'1'}) ${fullAccess?'':"AND kind='event'"}
  UNION ALL SELECT 'reports' AS resource,id AS record_id,title,'reported_content' AS category,created_at FROM reports WHERE status='open' AND ${reviewEligibleSql} AND (${!scopes?.enabled||scopes.has(actor,'community')?'1':'0'})
  ${fullAccess?"UNION ALL SELECT 'account_reports',id,title,'reported_account',created_at FROM account_reports WHERE status='open' AND ("+(!scopes?.enabled||scopes.has(actor,'community')?'1':'0')+")":''}`;}
export function taskList(db,actor,page=1,filter='all',scopes=null){
  const parameters=[], parts=[];
  if(actor.role!=='support'){
    parts.push(`SELECT t.*,s.record_id IS NULL AS is_new,0 AS unread_count FROM (${taskQuery(['owner','superadmin','admin'].includes(actor.role),scopes,actor)}) t LEFT JOIN task_seen s ON s.admin_id=? AND s.resource=t.resource AND s.record_id=t.record_id`);
    parameters.push(actor.id);
  }
  if(['owner','superadmin','support'].includes(actor.role)||(actor.role==='admin'&&scopes?.enabled)){
    parts.push(`SELECT 'support' resource,c.id record_id,c.subject title,'message' category,max(m.created_at) created_at,
      max(m.sequence)>COALESCE(r.last_sequence,0) is_new,
      sum(CASE WHEN m.sequence>COALESCE(r.last_sequence,0) THEN 1 ELSE 0 END) unread_count
      FROM support_conversations c JOIN support_messages m ON m.conversation_id=c.id AND m.sender_kind='member'
      LEFT JOIN support_read_state r ON r.conversation_id=c.id AND r.reader_kind='support' AND r.reader_id=?
      WHERE ${scopes?.inboxSql(actor)||'1'} GROUP BY c.id`);
    parameters.push(actor.id);
  }
  const query=parts.join(' UNION ALL ');
  const counts=db.prepare(`SELECT count(*) total,COALESCE(sum(is_new),0) unseen FROM (${query})`).get(...parameters);
  if(!['all','new','seen'].includes(filter))throw Object.assign(new Error('Invalid notification filter.'),{status:400});
  const where=filter==='all'?'':filter==='new'?' WHERE is_new=1':' WHERE is_new=0';
  const rows=db.prepare(`SELECT * FROM (${query})${where} ORDER BY created_at DESC,resource,record_id LIMIT 25 OFFSET ?`).all(...parameters,(page-1)*25);
  return {...counts,filteredTotal:filter==='all'?counts.total:filter==='new'?counts.unseen:counts.total-counts.unseen,rows,page};
}
