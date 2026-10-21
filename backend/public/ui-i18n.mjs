import {uiTranslations} from './ui-translations.mjs';
/** @param {string} language @param {string|number|null|undefined} text @param {Record<string,string|number>} values */
export function translateUi(language, text, values={}) {
  const source=String(text??'');
  const copy=language==='EN'?source:(uiTranslations[source]?.[language==='简体'?0:1]??source);
  return copy.replace(/\{(\w+)\}/g,(match,key)=>values[key]===undefined?match:String(values[key]));
}
export const languageLocale=language=>language==='简体'?'zh-CN':language==='繁體'?'zh-TW':'en-GB';
let currentLanguage='EN';
const textBindings=new Map(),attributeBindings=new Map();
export const translateCurrent=(text,values={})=>translateUi(currentLanguage,text,values);
export const currentLocale=()=>languageLocale(currentLanguage);
export function setUiLanguage(language){
  currentLanguage=['EN','简体','繁體'].includes(language)?language:'EN';
  for(const [node,source] of textBindings){if(node.isConnected)node.textContent=translateCurrent(typeof source==='function'?source():source);else textBindings.delete(node);}
  for(const [node,attributes] of attributeBindings){if(!node.isConnected){attributeBindings.delete(node);continue;}for(const [key,state] of attributes){state.rendered=translateCurrent(state.source);node.setAttribute(key,state.rendered);}}
}
/** Bind known interface copy only; pass false for user-provided content. */
export function bindText(node,source,localize=true){
  const text=typeof source==='function'?source():String(source??'');
  node.textContent=localize?translateCurrent(text):text;
  if(localize&&(typeof source==='function'||Object.hasOwn(uiTranslations,text)))textBindings.set(node,source);else textBindings.delete(node);
  return node;
}
/** Translate UI attributes without touching input values or saved content. */
export function observeUiAttributes(root){
  const attributes=['aria-label','title','placeholder'];
  const update=node=>{
    if(node.nodeType!==1)return;
    for(const key of attributes){const source=node.getAttribute(key);if(!source)continue;const previous=attributeBindings.get(node)?.get(key);if(previous?.rendered===source)continue;if(!Object.hasOwn(uiTranslations,source)){attributeBindings.get(node)?.delete(key);continue;}let bindings=attributeBindings.get(node);if(!bindings){bindings=new Map();attributeBindings.set(node,bindings);}const state={source,rendered:translateCurrent(source)};bindings.set(key,state);if(state.rendered!==source)node.setAttribute(key,state.rendered);}
  };
  const scan=node=>{update(node);node.querySelectorAll?.('[aria-label],[title],[placeholder]').forEach(update);};scan(root);
  if(typeof MutationObserver==='undefined')return ()=>{};
  const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')update(record.target);else record.addedNodes.forEach(scan);}});
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:attributes});
  return ()=>observer.disconnect();
}
