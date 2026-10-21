import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';

// Only exported web assets are public. Never serve the backend or its data directory.
export async function serveDemoWeb(req,res,path,directory) {
  if(req.method!=='GET'||!directory||!(path==='/'||path==='/index.html'||path==='/favicon.ico'||path.startsWith('/_expo/')||path.startsWith('/assets/')))return false;
  const root=resolve(directory),file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep))return false;
  let bytes;try{bytes=await readFile(file);}catch{res.writeHead(404);res.end('Not found');return true;}
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json'};
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(bytes);return true;
}
