import {openReportPreview} from './report-preview-dialog.js';
import {resolveQueueParish} from './parish-queue-scope.js';
import {reportDateOnly} from './parish-report-print.js?v=20261106-styled-dialogs';

export const RECORD_CATEGORIES=[['baptism','BAPTISMAL'],['confirmation','CONFIRMATION'],['marriage','MARRIAGE'],['funeral','FUNERAL']];
const sources={baptism:'baptism_records',confirmation:'confirmation_records',marriage:'marriage_records',funeral:'diocese_archive_records'};
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
export function registerDate(year,month,day) {
  const y=Number(year),m=/^\d+$/.test(String(month))?Number(month):months.findIndex(value=>value===String(month||'').trim().toLowerCase())+1,d=Number(day);
  if(!Number.isInteger(y)||y<1000||y>9999||m<1||m>12||d<1||d>31)return '';
  const value=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';
}
export function normalizeRecordRows(category,rows) {
  const groups=category==='marriage'?[...rows.reduce((map,row)=>{
    const key=row.entry_no==null||row.entry_no===''?'record-'+row.id:'entry-'+row.entry_no;
    if(!map.has(key))map.set(key,[]);map.get(key).push(row);return map;
  },new Map()).values()]:rows.map(row=>[row]);
  return groups.map(records=>{
    const first=records[0];
    const name=category==='marriage'?records.map(row=>(row.party_role?row.party_role+': ':'')+(row.name_family_name||'Name not recorded')).join(' / '):category==='funeral'?(first.full_name||[first.first_name,first.middle_name,first.last_name].filter(Boolean).join(' ')):first.name;
    const date=category==='baptism'?registerDate(first.year_baptism,first.month_batism,first.date_batism):category==='confirmation'?registerDate(first.year_confirm,first.month_confirm,first.date_baptism):String(first.marriage_date||first.service_date||'').slice(0,10);
    return {key:category+':'+first.id,category,name:name||'Name not recorded',date,location:first.location||first.residence||first.church||'',minister:first.minister||first.rev_name||'',records};
  });
}
export async function fetchRecordReportData({session,fetchRows}) {
  const query=(table,query)=>fetchRows(table,query,session.accessToken);
  const parish=await resolveQueueParish(session,query);
  const results=await Promise.allSettled(RECORD_CATEGORIES.map(async([category])=>{
    const rows=[];
    for(let offset=0;;offset+=500) {
      const filter='select=*&parish_id=eq.'+encodeURIComponent(parish.id)+(category==='funeral'?'&or=(record_type.ilike.funeral*,record_type.ilike.death*,record_type.ilike.burial*)':'')+'&order=id.asc&limit=500&offset='+offset;
      const batch=await query(sources[category],filter);
      if(!Array.isArray(batch))throw Error('The record response was not a list.');
      rows.push(...batch);if(batch.length<500)break;
    }
    return normalizeRecordRows(category,rows);
  }));
  const rows=[],errors={};
  results.forEach((result,index)=>{const [key,title]=RECORD_CATEGORIES[index];if(result.status==='fulfilled')rows.push(...result.value);else errors[key]=title+': '+(result.reason.message||'Records could not be loaded.');});
  return {parish,rows,errors};
}
export function filterRecordReports(rows,{category='all',from='',to='',search=''}={}) {
  const text=search.trim().toLowerCase();
  return rows.filter(row=>(category==='all'||row.category===category)&&(!from||row.date&&row.date>=from)&&(!to||row.date&&row.date<=to)&&(!text||[row.name,row.location,row.minister,...row.records.map(record=>record.id)].some(value=>String(value||'').toLowerCase().includes(text))));
}
export function recordReportCounts(rows) {return Object.fromEntries(RECORD_CATEGORIES.map(([key])=>[key,rows.filter(row=>row.category===key).length]));}
export function recordReportSeries(rows) {
  const groups=new Map();
  for(const row of rows){if(!row.date||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))continue;const year=row.date.slice(0,4),key=row.category+':'+year,month=Number(row.date.slice(5,7))-1;if(month<0||month>11)continue;if(!groups.has(key))groups.set(key,{key,category:row.category,year,months:Array(12).fill(0)});groups.get(key).months[month]++;}
  return [...groups.values()].sort((a,b)=>b.year.localeCompare(a.year)||a.category.localeCompare(b.category));
}
const title=key=>RECORD_CATEGORIES.find(([value])=>value===key)?.[1]||key;
const label=key=>key.replace(/_/g,' ').replace(/\b\w/g,value=>value.toUpperCase());
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const detailFields=record=>Object.entries(record).filter(([key,value])=>!['parish_id','chapel_id'].includes(key)&&value!=null&&value!=='');
export function buildRecordsReport({parish,rows,filters,generated=new Date().toISOString()}) {
  const counts=recordReportCounts(rows);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Parish Records Report</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px/1.6 Arial,sans-serif;color:#34335f;background:#fff;margin:24px}header{text-align:center;border-bottom:2px solid #6d45bd;padding-bottom:16px}h1{font-size:22px}h2{font-size:16px}.stats{display:flex;gap:24px;margin:20px 0}.stats div{padding:12px;border:1px solid #d5d0eb;flex:1}.stats strong{display:block;font-size:22px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:left;padding:8px;border:1px solid #ddd8ed;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#eeebf8}thead{display:table-header-group}tr{break-inside:avoid}.actions{display:flex;gap:12px;margin:20px 0}.actions button{padding:9px 14px;cursor:pointer}@media print{.actions{display:none}body{margin:0}h2{break-after:avoid}}</style></head><body><header><h1>'+esc(parish.parish_name)+'</h1><h2>Records Reports</h2><p>Category: '+esc(filters.category==='all'?'All record types':title(filters.category))+' | Record dates: '+esc(filters.from||'All dates')+' to '+esc(filters.to||'Present')+' | Search: '+esc(filters.search||'None')+'</p><p>Generated: '+esc(reportDateOnly(generated))+' | '+rows.length+' register entries</p></header><div class="stats">'+RECORD_CATEGORIES.map(([key,text])=>'<div>'+text+'<strong>'+counts[key]+'</strong></div>').join('')+'</div><h2>Record register</h2><table><thead><tr><th>No.</th><th>Record type</th><th>Name</th><th>Record date</th><th>Location</th><th>Minister</th></tr></thead><tbody>'+rows.map((row,index)=>'<tr><td>'+(index+1)+'</td><td>'+title(row.category)+'</td><td>'+esc(row.name)+'</td><td>'+esc(reportDateOnly(row.date))+'</td><td>'+esc(row.location)+'</td><td>'+esc(row.minister)+'</td></tr>').join('')+'</tbody></table>'+(!rows.length?'<p>No records match these filters.</p>':'')+rows.map(row=>'<section><h2>'+esc(title(row.category)+' — '+row.name)+'</h2>'+row.records.map(record=>'<table><tbody>'+detailFields(record).map(([key,value])=>'<tr><th>'+esc(label(key))+'</th><td>'+esc(typeof value==='object'?JSON.stringify(value):value)+'</td></tr>').join('')+'</tbody></table>').join('')+'</section>').join('')+'<div class="actions"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div></body></html>';
}
function RecordPreview({React:R,row,onClose}) {
  const h=R.createElement,ref=R.useRef(null);
  R.useEffect(()=>{const dialog=ref.current;dialog.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{if(dialog.open)dialog.close();document.body.style.overflow=old;};},[]);
  return h('dialog',{ref,className:'management-booking-dialog','aria-labelledby':'record-report-preview-title',onCancel:event=>{event.preventDefault();onClose();}},h('header',null,h('h3',{id:'record-report-preview-title'},row.name),h('button',{type:'button',className:'secondary-action',onClick:onClose},'Close')),row.records.map(record=>h('section',{key:record.id},h('h4',null,title(row.category)),h('dl',null,detailFields(record).map(([key,value])=>h('div',{key},h('dt',null,label(key)),h('dd',null,typeof value==='object'?JSON.stringify(value):String(value))))),/^https:\/\//i.test(record.scanned_file_url||'')?h('a',{href:record.scanned_file_url,target:'_blank',rel:'noopener noreferrer'},'View scanned record'):null)));
}
export function RecordsReports({React:R,session,fetchRows}) {
  const h=R.createElement,[state,setState]=R.useState({rows:[],errors:{},loading:true,parish:null,error:''}),[filters,setFilters]=R.useState({category:'all',from:'',to:'',search:''}),[selected,setSelected]=R.useState(null),[generating,setGenerating]=R.useState(false),[notice,setNotice]=R.useState('');
  const [page,setPage]=R.useState(0);
  const swipeStart=R.useRef(null);
  const mounted=R.useRef(false),pending=R.useRef(null);
  async function load(fresh=false) {
    if(fresh&&pending.current)await pending.current.catch(()=>{});
    if(pending.current)return pending.current;
    pending.current=fetchRecordReportData({session,fetchRows});
    try{const data=await pending.current;if(mounted.current)setState({...data,loading:false,error:''});return data;}finally{pending.current=null;}
  }
  R.useEffect(()=>{mounted.current=true;const refresh=()=>{if(document.visibilityState==='hidden')return;load().catch(error=>{if(mounted.current)setState(current=>({...current,error:error.message,loading:false}));});};refresh();const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{mounted.current=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[session?.accessToken,session?.email,session?.parish_id]);
  const update=(key,value)=>{setFilters(current=>({...current,[key]:value}));setPage(0);};
  const invalid=filters.from&&filters.to&&filters.from>filters.to;
  const base=invalid?[]:filterRecordReports(state.rows,{...filters,category:'all'}),counts=recordReportCounts(base),visible=filterRecordReports(base,{category:filters.category});
  const blocked=!!state.error||(filters.category==='all'?Object.keys(state.errors).length>0:!!state.errors[filters.category]);
  async function generate() {
    const popup=openReportPreview('Report preview');if(!popup){setNotice('Allow the report window to open, then try again.');return;}
    popup.document.write('<title>Preparing Records Report</title><p>Loading latest parish records...</p>');popup.document.close();setGenerating(true);
    try{const data=await load(true);if(filters.category==='all'?Object.keys(data.errors).length:!!data.errors[filters.category])throw Error('Some selected record categories could not be loaded. Resolve the displayed errors before generating this report.');const rows=filterRecordReports(data.rows,filters);popup.document.open();popup.document.write(buildRecordsReport({parish:data.parish,rows,filters}));popup.document.close();popup.focus();}catch(error){popup.document.body.textContent='Could not generate records report: '+error.message;}finally{setGenerating(false);}
  }
  const preview=state.rows.find(row=>row.key===selected),series=recordReportSeries(visible);
  const pageCount=Math.max(1,Math.ceil(visible.length/7)),currentPage=Math.min(page,pageCount-1),pageRows=visible.slice(currentPage*7,currentPage*7+7);
  const changePage=direction=>setPage(Math.max(0,Math.min(pageCount-1,currentPage+direction)));
  const startSwipe=event=>{swipeStart.current=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;};
  const endSwipe=event=>{const start=swipeStart.current;swipeStart.current=null;if(!start||state.loading||event.changedTouches.length!==1)return;const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;if(Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.5)changePage(dx<0?1:-1);};
  return h('section',{className:'booking-management records-reports','aria-label':'Records reports'},
    h('header',{className:'management-heading'},h('h4',null,'Records Reports'),h('p',null,'Sacramental and parish register entries. Booking requests are reported separately.')),
    h('div',{className:'management-status-cards'},RECORD_CATEGORIES.map(([key,text])=>h('button',{key,type:'button','aria-pressed':filters.category===key,onClick:()=>update('category',filters.category===key?'all':key)},h('span',null,text),h('strong',null,state.loading?'—':state.errors[key]?'Unavailable':counts[key])))),
    h('div',{className:'management-filters'},h('label',null,'Record date from',h('input',{type:'date',value:filters.from,onChange:event=>update('from',event.target.value)})),h('label',null,'Record date to',h('input',{type:'date',value:filters.to,onChange:event=>update('to',event.target.value)})),h('label',null,'Search records',h('input',{type:'search',value:filters.search,placeholder:'Name, record number, location or minister',onChange:event=>update('search',event.target.value)})),h('button',{type:'button',className:'primary-action',disabled:generating||state.loading||!!invalid||blocked,onClick:generate},generating?'Generating...':'Generate Reports')),
    invalid?h('p',{role:'alert'},'The start date must be before the end date.'):null,
    state.error?h('p',{role:'alert'},state.error):null,
    Object.entries(state.errors).map(([key,error])=>h('p',{key,role:'alert'},error)),notice?h('p',{role:'status'},notice):null,
    h('div',{className:'management-results-heading'},h('span',{'aria-live':'polite'},visible.length+' register entries'+(filters.category==='all'?'':' · '+title(filters.category))),h('button',{type:'button',className:'secondary-action',onClick:()=>{setFilters({category:'all',from:'',to:'',search:''});setPage(0);}},'Show all / Clear filters')),
    h('p',{className:'records-report-note'},'Marriage entries combine the bride and groom under the same register entry. Records without a complete date are included when no date filter is selected.'),
    state.loading?h('p',{role:'status'},'Loading parish records...'):h('div',{className:'management-table-wrap',onTouchStart:startSwipe,onTouchEnd:endSwipe,onTouchCancel:()=>{swipeStart.current=null;},tabIndex:0,role:'region','aria-label':'Records table. Swipe left for next page or right for previous page.',onKeyDown:event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();changePage(event.key==='ArrowRight'?1:-1);}}},h('table',null,h('thead',null,h('tr',null,['No.','Record type','Name','Record date','Location','Minister','Action'].map(text=>h('th',{key:text,scope:'col'},text)))),h('tbody',null,visible.length?pageRows.map((row,index)=>h('tr',{key:row.key},h('td',null,currentPage*7+index+1),h('td',null,title(row.category)),h('td',null,row.name),h('td',null,reportDateOnly(row.date)),h('td',null,row.location||'Not recorded'),h('td',null,row.minister||'Not recorded'),h('td',null,h('button',{type:'button',className:'secondary-action',onClick:()=>setSelected(row.key)},'Preview')))):h('tr',null,h('td',{colSpan:7},blocked?'Selected records are unavailable. See the loading errors above.':'No records match these filters.'))))),
    h('nav',{className:'management-results-heading','aria-label':'Records report pages'},h('button',{type:'button',className:'secondary-action',disabled:state.loading||currentPage===0,onClick:()=>changePage(-1)},'Previous'),h('span',{'aria-live':'polite'},'Page '+(currentPage+1)+' of '+pageCount+' ? '+(visible.length?currentPage*7+1:0)+'?'+Math.min((currentPage+1)*7,visible.length)+' of '+visible.length+' entries'),h('button',{type:'button',className:'secondary-action',disabled:state.loading||currentPage>=pageCount-1,onClick:()=>changePage(1)},'Next')),
    h('section',{className:'management-service-charts','aria-label':'Monthly register entries'},h('h4',null,'Monthly Record Entries'),h('p',null,'Entries by sacrament or parish record date. Only categories with dated records appear.'),h('div',{className:'report-charts-grid'},series.map((group,index)=>{const max=Math.max(1,...group.months);return h('article',{key:group.key,className:'report-chart'},h('h4',null,title(group.category)+' ('+group.year+')'),h('svg',{viewBox:'0 0 640 250',role:'img','aria-label':title(group.category)+' monthly records for '+group.year},[0,.5,1].map(value=>h('g',{key:value},h('line',{x1:36,x2:628,y1:200-value*160,y2:200-value*160,stroke:'#dddfee'}),h('text',{x:28,y:204-value*160,textAnchor:'end',fontSize:12},Math.round(value*max)))),group.months.map((count,month)=>h('g',{key:month},h('rect',{x:43+month*48,y:200-count/max*160,width:28,height:count/max*160,rx:4,fill:['#7851ec','#329d9c','#e9a23b','#cf5c8e'][index%4]},h('title',null,months[month]+': '+count)),h('text',{x:57+month*48,y:222,textAnchor:'middle',fontSize:11},months[month].slice(0,3))))),h('details',null,h('summary',null,'View chart data'),h('ul',null,group.months.map((count,month)=>h('li',{key:month},months[month]+': '+count)))));})),!series.length?h('p',null,'No dated records match these filters.'):null,
      visible.some(row=>!row.date)?h('p',null,visible.filter(row=>!row.date).length+' entries have no complete record date and are omitted from the monthly charts.'):null),
    preview?h(RecordPreview,{React:R,row:preview,onClose:()=>setSelected(null)}):null);
}
