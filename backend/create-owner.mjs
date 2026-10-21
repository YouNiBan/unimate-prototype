import { stdin, stdout } from 'node:process';
import readline from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatabase, transaction, audit } from './database.mjs';
import { hashPassword, passwordValid } from './security.mjs';

export async function createOwner(db, {email, name, password, confirmPassword}) {
  if (db.prepare('SELECT id FROM admins LIMIT 1').get()) throw new Error('Accounts already exist. This command never resets or changes them.');
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid owner email.');
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80) throw new Error('Enter your name.');
  if (!passwordValid(password) || password.length < 12 || confirmPassword !== password) throw new Error('Use matching passwords of 12–128 characters with a capital and special character.');
  const hash = await hashPassword(password);
  transaction(db,()=>{
    if (db.prepare('SELECT id FROM admins LIMIT 1').get()) throw new Error('Setup is already complete.');
    const id = randomUUID();
    db.prepare('INSERT INTO admins(id,email,name,password_hash,role,active) VALUES(?,?,?,?,?,1)').run(id,email.trim().toLowerCase(),name.trim(),hash,'owner');
    audit(db,{id,name:name.trim()},'owner.created','admins',id,null,{role:'owner'},'Owner provisioned interactively through private hosting console');
  });
}

// Human-operated console only: passwords are neither echoed nor accepted as
// command-line arguments, environment variables, or piped agent input.
async function main() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run this command yourself in an interactive private hosting shell.');
  const dataDirectory = process.env.UNIMATE_DATA_DIR;
  if (!dataDirectory) throw new Error('Set UNIMATE_DATA_DIR to the intended database directory first.');
  process.umask(0o077);
  const db = openDatabase(resolve(dataDirectory,'unimate.sqlite'));
  try {
    if (db.prepare('SELECT id FROM admins LIMIT 1').get()) throw new Error('Setup is already complete; no changes made.');
    const ask = (prompt, hidden = false) => new Promise((resolveAnswer, reject)=>{
      const rl = readline.createInterface({input:stdin,output:stdout,terminal:true});
      if (hidden) {
        rl._writeToOutput = () => {};
        stdout.write(prompt);
      }
      rl.question(hidden ? '' : prompt, answer=>{rl.close();if(hidden)stdout.write('\n');resolveAnswer(answer);});
      rl.on('SIGINT',()=>{rl.close();reject(new Error('Cancelled.'));});
    });
    const name = await ask('Owner name: ');
    const email = await ask('Owner email: ');
    const password = await ask('New password (hidden): ',true);
    const confirmPassword = await ask('Confirm password (hidden): ',true);
    await createOwner(db,{email,name,password,confirmPassword});
    stdout.write('Owner created. Sign in at your configured admin domain. No password is printed or saved in a file.\n');
  } finally {db.close();}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
