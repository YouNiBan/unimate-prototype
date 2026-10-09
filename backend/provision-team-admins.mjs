// Explicit local provisioning only. Never run automatically during startup/build.
// The legacy admins.email field is a unique login identifier; a username is not an email link.
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFileSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDatabase,transaction,audit} from './database.mjs';
import {hashPassword} from './security.mjs';
const teams=[['unimate.events','UniMate Events Team'],['unimate.support','UniMate Support Team'],['unimate.lostfound','UniMate Lost & Found Team'],['unimate.tech','UniMate Tech Support Team']];
const db=openDatabase(fileURLToPath(new URL('./data/unimate.sqlite',import.meta.url)));
const credentials=fileURLToPath(new URL('./data/team-admin-credentials.txt',import.meta.url));
try{
  const owner=db.prepare("SELECT id,name FROM admins WHERE role='owner' AND active=1").get();
  if(!owner)throw Error('An active local owner is required.');
  for(const [username,name] of teams)if(db.prepare('SELECT id FROM admins WHERE email=? OR name=?').get(username,name))throw Error('A requested team account already exists; no accounts changed.');
  const rows=[];
  for(const [username,name] of teams){const password='Um!'+randomBytes(20).toString('base64url');rows.push({id:randomUUID(),username,name,password,hash:await hashPassword(password)});}
  writeFileSync(credentials,'PRIVATE — LOCAL TEAM ADMIN SIGN-IN\nhttp://localhost:8090/\nNo email linked. Standard Admin access. Change passwords in Account settings before sharing access.\n\n'+rows.map(r=>`${r.name}\nUsername: ${r.username}\nPassword: ${r.password}\n`).join('\n'),{flag:'wx',mode:0o600});
  try{transaction(db,()=>{for(const row of rows){db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run(row.id,row.username,row.name,row.hash,'admin');audit(db,owner,'admin.created','admins',row.id,null,{name:row.name,username:row.username,role:'admin'},'User-requested local team account; no email linked');}});}catch(error){unlinkSync(credentials);throw error;}
  console.log('Created four standard Admin accounts. Credentials saved privately under backend/data/team-admin-credentials.txt.');
}finally{db.close();}
