import assert from 'node:assert/strict';
import {command,evaluate,close} from './design-browser.mjs';
await command('Page.enable'); await command('Runtime.enable');
try {
 await command('Page.navigate',{url:'http://localhost:5181'});
 await new Promise(resolve=>setTimeout(resolve,800));
 for(const width of [390,1440]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});
  const result=await evaluate(`(async()=>{
   const {previewRecordReport}=await import('/dist/assets/record-report-download.js');
   const trigger=document.createElement('button');trigger.textContent='Preview report';document.body.append(trigger);trigger.focus();
   const original=window.open;window.open=()=>{throw Error('Must stay inside admin page')};
   try{await previewRecordReport({records:[{id:1,name:'Sample Parish Record',fee:0}],config:{title:'Baptism records',name:'name',fields:['id','name','fee']},labels:{fee:'Fee'},session:{role:'parish',accessToken:'test',parish_id:'p1'},request:async()=>[{id:'p1',parish_name:'Sample Parish'}]});
    const dialog=document.querySelector('dialog[data-report-preview]'),frame=dialog.querySelector('iframe');
    await new Promise(resolve=>setTimeout(resolve,100));
    const data={open:dialog.open,data:frame.contentDocument.body.textContent.includes('Sample Parish Record'),parish:frame.contentDocument.body.textContent.includes('Sample Parish'),print:!!frame.contentDocument.querySelector('[data-print]'),download:!!frame.contentDocument.querySelector('[data-download]'),fits:dialog.getBoundingClientRect().right<=innerWidth};
    frame.contentDocument.querySelector('[data-close]').click();data.closed=!document.querySelector('dialog[data-report-preview]');data.focus=document.activeElement===trigger;return data;
   }finally{window.open=original;trigger.remove();}
  })()`);
  assert.deepEqual(result,{open:true,data:true,parish:true,print:true,download:true,fits:true,closed:true,focus:true});
 }
 const escape=await evaluate(`(async()=>{const {openReportPreview}=await import('/dist/assets/report-preview-dialog.js');const preview=openReportPreview();preview.document.open();preview.document.write('<p>Loading data...</p>');preview.document.close();preview.focus();preview.document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return preview.closed&&!document.querySelector('dialog[data-report-preview]');})()`);
 assert.equal(escape,true);
 console.log('PASS: in-page report popup renders data, parish, print/download controls at 390/1440px; Close and Escape dismiss it and restore focus; no browser popup used.');
}finally{close();}
