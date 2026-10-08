// Deliberately fictional fixtures. This adapter has no network or persistence.
const sampleDay=n=>new Date(Date.UTC(new Date().getFullYear(),new Date().getMonth(),n,12)).toISOString().slice(0,10);
const sampleCreated=sampleDay(1)+'T10:00:00Z';
const demoStaff=[['cleaners','Alex Sample'],['drivers','Jamie Example'],['movers','Taylor Demo'],['office','Sam Sample']].map(([team,name],i)=>({id:'demo-staff-'+i,name,team,email:'staff'+i+'@example.invalid',status:'active',created_at:sampleCreated}));
const demoBookings=['Cleaning','Airport transfer','Moving'].map((service,i)=>({id:'demo-booking-'+i,title:service+' · sample booking',customer:['Casey Sample','Riley Example','Morgan Demo'][i],service:['cleaning','airport_transfer','moving'][i],status:'assigned',amount_pence:[6500,9500,18000][i],created_at:sampleCreated,submission:{service,date:sampleDay(8+i),time:'10:00–12:00',description:'Fictional booking for reviewing the Administration interface. No customer or address is real.',location:'Example university campus'}}));
const demoUsers=demoBookings.map((b,i)=>({id:'demo-user-'+i,name:b.customer,age:21+i,university:'Example University',email:'student'+i+'@example.invalid',kind:'student',status:'active',created_at:sampleCreated,last_online:sampleCreated}));
const demoApprovals=[{id:'demo-approval-1',title:'Cleaning staff application',applicant:'Jordan Sample',kind:'staff',status:'pending',created_at:sampleCreated,submission:{service:'Cleaning',position:'Cleaner',note:'Fictional application; no identity documents included.'}},{id:'demo-approval-2',title:'Student account application',applicant:'Robin Demo',kind:'student',status:'pending',created_at:sampleCreated},{id:'demo-approval-3',title:'Campus welcome event',applicant:'Example Student Society',kind:'event',status:'pending',created_at:sampleCreated}];
const demoRows={users:demoUsers,teams:demoStaff,bookings:demoBookings,approvals:demoApprovals,posts:[{id:'demo-post-1',title:'Welcome to campus',author:'Casey Sample',status:'published',created_at:sampleCreated,submission:{body:'A fictional welcome post for the public Administration preview.',date:sampleDay(3)}}],reports:[],account_reports:[],audit:[{id:'demo-audit-1',actor_name:'Demo SuperAdmin',action:'demo.started',resource:'Fictional preview',created_at:sampleCreated}],documents:[],conversations:[],admins:[]};
async function previewApi(path,data){
 if(data)throw Error('Read-only public demo. No changes are saved or sent.');
 const [route,query='']=path.split('?'),params=new URLSearchParams(query),[resource,id]=route.split('/');
 if(resource==='session')return {admin:{name:'Demo SuperAdmin',email:'demo@example.invalid',role:'superadmin'},csrf:'demo-no-auth'};
 if(resource==='overview')return {users:demoUsers.length,approvals:demoApprovals.length,reports:0,bookings:demoBookings.length};
 if(resource==='tasks')return {rows:[],total:0,unseen:0};
 if(resource==='conversations'){
  const conversations=demoStaff.slice(0,3).map((staff,i)=>({id:'demo-chat-'+i,recipient_name:staff.name,recipient_kind:'Sample staff',subject:['Cleaning enquiry','Airport transfer','Moving booking'][i],message_count:2}));
  if(!id)return {rows:conversations,total:conversations.length};
  const conversation=conversations.find(c=>c.id===id);return {conversation,total:2,rows:[{sender_name:'Demo SuperAdmin',body:'Thank you, understood.',created_at:sampleCreated,demo:true},{sender_name:conversation.recipient_name,body:'Hello! This is a fictional service conversation showing the UniMate message layout.',created_at:sampleCreated,direction:'incoming',demo:true}]};
 }
 if(resource==='staff-schedule')return {rows:demoBookings.map((b,i)=>({id:'demo-slot-'+i,booking_id:b.id,member_id:demoStaff[i].id,name:demoStaff[i].name,team:demoStaff[i].team,title:b.title,starts_at:sampleDay(8+i)+'T09:00:00Z',ends_at:sampleDay(8+i)+'T11:00:00Z'}))};
 if(resource==='staff-holidays')return {rows:[{id:'demo-holiday',member_id:demoStaff[0].id,name:demoStaff[0].name,team:'cleaners',start_date:sampleDay(15),end_date:sampleDay(17)}]};
 if(resource==='invoices'){
  const invoice={id:'demo-invoice',reference:'UM-INV-'+new Date().getFullYear()+'-000001',customer:'Casey Sample',description:'Completed sample cleaning',booking_id:demoBookings[0].id,amount_pence:6500,issued_on:sampleDay(1),due_on:sampleDay(1),status:'paid'};
  const filter=params.get('status');return {rows:['all','closed','paid'].includes(filter)?[invoice]:[],total:['all','closed','paid'].includes(filter)?1:0,counts:{open:0,due:0,overdue:0,closed:1,paid:1,paid_off_platform:0,void:0,all:1},outstanding_pence:0,today:sampleDay(new Date().getDate())};
 }
 let rows=structuredClone(demoRows[resource]||[]);
 if(id){const row=rows.find(r=>r.id===decodeURIComponent(id));if(!row)throw Error('No sample record found');return {row,canManage:false};}
 if(params.get('kind'))rows=rows.filter(r=>r.kind===params.get('kind'));
 if(params.get('accounts'))rows=rows.filter(r=>r.kind!=='event');
 if(params.get('team')&&params.get('team')!=='all')rows=rows.filter(r=>r.team===params.get('team'));
 if(params.get('division')&&params.get('division')!=='all')rows=rows.filter(r=>r.service===params.get('division'));
 if(params.get('status'))rows=rows.filter(r=>r.status===params.get('status'));
 if(params.get('q'))rows=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(params.get('q').toLowerCase()));
 return {rows,total:rows.length,canManage:false};
}
function previewOnly(){dialog.replaceChildren(el('h2','Read-only demonstration'),el('p','This public preview uses fictional records. Real account changes, HR records, document uploads and booking assignments are available only in the private Administration service.'),button('Close',()=>dialog.close()));if(!dialog.open)dialog.showModal();}
assignBooking=holidayEditor=holidayDetails=hrEditor=areasEditor=teamEditor=documentUpload=adminEditor=newConversation=previewOnly;
accountSettings=main=>main.append(el('section','Public demonstration account · No login, password or personal information is required.','panel'));
const originalShowConversation=showConversation;
showConversation=async(...args)=>{await originalShowConversation(...args);const chat=args[0];chat.querySelectorAll('.quick-replies').forEach(n=>n.remove());chat.querySelectorAll('textarea, .chat-composer button').forEach(n=>{n.disabled=true;});const input=chat.querySelector('textarea');if(input)input.placeholder='Read-only public demo';};
// Remove forms and mutation controls before a visitor can enter sensitive information.
const originalDetails=details;
details=async(...args)=>{
 await originalDetails(...args);dialog.querySelectorAll('form').forEach(f=>f.remove());
 const application=demoApprovals.find(r=>r.id===args[0].id);
 if(application?.status==='pending'){
  const actions=el('div',undefined,'actions');
  for(const [status,label] of [['approved','Approve'],['rejected','Reject']])actions.append(button(label,async()=>{
   application.status=status;
   if(status==='approved'&&application.kind==='staff'&&!demoStaff.some(r=>r.id===application.id)){
    demoStaff.push({id:application.id,name:application.applicant,team:'cleaners',email:'jordan@example.invalid',status:'active',created_at:sampleCreated});
    demoUsers.push({id:application.id,name:application.applicant,email:'jordan@example.invalid',kind:'staff',status:'active',created_at:sampleCreated});
   }
   dialog.close();await render();message('Demo application '+status+'. This is a simulation only; reload to reset.');
  },status==='approved'?'primary':''));
  dialog.append(el('p','Demo decision only. No real account is changed; reloading resets this sample.','banner'),actions);
 }
};
