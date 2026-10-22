const prefixes={payment:'PAY',support:'SUP',message:'MSG',member:'MEM',booking:'JOB',account:'UMU'};
export function recordReference(db,kind,id,createdAt) {
  if(!prefixes[kind]||typeof id!=='string'||!id)throw Error('Invalid reference resource.');
  const existing=db.prepare('SELECT reference FROM record_references WHERE kind=? AND record_id=?').get(kind,id);
  if(existing)return existing.reference;
  const year=/^\d{4}-/.test(createdAt||'')?createdAt.slice(0,4):String(new Date().getUTCFullYear());
  // Job numbers use one continuous sequence, never reset at the new year.
  const key=kind==='booking'?'JOB':kind==='account'?'ACCOUNT':prefixes[kind]+'-'+year;
  const {number}=db.prepare('INSERT INTO reference_counters(key,number) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET number=number+1 RETURNING number').get(key);
  const reference=kind==='booking'?`UM-${String(number).padStart(6,'0')}`:kind==='account'?`UMU-${String(number).padStart(6,'0')}`:`UM-${key}-${String(number).padStart(6,'0')}`;
  db.prepare('INSERT OR IGNORE INTO record_references(kind,record_id,reference) VALUES(?,?,?)').run(kind,id,reference);
  return db.prepare('SELECT reference FROM record_references WHERE kind=? AND record_id=?').get(kind,id).reference;
}
