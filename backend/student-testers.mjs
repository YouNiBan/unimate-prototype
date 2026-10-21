/** Owner-selected test accounts only. Never accepts an identity from a request. */
export function isOwnerTester(db, id, configured = process.env.UNIMATE_TESTER_EMAILS || '') {
  const emails = configured.split(',').map(value => value.trim().toLowerCase()).filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  if (!emails.length) return false;
  const user = db.prepare("SELECT u.email FROM users u JOIN member_credentials c ON c.user_id=u.id WHERE u.id=? AND u.status='active' AND u.kind='student' AND c.verified_at IS NOT NULL").get(id);
  return !!user && emails.includes(user.email.toLowerCase());
}
