import {queueParishFilter} from './parish-queue-scope.js';
import {loadParishMembers} from './parish-members.js';

// Recover known legacy defaults, and only for this parish's members.
// Keep explicit bookings to other parishes outside this parish's results.
export async function fetchParishBookingRows({parish,session,query,filter=''}) {
 async function readAll(scope) {
  const rows=[];
  for(let offset=0;;) {
   const batch=await query('diocese_service_bookings','select=*&'+scope+(filter?'&'+filter:'')+'&order=created_at.desc&limit=500&offset='+offset);
   rows.push(...batch);if(batch.length<500)return rows;offset+=batch.length;
  }
 }
 const rows=await readAll(queueParishFilter(parish));
 if(String(parish.parish_name).trim().toLowerCase()==='parish of catbalogan')return rows;
 const members=await loadParishMembers(session,query);
 const ids=members.map(row=>String(row.id||'')).filter(id=>/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id));
 for(let start=0;start<ids.length;start+=100) {
  const scope='parish_name=eq.'+encodeURIComponent('Parish of Catbalogan')+'&or=(reference_number.like.APT-*,reference_number.like.COR-*,and(reference_number.like.CERT-*,service_name.ilike.*good*moral*))&booked_by=in.('+ids.slice(start,start+100).join(',')+')';
  rows.push(...await readAll(scope));
 }
 return [...new Map(rows.map(row=>[row.id,row])).values()].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
}
