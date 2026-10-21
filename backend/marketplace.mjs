import {randomUUID} from 'node:crypto';
import {audit,transaction} from './database.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function createMarketplace(db){
  db.exec(`CREATE TABLE IF NOT EXISTS marketplace_products(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,price_pence INTEGER NOT NULL,stock INTEGER NOT NULL,photo TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  return {
    list({published=false,q='',page=1}={}){
      if(!Number.isSafeInteger(page)||page<1||page>100000||q.length>100)fail(400,'Check your product search.');
      const where=(published?"status='published' AND ":'')+"(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')",term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
      return {rows:db.prepare(`SELECT * FROM marketplace_products WHERE ${where} ORDER BY updated_at DESC,id LIMIT 24 OFFSET ?`).all(term,term,(page-1)*24),total:db.prepare(`SELECT count(*) n FROM marketplace_products WHERE ${where}`).get(term,term).n,page};
    },
    save(actor,data){
      if(!['owner','superadmin'].includes(actor?.role))fail(403,'Owner or SuperAdmin access required.');
      const title=typeof data.title==='string'?data.title.trim():'',description=typeof data.description==='string'?data.description.trim():'';
      if(title.length<2||title.length>120||description.length>2000||!Number.isSafeInteger(data.pricePence)||data.pricePence<0||data.pricePence>10000000||!Number.isSafeInteger(data.stock)||data.stock<0||data.stock>100000||!['draft','published','archived'].includes(data.status))fail(400,'Check the title, price, stock and status.');
      const photo=data.photo||'';
      if(typeof photo!=='string'||photo.length>1400000)fail(400,'Choose a photo under 1 MB.');
      if(photo){const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);if(!match)fail(400,'Use a PNG, JPEG or WebP photo.');const bytes=Buffer.from(match[2],'base64');if(bytes.length>1048576||!(match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'))fail(400,'This photo format is not valid.');}
      if(data.status==='published'&&(!photo||!description))fail(400,'Add a photo and description before publishing.');
      return transaction(db,()=>{const before=data.id?db.prepare('SELECT * FROM marketplace_products WHERE id=?').get(data.id):null;
        if(data.id&&!before)fail(404,'Product not found.');if(before&&before.version!==data.version)fail(409,'This product changed. Refresh before saving.');
        const id=before?.id||randomUUID(),now=new Date().toISOString();
        db.prepare('INSERT INTO marketplace_products VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,price_pence=excluded.price_pence,stock=excluded.stock,photo=excluded.photo,status=excluded.status,version=excluded.version,updated_at=excluded.updated_at').run(id,title,description,data.pricePence,data.stock,photo,data.status,(before?.version||0)+1,before?.created_at||now,now);
        audit(db,actor,'marketplace.product_saved','marketplace_products',id,before?{title:before.title,status:before.status}:null,{title,status:data.status},'UniMate catalogue updated');return {id};
      });
    }
  };
}
