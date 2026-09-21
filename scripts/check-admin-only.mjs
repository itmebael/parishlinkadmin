import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {command,evaluate,close,browserErrors} from './design-browser.mjs';
const source=fs.readFileSync('dist/assets/index-v20260422157000.js','utf8');
const parser={exports:{}};parser.module={exports:parser.exports};
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'],parser);
const ast=parser.exports.parse(source,{ecmaVersion:'latest',sourceType:'module'});
const names=['requireAdmin','$f','If','gh'];
const authCode=ast.body.filter(n=>names.includes(n.id?.name)).map(n=>source.slice(n.start,n.end)).join('\n');
for(const role of ['user','diocese','',undefined,'parish']) {
  const user={user_metadata:{role}};
  const context=vm.createContext({Tt:async path=>path==='/auth/v1/user'?user:{user},user});
  vm.runInContext(authCode,context);
  for(const expression of ['$f({email:"test",password:"test"})','If("token")','gh("token")']) {
    if(role==='parish')await vm.runInContext(expression,context);
    else await assert.rejects(vm.runInContext(expression,context),/Only parish administrators/);
  }
}
const fixture=`
const role=new URL(location.href).searchParams.get('role');
const session={role,email:'admin@example.test',displayName:'Admin',accessToken:'test',refreshToken:'test',expiresAt:Math.floor(Date.now()/1000)+3600,userId:'test',parish_id:'test',parish_name:'Test Parish'};
sessionStorage.clear();if(role)sessionStorage.setItem('diocese-dashboard-db-session',JSON.stringify(session));
const original=fetch;window.fetch=async (input,init)=>{const url=String(input);if(!url.includes('supabase.co'))return original(input,init);let data=[];if(url.includes('/auth/v1/')){const loginRole=window.testLoginRole||role||'user';const user={id:'test',email:'admin@example.test',user_metadata:{role:loginRole}};data=url.includes('/user')?user:{user,access_token:'test',refresh_token:'test',expires_in:3600};}if(url.includes('get_parish_id_by_email'))data=[{id:'test',parish_name:'Test Parish'}];return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});};`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){for(let i=0;i<60;i++){try{if(await evaluate(`document.readyState==='complete'&&!!document.body&&document.body.innerText.length>40`))return;}catch{}await pause(250);}throw new Error('Page did not finish loading');}
try {
  await command('Runtime.enable');await command('Page.enable');
  await command('Page.addScriptToEvaluateOnNewDocument',{source:fixture});
  for(const role of ['','user','parish']) {
    await command('Page.navigate',{url:`http://127.0.0.1:5181/dist/index.html?role=${role}#${role==='parish'?'parish-catbalogan':'user-dashboard'}`});
    await ready();await pause(700);
    const state=await evaluate(`({text:document.body.innerText,session:sessionStorage.getItem('diocese-dashboard-db-session')})`);
    if(role==='parish')assert.ok(!state.text.includes('Admin login'),'Admin session opens dashboard');
    else {assert.ok(state.text.includes('Admin login'),'Client/anonymous route returns login');assert.ok(!state.text.includes('Create an account'));assert.equal(state.session,null);}
  }
  await command('Page.navigate',{url:'http://127.0.0.1:5181/dist/index.html#login'});await ready();await pause(700);
  for(const role of ['user','parish']) {
    await evaluate(`window.testLoginRole=${JSON.stringify(role)};for(const [name,value] of [['email','admin@example.test'],['password','example-password']]){const el=document.querySelector('input[name="'+name+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}`);
    await evaluate(`var terms=document.querySelector('input[name="portalTermsAccepted"]');if(terms)terms.checked=true;document.querySelector('form.login-card--form').requestSubmit()`);await pause(1300);
    if(role==='user'){assert.match(await evaluate('document.body.innerText'),/Only parish administrators/);assert.equal(await evaluate(`sessionStorage.getItem('diocese-dashboard-db-session')`),null);}
    else assert.equal(await evaluate('location.hash'),'#parish-catbalogan');
  }
  assert.deepEqual(browserErrors,[]);
  console.log('PASS: login, refresh, callback reject non-admin roles; client routes and sessions blocked; admin login and restored session open dashboard; no browser exceptions.');
} finally {close();}
