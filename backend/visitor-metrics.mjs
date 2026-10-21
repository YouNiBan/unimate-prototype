const endpoint='https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1&dimension1=Country%2FRegion';
const number=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0?n:0;};
export function summariseVisitors(payload){
 const traffic=Array.isArray(payload)?payload.find(row=>row.metricName==='Traffic'):null;
 const rows=Array.isArray(traffic?.information)?traffic.information:[];
 const regions=rows.slice(0,1000).map(row=>({region:String(row['Country/Region']||row.Country||'Unknown').slice(0,80),sessions:number(row.totalSessionCount),visitors:number(row.distinctUserCount ?? row.distantUserCount)})).filter(row=>row.sessions>0||row.visitors>0).sort((a,b)=>b.sessions-a.sessions);
 return {sessions:regions.reduce((n,r)=>n+r.sessions,0),regions:regions.slice(0,20),truncated:rows.length>=1000};
}
export function createVisitorMetrics({db,token=process.env.UNIMATE_CLARITY_EXPORT_TOKEN,fetcher=fetch,clock=Date.now}){
 db.exec('CREATE TABLE IF NOT EXISTS visitor_metrics_cache (id INTEGER PRIMARY KEY CHECK(id=1), attempted_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, payload TEXT)');
 db.prepare('INSERT OR IGNORE INTO visitor_metrics_cache(id) VALUES(1)').run();
 let pending;
 function read(){const row=db.prepare('SELECT * FROM visitor_metrics_cache WHERE id=1').get();return {configured:!!token,updatedAt:row.updated_at?new Date(row.updated_at).toISOString():null,periodHours:24,...(row.payload?JSON.parse(row.payload):{sessions:null,regions:[]}),stale:!!row.updated_at&&clock()-row.updated_at>8*3600000};}
 async function snapshot(){
  if(!token)return read();
  const row=db.prepare('SELECT * FROM visitor_metrics_cache WHERE id=1').get();
  // Persist the attempt before fetching, so restarts and refreshes cannot exhaust
  // Clarity's 10-requests/day quota. At most six calls per rolling 24 hours.
  if(clock()-row.attempted_at<4*3600000)return pending?pending:read();
  db.prepare('UPDATE visitor_metrics_cache SET attempted_at=? WHERE id=1').run(clock());
  pending=(async()=>{try{const response=await fetcher(endpoint,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});if(!response.ok)return {...read(),unavailable:true};const payload=summariseVisitors(await response.json());db.prepare('UPDATE visitor_metrics_cache SET updated_at=?,payload=? WHERE id=1').run(clock(),JSON.stringify(payload));return read();}catch{return {...read(),unavailable:true};}finally{pending=null;}})();return pending;
 }
 return {snapshot};
}
