import {transaction} from './database.mjs';
export const ADMIN_SESSION_SECONDS=30*24*60*60;
export function initializeAdminSessions(db){
 db.exec('CREATE TABLE IF NOT EXISTS admin_session_policy(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL)');
 // One-time extension preserves the age of existing eight-hour sessions.
 transaction(db,()=>{if(db.prepare('SELECT version FROM admin_session_policy WHERE id=1').get())return;const now=Date.now();db.prepare('UPDATE sessions SET expires=min(expires+?,?) WHERE expires>?').run((ADMIN_SESSION_SECONDS-8*60*60)*1000,now+ADMIN_SESSION_SECONDS*1000,now);db.prepare('INSERT INTO admin_session_policy VALUES(1,1)').run();});
}
