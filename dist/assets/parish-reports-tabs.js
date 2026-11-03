import {BookingManagement} from './booking-management.js?v=20261103-summary-charts';
import {RecordsReports} from './records-reports.js?v=20261103-seven-rows';
export function ParishReports({React:R,session,fetchRows,request}) {
  const h=R.createElement,[tab,setTab]=R.useState('bookings'),[recordsVisited,setRecordsVisited]=R.useState(false);
  const tabs=[['bookings','BOOKINGS / CERTIFICATES REPORTS'],['records','RECORDS REPORTS']];
  function select(value){setTab(value);if(value==='records')setRecordsVisited(true);}
  function navigate(event,index){const next=event.key==='ArrowRight'?(index+1)%2:event.key==='ArrowLeft'?(index+1)%2:event.key==='Home'?0:event.key==='End'?1:null;if(next==null)return;event.preventDefault();select(tabs[next][0]);event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();}
  return h('div',{className:'parish-report-tabs'},h('div',{role:'tablist','aria-label':'Parish report sections',className:'parish-report-tablist'},tabs.map(([value,text],index)=>h('button',{key:value,id:'reports-tab-'+value,type:'button',role:'tab','aria-selected':tab===value,'aria-controls':'reports-panel-'+value,tabIndex:tab===value?0:-1,onClick:()=>select(value),onKeyDown:event=>navigate(event,index)},text))),
    h('section',{id:'reports-panel-bookings',role:'tabpanel','aria-labelledby':'reports-tab-bookings',hidden:tab!=='bookings',className:'parish-report-panel'},h(BookingManagement,{React:R,session,fetchRows,request,reports:true})),
    h('section',{id:'reports-panel-records',role:'tabpanel','aria-labelledby':'reports-tab-records',hidden:tab!=='records',className:'parish-report-panel'},recordsVisited?h(RecordsReports,{React:R,session,fetchRows}):null));
}
