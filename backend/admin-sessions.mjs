import {transaction} from './database.mjs';
export const ADMIN_SESSION_SECONDS=30*24*60*60;
export function initializeAdminSessions(db){
 db.exec('CREATE TABLE IF NOT EXISTS admin_session_preferences(token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,keep_signed_in INTEGER NOT NULL CHECK(keep_signed_in IN (0,1)))');
 db.exec('CREATE TABLE IF NOT EXISTS admin_session_policy(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL)');
 // One-time extension preserves the age of existing eight-hour sessions.
 transaction(db,()=>{if(db.prepare('SELECT version FROM admin_session_policy WHERE id=1').get())return;const now=Date.now();db.prepare('UPDATE sessions SET expires=min(expires+?,?) WHERE expires>?').run((ADMIN_SESSION_SECONDS-8*60*60)*1000,now+ADMIN_SESSION_SECONDS*1000,now);db.prepare('INSERT INTO admin_session_policy VALUES(1,1)').run();});
}

export function saveAdminSessionPreference(db,hash,keepSignedIn){db.prepare('INSERT INTO admin_session_preferences VALUES(?,?)').run(hash,keepSignedIn?1:0);}
export function adminSessionCookie(db,rawToken,session,secureCookie=''){
 // Existing sessions retain their previous persistence; new sessions record the explicit choice.
 const keepSignedIn=db.prepare('SELECT keep_signed_in FROM admin_session_preferences WHERE token_hash=?').get(session.token_hash)?.keep_signed_in!==0;
 const expiry=keepSignedIn?`; Max-Age=${Math.max(0,Math.floor((session.expires-Date.now())/1000))}`:'';
 return `unimate_admin=${rawToken}; HttpOnly; SameSite=Strict; Path=/${expiry}${secureCookie}`;
}
