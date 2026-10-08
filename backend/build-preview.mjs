// Build an explicitly public, read-only snapshot. Never read the database or uploads.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const source=new URL('./public/',import.meta.url),out=new URL('../public/administration/',import.meta.url);
await mkdir(out,{recursive:true});
let code=await readFile(new URL('app.js',source),'utf8');
const start=code.indexOf('async function api(path, data) {'),end=code.indexOf('\nfunction field(',start);
if(start<0||end<0)throw Error('Preview API boundary not found');
code=code.slice(0,start)+'async function api(path,data){return previewApi(path,data);}\n'+code.slice(end);
code=code.replace("img.src='/unimate-logo.png'","img.src='./unimate-logo.png'")
 .replaceAll('LOCAL WORKSPACE — These records are not connected to the live UniMate app. Sample records, if loaded, are fictional.','PUBLIC DEMO — Fictional sample records only. Read-only: no real accounts, documents or live services.');
const adapter=await readFile(new URL('./preview-data.js',import.meta.url),'utf8');
code=code.replace('init().catch(error=>message(error.message));',adapter+'\ninit().catch(error=>message(error.message));');
if(code.includes("fetch("))throw Error('Public preview must not contain network calls');
await writeFile(new URL('app.js',out),code);
await copyFile(new URL('styles.css',source),new URL('styles.css',out));
await copyFile(new URL('../assets/unimate-logo.png',import.meta.url),new URL('unimate-logo.png',out));
await writeFile(new URL('index.html',out),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'"><title>UNIMATE 优你伴 Administration · Demo</title><link rel="stylesheet" href="./styles.css"><script src="./app.js" defer></script></head><body><div id="app"></div><p id="notice" role="status" aria-live="polite"></p><dialog id="detail"></dialog></body></html>`);
console.log('Public fictional-data preview built. No backend data read.');
