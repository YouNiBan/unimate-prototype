import test from 'node:test';import assert from 'node:assert/strict';import {openDatabase} from '../database.mjs';import {createMarketplace} from '../marketplace.mjs';
test('UniMate catalogue separates drafts, validates photos and prices, and protects updates',t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1)').run('owner','owner@example.invalid','Owner','unused','owner');const market=createMarketplace(db),owner={id:'owner',name:'Owner',role:'owner'};
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ZkAAAAASUVORK5CYII=';
 const draft={title:'Notebook',description:'Student notebook',pricePence:500,stock:2,status:'draft',photo};
 assert.throws(()=>market.save({role:'support'},draft),/access required/);assert.throws(()=>market.save(owner,{...draft,pricePence:-1}),/Check/);assert.throws(()=>market.save(owner,{...draft,photo:'data:image/svg+xml;base64,PHN2Zz4='}),/PNG/);
 const {id}=market.save(owner,draft);assert.equal(market.list({published:true}).total,0);assert.equal(market.list().total,1);
 market.save(owner,{...draft,id,version:1,status:'published'});assert.equal(market.list({published:true}).rows[0].id,id);assert.equal(market.list({published:true,q:'unmatched'}).total,0);
 assert.throws(()=>market.save(owner,{...draft,id,version:1}),/changed/);market.save(owner,{...draft,id,version:2,status:'archived'});assert.equal(market.list({published:true}).total,0);
});
