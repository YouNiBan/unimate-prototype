const choices=[['EN','English'],['简体','简体中文'],['繁體','繁體中文']];
let sequence=0;
/** @param {HTMLElement} host
 * @param {{value?: 'EN'|'简体'|'繁體', onChange?: (value: 'EN'|'简体'|'繁體') => void, label?: string}} options
 */
export function createLanguagePicker(host,{value='EN',onChange,label='Language'}={}){
 const doc=host.ownerDocument,root=doc.createElement('div'),trigger=doc.createElement('button'),menu=doc.createElement('div'),code=doc.createElement('span'),chevron=doc.createElement('span');
 root.className='unimate-language';trigger.className='unimate-language-trigger';trigger.type='button';trigger.setAttribute('aria-haspopup','menu');menu.id='unimate-language-'+(++sequence);trigger.setAttribute('aria-controls',menu.id);menu.className='unimate-language-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',label);menu.hidden=true;
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');svg.setAttribute('aria-hidden','true');const path=doc.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18ZM5 7h14M5 17h14');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.5');svg.append(path);chevron.className='unimate-language-chevron';chevron.setAttribute('aria-hidden','true');trigger.append(svg,code,chevron);root.append(trigger,menu);host.append(root);
 let current=value;
 const options=choices.map(([id,name])=>{const button=doc.createElement('button'),short=doc.createElement('span'),title=doc.createElement('span'),check=doc.createElement('span');button.type='button';button.setAttribute('role','menuitemradio');button.dataset.languageCode=id;short.className='unimate-language-code';short.textContent=id;title.textContent=name;check.className='unimate-language-check';check.textContent='✓';check.setAttribute('aria-hidden','true');button.append(short,title,check);button.onclick=()=>{update(id);close(true);onChange?.(id);};menu.append(button);return button;});
 function update(next,nextLabel){if(nextLabel){label=nextLabel;menu.setAttribute('aria-label',label);}current=next;code.textContent=next;trigger.setAttribute('aria-label',label+': '+(choices.find(c=>c[0]===next)?.[1]||next));for(const option of options)option.setAttribute('aria-checked',String(option.dataset.languageCode===next));}
 function close(focus=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
 function open(){menu.hidden=false;trigger.setAttribute('aria-expanded','true');options.find(o=>o.dataset.languageCode===current)?.focus();}
 trigger.onclick=()=>menu.hidden?open():close();trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}if(e.key==='Escape')close(true);};
 menu.onkeydown=e=>{const index=options.indexOf(doc.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next].focus();}if(e.key==='Escape'){e.preventDefault();close(true);}if(e.key==='Tab')close(true);};
 const outside=e=>{if(!root.contains(e.target))close();};doc.addEventListener('pointerdown',outside);update(value);close();
 return {update,destroy(){doc.removeEventListener('pointerdown',outside);root.remove();}};
}
