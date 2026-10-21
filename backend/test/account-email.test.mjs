import test from 'node:test';
import assert from 'node:assert/strict';
import {accountEmail} from '../account-email.mjs';
import {createMailer} from '../mailer.mjs';

test('account mail has matching HTML and text links, inline branding and correct expiry', () => {
  for (const [kind,expiry] of [['verify','24 hours'],['reset','1 hour']]) {
    const link = `https://hellounimate.com/?member_action=${kind}&token=example-not-a-real-token`;
    const mail = accountEmail({kind,link});
    assert.ok(mail.text.includes(link));
    assert.ok(mail.html.includes(link.replaceAll('&','&amp;')));
    assert.ok(mail.html.includes('cid:unimate-logo@hellounimate.com'));
    assert.ok(mail.html.includes(expiry));
    assert.ok(mail.text.includes(expiry));
    assert.ok(!mail.html.includes('<script'));
  }
  const mail = accountEmail({kind:'university',code:'012345'});
  assert.match(mail.text,/code is 012345/);
  assert.match(mail.html,/012345/);
  assert.match(mail.html,/10 minutes/);
  assert.throws(() => accountEmail({kind:'reset',link:'javascript:alert(1)'}));
});

test('mailer attaches the original logo from memory and sends both MIME alternatives without network fetching', async t => {
  const {default:nodemailer} = await import('nodemailer');
  const original = nodemailer.createTransport;
  let captured;
  nodemailer.createTransport = () => ({sendMail:async message => {captured=message;return {accepted:['recipient@example.invalid'],rejected:[]};},verify:async()=>true,close(){}});
  t.after(() => {nodemailer.createTransport=original;});
  const send = await createMailer({UNIMATE_SMTP_HOST:'smtp.example.invalid',UNIMATE_SMTP_USER:'tester',UNIMATE_SMTP_PASSWORD:'unused',UNIMATE_MAIL_FROM:'mail@example.invalid'});
  await send({to:'recipient@example.invalid',...accountEmail({kind:'verify',link:'https://hellounimate.com/?token=example'})});
  assert.ok(captured.text && captured.html);
  assert.equal(captured.attachments[0].cid,'unimate-logo@hellounimate.com');
  assert.ok(Buffer.isBuffer(captured.attachments[0].content));
  assert.equal(captured.disableFileAccess,true);
  assert.equal(captured.disableUrlAccess,true);
});
