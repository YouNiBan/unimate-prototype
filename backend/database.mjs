import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','superadmin','admin','viewer')), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','suspended')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, applicant TEXT NOT NULL,
      details TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('published','hidden')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id), title TEXT NOT NULL,
      reporter TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','resolved','dismissed')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS moderation_targets(post_id TEXT PRIMARY KEY REFERENCES posts(id), kind TEXT NOT NULL CHECK(kind IN ('moment','forum','comment')));
    CREATE TABLE IF NOT EXISTS report_votes(post_id TEXT NOT NULL REFERENCES posts(id), user_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(post_id,user_id));
    CREATE INDEX IF NOT EXISTS reports_post_idx ON reports(post_id);
    CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, title TEXT NOT NULL, customer TEXT NOT NULL, service TEXT NOT NULL,
      status TEXT NOT NULL, amount_pence INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT NOT NULL, action TEXT NOT NULL,
      resource TEXT NOT NULL, resource_id TEXT NOT NULL, before_state TEXT, after_state TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_seen(admin_id TEXT NOT NULL REFERENCES admins(id),resource TEXT NOT NULL,record_id TEXT NOT NULL,PRIMARY KEY(admin_id,resource,record_id));
    CREATE TABLE IF NOT EXISTS team_members(id TEXT PRIMARY KEY,team TEXT NOT NULL CHECK(team IN ('office','cleaners','drivers','movers')),name TEXT NOT NULL,email TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','deactivated')),created_at TEXT NOT NULL,UNIQUE(team,email));
    CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members(team,name,id);
    CREATE TABLE IF NOT EXISTS staff_areas(member_id TEXT PRIMARY KEY REFERENCES team_members(id),areas TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS staff_hr(member_id TEXT PRIMARY KEY REFERENCES team_members(id),job_title TEXT NOT NULL DEFAULT '',start_date TEXT NOT NULL DEFAULT '',emergency_contact TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS staff_hr_details(member_id TEXT PRIMARY KEY REFERENCES team_members(id),details_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS company_documents(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,expires_on TEXT NOT NULL,filename TEXT NOT NULL,file BLOB NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invoice_counters(year TEXT PRIMARY KEY,next_number INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY,reference TEXT NOT NULL UNIQUE,booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),customer TEXT NOT NULL,description TEXT NOT NULL,amount_pence INTEGER NOT NULL CHECK(amount_pence>=0),issued_on TEXT NOT NULL,due_on TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','paid','paid_off_platform','void')),created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),age INTEGER CHECK(age BETWEEN 0 AND 130),university TEXT,last_online TEXT);
    CREATE TABLE IF NOT EXISTS staff_applications(approval_id TEXT PRIMARY KEY REFERENCES approvals(id),name TEXT NOT NULL,email TEXT NOT NULL,service TEXT NOT NULL CHECK(service IN ('cleaning','moving','airport_transfer')),job_title TEXT NOT NULL,member_id TEXT UNIQUE REFERENCES team_members(id));
    CREATE TABLE IF NOT EXISTS account_reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,reporter TEXT NOT NULL REFERENCES users(id),details TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','resolved','dismissed')),created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS account_report_open_idx ON account_reports(user_id,reporter) WHERE status='open';
    CREATE TABLE IF NOT EXISTS staff_holidays(id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES team_members(id),start_date TEXT NOT NULL,end_date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','cancelled')));
    CREATE INDEX IF NOT EXISTS holidays_member_idx ON staff_holidays(member_id,start_date,end_date);
    CREATE TABLE IF NOT EXISTS submission_details(resource TEXT NOT NULL,record_id TEXT NOT NULL,details_json TEXT NOT NULL,PRIMARY KEY(resource,record_id));
    CREATE TABLE IF NOT EXISTS booking_assignments(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),member_id TEXT NOT NULL REFERENCES team_members(id),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,recipient_id TEXT NOT NULL REFERENCES users(id),subject TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES admins(id),created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),sender_id TEXT NOT NULL REFERENCES admins(id),body TEXT NOT NULL,delivery_status TEXT NOT NULL CHECK(delivery_status='local_only'),created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS conversation_date_idx ON conversations(created_at DESC,id);
    CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id,created_at DESC,id);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit rows cannot be updated'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit rows cannot be deleted'); END;
    CREATE INDEX IF NOT EXISTS users_date_idx ON users(created_at DESC,id);
    CREATE INDEX IF NOT EXISTS users_status_idx ON users(status,created_at DESC,id);
    CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status,created_at DESC,id);
    CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status,created_at DESC,id);
    CREATE INDEX IF NOT EXISTS posts_date_idx ON posts(created_at DESC,id);
    CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings(created_at DESC,id);
    CREATE INDEX IF NOT EXISTS audit_date_idx ON audit(created_at DESC,id);
    CREATE INDEX IF NOT EXISTS sessions_admin_idx ON sessions(admin_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires);
    `);
  // Preserve existing accounts and sessions while migrating the original role constraint.
  if (!db.prepare("SELECT sql FROM sqlite_master WHERE name='admins'").get().sql.includes("'owner'")) {
    db.exec('PRAGMA foreign_keys=OFF');
    try {
      transaction(db,()=>db.exec(`CREATE TABLE admins_v2(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','superadmin','admin','viewer')), active INTEGER NOT NULL DEFAULT 1);
        INSERT INTO admins_v2 SELECT id,email,name,password_hash,CASE WHEN role='moderator' THEN 'admin' ELSE role END,active FROM admins;
        DROP TABLE admins; ALTER TABLE admins_v2 RENAME TO admins;`));
    } finally { db.exec('PRAGMA foreign_keys=ON'); }
  }
  db.exec("CREATE INDEX IF NOT EXISTS admins_name_idx ON admins(name,id); CREATE UNIQUE INDEX IF NOT EXISTS single_owner_idx ON admins(role) WHERE role='owner'; PRAGMA user_version=3");
  if (!db.prepare('PRAGMA table_info(conversations)').all().some(column=>column.name==='status')) {
    db.exec("ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('request','open','closed'))");
  }
  if (!db.prepare('PRAGMA table_info(conversations)').all().some(column=>column.name==='category')) db.exec("ALTER TABLE conversations ADD COLUMN category TEXT NOT NULL DEFAULT 'general' CHECK(category IN ('general','events','support','lost_found','technical'))");
  return db;
}
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function audit(db, actor, action, resource, id, before, after, reason) {
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), actor?.id || null,
    actor?.name || 'System', action, resource, id, before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null, reason, new Date().toISOString());
}
