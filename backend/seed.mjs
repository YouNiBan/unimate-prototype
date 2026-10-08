import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase, transaction, audit } from './database.mjs';
export function seed(db) {
  transaction(db,()=>{
    if(db.prepare("SELECT id FROM users WHERE id='sample-user'").get())return;
    const now=new Date().toISOString();
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('sample-user','Alex Sample','alex@example.invalid','student','active',now);
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('sample-reporter-2','Sam Sample','sam@example.invalid','student','active',now);
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('sample-reporter-3','Taylor Sample','taylor@example.invalid','student','active',now);
    db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?)').run('sample-approval','Sample campus society','society','Alex Sample','Fictional application for testing approval decisions.','pending',now);
    db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?)').run('sample-post','Welcome to campus','Alex Sample','Synthetic post used to test moderation.','published',now);
    db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?)').run('sample-report','sample-post','Review sample post','Sam Sample','Fictional report: please review this test post.','open',now);
    for(const userId of ['sample-user','sample-reporter-2','sample-reporter-3'])db.prepare('INSERT INTO report_votes VALUES(?,?,?,?)').run('sample-post',userId,'Fictional report for moderation testing',now);
    db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run('sample-booking','Sample welcome event','Alex Sample','Campus events','confirmed',1500,now);
    const saveDetails=db.prepare('INSERT INTO submission_details VALUES(?,?,?)');
    saveDetails.run('posts','sample-post',JSON.stringify({source:'Fictional sample — not a student submission',post_type:'Public moment',caption:'Welcome to campus! Looking for students interested in a weekend study group.',submitted_at:now,visibility:'Public',images:[],image_status:'No images supplied in this sample'}));
    saveDetails.run('bookings','sample-booking',JSON.stringify({source:'Fictional sample — not a student submission',event_name:'Sample welcome event',event_date:'2026-10-20',start_time:'18:00 Europe/London',end_time:'21:00 Europe/London',location:'Example campus common room (fictional)',summary:'A sample student welcome gathering.',capacity:30,ticket_price:'£15.00',images:[],image_status:'No images supplied in this sample'}));
    audit(db,null,'samples.loaded','system','samples',null,null,'Explicit local sample data import');
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.umask(0o077);const db=openDatabase(fileURLToPath(new URL('./data/unimate.sqlite',import.meta.url)));seed(db);db.close();console.log('Fictional sample records loaded. No admin account was created.');
}
