import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('notification bell opens expanded centre on New; All and Seen remain explicit options',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(source,/async function notifications\(taskPage=1,taskFilter='new'\)/);
 assert.match(source,/classList.add\('notifications-dialog','notifications-expanded'\)/);
 assert.match(source,/\[\['all','All'\],\['new','New'\],\['seen','Seen'\]\]/);
});
