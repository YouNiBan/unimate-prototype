// Exact outlined artwork from UniMate's existing Ionicons asset set.
const composePaths={"attachment":"M221 385Q221 385 221 385Q260 388 288 360Q302 346 308 326Q311 317 311.5 302.0Q312 287 312 205Q312 119 311.5 108.0Q311 97 306 87Q299 73 286 65Q255 46 226 66Q208 78 202 98Q202 98 200 105V182Q200 260 202.0 263.5Q204 267 207.5 269.5Q211 272 216 272Q226 272 230 263Q232 261 232 183Q232 183 233 106L235 102Q242 89 257.0 89.0Q272 89 278 103Q280 107 280.0 208.0Q280 309 279 314Q273 335 254.5 346.0Q236 357 216 352Q186 344 178 315Q177 308 177.0 205.5Q177 103 178 96Q185 56 222 38Q256 22 289 38Q323 54 333 90Q335 97 335.5 195.0Q336 293 337 296Q342 305 353.0 304.0Q364 303 367 292Q368 289 368.0 197.5Q368 106 367 98Q362 55 330.5 26.5Q299 -2 256 -2Q210 -2 177 31Q154 54 147 87Q145 95 144.5 197.5Q144 300 145 309Q148 334 162.5 353.0Q177 372 201 381Q209 384 221 385Z","emoji":"M231 415Q239 415 255.0 415.0Q271 415 280 415Q289 414 300 412Q355 401 399.0 364.5Q443 328 464 276Q491 207 472.5 135.5Q454 64 397 18Q344 -24 278.0 -30.5Q212 -37 152 -6Q94 24 61.5 81.5Q29 139 32 205Q35 253 58 296Q79 337 115 366Q143 389 177 401Q204 412 231 415ZM284 382Q261 385 242 383Q216 381 195 374Q119 349 84 276Q64 237 64 192Q64 167 70 146Q85 83 136 42Q199 -8 278 1Q327 7 367.0 35.5Q407 64 428 108Q448 147 448 192Q448 226 437 256Q430 277 417 296Q369 369 284 382ZM192 238Q201 236 205.5 227.0Q210 218 207 210Q202 194 186 192Q171 191 163.5 203.5Q156 216 163 228Q167 234 175.0 238.0Q183 242 192 238ZM319 238Q329 242 339 237Q356 229 351 210Q348 199 337.5 194.0Q327 189 316 195Q302 203 304 218Q306 234 319 238ZM165 143Q165 143 165 143Q167 144 257 144Q257 144 347 144L349 142Q353 138 350 130Q343 109 326.5 92.5Q310 76 288 69Q273 64 256.0 64.0Q239 64 224 69Q179 84 162 128Q158 140 165 143Z"};
function composeIcon(doc,name){const make=tag=>doc.createElementNS?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),svg=make('svg'),path=make('path');for(const [key,value]of Object.entries({viewBox:'0 0 512 512',width:'20',height:'20',fill:'currentColor','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);path.setAttribute('d',composePaths[name]);path.setAttribute('transform','translate(0 448) scale(1 -1)');svg.append(path);return svg;}
import {bindText,translateCurrent as t,currentLocale,observeUiAttributes} from './ui-i18n.mjs';
export function createComposeIcon(doc) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 512 512', width: '16', height: '16', fill: 'currentColor', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(name, value);
  const path = doc.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', "M446 400Q450 401 457 397Q467 391 463 379Q462 375 454 367Q445 358 441.5 358.0Q438 358 430 366Q421 375 423 380Q424 383 432.0 390.5Q440 398 443 399Q445 400 446 400ZM309 268 402 360H406Q410 360 416 354Q426 344 424 339Q423 336 331 244L239 153L226 149Q213 144 211 144Q207 145 212 162L217 176ZM97 335Q97 335 97 335Q102 336 189.0 336.0Q276 336 279 334Q288 329 288.0 320.0Q288 311 279 306Q276 304 186.5 303.5Q97 303 94 302Q86 298 82 291Q82 291 81 287V160V33L82 29Q87 22 95 18Q99 16 224.0 16.0Q349 16 353 18Q361 22 366 29Q366 29 367 33L368 131V228L370 232Q374 238 381.5 239.5Q389 241 394 236Q399 231 399.5 220.5Q400 210 400 128Q400 128 400 29L398 24Q388 -5 360 -14Q360 -14 354 -16H224H94L88 -14Q72 -9 61 5Q54 13 50 24Q50 24 48 30V160V290L50 296Q54 307 61 315Q75 333 97 335Z");
  path.setAttribute('transform', 'translate(0 448) scale(1 -1)');
  svg.append(path);
  return svg;
}

const attachmentTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
export async function encodeChatAttachments(files, existingCount = 0) {
  if (existingCount + files.length > 3) throw Error('Choose up to 3 attachments per message.');
  for (const file of files) {
    if (!attachmentTypes.has(file.type)) throw Error('Choose a PNG, JPEG, WebP or PDF file.');
    if (!file.size || file.size > 5 * 1024 * 1024) throw Error('Each attachment must be between 1 byte and 5 MB.');
  }
  return Promise.all(files.map(async file => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return { filename: file.name, mime: file.type, base64: btoa(binary) };
  }));
}

/** Attachment and emoji tools shared by existing and new conversation forms. */
export function createComposerTools(container, { input, getDraft, onChange, onError, onBusy, onTextChange }) {
  const doc = container.ownerDocument;
  const stopLocalizing=observeUiAttributes(container);
  const make = (tag, text, className,localize=true) => { const n = doc.createElement(tag); if (text !== undefined) bindText(n,text,localize); if (className) n.className = className; return n; };
  const button = (label, action) => { const n = make('button', label); n.type = 'button'; n.onclick = action; return n; };
  let disabled = false, processing = false, disposed = false, operation = 0, urls = [];
  const root = make('div', undefined, 'shared-compose-tools'), bar = make('div', undefined, 'shared-compose-toolbar');
  const files = make('input'); files.type = 'file'; files.multiple = true; files.hidden = true; files.accept = 'image/png,image/jpeg,image/webp,application/pdf';
  files.setAttribute('aria-label', 'Choose attachments');
  const attach = button('', () => files.click());attach.append(composeIcon(doc,'attachment')); attach.title = 'Add attachments'; attach.setAttribute('aria-label', 'Add attachments');
  const emoji = button('', () => { picker.hidden = !picker.hidden; emoji.setAttribute('aria-expanded', String(!picker.hidden)); if (!picker.hidden) picker.children[0]?.focus(); });
  emoji.append(composeIcon(doc,'emoji'));
  emoji.title = 'Choose emoji'; emoji.setAttribute('aria-label', 'Choose emoji'); emoji.setAttribute('aria-expanded', 'false');
  const hint = make('small', 'Up to 3 files · 5 MB each');
  const picker = make('div', undefined, 'shared-emoji-picker'); picker.hidden = true; picker.setAttribute('role', 'dialog'); picker.setAttribute('aria-label', 'Choose emoji');
  for (const [value, name] of [['🙂','smile'],['😊','happy'],['😄','grin'],['😂','laugh'],['🥰','love'],['😍','heart eyes'],['😎','cool'],['🤔','thinking'],['😅','relieved'],['😔','sad'],['😢','cry'],['😮','surprised'],['👍','thumbs up'],['👎','thumbs down'],['👏','clap'],['🙏','thank you'],['👋','wave'],['💪','strong'],['❤️','heart'],['💙','blue heart'],['✨','sparkles'],['🎉','celebrate'],['✅','check'],['☕','coffee']]) {
    const option = button(value, () => {
      const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
      const next = input.value.slice(0, start) + value + input.value.slice(end);
      if (next.length > 4000) { onError('Messages can contain up to 4,000 characters.'); return; }
      input.value = next; getDraft().body = next; onTextChange?.(next); onChange?.();
      picker.hidden = true; emoji.setAttribute('aria-expanded', 'false'); input.focus(); input.setSelectionRange(start + value.length, start + value.length);
    });
    option.setAttribute('aria-label', t('Insert {name} emoji',{name:t(name)})); picker.append(option);
  }
  picker.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); picker.hidden = true; emoji.setAttribute('aria-expanded', 'false'); input.focus(); } };
  const chips = make('div', undefined, 'shared-compose-files');
  bar.append(attach, emoji, hint); root.append(files, bar, picker, chips); container.append(root);
  function controls() {
    attach.disabled = emoji.disabled = files.disabled = disabled || processing;
    for (const button of picker.children) button.disabled = disabled || processing;
    for (const chip of chips.children) { const remove = chip.lastChild; if (remove) remove.disabled = disabled || processing; }
  }
  function refresh() {
    urls.forEach(url => URL.revokeObjectURL(url)); urls = []; chips.replaceChildren();
    for (const [index, attachment] of (getDraft().attachments || []).entries()) {
      const chip = make('div', undefined, 'shared-compose-file');
      if (attachment.mime.startsWith('image/')) {
        const binary = atob(attachment.base64), bytes = Uint8Array.from(binary, letter => letter.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: attachment.mime })); urls.push(url);
        const image = make('img'); image.src = url; image.alt = ''; chip.append(image);
      } else chip.append(make('span', 'PDF', 'shared-compose-file-kind'));
      chip.append(make('span', attachment.filename,undefined,false));
      const remove = button('×', () => { const draft = getDraft(); draft.attachments.splice(index, 1); draft.clientId = ''; refresh(); onChange?.(); });
      remove.setAttribute('aria-label', `Remove ${attachment.filename}`); chip.append(remove); chips.append(chip);
    }
    controls();
  }
  files.onchange = async () => {
    if (disabled || processing || !files.files?.length) return;
    const current = ++operation, draft = getDraft();
    processing = true; controls(); onBusy?.(true); onError('');
    try {
      const additions = await encodeChatAttachments(Array.from(files.files), (draft.attachments || []).length);
      if (disposed || current !== operation) return;
      draft.attachments = [...(draft.attachments || []), ...additions]; draft.clientId = ''; refresh(); onChange?.();
    } catch (error) { if (!disposed && current === operation) onError(error.message || 'This attachment could not be opened.'); }
    finally { if (!disposed && current === operation) { processing = false; files.value = ''; controls(); onBusy?.(false); } }
  };
  refresh();
  return { refresh, setDisabled(value) { disabled = value; controls(); }, destroy() { stopLocalizing(); disposed = true; operation++; urls.forEach(url => URL.revokeObjectURL(url)); files.onchange = null; root.remove(); } };
}

