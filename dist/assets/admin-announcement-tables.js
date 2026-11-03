import {isSundayMassSponsor} from './announcement-kind.js';
import {parseAnnouncementActivities} from './announcement-activities.js';
import {scheduleTime} from './schedule-time.js';
export function AdminAnnouncementTables({React:R,posts,busy,onEdit,onDelete,attachments,onStatusChange,onAttach,onAdd}) {
 const h=R.createElement;
 const dateLabel=value=>{const date=new Date(value+'T00:00:00');return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});};
 function table(sponsor){
  const title=sponsor?'Sunday Mass Sponsor':'Latest Announcements';
  const selected=posts.filter(post=>isSundayMassSponsor(post)===sponsor);
  const rows=selected.flatMap((post,postIndex)=>parseAnnouncementActivities(post).map((item,index)=>({post,item,index,postIndex})));
  rows.sort((a,b)=>String(b.item.date||'').localeCompare(String(a.item.date||''))||a.postIndex-b.postIndex||a.index-b.index);
  const seen=new Set();
  const columns=sponsor?['Date','Time','Barangay','Organization','Status','Audience','Actions']:['Date','Activities','Status','Action'];
  return h('section',{className:'admin-announcement-summary','data-announcement-kind':sponsor?'sponsors':'latest'},
   h('header',null,h('h4',null,title),h('span',null,selected.length+' '+(selected.length===1?'post':'posts'))),
   h('div',{className:'admin-announcement-table-wrap',role:'region',tabIndex:0,'aria-label':title},
    h('table',{className:'admin-announcement-table'},
     h('thead',null,h('tr',null,columns.map(label=>h('th',{key:label,scope:'col'},label)))),
     ...rows.length?[h('tbody',{key:'rows'},rows.map(({post,item,index,postIndex})=>{const first=!seen.has(post);seen.add(post);return h('tr',{key:postIndex+'-'+index},
      h('td',null,dateLabel(item.date)),
      ...(sponsor?[h('td',{key:'time'},scheduleTime(item.time||post.start_time||post.event_time)||'—'),h('td',{key:'barangay'},item.barangay||'—'),h('td',{key:'organization'},item.organization||'—')]:[h('td',{key:'activity'},h('div',{className:'announcement-activity-copy'},item.activity||'—'),first?attachments(post):null,h('button',{type:'button',className:'announcement-attach-image',disabled:busy,onClick:()=>onAttach(post)},'Attach Event Image'))]),
      h('td',{key:'status'},h('select',{'aria-label':'Status for '+(item.activity||post.title),value:post.status||'Draft',disabled:busy,onChange:event=>onStatusChange(post,event.target.value)},['Draft','Published','Archived'].map(status=>h('option',{key:status,value:status},status)))),
      ...(sponsor?[h('td',{key:'audience'},post.audience||'Parish Members')]:[]),
      h('td',{key:'actions'},h('div',{className:'publishing-actions'},h('button',{type:'button',className:'secondary-action',disabled:busy,onClick:()=>onEdit(post)},'Edit'),h('button',{type:'button',className:'secondary-action',disabled:busy,onClick:()=>onDelete(post)},'Delete')),sponsor&&first?attachments(post):null)
     );}))] : [h('tbody',{key:'empty'},h('tr',null,h('td',{colSpan:columns.length,className:'admin-announcement-empty'},sponsor?'No Sunday Mass sponsors posted yet.':'No announcements yet.')))])));
 }
 return h('div',{className:'admin-announcement-tables'},table(false),h('button',{type:'button',className:'secondary-action announcement-add-row',disabled:busy,onClick:onAdd},'+ Add Parish Activity'),table(true));
}
