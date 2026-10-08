import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {command,evaluate,close,browserErrors} from './design-browser.mjs';
const source=fs.readFileSync('dist/assets/index-v20260422157000.js','utf8');
const loader=source.slice(source.indexOf('async function kh('),source.indexOf('function pg(',source.indexOf('async function kh(')));
const queries=[];
const scope=vm.createContext({Fc:()=>({}),ao:async()=>({parish_name:'Parish Of Calbiga'}),V:error=>error.message,de:async(table,query,token)=>{queries.push({table,query,token});return[];}});
vm.runInContext(loader,scope);
await vm.runInContext(`kh('test-token',{parish_name:'Parish Of Calbiga'})`,scope);
assert.ok(queries[0].query.includes('parish_name=ilike.Parish%20Of%20Calbiga'));
assert.equal(queries[0].token,'test-token');
await vm.runInContext(`kh('test-token',{email:'admin@example.test'})`,scope);
assert.equal(queries.length,2);
await assert.rejects(vm.runInContext(`kh('test-token',{})`,scope),/Could not find the parish/);
assert.equal(queries.length,2,'Missing parish must never query unrelated bookings');
let failed=false;
scope.de=async(table,query)=>{if(!failed){failed=true;throw new Error('column does not exist');}return[{id:'legacy'}];};
assert.equal((await vm.runInContext(`kh('test-token',{parish_name:'Parish Of Calbiga'})`,scope))[0].id,'legacy');
console.log('PASS: parish scoping, profile lookup, token, and older schema fallback');
const fixture=fs.readFileSync('scripts/check-admin-only.mjs','utf8').match(/const fixture=`([\s\S]*?)`;/)[1];
const extra=`
const stored=JSON.parse(sessionStorage.getItem('diocese-dashboard-db-session'));stored.parish_name='Parish Of Calbiga';sessionStorage.setItem('diocese-dashboard-db-session',JSON.stringify(stored));
window.bookingRows=[{id:'old',parish_name:'Parish Of Calbiga',client_name:'Existing Member',reference_number:'CERT-OLD',service_name:'Baptismal Certificate',booking_status:'Pending',created_at:'2026-10-07T01:00:00Z'}];
window.bookingQueries=[];window.bookingFailure=false;window.bookingPolling=[];
const bookingFetch=window.fetch;
window.fetch=async(input,init)=>{const url=new URL(String(input),location.origin);if(url.pathname.endsWith('/diocese_service_bookings')){window.bookingQueries.push(url.searchParams.get('parish_name'));if(window.bookingFailure)return new Response(JSON.stringify({message:'Temporary connection error'}),{status:503});const filter=url.searchParams.get('parish_name');return new Response(JSON.stringify(filter==='ilike.Parish Of Calbiga'?window.bookingRows:[]),{status:200});}return bookingFetch(input,init);};
const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>{if(ms===15000)window.bookingPolling.push(fn);return interval(fn,ms,...args);};`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await pause(150);}throw new Error('Timed out: '+expression);}
await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Network.setCacheDisabled',{cacheDisabled:true});
const {identifier}=await command('Page.addScriptToEvaluateOnNewDocument',{source:fixture+extra});
try {
await command('Page.navigate',{url:'http://127.0.0.1:5181/dist/index.html?role=parish&bookingRefreshCheck='+Date.now()});await pause(500);
await waitFor(`!!document.querySelector('.sidebar__nav')`);
await evaluate(`window.bookingQueries=[];[...document.querySelectorAll('.sidebar .nav-item')].find(el=>el.textContent.trim()==='Bookings').click()`);
await waitFor(`document.querySelectorAll('.parish-booking-item').length===1`);
await evaluate(`window.bookingRows.push({id:'new',parish_name:'Parish Of Calbiga',client_name:'New Member',reference_number:'APT-NEW',service_name:'Appointment',booking_status:'Appointment',created_at:'2026-10-08T01:00:00Z'});window.bookingPolling.at(-1)()`);
await waitFor(`document.querySelectorAll('.parish-booking-item').length===2`);
assert.ok(await evaluate(`document.querySelector('.parish-booking-item').textContent.includes('APT-NEW')`));
await evaluate(`window.bookingFailure=true;window.dispatchEvent(new Event('focus'))`);
await waitFor(`document.body.innerText.includes('Temporary connection error')`);
assert.equal(await evaluate(`document.querySelectorAll('.parish-booking-item').length`),2);
await evaluate(`window.bookingFailure=false;window.bookingRows.push({id:'manual',parish_name:'Parish Of Calbiga',client_name:'Manual Refresh Member',reference_number:'CERT-MANUAL',service_name:'Baptismal Certificate',booking_status:'Pending',created_at:'2026-10-08T02:00:00Z'});document.querySelector('.parish-booking-refresh button').click()`);
await waitFor(`document.querySelectorAll('.parish-booking-item').length===3`);
assert.equal(await evaluate(`window.bookingQueries.every(filter=>filter==='ilike.Parish Of Calbiga')`),true);
assert.deepEqual(browserErrors,[]);
console.log('PASS: new bookings appear on polling, newest first, retained on errors, and manual refresh works');
}finally{await command('Page.removeScriptToEvaluateOnNewDocument',{identifier});close();}
