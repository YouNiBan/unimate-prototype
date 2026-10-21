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
  const attach = button('📎', () => files.click()); attach.title = 'Add attachments'; attach.setAttribute('aria-label', 'Add attachments');
  const emoji = button('☺', () => { picker.hidden = !picker.hidden; emoji.setAttribute('aria-expanded', String(!picker.hidden)); if (!picker.hidden) picker.children[0]?.focus(); });
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
  const attachmentCache = new Map();
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
  const largeImage = node('img');
  imageDialog.append(closeImage, largeImage);
  imageDialog.onclick = event => { if (event.target === imageDialog) imageDialog.close(); };
  root.append(head, history, closed, feedback, composer, imageDialog);
  container.replaceChildren(root);

  function updateControls() {
    if (!props) return;
    const isClosed = props.conversation.status === 'closed';
    status.hidden = !isClosed && props.viewer !== 'support';
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
    participant.textContent = next.viewer === 'support'
      ? `${next.conversation.participant.name} · ${t(next.conversation.participant.role === 'staff' ? 'Staff' : 'Student')}`
      : t(next.conversation.teamName||'UniMate Support');
    const category = { general: 'General enquiry', booking: 'Booking help', technical: 'Technical help' }[next.conversation.category] || 'Support';
    meta.textContent = `${next.conversation.reference ? next.conversation.reference+' · ' : ''}${t(category)} · ${t(next.conversation.status === 'closed' ? 'Closed' : 'Open')}${next.conversation.bookingId ? ` · ${t('Booking')} ${next.conversation.bookingId}` : ''}`;
    earlier.hidden = next.page * 50 >= next.total;
    newer.hidden = next.page <= 1;
    const nextSignature = JSON.stringify([currentLocale(), next.page, next.messages]);
    for (const [key, cached] of attachmentCache) if (cached.failed) { attachmentCache.delete(key); signature = ''; }
    if (nextSignature !== signature) {
      const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 100;
      const oldScroll = history.scrollTop;
      messages.replaceChildren();
      for (const message of next.messages) {
        const own = (next.viewer === 'support') === (message.sender.kind === 'support');
        const row = node('article', undefined, `shared-chat-message${own ? ' is-own' : ''}`);
        const bubble = node('div', undefined, 'shared-chat-bubble');
        const sender = node('strong', message.sender.kind === 'support' ? (next.viewer==='support'?`${t(next.conversation.teamName||'UniMate Support')} · ${message.sender.name}`:t(next.conversation.teamName||'UniMate Support')) : message.sender.name, 'shared-chat-sender',false);
        const body = node('p', message.body,undefined,false);
        const date = new Date(message.createdAt);
        const time = node('time', Number.isNaN(date.getTime()) ? '' : date.toLocaleString(currentLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
        time.dateTime = message.createdAt;
        if(message.reference)bubble.append(node('small',message.reference,'shared-chat-reference',false));
        bubble.append(sender);
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
                const open = button('', () => { largeImage.src = url; largeImage.alt = attachment.filename; imageDialog.showModal(); }, 'shared-chat-image-open');
                open.setAttribute('aria-label', t('Enlarge {filename}',{filename:attachment.filename}));
                const image = node('img'); image.src = url; image.alt = attachment.filename; open.append(image); file.append(open);
              }
              const download = node('a', attachment.mime === 'application/pdf' ? t('Download {filename}',{filename:attachment.filename}) : attachment.filename,undefined,false);
              download.href = url; download.download = attachment.filename; file.append(download);
            }).catch(() => { cached.failed = true; if (!disposed && file.isConnected) file.replaceChildren(caption, node('small', 'Attachment unavailable. Refresh to try again.')); });
          }
          bubble.append(files);
        }
        bubble.append(time);
        row.append(bubble);
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
      for (const cached of attachmentCache.values()) { cached.controller.abort(); if (cached.url) URL.revokeObjectURL(cached.url); }
      attachmentCache.clear();
      input.oninput = null;
      composer.onsubmit = null;
      container.replaceChildren();
    },
  };
}
