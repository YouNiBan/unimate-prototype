// Aggregate only: never retain request URLs, identities, messages or payment data.
const bounds=[10,25,50,100,250,500,1000,2500,5000,10000,Infinity];
export function createAppMetrics({clock=Date.now,monotonic=()=>performance.now()}={}){
 const startedAt=clock(),buckets=new Map();
 function prune(now){for(const minute of buckets.keys())if(minute<Math.floor(now/60000)-14)buckets.delete(minute);}
 function observe(req,res){
  const path=(req.url||'').split('?')[0];
  if(!path.startsWith('/api/')||['/api/health','/api/app-metrics','/api/visitor-metrics'].includes(path))return;
  const start=monotonic();let done=false;
  const finish=()=>{if(done)return;done=true;res.removeListener('finish',finish);res.removeListener('close',finish);const now=clock();prune(now);const minute=Math.floor(now/60000);let b=buckets.get(minute);if(!b){b={requests:0,errors:0,rejected:0,totalMs:0,hist:bounds.map(()=>0)};buckets.set(minute,b);}const elapsed=Math.max(0,monotonic()-start);b.requests++;b.errors+=!res.writableFinished||res.statusCode>=500?1:0;b.rejected+=res.statusCode>=400&&res.statusCode<500?1:0;b.totalMs+=elapsed;b.hist[bounds.findIndex(n=>elapsed<=n)]++;};
  res.once('finish',finish);res.once('close',finish);
 }
 function snapshot(){const now=clock();prune(now);const total={requests:0,errors:0,rejected:0,totalMs:0,hist:bounds.map(()=>0)};for(const b of buckets.values()){for(const k of ['requests','errors','rejected','totalMs'])total[k]+=b[k];b.hist.forEach((n,i)=>total.hist[i]+=n);}let cumulative=0,p95Ms=null;for(let i=0;i<bounds.length&&total.requests;i++){cumulative+=total.hist[i];if(cumulative>=Math.ceil(total.requests*.95)){p95Ms=Number.isFinite(bounds[i])?bounds[i]:null;break;}}
 return {sampledAt:new Date(now).toISOString(),startedAt:new Date(startedAt).toISOString(),windowMinutes:15,uptimeSeconds:Math.floor((now-startedAt)/1000),requests:total.requests,serverErrors:total.errors,clientErrors:total.rejected,errorPercent:total.requests?100*total.errors/total.requests:null,averageMs:total.requests?Math.round(total.totalMs/total.requests):null,p95UpperBoundMs:p95Ms,memoryMb:Math.round(process.memoryUsage().rss/1024/1024),history:Array.from({length:15},(_,i)=>{const minute=Math.floor(now/60000)-14+i,b=buckets.get(minute);return {at:new Date(minute*60000).toISOString(),requests:b?.requests||0,errors:b?.errors||0};})};}
 return {observe,snapshot};
}
