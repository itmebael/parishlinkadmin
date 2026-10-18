export async function updateSacramentalRecord(request, session, {table,fields,name}, record, values) {
 if(session?.role!=='parish'||!session.accessToken)throw Error('Sign in as a parish administrator before editing records.');
 if(!record?.id)throw Error('This record has no record number.');
 let parishId=session.parish_id;
 if(!parishId&&session.email){const rows=await request('/rest/v1/rpc/get_parish_id_by_email',{method:'POST',body:{p_email:session.email},accessToken:session.accessToken});if(Array.isArray(rows)&&rows.length===1)parishId=rows[0].id;}
 if(!parishId)throw Error('Your account is not linked to a parish.');
 if(!String(values[name]||'').trim())throw Error('Enter the person�s name before saving.');
 const body={};for(const key of fields)if(!['id','created_at','parish_id'].includes(key))body[key]=String(values[key]??'').trim()||null;
 const query=new URLSearchParams({id:'eq.'+record.id,parish_id:'eq.'+parishId,select:'*'});
 const saved=await request('/rest/v1/'+table+'?'+query,{method:'PATCH',body,headers:{Prefer:'return=representation'},accessToken:session.accessToken});
 if(!Array.isArray(saved)||saved.length!==1)throw Error('The record was not updated. Check your parish permissions and refresh the records.');
 return saved[0];
}
export function RecordEditor({React:R,request,session,config,labels,records,onClose,onSaved}) {
 const h=R.createElement,ref=R.useRef(null),[index,setIndex]=R.useState(0),[values,setValues]=R.useState({...records[0]}),[busy,setBusy]=R.useState(false),[error,setError]=R.useState('');
 R.useEffect(()=>{ref.current.showModal();return()=>ref.current?.close();},[]);
 async function save(event){event.preventDefault();if(busy)return;setBusy(true);setError('');try{await updateSacramentalRecord(request,session,config,records[index],values);onSaved();}catch(e){setError(e.message||'Could not save the record.');}finally{setBusy(false);}}
 return h('dialog',{ref,className:'sacramental-edit-dialog','aria-labelledby':'record-edit-title',onCancel:e=>{e.preventDefault();if(!busy)onClose();}},
 h('header',null,h('h3',{id:'record-edit-title'},'Edit '+config.title.replace(/ records$/i,' record')),h('button',{type:'button','aria-label':'Close record editor',disabled:busy,onClick:onClose},'�')),
 h('form',{onSubmit:save},records.length>1?h('label',{className:'record-edit-party'},'Person',h('select',{value:index,disabled:busy,onChange:e=>{const next=Number(e.target.value);setIndex(next);setValues({...records[next]});setError('');}},records.map((r,i)=>h('option',{key:r.id,value:i},(r.party_role||'Person')+': '+(r[config.name]||'Unnamed'))))):null,
 error?h('p',{role:'alert'},error):null,
 h('fieldset',{disabled:busy,className:'record-edit-fields'},config.fields.filter(key=>!['id','created_at','parish_id'].includes(key)).map(key=>h('label',{key},labels[key]||key,h('input',{name:key,type:key==='marriage_date'?'date':'text',required:key===config.name,value:values[key]??'',onChange:e=>setValues({...values,[key]:e.target.value})})))),
 h('footer',null,h('button',{type:'button',className:'secondary-action',disabled:busy,onClick:onClose},'Cancel'),h('button',{type:'submit',className:'primary-action',disabled:busy},busy?'Saving�':'Save Changes'))));
}
