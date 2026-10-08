import {randomUUID} from 'node:crypto';
import {transaction,audit} from './database.mjs';

// Trusted integration boundary only. The future signup service must verify the
// identity/email before calling this; this is not an anonymous admin API route.
export function recordStaffApplication(db,{name,email,service,jobTitle}){
  if(typeof name!=='string'||name.trim().length<2||name.length>80||typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!['cleaning','moving','airport_transfer'].includes(service)||typeof jobTitle!=='string'||!jobTitle.trim()||jobTitle.length>120)throw Error('Invalid staff signup details.');
  email=email.trim().toLowerCase();name=name.trim();
  return transaction(db,()=>{
    if(db.prepare("SELECT a.approval_id FROM staff_applications a JOIN approvals p ON p.id=a.approval_id WHERE a.email=? AND p.status IN ('pending','approved')").get(email)||db.prepare('SELECT id FROM team_members WHERE email=?').get(email))throw Error('Staff account or application already exists.');
    const id=randomUUID(),now=new Date().toISOString();
    db.prepare("INSERT INTO approvals VALUES(?,?,?,?,?,'pending',?)").run(id,'Staff signup · '+name,'staff',name,JSON.stringify({name,email,service,jobTitle}),now);
    db.prepare('INSERT INTO staff_applications VALUES(?,?,?,?,?,NULL)').run(id,name,email,service,jobTitle.trim());
    audit(db,null,'staff.application_received','approvals',id,null,{service},'Verified staff signup received');return id;
  });
}
