import fs from 'node:fs';
import assert from 'node:assert/strict';
const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const oldLoader = 'async function kh(e){const t=encodeURIComponent(`*${Zr}*`),r=';
if (source.includes(oldLoader)) {
  source = source.replace(oldLoader, `async function kh(e,session=Fc()){
    let parishName=String(session?.parish_name||session?.parishName||"").trim();
    if(!parishName&&session?.email){const parish=await ao({parishEmail:session.email,accessToken:e});parishName=String(parish?.parish_name||"").trim();}
    if(!parishName)throw new Error("Could not find the parish linked to your account. Please log in again or check your parish profile.");
    const t=encodeURIComponent(parishName.replace(/[\\\\%_*]/g,char=>"\\\\"+char)),r=`);
  source = source.replaceAll('kh(be(e))', 'kh(be(e),e)');
}
const start = source.indexOf('function Og('), end = source.indexOf('function ', source.indexOf('return n.jsx("div",{className:"screen-grid"', start));
assert.ok(start >= 0 && end > start);
let component = source.slice(start, end);
if (!component.includes('bookingRequestRef')) {
  component = component.replace('const[t,r]=N.useState([])', 'const bookingRequestRef=N.useRef(false),bookingMountedRef=N.useRef(true);const[t,r]=N.useState([])');
  component = component.replace('async function d(){', 'async function d(quiet=false){if(bookingRequestRef.current)return;');
  component = component.replace('try{a(!0);const y=await kh(be(e),e)', 'bookingRequestRef.current=true;try{if(!quiet)a(!0);const y=await kh(be(e),e);if(!bookingMountedRef.current)return;const bookings=y');
  component = component.replace('j=(Array.isArray(y)?y:[])', 'j=(Array.isArray(bookings)?bookings:[])');
  // The replacement above introduces a semicolon before the existing comma.
  component = component.replace('const bookings=y,j=', 'const bookings=y,j=');
  component = component.replace('catch(y){const j=V(y)', 'catch(y){if(!bookingMountedRef.current)return;const j=V(y)');
  component = component.replace('r([]),l({tone:"error",title:A?', 'l({tone:"error",title:A?');
  component = component.replace('finally{a(!1)}}N.useEffect(()=>{d()},[]);', `finally{bookingRequestRef.current=false;if(bookingMountedRef.current&&!quiet)a(!1)}}N.useEffect(()=>{
    bookingMountedRef.current=true;d();
    const refresh=()=>{if(document.visibilityState!=="hidden")d(true)};
    const timer=window.setInterval(refresh,15000);
    window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return()=>{bookingMountedRef.current=false;window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh)};
  },[e?.email,e?.parish_name,e?.accessToken]);`);
  const count = 'n.jsxs(G,{tone:"blue",children:[ve(Of.length)," of ",ve(t.length)," bookings"]})';
  assert.ok(component.includes(count));
  component = component.replace(count, `n.jsxs("div",{className:"parish-booking-refresh",children:[${count},n.jsx("button",{type:"button",className:"secondary-action",disabled:s,onClick:()=>d(),children:s?"Refreshing...":"Refresh"})]})`);
  source = source.slice(0, start) + component + source.slice(end);
  fs.writeFileSync(file, source);
}
source = source.replace('async async function kh(', 'async function kh(');
fs.writeFileSync(file, source);
console.log('Bookings now use the signed-in parish and refresh automatically.');
