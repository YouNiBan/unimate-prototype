const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** Transactional email only. Links and codes are never logged or fetched here. */
export function accountEmail({ kind, link, code }) {
  const verification = kind === 'verify', university = kind === 'university';
  if (!['verify', 'reset', 'university'].includes(kind)) throw new Error('Unknown account email.');
  if (university && !/^\d{6}$/.test(code || '')) throw new Error('Invalid verification code.');
  if (!university) {
    const url = new URL(link);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid account link.');
  }
  const title = university ? 'Verify your university email' : verification ? 'Welcome to UniMate' : 'Reset your password';
  const subject = university ? 'Your UniMate university verification code' : verification ? 'Confirm your UniMate email' : 'Reset your UniMate password';
  const intro = university ? 'Enter this six-digit code in the University verification step in your UniMate profile.' : verification ? 'A new chapter starts here. Confirm your email address to finish creating your UniMate account.' : 'We received a request to reset your UniMate password. Use the button below to choose a new password.';
  const expiry = university ? '10 minutes' : verification ? '24 hours' : '1 hour';
  const detail = university ? 'Your university email is used only for student verification. Keep signing in with your personal email.' : verification ? 'The button opens a secure confirmation page. Choose Confirm email on that page to finish.' : 'Your password will change only after you submit a new password.';
  const button = verification ? 'Confirm email address' : 'Reset password';
  const text = university
    ? `Your UniMate university verification code is ${code}. It expires in 10 minutes.\n\n${intro}\n\n${detail}\n\nIf you did not request this code, you can ignore this email.`
    : `${intro}\n\n${link}\n\nThis link expires in ${expiry}. ${detail} If you did not request this, you can ignore this email.\n\nUniMate 优你伴\nhttps://hellounimate.com`;
  const action = university
    ? `<div style="margin:28px 0;padding:22px 12px;border:1px solid #cfe2f8;border-radius:12px;background:#eff7ff;font-size:34px;line-height:44px;font-weight:700;letter-spacing:10px;text-align:center;color:#102d63">${escapeHtml(code)}</div>`
    : `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0"><tr><td bgcolor="#087df1" style="border-radius:10px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:15px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:700;text-decoration:none;color:#ffffff">${button}</a></td></tr></table>`;
  const fallback = university ? '' : `<p style="margin:24px 0 8px;font-size:12px;line-height:20px;color:#52657e">If the button doesn’t work, copy and paste this link into your browser:</p><p style="margin:0;font-size:12px;line-height:20px;overflow-wrap:anywhere;word-break:break-all"><a href="${escapeHtml(link)}" style="color:#0874da">${escapeHtml(link)}</a></p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;padding:0;background:#f2f6fb;font-family:Arial,Helvetica,sans-serif;color:#102d63"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${intro}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f2f6fb"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #dce7f3;border-radius:18px"><tr><td style="padding:32px 32px 24px;border-bottom:1px solid #e5edf6"><img src="cid:unimate-logo@hellounimate.com" width="152" height="60" alt="UniMate 优你伴" style="display:block;max-width:100%;border:0"></td></tr><tr><td style="padding:32px"><p style="margin:0 0 12px;font-size:11px;line-height:18px;letter-spacing:1.6px;color:#0874da;font-weight:700">YOUR UNIMATE ACCOUNT</p><h1 style="margin:0 0 18px;font-size:28px;line-height:36px;color:#102d63">${title}</h1><p style="margin:0;font-size:16px;line-height:26px;color:#394f6c">${intro}</p>${action}<p style="margin:0 0 14px;font-size:14px;line-height:23px;color:#394f6c">${detail}</p><p style="margin:0;padding:14px 16px;background:#eef7ff;border-radius:10px;font-size:13px;line-height:21px;color:#244b72">${university ? 'This code' : 'This link'} expires in <strong>${expiry}</strong>. If you didn’t request this, you can safely ignore this email.</p>${fallback}</td></tr><tr><td style="padding:22px 32px;border-top:1px solid #e5edf6;font-size:12px;line-height:20px;color:#61738b">UniMate 优你伴<br>A little company for your student journey.<br><a href="https://hellounimate.com" style="color:#0874da;text-decoration:none">hellounimate.com</a></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
