import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBookingDetails,readBookingSubmission} from '../public/booking-details.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6qjEAAAAASUVORK5CYII=';
const group=(row,key)=>normalizeBookingDetails(row).photoGroups.find(item=>item.key===key);

test('completed jobs preserve student intake and separate before/completion evidence',()=>{
  const row={id:'test-booking',service:'cleaning',customer:'Example Student',amount_pence:7500,submission:{booking:{date:'2026-10-20',time:'09:00–12:00',place:'Fictional test address',intake:{fields:[{label:'Bedrooms',value:'1'},{label:'Special instructions',value:'Test note'}],photos:[png]}},beforePhotos:[png],photos:[png]}};
  const copy=structuredClone(row),result=normalizeBookingDetails(row);
  assert.deepEqual(result.photoGroups.map(item=>[item.key,item.label]),[['request','Request photos'],['before','Before-service photos'],['completion','Completion photos']]);
  for(const key of ['request','before','completion'])assert.equal(group(row,key).photos[0].src,png);
  for(const expected of [{label:'Bedrooms',value:'1'},{label:'Booking amount',value:'£75.00'},{label:'Date',value:'2026-10-20'},{label:'Address / route',value:'Fictional test address'}])assert.ok(result.fields.some(field=>field.label===expected.label&&field.value===expected.value));
  assert.ok(!JSON.stringify(result.fields).includes('[object Object]'));
  assert.deepEqual(row,copy);
});

test('raw intake photos stay request photos, while legacy images and completionPhotos remain supported',()=>{
  const intake={submission:{fields:[{label:'Rooms',value:2}],photos:[png]}};
  assert.equal(group(intake,'request').photos.length,1);
  assert.equal(group(intake,'completion').photos.length,0);
  const legacy={submission:{images:[png],completionPhotos:[{uri:png}],beforePhotos:[png]}};
  assert.equal(group(legacy,'request').photos[0].src,png);
  assert.equal(group(legacy,'completion').photos[0].src,png);
});

test('device and browser references are labelled unavailable rather than rendered',()=>{
  for(const uri of ['file:///private/photo.jpg','content://device/photo','blob:https://example.invalid/photo']){
    const result=group({submission:{intake:{photos:[uri]}}},'request').photos[0];
    assert.equal(result.src,undefined);
    assert.match(result.unavailable,/original device.*not been uploaded/);
  }
});

test('remote, active, corrupt and unsupported image sources never render',()=>{
  const sources=['https://example.invalid/private.jpg','http://localhost/private.jpg','/uploads/photo.jpg','//example.invalid/photo.jpg','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,PHN2Zy8+','data:image/jpeg;base64,aGVsbG8=','data:image/png;base64,@@@@','data:image/png;base64,','data:image/png;base64,a===',null,{},42];
  for(const source of sources){const result=group({submission:{images:[source]}},'request').photos[0];assert.equal(result.src,undefined);assert.match(result.unavailable,/unavailable/i);}
});

test('oversized embedded images remain unavailable',()=>{
  const bytes=Buffer.alloc(5*1024*1024+1);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const result=group({submission:{images:['data:image/png;base64,'+bytes.toString('base64')]}},'request').photos[0];
  assert.equal(result.src,undefined);assert.match(result.unavailable,/5 MB/);
});

test('malformed or absent saved submission data has a safe empty result',()=>{
  for(const value of ['{bad','[]','null',null,[],false])assert.equal(readBookingSubmission(value),null);
  assert.deepEqual(readBookingSubmission('{"intake":{"photos":[]}}'),{intake:{photos:[]}});
  for(const row of [null,{},[],{submission:'{bad'},{submission:{fields:[null,{}],intake:{photos:'broken'}}}]){
    const result=normalizeBookingDetails(row);assert.equal(result.photoGroups.length,3);assert.ok(result.photoGroups.every(item=>item.photos.length===0));
  }
});

