import assert from 'node:assert/strict';
import {validateFiles, publishingPayload, postAttachments} from '../dist/assets/parish-publishing.js';
import {command, evaluate, screenshot, close} from './design-browser.mjs';
assert.throws(() => validateFiles([{name:'attack.html', type:'text/html', size:100}]), /Use JPG/);
assert.throws(() => validateFiles([{name:'large.pdf', type:'application/pdf', size:11*1024*1024}]), /10 MB/);
assert.throws(() => validateFiles(Array.from({length:11}, () => ({name:'photo.png', type:'image/png', size:1}))), /10 files/);
assert.throws(() => publishingPayload('bulletin', {title:'Test',content:'',category:'Parish matters',status:'Draft'}, {id:'parish'}, [], 'post'), /content/);
assert.equal(postAttachments({photo_urls:['https://example.test/photo.png']}).length, 1);
const fixture = `
const parishId = '00000000-0000-4000-8000-000000000001';
const user = {id:'00000000-0000-4000-8000-000000000002',email:'parish@example.test',email_confirmed_at:'2026-01-01',user_metadata:{role:'parish'}};
sessionStorage.setItem('diocese-dashboard-db-session',JSON.stringify({role:'parish',email:user.email,userId:user.id,accessToken:'mock-token',refreshToken:'mock-refresh',expiresAt:Math.floor(Date.now()/1000)+86400,parish_id:parishId,parish_name:'Test Parish'}));
localStorage.setItem('diocese-dashboard-theme','light');
window.confirm = () => true;
window.posts = {diocese_announcements:[],parish_bulletins:[]}; window.calls = []; window.failSave = false;
const originalFetch = window.fetch;
window.fetch = async (input, init={}) => {
 const u = new URL(String(input),location.origin), method = init.method || 'GET';
 if (!u.host.includes('supabase.co')) return originalFetch(input,init);
 window.calls.push({path:u.pathname,search:u.search,method});
 let data=[];
 if(u.pathname.includes('/auth/v1/')) data=u.pathname.endsWith('/user')?user:{user,access_token:'mock-token'};
 else if(u.pathname.endsWith('/parishes')||u.pathname.includes('get_parish_id_by_email')) data=[{id:parishId,parish_name:'Test Parish'}];
 else if(u.pathname.includes('/storage/v1/')) data=u.pathname.includes('/sign/')?{signedURL:'/object/sign/mock?token=mock'}:{};
 else {
   const table=u.pathname.split('/').pop();
   if(window.posts[table]) {
     if(method==='POST'||method==='PATCH') {
       if(window.failSave) return new Response(JSON.stringify({message:'Test save failure'}),{status:500});
       const payload=JSON.parse(init.body), id=u.searchParams.get('id')?.slice(3)||payload.id;
       const previous=window.posts[table].find(r=>r.id===id);
       const row={...previous,...payload,id,created_at:previous?.created_at||'2026-10-08T00:00:00Z'};
       if(row.status==='Published') row.published_at='2026-10-08T00:00:00Z';
       window.posts[table]=[row,...window.posts[table].filter(r=>r.id!==id)]; data=[row];
     } else if(method==='DELETE') {const id=u.searchParams.get('id')?.slice(3);data=window.posts[table].filter(r=>r.id===id);window.posts[table]=window.posts[table].filter(r=>r.id!==id);}
     else data=window.posts[table];
   }
 }
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};`;
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function waitFor(expression) {for(let i=0;i<60;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Timed out: '+expression);}
async function fill(name, value) {
  await evaluate(`(() => {const el=document.querySelector('.publishing-compose [name="${name}"]');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
}
await command('Page.enable'); await command('Runtime.enable');
await command('Page.navigate',{url:'about:blank'});await pause(100);
const {identifier}=await command('Page.addScriptToEvaluateOnNewDocument',{source:fixture});
try {
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await command('Page.navigate',{url:'http://127.0.0.1:5181/dist/index.html#parish-announcement'});
 await waitFor(`!!document.querySelector('.sidebar__nav')`);
 await pause(500);
 await evaluate(`[...document.querySelectorAll('.sidebar__nav button')].find(b=>b.textContent.trim()==='Announcement').click()`);
 await waitFor(`!!document.querySelector('.publishing-compose fieldset:not(:disabled)')`);
 for(const kind of ['announcement','bulletin']) {
   if(kind==='bulletin'){await evaluate(`document.querySelectorAll('.publishing-tabs button')[1].click()`);await waitFor(`!!document.querySelector('.publishing-compose fieldset:not(:disabled)')`);}
   await fill('title',kind+' test');await fill('content','Parish-approved update');
   await fill('category',kind==='bulletin'?'Project transparency':'Financial Report');
   await evaluate(`(() => {const input=document.querySelector('.publishing-compose input[type=file]'), dt=new DataTransfer();dt.items.add(new File(['test image'],'image.png',{type:'image/png'}));dt.items.add(new File(['test file'],'report.pdf',{type:'application/pdf'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   await evaluate(`document.querySelector('.publishing-compose form').requestSubmit()`);
   await waitFor(`document.querySelector('.publishing-notice')?.textContent.includes('saved as Draft')`);
   const table=kind==='bulletin'?'parish_bulletins':'diocese_announcements';
   const row=await evaluate(`window.posts.${table}[0]`);
   assert.equal(row.attachments.length,2);assert.equal(row.photo_urls.length,1);assert.equal(row.status,'Draft');
   assert.ok(row.attachments.every(a=>a.path.startsWith('00000000-0000-4000-8000-000000000001/'+kind+'/')));
   await evaluate(`document.querySelector('.publishing-post .publishing-actions button').click()`);
   await fill('status','Published');await evaluate(`document.querySelector('.publishing-compose form').requestSubmit()`);
   await waitFor(`document.querySelector('.publishing-notice')?.textContent.includes('saved as Published')`);
   assert.equal(await evaluate(`window.posts.${table}[0].attachments.length`),2);
   await evaluate(`document.querySelector('.publishing-post .publishing-actions button').click()`);
   await evaluate(`document.querySelector('.publishing-file-list button').click()`);
   await evaluate(`document.querySelector('.publishing-compose form').requestSubmit()`);
   await waitFor(`document.querySelector('.publishing-notice')?.textContent.includes('saved as Published')`);
   assert.equal(await evaluate(`window.posts.${table}[0].attachments.length`),1);
   assert.equal(await evaluate(`window.posts.${table}[0].photo_urls.length`),0);
   await evaluate(`document.querySelector('.publishing-post .publishing-actions button').click()`);
   await fill('status','Archived');await evaluate(`document.querySelector('.publishing-compose form').requestSubmit()`);
   await waitFor(`document.querySelector('.publishing-notice')?.textContent.includes('saved as Archived')`);
   await evaluate(`document.querySelectorAll('.publishing-post .publishing-actions button')[1].click()`);
   await waitFor(`window.posts.${table}.length===0`);
 }
 await fill('title','Retry test');await fill('content','Keep this content');
 await evaluate(`(() => {const input=document.querySelector('.publishing-compose input[type=file]'), dt=new DataTransfer();dt.items.add(new File(['pdf'],'failed-save.pdf',{type:'application/pdf'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const cleanupBefore=await evaluate(`window.calls.filter(c=>c.method==='DELETE'&&c.path.includes('/storage/')).length`);
 await evaluate(`window.failSave=true;document.querySelector('.publishing-compose form').requestSubmit()`);
 await waitFor(`document.querySelector('.publishing-notice')?.textContent.includes('Test save failure')`);
 assert.equal(await evaluate(`document.querySelector('[name=title]').value`),'Retry test');
 assert.equal(await evaluate(`window.calls.filter(c=>c.method==='DELETE'&&c.path.includes('/storage/')).length`),cleanupBefore+1);
 await screenshot('parish-publishing-desktop');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await pause(300);
 assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth+1`),false);
 await screenshot('parish-publishing-mobile');
 console.log('PASS: both post types, image/PDF uploads, scoped paths, draft/publish/archive, edit/delete, validation, preserved content after failure, mobile layout. Mock database/storage only.');
} finally {await command('Page.removeScriptToEvaluateOnNewDocument',{identifier});close();}
