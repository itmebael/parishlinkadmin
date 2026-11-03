import {parseAnnouncementActivities} from './announcement-activities.js';
export function isSundayMassSponsor(post){
 const category=String(post.category||'').trim().toLowerCase();
 if(category==='sunday mass sponsor')return true;
 if(/sunday\s+mass\s+sponsor/i.test(String(post.title||'')))return true;
 // Older admin forms had no sponsor category, only barangay/organization fields.
 return (!category||category==='notice')&&parseAnnouncementActivities(post).some(item=>item.barangay||item.organization);
}
export function groupedAnnouncementRows(posts){
 const result={latest:[],sponsors:[]};
 for(const post of posts){
  if(post.status&&String(post.status).toLowerCase()!=='published')continue;
  parseAnnouncementActivities(post).forEach((item,index)=>result[isSundayMassSponsor(post)?'sponsors':'latest'].push({...item,post,index,key:String(post.id||post.created_at)+'-'+index}));
 }
 for(const rows of Object.values(result))rows.sort((a,b)=>(Date.parse(b.post.published_at||b.post.created_at)||0)-(Date.parse(a.post.published_at||a.post.created_at)||0)||String(b.date).localeCompare(String(a.date))||a.index-b.index);
 return result;
}
