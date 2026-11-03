import {resolveQueueParish} from './parish-queue-scope.js';
import {fetchParishBookingRows} from './parish-booking-rows.js';
import {bookingStatusGroup} from './booking-filters.js';
import {isCertificateRequest, takePendingQueueRequest} from './pending-queue.js?v=20261031-clickable';
import {buildParishReport, reportDateOnly} from './parish-report-print.js';
import {reportDate} from './report-charts.js';

export const STATUS_CARDS = ['pending','approved','completed','rejected'];
export function bookingDay(row) {
  const value=row.booking_date||row.created_at||'';
  if(!value||!Number.isFinite(Date.parse(value)))return '';
  return String(value).length===10?value:reportDate(value);
}
export function managementStatus(row) {
  if (/^(cancelled|canceled)$/i.test(String(row.booking_status||'').trim())) return 'cancelled';
  const group = bookingStatusGroup(row);
  return group === 'declined' ? 'rejected' : group;
}
export function statusCounts(rows) {
  return Object.fromEntries(STATUS_CARDS.map(status => [status, rows.filter(row => managementStatus(row) === status).length]));
}
export function filterManagementRows(rows, {status='all',from='',to='',search='',type='all'}={}) {
  const text=search.trim().toLowerCase();
  return rows.filter(row => {
    const date=bookingDay(row);
    return (status==='all'||managementStatus(row)===status) && (!from||date>=from) && (!to||date<=to) &&
      (type==='all'||isCertificateRequest(row)===(type==='certificates')) &&
      (!text||[row.reference_number,row.client_name,row.service_name,row.booking_status].some(value=>String(value||'').toLowerCase().includes(text)));
  });
}
export function serviceSeries(rows) {
  const groups=new Map();
  for(const row of rows) {
    const date=bookingDay(row);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))continue;
    const service=String(row.service_name||'').split(' - ')[0].trim();
    if(!service)continue;
    const year=date.slice(0,4),key=service+'|'+year;
    if(!groups.has(key))groups.set(key,{key,service,year,months:Array(12).fill(0),total:0});
    const group=groups.get(key),month=Number(date.slice(5,7))-1;
    group.months[month]++;group.total++;
  }
  return [...groups.values()].sort((a,b)=>b.year.localeCompare(a.year)||a.service.localeCompare(b.service));
}
export function actionsFor(row) {
  return {pending:['Approve','Decline'],approved:['Preview','Mark as Completed'],completed:['Preview','Print'],rejected:['Preview'],cancelled:['Preview']}[managementStatus(row)];
}
export async function changeBookingStatus({row,action,request,session}) {
  if(session?.role!=='parish'||!session.accessToken||!row?.id)throw Error('Sign in as a parish administrator before updating requests.');
  const transition={Approve:['pending','Approved'],Decline:['pending','Declined'],'Mark as Completed':['approved','Completed']}[action];
  if(!transition||managementStatus(row)!==transition[0])throw Error('This booking has changed. Reload its latest status before taking action.');
  const query=new URLSearchParams({id:'eq.'+row.id,select:'*'});
  if(row.booking_status!=null)query.set('booking_status','eq.'+row.booking_status);
  else query.set('booking_status','is.null');
  const saved=await request('/rest/v1/diocese_service_bookings?'+query,{method:'PATCH',accessToken:session.accessToken,headers:{Prefer:'return=representation'},body:{booking_status:transition[1],updated_at:new Date().toISOString()}});
  if(!Array.isArray(saved)||saved.length!==1)throw Error('The request was not updated. It may have changed in another window. Please try again.');
  return saved[0];
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=key=>key.replace(/_/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
export function bookingFieldValue(key,value) {
  if(value==null||value==='')return 'Not provided';
  if(['cost','payment_amount','payment_fee','payment_total'].includes(key)&&Number.isFinite(Number(value)))return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value));
  if(/(_at|_date|_birthday)$/.test(key)&&typeof value==='string'&&Number.isFinite(Date.parse(value)))return key.endsWith('_at')?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):reportDateOnly(value);
  return typeof value==='object'?JSON.stringify(value):String(value);
}
export function bookingSections(row) {
  const definitions=[['Request details',['reference_number','service_name','booking_status','parish_name','booking_date','booking_time','appointment_time','purpose']],['Personal details',['client_name','client_first_name','client_middle_name','client_last_name','requester_age','requester_gender','requester_birthday','requester_address']],['Family details',['mother_name','mother_last_name','father_name','father_last_name']],['Payment details',['cost','payment_method','payment_amount','payment_fee','payment_total','payment_status']],['Certificate and processing',['certificate_file_name','certificate_file_type','certificate_uploaded_at','created_at','updated_at']]];
  const remaining=new Set(Object.keys(row).filter(key=>!['id','booked_by','parish_id','certificate_file_url','certificate_file_size'].includes(key)&&row[key]!=null&&row[key]!==''));
  const sections=definitions.map(([title,keys])=>({title,fields:keys.filter(key=>remaining.delete(key)).map(key=>[label(key),bookingFieldValue(key,row[key])])}));
  if(remaining.size)sections.push({title:'Additional details',fields:[...remaining].map(key=>[label(key),bookingFieldValue(key,row[key])])});
  return sections.filter(section=>section.fields.length);
}
export function bookingFields(row) {
  return Object.entries(row).filter(([key,value])=>!['id','booked_by','parish_id','certificate_file_url','certificate_file_size'].includes(key)&&value!=null&&value!=='')
    .map(([key,value])=>[label(key),bookingFieldValue(key,value)]);
}
function showReport(popup,parish,rows,filters,print=false) {
  let html=buildParishReport({parish:parish.parish_name,rows,from:filters.from,to:filters.to,status:filters.status==='all'?'All':filters.status.toUpperCase()});
  const counts=statusCounts(rows);
  const summary='<h2>Booking statuses</h2><table><thead><tr>'+STATUS_CARDS.map(status=>'<th>'+status.toUpperCase()+'</th>').join('')+'</tr></thead><tbody><tr>'+STATUS_CARDS.map(status=>'<td>'+counts[status]+'</td>').join('')+'</tr></tbody></table>';
  const details=rows.map(row=>'<section><h2>'+escape(row.reference_number||row.service_name||'Request details')+'</h2><table><tbody>'+bookingFields(row).map(([key,value])=>'<tr><th>'+escape(key)+'</th><td>'+escape(value)+'</td></tr>').join('')+'</tbody></table></section>').join('');
  html=html.replace('<h2>Certificate requests by type</h2>',summary+'<h2>Certificate requests by type</h2>').replace('<footer>',details+'<footer>');
  html=html.replace('Period: Not recorded to Not recorded','Period: All dates');
  popup.document.open();popup.document.write(html);popup.document.close();
  if(print)Promise.resolve(popup.document.fonts?.ready).then(()=>{popup.focus();popup.print();});
}
function Preview({React:R,row,onClose}) {
  const h=R.createElement,ref=R.useRef(null);
  R.useEffect(()=>{const dialog=ref.current;dialog.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{if(dialog.open)dialog.close();document.body.style.overflow=previous;};},[]);
  return h('dialog',{ref,className:'management-booking-dialog management-booking-preview',onCancel:event=>{event.preventDefault();onClose();},'aria-labelledby':'management-preview-title'},
    h('header',{className:'management-preview-header'},h('div',null,h('span',{className:'management-preview-eyebrow'},isCertificateRequest(row)?'CERTIFICATE REQUEST':'PARISH BOOKING'),h('h3',{id:'management-preview-title'},'Booking Details'),h('p',null,row.reference_number||'Reference not provided')),h('button',{type:'button',className:'management-preview-close',onClick:onClose,'aria-label':'Close booking details'},h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round','aria-hidden':true},h('path',{d:'M6 6l12 12M18 6L6 18'})))),
    h('div',{className:'management-preview-body'},h('div',{className:'management-preview-summary'},h('div',null,h('strong',null,row.client_name||'Name not provided'),h('p',null,row.service_name||'Parish service')),h('span',{'data-status':managementStatus(row),className:'management-status'},managementStatus(row).toUpperCase())),bookingSections(row).map(section=>h('section',{key:section.title,className:'management-preview-section'},h('h4',null,section.title),h('dl',null,section.fields.map(([key,value])=>h('div',{key},h('dt',null,key),h('dd',null,value))))))),
    h('footer',{className:'management-preview-footer'},/^https:\/\//i.test(row.certificate_file_url||'')?h('a',{className:'primary-action',href:row.certificate_file_url,target:'_blank',rel:'noopener noreferrer'},'View certificate'):null,h('button',{type:'button',className:'secondary-action',onClick:onClose},'Close')));
}
export function BookingManagement({React:R,session,fetchRows,request,reports=false}) {
  const h=R.createElement;
  const [state,setState]=R.useState({rows:[],parish:null,loading:true,error:''});
  const [filters,setFilters]=R.useState(()=>({status:'all',from:'',to:'',search:reports?'':takePendingQueueRequest()?.reference_number||'',type:'all'}));
  const [selected,setSelected]=R.useState(null),[busy,setBusy]=R.useState(''),[notice,setNotice]=R.useState('');
  const [page,setPage]=R.useState(0);
  const swipeStart=R.useRef(null);
  const mounted=R.useRef(false),loading=R.useRef(null),version=R.useRef(0);
  async function load(fresh=false) {
    if(fresh&&loading.current)await loading.current.catch(()=>{});
    if(loading.current)return loading.current;
    const currentVersion=version.current;
    loading.current=(async()=>{
      const query=(table,query)=>fetchRows(table,query,session.accessToken);
      const parish=await resolveQueueParish(session,query);
      const rows=await fetchParishBookingRows({parish,session,query});
      if(mounted.current&&version.current===currentVersion)setState({rows,parish,loading:false,error:''});
      return {rows,parish};
    })();
    try{return await loading.current;}finally{loading.current=null;}
  }
  R.useEffect(()=>{
    mounted.current=true;
    const refresh=()=>{if(document.visibilityState==='hidden')return;load().catch(error=>{if(mounted.current)setState(current=>({...current,loading:false,error:error.message}));});};
    const updated=event=>{const row=event.detail;if(!row?.id)return;version.current++;setState(current=>({...current,rows:current.rows.map(item=>item.id===row.id?row:item)}));refresh();};
    refresh();const timer=window.setInterval(refresh,5000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('parish-bookings-changed',updated);
    return()=>{mounted.current=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('parish-bookings-changed',updated);};
  },[session?.accessToken,session?.email,session?.parish_id]);
  const update=(key,value)=>{setFilters(current=>({...current,[key]:value}));setPage(0);};
  const invalid=filters.from&&filters.to&&filters.from>filters.to;
  const base=invalid?[]:filterManagementRows(state.rows,{...filters,status:'all'}),counts=statusCounts(base),visible=filterManagementRows(base,{status:filters.status});
  const pageCount=Math.max(1,Math.ceil(visible.length/7)),currentPage=Math.min(page,pageCount-1),pageRows=visible.slice(currentPage*7,currentPage*7+7);
  const changePage=direction=>setPage(Math.max(0,Math.min(pageCount-1,currentPage+direction)));
  const startSwipe=event=>{swipeStart.current=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;};
  const endSwipe=event=>{const start=swipeStart.current;swipeStart.current=null;if(!start||state.loading||event.changedTouches.length!==1)return;const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;if(Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.5)changePage(dx<0?1:-1);};
  async function act(row,action) {
    if(action==='Preview'){setSelected(row.id);return;}
    if(action==='Print') {
      const popup=window.open('','_blank','width=1000,height=760');
      if(!popup){setNotice('Allow the print window to open, then try again.');return;}
      try {const latest=await load(true),current=latest.rows.find(item=>item.id===row.id);if(!current||managementStatus(current)!=='completed')throw Error('Only completed requests can be printed.');showReport(popup,latest.parish,[current],{status:'completed',from:'',to:''},true);}catch(error){popup.close();setNotice(error.message);}return;
    }
    if(busy||!window.confirm(action==='Approve'?'Confirm the priest or parish office is available, then approve this request?':action+' this request?'))return;
    setBusy(row.id);setNotice('');
    try {
      const saved=await changeBookingStatus({row,action,request,session});
      version.current++;setState(current=>({...current,rows:current.rows.map(item=>item.id===saved.id?saved:item)}));
      window.dispatchEvent(new CustomEvent('parish-bookings-changed',{detail:saved}));
      setNotice('Request '+(saved.booking_status==='Declined'?'rejected':saved.booking_status.toLowerCase())+'.');
    }catch(error){setNotice(error.message);await load().catch(()=>{});}finally{setBusy('');}
  }
  async function generate() {
    const popup=window.open('','_blank','width=1000,height=760');if(!popup){setNotice('Allow the report window to open, then try again.');return;}
    popup.document.write('<title>Preparing Parish Report</title><p>Loading latest booking information...</p>');popup.document.close();setBusy('report');
    try{const latest=await load(true);showReport(popup,latest.parish,filterManagementRows(latest.rows,filters),filters);}catch(error){popup.document.body.textContent='Could not generate report: '+error.message;}finally{setBusy('');}
  }
  const preview=state.rows.find(row=>row.id===selected);
  const chartRows=serviceSeries(visible);
  const certificates=visible.filter(isCertificateRequest),bookingsCount=visible.length-certificates.length,certificateCounts=new Map();
  for(const row of certificates){const name=String(row.service_name||'Certificate').trim();certificateCounts.set(name,(certificateCounts.get(name)||0)+1);}
  const topCertificates=[...certificateCounts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return h('section',{className:'booking-management','aria-label':reports?'Parish reports':'Parish bookings'},
    h('header',{className:'management-heading'},h('div',null,h('h4',null,reports?'Booking Management and Reports':'Bookings and Certificate Requests'),h('p',null,'Monitor parish requests and their latest processing status.'))),
    h('div',{className:'management-status-cards'},STATUS_CARDS.map(status=>h('button',{key:status,type:'button','aria-pressed':filters.status===status,'data-status':status,onClick:()=>update('status',filters.status===status?'all':status)},h('span',null,status.toUpperCase()),h('strong',null,state.loading?'—':counts[status])))),
    h('div',{className:'management-filters'},
      h('label',null,'Booking date from',h('input',{type:'date',value:filters.from,onChange:event=>update('from',event.target.value)})),
      h('label',null,'Booking date to',h('input',{type:'date',value:filters.to,onChange:event=>update('to',event.target.value)})),
      h('label',null,'Request type',h('select',{value:filters.type,onChange:event=>update('type',event.target.value)},[['all','All requests'],['certificates','Certificates'],['appointments','Bookings']].map(([value,text])=>h('option',{key:value,value},text)))),
      h('label',null,'Search',h('input',{type:'search',placeholder:'Name, reference or service',value:filters.search,onChange:event=>update('search',event.target.value)})),
      h('button',{type:'button',className:'primary-action',disabled:!!busy||state.loading||!!state.error||!!invalid,onClick:generate},busy==='report'?'Generating...':'Generate Reports')),
    invalid?h('p',{role:'alert'},'The start date must be before the end date.'):null,
    h('div',{className:'management-results-heading'},h('span',{'aria-live':'polite'},visible.length+' requests'+(filters.status==='all'?'':' · '+filters.status.toUpperCase())),h('button',{type:'button',className:'secondary-action',onClick:()=>{setFilters({status:'all',from:'',to:'',search:'',type:'all'});setPage(0);}},'Show all / Clear filters')),
    state.error?h('p',{role:'alert'},state.error):null,notice?h('p',{role:'status',className:'management-notice'},notice):null,
    state.loading?h('p',{role:'status'},'Loading booking records...'):h('div',{className:'management-table-wrap',onTouchStart:startSwipe,onTouchEnd:endSwipe,onTouchCancel:()=>{swipeStart.current=null;},tabIndex:0,role:'region','aria-label':'Booking requests table. Swipe left for next page or right for previous page.',onKeyDown:event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();changePage(event.key==='ArrowRight'?1:-1);}}},h('table',null,h('thead',null,h('tr',null,['Reference','Name','Service','Booking date','Status','Actions'].map(text=>h('th',{key:text,scope:'col'},text)))),h('tbody',null,visible.length?pageRows.map(row=>h('tr',{key:row.id},h('td',null,row.reference_number||'—'),h('td',null,row.client_name||'Not provided'),h('td',null,row.service_name||'Parish service'),h('td',null,reportDateOnly(row.booking_date||row.created_at)),h('td',null,h('span',{'data-status':managementStatus(row),className:'management-status'},managementStatus(row).toUpperCase())),h('td',null,h('div',{className:'management-row-actions'},actionsFor(row).map(action=>h('button',{key:action,type:'button',className:action==='Approve'||action==='Mark as Completed'?'primary-action':'secondary-action',disabled:!!busy,onClick:()=>act(row,action)},busy===row.id?'Saving...':action)))))):h('tr',null,h('td',{colSpan:6},'No requests match these filters.'))))),
    h('nav',{className:'management-results-heading','aria-label':'Booking request pages'},h('button',{type:'button',className:'secondary-action',disabled:state.loading||currentPage===0,onClick:()=>changePage(-1)},'Previous'),h('span',{'aria-live':'polite'},'Page '+(currentPage+1)+' of '+pageCount+' ? '+(visible.length?currentPage*7+1:0)+'?'+Math.min((currentPage+1)*7,visible.length)+' of '+visible.length+' requests'),h('button',{type:'button',className:'secondary-action',disabled:state.loading||currentPage>=pageCount-1,onClick:()=>changePage(1)},'Next')),
    reports&&visible.length?h('section',{className:'management-service-charts','aria-label':'Booking and certificate summary charts'},h('div',{className:'report-charts-grid'},
      h('article',{className:'report-chart'},h('h4',null,'Bookings vs Certificates'),h('div',{className:'report-pie-wrap'},h('div',{className:'report-pie',role:'img','aria-label':bookingsCount+' bookings and '+certificates.length+' certificate requests',style:{background:'conic-gradient(#315cc4 0 '+(bookingsCount/visible.length*100)+'%, #39a58b '+(bookingsCount/visible.length*100)+'% 100%)'}}),h('div',null,h('strong',null,visible.length),h('span',null,'total requests'))),h('div',{className:'report-chart-legend'},h('span',null,h('i',{style:{background:'#315cc4'}}),'Bookings: '+bookingsCount),h('span',null,h('i',{style:{background:'#39a58b'}}),'Certificates: '+certificates.length))),
      topCertificates.length?h('article',{className:'report-chart'},h('h4',null,'Most-requested Certificates'),h('ol',{className:'report-bars'},topCertificates.map(([name,count])=>h('li',{key:name},h('div',null,h('span',null,name),h('strong',null,count)),h('div',{className:'report-bar-track'},h('div',{style:{width:count/topCertificates[0][1]*100+'%'}})))))):null)):null,
    reports?h('section',{className:'management-service-charts','aria-label':'Monthly service bookings'},h('h4',null,'Monthly Service Requests'),h('p',null,'Actual requests by booking date, including the selected status and filters. Services without records are omitted.'),h('div',{className:'report-charts-grid'},chartRows.map((series,index)=>{
      const max=Math.max(1,...series.months),color=['#7851ec','#e9a23b','#329d9c','#cf5c8e'][index%4];
      return h('article',{key:series.key,className:'report-chart'},h('h4',null,series.service+' ('+series.year+')'),h('p',null,series.total+' requests'),h('svg',{viewBox:'0 0 640 250',role:'img','aria-label':series.service+' monthly bookings in '+series.year},[0,.5,1].map(value=>h('g',{key:value},h('line',{x1:36,x2:628,y1:200-value*160,y2:200-value*160,stroke:'#dddfee'}),h('text',{x:28,y:204-value*160,textAnchor:'end',fontSize:12},Math.round(max*value)))),series.months.map((count,month)=>h('g',{key:month},h('rect',{x:43+month*48,y:200-count/max*160,width:28,height:count/max*160,rx:4,fill:color},h('title',null,new Date(2020,month,1).toLocaleString('en',{month:'long'})+': '+count)),h('text',{x:57+month*48,y:222,textAnchor:'middle',fontSize:11},new Date(2020,month,1).toLocaleString('en',{month:'short'}))))),h('details',null,h('summary',null,'View chart data'),h('ul',null,series.months.map((count,month)=>h('li',{key:month},new Date(2020,month,1).toLocaleString('en',{month:'long'})+': '+count)))));
    })),!chartRows.length?h('p',null,'No service booking data for the selected filters.'):null):null,
    preview?h(Preview,{React:R,row:preview,onClose:()=>setSelected(null)}):null);
}
