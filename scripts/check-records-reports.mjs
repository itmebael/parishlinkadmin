import assert from 'node:assert/strict';
import {registerDate,normalizeRecordRows,fetchRecordReportData,filterRecordReports,recordReportCounts,recordReportSeries,buildRecordsReport,RecordsReports} from '../dist/assets/records-reports.js';
import {ParishReports} from '../dist/assets/parish-reports-tabs.js';
const session={role:'parish',email:'office@example.test',parish_id:'p1',accessToken:'admin-token'};
const database={
 baptism_records:[{id:1,parish_id:'p1',name:'Guadalupe Badejo',year_baptism:1941,month_batism:'April',date_batism:12,location:'Calbiga'},{id:2,parish_id:'p1',name:'No date entered'}],
 confirmation_records:[{id:3,parish_id:'p1',name:'Confirmation Person',year_confirm:2026,month_confirm:11,date_baptism:3}],
 marriage_records:[{id:4,parish_id:'p1',entry_no:17,party_role:'Groom',name_family_name:'Groom Person',marriage_date:'2026-11-03'},{id:5,parish_id:'p1',entry_no:17,party_role:'Bride',name_family_name:'Bride Person',marriage_date:'2026-11-03'}],
 diocese_archive_records:[{id:6,parish_id:'p1',record_type:'Death',first_name:'Funeral',last_name:'Person',service_date:'2026-11-02'}],
};
const calls=[];
async function fetchRows(table,query,token) {
 assert.equal(token,'admin-token');calls.push({table,query});
 if(table==='parishes')return[{id:'p1',parish_name:'Test Parish'}];
 assert.ok(query.includes('parish_id=eq.p1'));assert.notEqual(table,'diocese_service_bookings');
 if(table==='diocese_archive_records')assert.ok(query.includes('record_type.ilike.death*'));
 return database[table].map(row=>({...row}));
}
assert.equal(registerDate(1941,'April',12),'1941-04-12');assert.equal(registerDate(2024,'February',29),'2024-02-29');assert.equal(registerDate(2025,'February',29),'');assert.equal(registerDate(1941,'April',null),'');
const result=await fetchRecordReportData({session,fetchRows});
assert.deepEqual(recordReportCounts(result.rows),{baptism:2,confirmation:1,marriage:1,funeral:1});
const marriage=result.rows.find(row=>row.category==='marriage');assert.equal(marriage.records.length,2);assert.ok(marriage.name.includes('Bride Person'));
assert.equal(filterRecordReports(result.rows,{category:'baptism',from:'1941-04-01',to:'1941-04-30'}).length,1);
assert.equal(filterRecordReports(result.rows,{search:'groom'}).length,1);
assert.equal(recordReportSeries(result.rows).length,4);assert.equal(recordReportSeries([]).length,0);
const failure=await fetchRecordReportData({session,fetchRows:async(table,query,token)=>{if(table==='diocese_archive_records')throw Error('Archive unavailable');return fetchRows(table,query,token);}});
assert.ok(failure.errors.funeral);assert.equal(failure.rows.length,4);
const filtered=filterRecordReports(result.rows,{category:'baptism'});
const html=buildRecordsReport({parish:result.parish,rows:filtered,filters:{category:'baptism',from:'',to:'',search:''}});
assert.ok(html.includes('Guadalupe Badejo'));assert.ok(!html.includes('Groom Person'));assert.ok(html.includes('2 register entries'));
const escaped=buildRecordsReport({parish:{parish_name:'<unsafe>'},rows:[],filters:{category:'all',search:'<script>',from:'',to:''}});assert.ok(!escaped.includes('<unsafe>'));assert.ok(escaped.includes('&lt;script&gt;'));
function harness(Component,props) {
 let index=0,refIndex=0;const states=[],refs=[],effects=[];
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],next=>states[i]=typeof next==='function'?next(states[i]):next];},useRef(initial){const i=refIndex++;return refs[i]||(refs[i]={current:initial});},useEffect(fn){const i=index++;if(!effects[i])effects[i]={cleanup:fn()};}};
 return {render(){index=0;refIndex=0;return Component({React,...props});},close(){effects.forEach(effect=>effect?.cleanup?.());}};
}
function nodes(root,predicate){if(!root||typeof root!=='object')return [];return[...(predicate(root)?[root]:[]),...(root.children||[]).flat(Infinity).flatMap(child=>nodes(child,predicate))];}
globalThis.document=new EventTarget();document.visibilityState='visible';
globalThis.window=new EventTarget();window.setInterval=()=>1;window.clearInterval=()=>{};
let reportHtml='';window.open=()=>({document:{open(){},write:html=>reportHtml=html,close(){},body:{}},focus(){}});
const reports=harness(RecordsReports,{session,fetchRows});reports.render();await new Promise(resolve=>setTimeout(resolve,0));let tree=reports.render();
const cards=nodes(tree,node=>node.type==='button'&&node.children.some(child=>child?.type==='strong'));assert.equal(cards.length,4);
cards.find(node=>node.children[0].children[0]==='BAPTISMAL').props.onClick();tree=reports.render();
assert.equal(nodes(tree,node=>node.type==='tr').length,3,'Two baptism entries and table header');
const reads=calls.length;await nodes(tree,node=>node.type==='button'&&node.children.includes('Generate Reports'))[0].props.onClick();assert.ok(calls.length>reads);assert.ok(reportHtml.includes('Guadalupe Badejo'));assert.ok(!reportHtml.includes('Funeral Person'));database.baptism_records.push(...Array.from({length:14},(_,index)=>({id:100+index,parish_id:'p1',name:'Additional '+index,year_baptism:1941,month_batism:'April',date_batism:12})));
await nodes(tree,node=>node.type==='button'&&node.children.includes('Generate Reports'))[0].props.onClick();tree=reports.render();
assert.equal(nodes(tree,node=>node.type==='tr').length,8,'Seven entries plus table header');assert.ok(reportHtml.includes('16 register entries'),'Generated report keeps all matching entries');
nodes(tree,node=>node.type==='button'&&node.children.includes('Next'))[0].props.onClick();tree=reports.render();
assert.equal(nodes(tree,node=>node.type==='tr')[1].children[0].children[0],8,'Second page starts at entry eight');
const region=nodes(tree,node=>node.props.role==='region')[0];region.props.onTouchStart({touches:[{clientX:20,clientY:20}]});region.props.onTouchEnd({changedTouches:[{clientX:120,clientY:25}]});tree=reports.render();assert.equal(nodes(tree,node=>node.type==='tr')[1].children[0].children[0],1,'Swipe right returns to first page');
assert.equal(nodes(tree,node=>node.type==='button'&&node.children.includes('Previous'))[0].props.disabled,true);
reports.close();
const tabs=harness(ParishReports,{session,fetchRows,request:()=>{}});tree=tabs.render();
let controls=nodes(tree,node=>node.props.role==='tab');assert.equal(controls.length,2);assert.equal(controls[0].props['aria-selected'],true);
assert.equal(nodes(tree,node=>node.type?.name==='RecordsReports').length,0,'Records load only when tab is first opened');
controls[1].props.onClick();tree=tabs.render();assert.equal(nodes(tree,node=>node.props.id==='reports-panel-bookings')[0].props.hidden,true);assert.equal(nodes(tree,node=>node.props.id==='reports-panel-records')[0].props.hidden,false);
assert.equal(nodes(tree,node=>node.type?.name==='RecordsReports').length,1);
controls=nodes(tree,node=>node.props.role==='tab');controls[0].props.onClick();tree=tabs.render();assert.equal(nodes(tree,node=>node.type?.name==='RecordsReports').length,1,'Tab content remains mounted to preserve independent filters');tabs.close();
console.log('PASS: independent tabs, parish-only record sources, four category counts, marriage grouping, date/search filters, real charts, unavailable-source errors, fresh filtered reports, escaping, and tab-state preservation.');
