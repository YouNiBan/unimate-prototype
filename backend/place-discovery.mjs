import {transaction} from './database.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const types=['all','restaurant','massage','nail_salon','pottery','tufting','activity'];
export const placeFilters=['All','Top rated','£','££','£££','Activities','Italian','Chinese','Thai','Korean','BBQ','Burger','Steak','Indian','Under £20','Birthday','Family','Date night'];
export function createPlaceDiscovery(db,{now=()=>new Date()}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS member_place_bookmarks(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,created_at TEXT NOT NULL,PRIMARY KEY(user_id,restaurant_id));
 CREATE TABLE IF NOT EXISTS member_place_visits(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,visited_on TEXT NOT NULL,PRIMARY KEY(user_id,restaurant_id));`);
 const current=user=>{if(!user?.id||!db.prepare("SELECT u.id FROM users u JOIN member_credentials c ON c.user_id=u.id WHERE u.id=? AND u.status='active' AND c.verified_at IS NOT NULL").get(user.id))fail(401,'Please sign in again.');};
 const published=id=>{if(typeof id!=='string'||!db.prepare("SELECT id FROM restaurants WHERE id=? AND status='published'").get(id))fail(404,'Place not found.');};
 const verified=`(EXISTS(SELECT 1 FROM student_verifications v WHERE v.user_id=u.id) OR EXISTS(SELECT 1 FROM member_controls c WHERE c.user_id=u.id AND c.verified_at IS NOT NULL AND c.deleted_at IS NULL))`;
 const cte=`WITH eligible AS (
 SELECT r.restaurant_id,r.user_id,r.rating,r.body,r.updated_at FROM restaurant_student_reviews r JOIN users u ON u.id=r.user_id WHERE u.status='active' AND ${verified}
 ), scores AS (
 SELECT restaurant_id,rating,body,updated_at FROM eligible UNION ALL
 SELECT r.restaurant_id,r.rating,r.review body,r.updated_at FROM official_food_reviews r JOIN admins a ON a.id=r.author_id WHERE r.status='published' AND a.active=1
 ), friends AS (
 SELECT CASE WHEN sender_id=@user THEN recipient_id ELSE sender_id END id FROM student_connections WHERE status='accepted' AND (sender_id=@user OR recipient_id=@user)
 ), places AS (
 SELECT r.*, (SELECT count(*) FROM scores s WHERE s.restaurant_id=r.id) reviewCount,
 (SELECT round(avg(s.rating),1) FROM scores s WHERE s.restaurant_id=r.id) rating,
 (SELECT s.body FROM scores s WHERE s.restaurant_id=r.id ORDER BY s.updated_at DESC LIMIT 1) quote,
 (SELECT count(*) FROM scores s WHERE s.restaurant_id=r.id AND s.updated_at>=@recent) recentReviews,
 (SELECT count(*) FROM eligible e JOIN friends f ON f.id=e.user_id WHERE e.restaurant_id=r.id) friendCount,
 (SELECT round(avg(e.rating),1) FROM eligible e JOIN friends f ON f.id=e.user_id WHERE e.restaurant_id=r.id) friendRating,
 EXISTS(SELECT 1 FROM member_place_bookmarks b WHERE b.restaurant_id=r.id AND b.user_id=@user) saved,
 (SELECT visited_on FROM member_place_visits v WHERE v.restaurant_id=r.id AND v.user_id=@user) visitedOn,
 EXISTS(SELECT 1 FROM eligible e WHERE e.restaurant_id=r.id AND e.user_id=@user) reviewed,
 EXISTS(SELECT 1 FROM restaurant_previews p WHERE p.restaurant_id=r.id) hasPhoto
 FROM restaurants r WHERE r.status='published'
 ) `;
 function filterSql(filter){
  if(filter==='All')return '1';
  if(filter==='Top rated')return 'rating>=4.7';
  if(filter==='Under £20')return 'maximum_spend_pence IS NOT NULL AND maximum_spend_pence<=2000';
  if(filter==='Activities')return "place_type<>'restaurant'";
  if(['£','££','£££'].includes(filter))return 'price_band=@filter';
  return "(instr(lower(cuisine),lower(@filter))>0 OR instr(lower(category),lower(@filter))>0)";
 }
 const map=row=>({...row,saved:!!row.saved,reviewed:!!row.reviewed,previewPhoto:row.hasPhoto?{filename:row.name,url:'/api/member/restaurants/'+encodeURIComponent(row.id)+'/photo'}:null});
 function list(user,{q='',type='restaurant',mode='discover',filter='All',page=1}={}){
  current(user);
  if(typeof q!=='string'||q.length>100||!types.includes(type)||!['discover','trending','friends','saved','visited'].includes(mode)||!placeFilters.includes(filter)||!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'Check the place filters and search.');
  const date=now(),recent=new Date(date.getTime()-30*86400000).toISOString(),params={user:user.id,recent,filter};
  const conditions=[filterSql(filter)];
  if(type!=='all'){conditions.push('place_type=@type');params.type=type;}
  if(q.trim()){conditions.push("(name LIKE @q ESCAPE '\\' OR cuisine LIKE @q ESCAPE '\\' OR category LIKE @q ESCAPE '\\' OR area LIKE @q ESCAPE '\\' OR city LIKE @q ESCAPE '\\')");params.q='%'+q.trim().replace(/[\\%_]/g,'\\$&')+'%';}
  if(mode==='friends')conditions.push('friendCount>0');
  if(mode==='saved')conditions.push('saved=1');
  if(mode==='visited')conditions.push('(visitedOn IS NOT NULL OR reviewed=1)');
  const where=conditions.join(' AND '),order=mode==='trending'?'recentReviews DESC,reviewCount DESC,rating DESC':mode==='friends'?'friendRating DESC,friendCount DESC':mode==='visited'?'visitedOn DESC':filter==='Top rated'?'rating DESC,reviewCount DESC':'friendCount DESC,reviewCount DESC,rating DESC';
  // Unknown named bindings are deliberately allowed: each safe query consumes
  // only the supplied whitelisted bindings it needs, never interpolated input.
  const query=sql=>{const statement=db.prepare(sql);statement.setAllowUnknownNamedParameters(true);return statement;};
  const rows=query(cte+'SELECT * FROM places WHERE '+where+' ORDER BY '+order+',name COLLATE NOCASE,id LIMIT 24 OFFSET @offset').all({...params,offset:(page-1)*24}).map(map);
  const total=query(cte+'SELECT count(*) n FROM places WHERE '+where).get(params).n;
  const features=[['under20','Top 10 under £20','Under £20'],['birthday','Best for birthdays','Birthday'],['activities','Social activities','Activities'],['friends','Friend favourites',null],['rated','Top student rated','Top rated']].map(([id,title,value])=>{
   const condition=id==='friends'?'friendCount>0':filterSql(value),featureParams={user:user.id,recent,filter:value||'All'};
   const count=query(cte+'SELECT count(*) n FROM places WHERE '+condition).get(featureParams).n;
   const cover=query(cte+'SELECT id,name,hasPhoto FROM places WHERE '+condition+' ORDER BY rating DESC,reviewCount DESC,name LIMIT 1').get(featureParams);
   return {id,title,filter:value,mode:id==='friends'?'friends':'discover',count,photo:cover?.hasPhoto?{filename:cover.name,url:'/api/member/restaurants/'+encodeURIComponent(cover.id)+'/photo'}:null};
  });
  return {rows,total,page,features};
 }
 function bookmark(user,data){return transaction(db,()=>{current(user);published(data.restaurantId);if(typeof data.saved!=='boolean')fail(400,'Choose whether to save this place.');if(data.saved)db.prepare('INSERT OR IGNORE INTO member_place_bookmarks VALUES(?,?,?)').run(user.id,data.restaurantId,now().toISOString());else db.prepare('DELETE FROM member_place_bookmarks WHERE user_id=? AND restaurant_id=?').run(user.id,data.restaurantId);return {saved:data.saved};});}
 function visit(user,data){return transaction(db,()=>{current(user);published(data.restaurantId);const value=data.visitedOn;if(value!==null){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>now().toISOString().slice(0,10)||value<'2000-01-01')fail(400,'Choose a valid past visit date.');db.prepare('INSERT INTO member_place_visits VALUES(?,?,?) ON CONFLICT(user_id,restaurant_id) DO UPDATE SET visited_on=excluded.visited_on').run(user.id,data.restaurantId,value);}else db.prepare('DELETE FROM member_place_visits WHERE user_id=? AND restaurant_id=?').run(user.id,data.restaurantId);return {visitedOn:value};});}
 return {list,bookmark,visit};
}
