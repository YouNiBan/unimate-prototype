import { randomUUID } from 'node:crypto';
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Development only, memory only, and visible only to a signed-in privileged
// administrator. Never enabled by the hosted startup configuration.
export function createLocalMailbox(webOrigin) {
  const origin = new URL(webOrigin);
  if (!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) throw new Error('Local test mail requires a localhost website.');
  let messages=[];
  const rows = () => {
    messages=messages.filter(message=>Date.now()-message.timestamp<3600000);
    return messages.map(({timestamp,...message})=>message);
  };
  const send = async ({to,subject,text})=>{
    messages.unshift({id:randomUUID(),to,subject,text,createdAt:new Date().toISOString(),timestamp:Date.now()});
    messages=messages.slice(0,30);
  };
  send.verify = async () => true;
  send.close = () => {messages=[];};
  const render = () => {
    const items=rows().map(message=>{
      const links=[...message.text.matchAll(/https?:\/\/[^\s]+/g)].map(match=>{
        try {
          const url=new URL(match[0]);
          if (url.origin!==origin.origin || !['verify','reset'].includes(url.searchParams.get('member_action'))) return '';
          return `<p><a href="${escape(url.href)}" target="_blank" rel="noreferrer noopener">Open ${url.searchParams.get('member_action')==='verify'?'confirmation':'password reset'} link</a></p>`;
        }catch{return '';}
      }).join('');
      return `<article class="card"><h2>${escape(message.subject)}</h2><p>To: ${escape(message.to)} · ${escape(message.createdAt)}</p><pre>${escape(message.text)}</pre>${links}</article>`;
    }).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local test mailbox · UniMate</title><link rel="stylesheet" href="/styles.css"></head><body><main class="content"><p><a href="/">← Administration</a></p><h1>Local test mailbox</h1><p>This computer only. These test messages were not sent by email. They disappear after one hour or when the backend stops. Refresh to see new messages.</p>${items||'<p>No local test messages yet. Try creating a student account in the local website.</p>'}</main></body></html>`;
  };
  return {send,rows,render};
}
