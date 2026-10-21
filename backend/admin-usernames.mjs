import {audit, transaction} from './database.mjs';

export function setAdminUsername(db, actor, value) {
  const username = typeof value === 'string' ? value.trim() : '';
  const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
  if (!/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(username)) fail(400, 'Use 3–32 characters: letters, numbers, dots, underscores or hyphens. Start with a letter.');
  return transaction(db, () => {
    const current = db.prepare('SELECT * FROM admins WHERE id=? AND active=1').get(actor.id);
    if (!current) fail(401, 'Please sign in.');
    if (db.prepare('SELECT id FROM admins WHERE lower(email)=lower(?) AND id<>?').get(username, actor.id)
      || db.prepare('SELECT admin_id FROM admin_usernames WHERE username=? COLLATE NOCASE AND admin_id<>?').get(username, actor.id)) fail(409, 'This username is already in use.');
    const before = db.prepare('SELECT username FROM admin_usernames WHERE admin_id=?').get(actor.id) || null;
    db.prepare('INSERT INTO admin_usernames(admin_id,username) VALUES(?,?) ON CONFLICT(admin_id) DO UPDATE SET username=excluded.username').run(actor.id,username);
    audit(db,current,'username.changed','admins',actor.id,before,{username},'Account username updated');
    return {username};
  });
}
