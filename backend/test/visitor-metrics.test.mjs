import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createVisitorMetrics,summariseVisitors} from '../visitor-metrics.mjs';
test('exports aggregate counts only, and keeps persisted refresh budget on errors and restarts',async()=>{
 const db=new DatabaseSync(':memory:');let now=Date.now(),calls=0;
 const payload=[{metricName:'Traffic',information:[{'Country/Region':'UK',totalSessionCount:'4',distinctUserCount:'3',private:'secret'},{Country:'France',totalSessionCount:'2',distantUserCount:'1'}]}];
 const expected=summariseVisitors(payload);assert.equal(expected.sessions,6);assert.equal(expected.regions[0].visitors,3);assert.equal(summariseVisitors([{metricName:'Traffic',information:[{totalSessionCount:0,distinctUserCount:0}]}]).regions.length,0);assert.equal(expected.regions[0].region,'UK');assert.ok(!JSON.stringify(expected).includes('secret'));
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>payload};};
 let metrics=createVisitorMetrics({db,token:'test',clock:()=>now,fetcher});
 await Promise.all([metrics.snapshot(),metrics.snapshot()]);assert.equal(calls,1);
 metrics=createVisitorMetrics({db,token:'test',clock:()=>now,fetcher});await metrics.snapshot();assert.equal(calls,1);
 now+=4*3600000;await metrics.snapshot();assert.equal(calls,2);
 now+=4*3600000;metrics=createVisitorMetrics({db,token:'test',clock:()=>now,fetcher:async()=>{calls++;throw Error('private');}});const result=await metrics.snapshot();assert.equal(result.sessions,6);assert.equal(result.unavailable,true);await metrics.snapshot();assert.equal(calls,3);
 assert.equal((await createVisitorMetrics({db,token:'',fetcher}).snapshot()).configured,false);db.close();
});