/**
 * Shared, network-independent conversation view used by the member website and
 * support dashboard. The website copy is checked byte-for-byte by a test.
 * All server text is inserted as textContent, never interpreted as markup.
 */
export function createSharedChat(container) {
  const doc = container.ownerDocument;
  const stopLocalizing=observeUiAttributes(container);
  const node = (tag, text, className,localize=true) => {
    const result = doc.createElement(tag);
    if (text !== undefined) bindText(result,text,localize);
    if (className) result.className = className;
    return result;
  };
  const button = (label, action, className) => {
    const result = node('button', label, className);
    result.type = 'button';
    result.onclick = action;
    return result;
  };
  let props, disposed = false, sending = false, preparing = false, changing = false, signature = '', identity = '';
  const attachmentCache = new Map(),avatarCache=new Map();
  const root = node('section', undefined, 'shared-chat');
  const head = node('header', undefined, 'shared-chat-head');
  const back = button('← Inbox', () => props.onBack?.(), 'shared-chat-back');
  const heading = node('div', undefined, 'shared-chat-heading');
  const subject = node('h2');
  const participant = node('p');
  const meta = node('p', undefined, 'shared-chat-meta');
  heading.append(subject, participant, meta);
  const controls = node('div', undefined, 'shared-chat-controls');
  const refresh = button('Refresh', () => props.onRefresh?.());
  const status = button('', async () => {
    if (changing) return;
    changing = true;
    updateControls();
    bindText(feedback,()=>'');
    try { await props.onStatus(props.conversation.status === 'closed' ? 'open' : 'closed', props.conversation.status); }
    catch (error) { if (!disposed) bindText(feedback,()=>error.message || 'Could not update this conversation.'); }
    finally { if (!disposed) { changing = false; updateControls(); } }
  });
  controls.append(refresh, status);
  head.append(back, heading, controls);
  const history = node('div', undefined, 'shared-chat-history');
  history.setAttribute('role', 'log');
  history.setAttribute('aria-label', 'Conversation messages');
  history.setAttribute('aria-live', 'polite');
  const pager = node('div', undefined, 'shared-chat-pager');
  const earlier = button('Earlier messages', () => props.onPage(props.page + 1));
  const newer = button('Newer messages', () => props.onPage(props.page - 1));
  pager.append(earlier, newer);
  const messages = node('div', undefined, 'shared-chat-messages');
  history.append(pager, messages);
  const closed = node('p', 'This conversation is closed. Reopen it to send another message.', 'shared-chat-closed');
  const feedback = node('p', '', 'shared-chat-error');
  feedback.setAttribute('role', 'alert');
  const composer = node('form', undefined, 'shared-chat-composer');
  const label = node('label', 'Your message', 'shared-chat-compose-label');
  const input = node('textarea');
  input.rows = 3;
  input.required = true;
  input.maxLength = 4000;
  input.placeholder = 'Write a message…';
  input.setAttribute('aria-label', 'Your message');
  label.append(input);
  const footer = node('div', undefined, 'shared-chat-compose-footer');
  const hint = node('small', 'Messages are shared with the UniMate Support team.');
  const send = node('button', 'Send message', 'shared-chat-send');
  send.type = 'submit';
  footer.append(hint, send);
  const toolsHost = node('div');
  const tools = createComposerTools(toolsHost, { input, getDraft: () => props?.draft || { body: '' }, onChange: () => updateControls(), onError: text => { bindText(feedback,()=>text); }, onBusy: value => { preparing = value; updateControls(); } });
  composer.append(label, toolsHost, footer);
  const imageDialog = node('dialog', undefined, 'shared-chat-image-dialog');
  imageDialog.setAttribute('aria-label', 'Photo preview');
  const closeImage = button('Close photo', () => imageDialog.close());
  const largeImage = node('img'),saveImage=node('a','Save image','shared-chat-save-image');saveImage.download='photo.jpg';
  imageDialog.append(closeImage,largeImage,saveImage);
  imageDialog.onclick = event => { if (event.target === imageDialog) imageDialog.close(); };
  root.append(head, history, closed, feedback, composer, imageDialog);
  container.replaceChildren(root);

  function avatar(name,url,team=false){const frame=node('span',team?'U':name.trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()||'?','shared-chat-avatar'+(team?' is-team':''),false);frame.setAttribute('aria-label',name+' profile picture');if(url&&props.loadAvatar){let entry=avatarCache.get(url);if(!entry){const controller=new AbortController();entry={controller,url:'',promise:null};entry.promise=Promise.resolve().then(()=>props.loadAvatar(url,controller.signal)).then(blob=>{if(disposed||controller.signal.aborted||!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>512000)throw Error('Photo unavailable');entry.url=URL.createObjectURL(blob);return entry.url;});avatarCache.set(url,entry);}entry.promise.then(src=>{if(disposed||!frame.isConnected)return;const image=node('img');image.src=src;image.alt='';image.onerror=()=>{frame.textContent=name.slice(0,1).toUpperCase();};frame.replaceChildren(image);}).catch(()=>{});}return frame;}
  function updateControls() {
    if (!props) return;
    const isClosed = props.conversation.status === 'closed';
    status.hidden = props.conversation.audience==='personal'||(!isClosed && props.viewer !== 'support');
    bindText(status,changing ? 'Updating…' : isClosed ? 'Reopen conversation' : 'Close conversation');
    status.disabled = changing || sending;
    closed.hidden = !isClosed;
    composer.hidden = isClosed;
    input.disabled = sending;
    input.required = !props.draft.attachments?.length;
    tools.setDisabled(sending);
    send.disabled = sending || preparing || (!input.value.trim() && !props.draft.attachments?.length);
    bindText(send,sending ? 'Sending…' : 'Send message');
  }
  input.oninput = () => {
    props.draft.body = input.value;
    updateControls();
  };
  composer.onsubmit = async event => {
    event.preventDefault();
    const body = input.value.trim();
    if (sending || preparing || (!body && !props.draft.attachments?.length) || props.conversation.status !== 'open') return;
    const draft = props.draft;
    if (!draft.clientId || draft.attemptBody !== body) {
      draft.clientId = globalThis.crypto.randomUUID();
      draft.attemptBody = body;
    }
    const sentIdentity = identity;
    const onSend = props.onSend;
    sending = true;
    updateControls();
    bindText(feedback,()=>'');
    try {
      await onSend(body, draft.clientId, draft.attachments || []);
      draft.body = '';
      draft.attachments = [];
      draft.clientId = '';
      draft.attemptBody = '';
      if (!disposed && identity === sentIdentity) { input.value = ''; tools.refresh(); }
    } catch (error) {
      if (!disposed && identity === sentIdentity) bindText(feedback,()=>error.message || 'Your message was not sent. Try again.');
    } finally {
      if (!disposed && identity === sentIdentity) { sending = false; updateControls(); }
    }
  };

  function update(next) {
    if (disposed) return;
    props = next;
    const changed = identity !== next.conversation.id;
    if (changed) {
      identity = next.conversation.id;
      input.value = next.draft.body || '';
      bindText(feedback,()=>'');
      sending = false;
      changing = false;
      signature = '';
      tools.refresh();
    }
    subject.textContent = next.conversation.subject;
    participant.textContent = next.conversation.audience==='personal'?t('Friends · Personal chat'):next.viewer === 'support'
      ? `${next.conversation.participant.name} · ${t(next.conversation.participant.role === 'staff' ? 'Staff' : 'Student')}`
      : t(next.conversation.teamName||'UniMate Support');
    bindText(hint,()=>next.conversation.audience==='personal'?t('Private chat with your friend.'):t('Messages go to {team}.',{team:t(next.conversation.teamName||'UniMate Support')}));
    const category = { personal:'Friends only',general: 'General enquiry', booking: 'Booking help', technical: 'Technical help' }[next.conversation.category] || 'Support';
    meta.textContent = `${next.conversation.reference ? next.conversation.reference+' · ' : ''}${t(category)} · ${t(next.conversation.status === 'closed' ? 'Closed' : 'Open')}${next.conversation.bookingId ? ` · ${t('Booking')} ${next.conversation.bookingReference || next.conversation.bookingId}` : ''}${next.conversation.audience === 'staff_internal' ? ' · '+t('Internal staff chat — not visible to client') : ''}`;
    earlier.hidden = next.page * 50 >= next.total;
    newer.hidden = next.page <= 1;
    const nextSignature = JSON.stringify([currentLocale(), next.page,next.conversation.participant,next.conversation.audience,next.messages]);
    for (const [key, cached] of attachmentCache) if (cached.failed) { attachmentCache.delete(key); signature = ''; }
    if (nextSignature !== signature) {
      const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 100;
      const oldScroll = history.scrollTop;
      messages.replaceChildren();
      for (const message of next.messages) {
        const own = next.conversation.audience==='personal'?message.sender.id===next.viewerId:(next.viewer === 'support') === (message.sender.kind === 'support');
        const row = node('article', undefined, `shared-chat-message${own ? ' is-own' : ''}`);
        const bubble = node('div', undefined, 'shared-chat-bubble');
        const sender = node('strong', message.sender.kind === 'support' ? (next.viewer==='support'?`${t(next.conversation.teamName||'UniMate Support')} · ${message.sender.name}`:t(next.conversation.teamName||'UniMate Support')) : message.sender.name, 'shared-chat-sender',false);
        const body = node('p', message.body,undefined,false);
        const date = new Date(message.createdAt);
        const time = node('time', Number.isNaN(date.getTime()) ? '' : date.toLocaleString(currentLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
        time.dateTime = message.createdAt;
        if(message.reference)bubble.append(node('small',message.reference,'shared-chat-reference',false));
        const content=node('div',undefined,'shared-chat-message-content');content.append(sender);const picture=avatar(message.sender.kind==='support'?(next.conversation.teamName||'UniMate Support'):message.sender.name,message.sender.avatarUrl,message.sender.kind==='support');
        if (message.body) bubble.append(body);
        if (message.attachments?.length) {
          const files = node('div', undefined, 'shared-chat-attachments');
          for (const attachment of message.attachments) {
            const file = node('div', undefined, 'shared-chat-attachment');
            const caption = node('span', attachment.filename,undefined,false);
            file.append(caption, node('small', 'Loading attachment…'));
            files.append(file);
            const cacheKey = `${identity}:${attachment.id}`;
            let cached = attachmentCache.get(cacheKey);
            if (!cached) {
              const controller = new AbortController();
              cached = { controller, url: '', promise: null };
              cached.promise = Promise.resolve().then(async () => {
                if (!attachmentTypes.has(attachment.mime) || !attachment.bytes || attachment.bytes > 5 * 1024 * 1024 || !props.loadAttachment) throw Error('Attachment unavailable.');
                const blob = await props.loadAttachment(attachment.url, controller.signal);
                if (disposed || controller.signal.aborted) throw Error('Attachment closed.');
                if (blob.type !== attachment.mime || !blob.size || blob.size > 5 * 1024 * 1024) throw Error('This attachment could not be opened.');
                cached.url = URL.createObjectURL(blob); return cached.url;
              });
              attachmentCache.set(cacheKey, cached);
            }
            cached.promise.then(url => {
              if (disposed || !file.isConnected) return;
              file.replaceChildren();
              if (attachment.mime.startsWith('image/')) {
                const open = button('', () => { largeImage.src=url;largeImage.alt=t('Chat photo');saveImage.href=url;saveImage.download=attachment.filename;imageDialog.showModal(); }, 'shared-chat-image-open');
                open.setAttribute('aria-label',t('Open photo'));
                const image = node('img'); image.src = url; image.alt = t('Chat photo'); open.append(image); file.append(open);
              }
              const download = node('a', attachment.mime === 'application/pdf' ? t('Download {filename}',{filename:attachment.filename}) : attachment.filename,undefined,false);
              download.href=url;download.download=attachment.filename;if(attachment.mime==='application/pdf')file.append(download);
            }).catch(() => { cached.failed = true; if (!disposed && file.isConnected) file.replaceChildren(caption, node('small', 'Attachment unavailable. Refresh to try again.')); });
          }
          bubble.append(files);
        }
        bubble.append(time);
        content.append(bubble);row.append(picture,content);
        messages.append(row);
      }
      if (!next.messages.length) messages.append(node('p', 'No messages in this conversation yet.', 'shared-chat-empty'));
      if ((changed || nearBottom) && next.page === 1) history.scrollTop = history.scrollHeight;
      else history.scrollTop = oldScroll;
      signature = nextSignature;
      const visibleIds = new Set(next.messages.flatMap(message => (message.attachments || []).map(attachment => `${identity}:${attachment.id}`)));
      for (const [key, cached] of attachmentCache) if (!visibleIds.has(key)) { cached.controller.abort(); if (cached.url) URL.revokeObjectURL(cached.url); attachmentCache.delete(key); }
    }
    updateControls();
  }
  const onLanguageChange=()=>{if(props&&!disposed)update(props);};
  container.ownerDocument.addEventListener?.('unimate-language-change',onLanguageChange);
  return {
    update,
    destroy() { stopLocalizing();
      container.ownerDocument.removeEventListener?.('unimate-language-change',onLanguageChange);
      disposed = true;
      tools.destroy();
      for(const entry of avatarCache.values()){entry.controller.abort();if(entry.url)URL.revokeObjectURL(entry.url);}avatarCache.clear();
      for (const cached of attachmentCache.values()) { cached.controller.abort(); if (cached.url) URL.revokeObjectURL(cached.url); }
      attachmentCache.clear();
      input.oninput = null;
      composer.onsubmit = null;
      container.replaceChildren();
    },
  };
}
