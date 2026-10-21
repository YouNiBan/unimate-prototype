import {transaction} from './database.mjs';
export const demoAccounts = [
 ['owner','Demo Owner','owner','UniMateDemo'],['superadmin','Developer Demo','superadmin','DeveloperDemo'],['admin','Demo Administrator','admin','AdminDemo'],['support','Demo Support','support','SupportDemo'],
 ['student','Alex Demo','student'],['staff','Sam Demo','staff'],['seller','Jamie Demo','seller'],['organisation','Campus Society Demo','organisation'],
];
export function seedDemo(db,hashes){
 db.exec('CREATE TABLE IF NOT EXISTS demo_installation(id INTEGER PRIMARY KEY CHECK(id=1),created_at TEXT NOT NULL)');
 if(db.prepare('SELECT 1 FROM demo_installation').get())return false;
 if(db.prepare('SELECT 1 FROM admins LIMIT 1').get()||db.prepare('SELECT 1 FROM users LIMIT 1').get())throw Error('Demo seeding requires an empty database.');
 if(!demoAccounts.every(([id])=>typeof hashes[id]==='string'&&/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hashes[id])))throw Error('Valid demo password hashes required.');
 const now=new Date().toISOString(),date=new Date(Date.now()+86400000*2).toISOString().slice(0,10);
 transaction(db,()=>{
  for(const [id,name,role,username]of demoAccounts){
   const email=id+'@demo.hellounimate.com';
   if(username){db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run('demo-'+id,email,name,hashes[id],role);db.prepare('INSERT INTO admin_usernames VALUES(?,?)').run('demo-'+id,username);}
   else{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('demo-'+id,name,email,role,'active',now);db.prepare('INSERT INTO member_credentials VALUES(?,?,?,?)').run('demo-'+id,hashes[id],now,now);
    if(role!=='student'){db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?)').run('demo-approval-'+id,name+' application',role,email,'Fictional developer demonstration account.','approved',now);db.prepare('INSERT INTO member_account_requests(user_id,account_type,service,organisation,approval_id) VALUES(?,?,?,?,?)').run('demo-'+id,role,role==='staff'?'cleaning':'',role==='organisation'?'Campus Society Demo':'','demo-approval-'+id);}
   }
  }
  db.prepare('INSERT INTO team_members VALUES(?,?,?,?,?,?)').run('demo-cleaner','cleaners','Sam Demo','staff@demo.hellounimate.com','active',now);db.prepare('INSERT INTO staff_user_links VALUES(?,?)').run('demo-cleaner','demo-staff');
  for(const [service,title,price]of [['cleaning','Student room cleaning',6000],['moving','Move to student accommodation',18000],['airport_transfer','Airport arrival pickup',8500]]){
   const id='demo-'+service;db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?)').run(id,title,'Alex Demo',service,'confirmed',price,now);db.prepare('INSERT INTO booking_owners VALUES(?,?)').run(id,'demo-student');db.prepare('INSERT INTO booking_pricing VALUES(?,?)').run(id,'confirmed');
   db.prepare('INSERT INTO submission_details VALUES(?,?,?)').run('bookings',id,JSON.stringify({service,requestedDate:date,fields:[{label:'Requested date',value:date},{label:'Time',value:'10:00'},{label:'Address / route',value:'Demo student residence, London'},{label:'Details',value:'Fictional booking for the developer walkthrough. No real service is scheduled.'}]}));
  }
  db.prepare('INSERT INTO booking_assignments VALUES(?,?,?,?)').run('demo-cleaning','demo-cleaner',date+'T10:00:00',date+'T12:00:00');
  db.prepare('INSERT INTO support_conversations VALUES(?,?,?,?,?,?,?,?)').run('demo-conversation','demo-student','Can I update my cleaning time?','booking','open','demo-cleaning',now,now);
  db.prepare('INSERT INTO support_messages(id,conversation_id,sender_kind,sender_id,sender_name,body,client_id,operation,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('demo-message','demo-conversation','member','demo-student','Alex Demo','Hello! This is a sample support conversation for the demo.','demo-message','create',now);
  db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?,?,?)').run('demo-event','Campus welcome event','event','Campus Society Demo','Sample event awaiting review.','pending',now);
  db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?)').run('demo-post','Welcome to UniMate','Alex Demo','A fictional community post for moderation preview.','published',now);
  db.prepare('INSERT INTO marketplace_products VALUES(?,?,?,?,?,?,?,?,?,?)').run('demo-product','UniMate welcome pack','Demo catalogue product. Checkout is not enabled for this item.',2500,20,'','draft',1,now,now);
  db.prepare('INSERT INTO demo_installation VALUES(1,?)').run(now);
 });return true;
}
