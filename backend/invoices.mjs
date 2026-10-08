import {randomUUID} from 'node:crypto';
import {audit} from './database.mjs';
// Must run inside the caller's transaction, together with service completion.
export function createBookingInvoice(db,actor,booking,today,due=today){
  const existing=db.prepare('SELECT id,reference FROM invoices WHERE booking_id=?').get(booking.id);if(existing)return existing;
  if(!Number.isSafeInteger(booking.amount_pence)||booking.amount_pence<0)throw Error('Invalid booking amount.');
  const year=today.slice(0,4);db.prepare('INSERT OR IGNORE INTO invoice_counters VALUES(?,1)').run(year);const number=db.prepare('SELECT next_number FROM invoice_counters WHERE year=?').get(year).next_number;
  db.prepare('UPDATE invoice_counters SET next_number=next_number+1 WHERE year=?').run(year);
  const id=randomUUID(),reference='UM-INV-'+year+'-'+String(number).padStart(6,'0');
  db.prepare("INSERT INTO invoices VALUES(?,?,?,?,?,?,?,?,'open',?)").run(id,reference,booking.id,booking.customer,booking.title,booking.amount_pence,today,due,new Date().toISOString());
  audit(db,actor,'invoice.created','invoices',id,null,{reference,booking_id:booking.id},'Service completed; local invoice record created, not sent');return {id,reference};
}
