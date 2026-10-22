// A bounded, deterministic safety layer, not a guarantee of universal moderation.
// Match ordinary words as whole segments to avoid blocking names such as Scunthorpe.
const words=new Set(['fuck','fucker','fucking','motherfucker','shit','bullshit','bitch','bastard','cunt','asshole','arsehole','wanker','dickhead','nigger','nigga','chink','gook','paki','spic','kike','faggot','fag','tranny','retard','retarded','heilhitler','hitler','nazi','whitepower','whitesupremacy','kkk','killallblacks','killalljews','操你妈','草你妈','傻逼','傻屄','死全家','支那','黑鬼']);
const severe=['motherfuck','nigger','faggot','heilhitler','whitepower','whitesupremacy','killallblacks','killalljews'];
const disguises={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','8':'b','а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','і':'i','ı':'i','ѕ':'s'};
export function unsafeUsername(value){
 if(typeof value!=='string')return false;
 const plain=value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[0134578аеорсхіıѕ]/g,c=>disguises[c]);
 const forms=[plain,plain.replace(/[0-9]/g,''),value.toLowerCase().replace(/[0-9]/g,'')];
 for(const form of forms){const segments=form.split(/[^\p{L}\p{N}]+/u).filter(Boolean),joined=segments.join('');
  if(segments.some(s=>words.has(s))||words.has(joined)||severe.some(s=>joined.includes(s)))return true;
  if([...words].some(w=>joined===w+'you'||joined===w+'off'||joined==='you'+w||joined===w+'s'))return true;
 }
 return false;
}
export const USERNAME_SAFETY_MESSAGE='Choose a respectful username without profanity, slurs or hateful language.';
