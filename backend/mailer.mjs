// SMTP remains server-only. No credentials or verification links are logged.
export async function createMailer(env = process.env) {
  const keys = ['UNIMATE_SMTP_HOST', 'UNIMATE_SMTP_USER', 'UNIMATE_SMTP_PASSWORD', 'UNIMATE_MAIL_FROM'];
  if (!keys.some(key => env[key])) return null;
  if (keys.some(key => !env[key])) throw new Error('Complete all SMTP settings before enabling account email.');
  const port = Number(env.UNIMATE_SMTP_PORT || 465);
  if (![465, 587].includes(port)) throw new Error('Use SMTP over TLS on port 465 or STARTTLS on 587.');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.UNIMATE_MAIL_FROM)) throw new Error('UNIMATE_MAIL_FROM must be one email address.');
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: env.UNIMATE_SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: {user: env.UNIMATE_SMTP_USER, pass: env.UNIMATE_SMTP_HOST==='smtp.gmail.com'?env.UNIMATE_SMTP_PASSWORD.replace(/\s/g,''):env.UNIMATE_SMTP_PASSWORD},
    tls: {minVersion: 'TLSv1.2', rejectUnauthorized: true},
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  const send = async ({to, subject, text}) => {
    const result = await transport.sendMail({
      from: {name:'UniMate', address:env.UNIMATE_MAIL_FROM},
      to, subject, text, disableFileAccess:true, disableUrlAccess:true,
    });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('Account email could not be delivered.');
  };
  send.verify = () => transport.verify();
  send.close = () => transport.close();
  return send;
}
