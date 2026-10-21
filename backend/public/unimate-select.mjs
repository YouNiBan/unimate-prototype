let sequence=0;
const instances=new WeakMap();

/** Keep the original select for form values and change events; draw the menu in UniMate. */
export function enhanceSelect(select, host) {
  if(instances.has(select))return instances.get(select);
  if(select.multiple||select.size>1)return null;
  const doc=select.ownerDocument,win=doc.defaultView;
  const owned=!host;
  if(!host){host=doc.createElement('span');select.before(host);host.append(select);}
  host.classList.add('unimate-select');
  const trigger=doc.createElement('button'),label=doc.createElement('span'),arrow=doc.createElement('span'),menu=doc.createElement('div');
  trigger.type='button';trigger.className='unimate-select-trigger';
  trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  menu.id='unimate-select-'+(++sequence);menu.className='unimate-select-menu';menu.setAttribute('role','listbox');menu.hidden=true;
  if(typeof menu.showPopover==='function')menu.setAttribute('popover','manual');
  trigger.setAttribute('aria-controls',menu.id);arrow.className='unimate-select-chevron';arrow.setAttribute('aria-hidden','true');
  trigger.append(label,arrow);host.append(trigger,menu);
  select.classList.add('unimate-select-native');select.setAttribute('aria-hidden','true');select.tabIndex=-1;
  let buttons=[],search='',timer,opened=false;
  function refresh(){
    const current=select.selectedOptions[0];label.textContent=current?.textContent||'';
    trigger.disabled=select.matches(':disabled');
    const associated=select.labels?.[0]?.cloneNode(true);
    associated?.querySelectorAll('select,button,.unimate-select-menu').forEach(node=>node.remove());
    const name=select.getAttribute('aria-label')||associated?.textContent?.trim()||'Choose an option';
    trigger.setAttribute('aria-label',name);
    trigger.setAttribute('aria-required',String(select.required));
    menu.setAttribute('aria-label',name);
    if(select.getAttribute('aria-describedby'))trigger.setAttribute('aria-describedby',select.getAttribute('aria-describedby'));
  }
  function close(focus=false){
    if(opened&&typeof menu.hidePopover==='function')menu.hidePopover();
    opened=false;menu.hidden=true;trigger.setAttribute('aria-expanded','false');
    if(focus&&trigger.isConnected)trigger.focus();
  }
  function focusOption(index){
    const enabled=buttons.filter(button=>!button.disabled);
    if(!enabled.length)return;
    enabled[(index+enabled.length)%enabled.length].focus();
  }
  function open(){
    refresh();if(trigger.disabled)return;
    menu.replaceChildren();buttons=[];
    for(const option of select.options){
      if(option.hidden)continue;
      const item=doc.createElement('button'),text=doc.createElement('span'),check=doc.createElement('span');
      item.type='button';item.className='unimate-select-option';item.setAttribute('role','option');
      item.setAttribute('aria-selected',String(option.selected));item.tabIndex=-1;
      item.disabled=option.disabled||option.parentElement?.disabled===true;
      text.textContent=option.textContent;check.textContent='✓';check.className='unimate-select-check';check.setAttribute('aria-hidden','true');
      item.append(text,check);menu.append(item);buttons.push(item);
      item.onclick=event=>{
        event.preventDefault();select.value=option.value;refresh();close(true);
        select.dispatchEvent(new win.Event('input',{bubbles:true}));
        select.dispatchEvent(new win.Event('change',{bubbles:true}));
      };
    }
    menu.hidden=false;opened=true;trigger.setAttribute('aria-expanded','true');
    if(typeof menu.showPopover==='function')menu.showPopover();
    const rect=trigger.getBoundingClientRect(),width=Math.min(Math.max(rect.width,180),win.innerWidth-24);
    const below=win.innerHeight-rect.bottom-12,above=rect.top-12,up=below<180&&above>below;
    const height=Math.min(280,Math.max(90,up?above:below));
    menu.style.width=width+'px';menu.style.maxHeight=height+'px';
    menu.style.left=Math.max(12,Math.min(rect.left,win.innerWidth-width-12))+'px';
    menu.style.top=(up?Math.max(8,rect.top-Math.min(menu.scrollHeight,height)-6):rect.bottom+6)+'px';
    (buttons.find(button=>button.getAttribute('aria-selected')==='true'&&!button.disabled)||buttons.find(button=>!button.disabled))?.focus();
  }
  trigger.onclick=event=>{event.preventDefault();opened?close(true):open();};
  trigger.onkeydown=event=>{
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();open();if(event.key==='Home')focusOption(0);if(event.key==='End')focusOption(-1);}
  };
  menu.onkeydown=event=>{
    const enabled=buttons.filter(button=>!button.disabled),index=enabled.indexOf(doc.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();focusOption(event.key==='Home'?0:event.key==='End'?-1:index+(event.key==='ArrowDown'?1:-1));
    }else if(event.key==='Escape'){event.preventDefault();close(true);}
    else if(event.key==='Tab'){close(true);}
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key!==' '){
      event.preventDefault();clearTimeout(timer);search+=event.key.toLocaleLowerCase();
      enabled.find(button=>button.textContent.trim().toLocaleLowerCase().startsWith(search))?.focus();
      timer=setTimeout(()=>{search='';},650);
    }
  };
  const outside=event=>{if(!host.contains(event.target))close();};
  const scroll=event=>{if(opened&&!menu.contains(event.target))close();};
  const invalid=event=>{event.preventDefault();trigger.focus();};
  const reset=()=>queueMicrotask(refresh);
  doc.addEventListener('pointerdown',outside);win.addEventListener('resize',close);
  doc.addEventListener('scroll',scroll,true);select.addEventListener('change',refresh);select.addEventListener('invalid',invalid);select.form?.addEventListener('reset',reset);
  const instance={refresh,destroy(){
    close();clearTimeout(timer);doc.removeEventListener('pointerdown',outside);win.removeEventListener('resize',close);doc.removeEventListener('scroll',scroll,true);
    select.removeEventListener('change',refresh);select.removeEventListener('invalid',invalid);select.form?.removeEventListener('reset',reset);
    trigger.remove();menu.remove();select.classList.remove('unimate-select-native');select.removeAttribute('aria-hidden');select.removeAttribute('tabindex');
    if(owned&&host.parentNode){host.before(select);host.remove();}instances.delete(select);
  }};
  instances.set(select,instance);refresh();return instance;
}

export function installSelects(root){
  const tracked=new Map();
  const scan=node=>{
    if(node.nodeType!==1)return;
    for(const select of [...(node.matches('select')?[node]:[]),...node.querySelectorAll('select')]){
      if(!tracked.has(select)){const item=enhanceSelect(select);if(item)tracked.set(select,item);}
    }
  };
  scan(root);
  const observer=new MutationObserver(records=>{
    for(const [select,item] of tracked)if(!root.contains(select)){item.destroy();tracked.delete(select);}
    for(const record of records){
      const select=record.target.nodeType===1?record.target.closest('select'):record.target.parentElement?.closest('select');
      if(select)tracked.get(select)?.refresh();
      for(const node of record.addedNodes||[])scan(node);
      if(record.type==='attributes'&&record.target.matches?.('fieldset'))record.target.querySelectorAll('select').forEach(select=>tracked.get(select)?.refresh());
    }
  });
  observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','selected','aria-label']});
  return ()=>{observer.disconnect();for(const item of tracked.values())item.destroy();};
}
