import {groupedAnnouncementRows} from './announcement-kind.js';

export function activityDocuments(posts) {
 const groups=groupedAnnouncementRows(posts,{publishedOnly:false}).latest;
 const documents=new Map();
 for(const item of groups) {
  if(!documents.has(item.post.id))documents.set(item.post.id,{id:item.post.id,post:item.post,status:item.post.status||'Draft',files:[],activities:[]});
  documents.get(item.post.id).activities.push({date:item.date,activity:item.activity,barangay:item.barangay||'',organization:item.organization||'',...(item.time?{time:item.time}:{})});
 }
 return [...documents.values()];
}
export function ActivityUpdateEditor({React:R,posts,onSave,onClose}) {
 const h=R.createElement,ref=R.useRef(null);
 const [documents,setDocuments]=R.useState(()=>activityDocuments(posts));
 const [busy,setBusy]=R.useState(false),[error,setError]=R.useState(''),[dirty,setDirty]=R.useState(false);
 R.useEffect(()=>{const dialog=ref.current,previous=document.body.style.overflow;dialog.showModal();document.body.style.overflow='hidden';return()=>{if(dialog.open)dialog.close();document.body.style.overflow=previous;};},[]);
 async function close() {
  if(busy)return;
  if(dirty&&!(await window.parishDialogs.confirm('Discard your unsaved announcement changes?')))return;
  onClose();
 }
 function change(id,update){setDirty(true);setDocuments(current=>current.map(doc=>doc.id===id?update(doc):doc));}
 function add() {
  setDirty(true);setDocuments(current=>[...current,{id:crypto.randomUUID(),post:null,status:'Draft',files:[],activities:[{date:'',activity:'',barangay:'',organization:''}]}]);
 }
 async function save(event) {
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try {
   await onSave(documents,(id,post)=>setDocuments(current=>current.map(doc=>doc.id===id?{...doc,post,files:[]}:doc)));
   onClose();
  }catch(error){setError(error.message||'Could not save the announcements. Please try again.');}
  finally{setBusy(false);}
 }
 let rowNumber=0;
 return h('dialog',{ref,className:'activity-update-dialog','aria-labelledby':'activity-update-title',onCancel:event=>{event.preventDefault();close();}},
  h('header',{className:'activity-update-header'},h('span',{className:'activity-update-heading-icon','aria-hidden':true},h('svg',{width:27,height:27,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round'},h('path',{d:'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M9 15l3-1 8-8a2.1 2.1 0 0 0-3-3l-8 8-1 4M7 7h3M7 18h10'}))),h('div',{className:'activity-update-heading'},h('h3',{id:'activity-update-title'},'Update Latest Announcements'),h('p',null,'Edit the table, add parish activities, then save your changes.')),h('button',{type:'button',className:'activity-update-close',disabled:busy,onClick:close,'aria-label':'Close announcement editor'},'\u00d7')),
  h('form',{onSubmit:save},
   h('div',{className:'activity-update-body'},
    error?h('p',{className:'activity-update-error',role:'alert'},error):null,
    h('div',{className:'activity-update-table-wrap',role:'region',tabIndex:0,'aria-label':'Editable latest announcements'},
     h('table',{className:'activity-update-table'},
      h('thead',null,h('tr',null,['No.','Date','Activities','Status','Images or files'].map(label=>h('th',{key:label,scope:'col'},label)))),
      h('tbody',null,documents.length?documents.flatMap(doc=>doc.activities.map((item,index)=>{const number=++rowNumber;return h('tr',{key:doc.id+'-'+index},
       h('td',null,h('span',{className:'activity-update-row-number'},String(number).padStart(2,'0'))),
       h('td',null,h('input',{type:'date',required:true,disabled:busy,value:item.date,'aria-label':'Date, row '+number,onChange:event=>change(doc.id,doc=>({...doc,activities:doc.activities.map((row,i)=>i===index?{...row,date:event.target.value}:row)}))})),
       h('td',null,h('textarea',{required:true,disabled:busy,rows:2,value:item.activity,'aria-label':'Activity, row '+number,placeholder:'Enter parish activity',onChange:event=>change(doc.id,doc=>({...doc,activities:doc.activities.map((row,i)=>i===index?{...row,activity:event.target.value}:row)}))})),
       index===0?h('td',{rowSpan:doc.activities.length},h('select',{'data-status':doc.status.toLowerCase(),disabled:busy,value:doc.status,'aria-label':'Status, row '+number,onChange:event=>change(doc.id,doc=>({...doc,status:event.target.value}))},['Draft','Published','Archived'].map(status=>h('option',{key:status,value:status},status)))):null,
       index===0?h('td',{rowSpan:doc.activities.length},h('label',{className:'activity-update-upload'},h('input',{className:'activity-update-file',type:'file',multiple:true,disabled:busy,accept:'.jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.docx,.xlsx','aria-label':'Attachments, row '+number,onChange:event=>{const files=[...event.target.files];change(doc.id,doc=>({...doc,files}));}}),h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,'aria-hidden':true},h('path',{d:'M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5',strokeLinecap:'round',strokeLinejoin:'round'})),h('span',null,'Upload files')),h('small',null,doc.files.length?doc.files.map(file=>file.name).join(', '):doc.post?.attachments?.length?doc.post.attachments.length+' existing attachment(s)':'Optional attachments')):null
      );})):h('tr',null,h('td',{colSpan:5,className:'activity-update-empty'},'No announcements yet. Add a parish activity below.'))))),
    h('button',{type:'button',className:'activity-update-add',disabled:busy,onClick:add},'+ Add Parish Activity')),
   h('footer',{className:'activity-update-footer'},h('div',{className:'activity-update-footer-note'},h('span',{className:'activity-update-save-state','data-dirty':dirty,role:'status'},busy?'Saving changes...':dirty?'Unsaved changes':'No unsaved changes'),h('small',null,'Choose Published to make activities visible to parish members.')),h('button',{type:'button',className:'activity-update-cancel',disabled:busy,onClick:close},'Cancel'),h('button',{type:'submit',className:'activity-update-save',disabled:busy||!dirty||!documents.length},busy?'Saving...':'Save'))));
}