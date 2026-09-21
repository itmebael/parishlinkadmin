import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const parser={exports:{}};parser.module={exports:parser.exports};
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'],parser);
const parse=s=>parser.exports.parse(s,{ecmaVersion:'latest',sourceType:'module'});
const file='dist/assets/index-v20260422157000.js';
let source=fs.readFileSync(file,'utf8');
const originalLength=source.length;
const sqlHashes=Object.fromEntries(fs.readdirSync('sql').map(f=>[f,fs.readFileSync('sql/'+f).toString('base64')]));
function walk(node,fn){if(!node||typeof node!=='object')return;if(node.type)fn(node);for(const v of Object.values(node))if(Array.isArray(v))v.forEach(n=>walk(n,fn));else if(v&&typeof v==='object')walk(v,fn);}
function edits(list){for(const [start,end,text] of list.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);parse(source);}
function replace(a,b){assert.equal(source.split(a).length,2,'Expected unique match: '+a.slice(0,80));source=source.replace(a,b);}
function fn(name,body){const node=parse(source).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(node,name);edits([[node.start,node.end,body]]);}
fn('vg',fs.readFileSync('scripts/admin-login.txt','utf8'));
let changes=[];
walk(parse(source),node=>{
  if(node.type==='SwitchCase'&&String(node.test?.value).startsWith('user-'))changes.push([node.start,node.end,'']);
  if(node.type==='VariableDeclarator'&&node.id.name==='ra')changes.push([node.init.start,node.init.end,'[]']);
  if(node.type==='VariableDeclarator'&&node.id.name==='fr')changes.push([node.init.start,node.init.end,'[{id:"parish",label:"Admin",role:"Parish Administrator",destination:"parish-catbalogan"}]']);
  if(node.type==='VariableDeclarator'&&node.id.name==='Dc')changes.push([node.init.start,node.init.end,'{'+node.init.properties.filter(p=>!String(p.key.name||p.key.value).startsWith('user-')).map(p=>source.slice(p.start,p.end)).join(',')+'}']);
});
edits(changes);
replace('Dc[e]||Dc["user-dashboard"]','Dc[e]||Dc["parish-catbalogan"]');
fn('Uc','function Uc(e){const t=e.replace(/^#/,"");return t==="login"||t==="logout"||Zi.some(route=>route.id===t)?t:"login"}');
replace('if(_ses.role==="diocese")','if(_ses.role!=="parish")');
replace('function ln(e){if(!(typeof window>"u")){','function ln(e){if(!(typeof window>"u")){if(e&&e.role!=="parish")e=null;');
// Validate every password login, token refresh, and URL callback against the auth response.
source+='\nfunction requireAdmin(user){const role=user?.app_metadata?.role||user?.user_metadata?.role;if(role!=="parish")throw new Error("Access denied. Only parish administrators can sign in to this admin portal.");return user;}\n';
fn('$f','async function $f({email:e,password:t}){const result=await Tt("/auth/v1/token?grant_type=password",{method:"POST",body:{email:e,password:t}});requireAdmin(result.user);return result;}');
fn('If','async function If(e){const result=await Tt("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:{refresh_token:e}});requireAdmin(result.user);return result;}');
fn('gh','async function gh(e){return requireAdmin(await Tt("/auth/v1/user",{accessToken:e}));}');
replace('[d,v]=N.useState(Fc)','[d,v]=N.useState(null)');
replace('[w,y]=N.useState(Ja);','[w,y]=N.useState(Ja);N.useEffect(()=>{let active=true;const saved=Fc();if(saved?.accessToken)gh(saved.accessToken).then(user=>{if(active){const verified={...saved,role:"parish",email:user.email,userId:user.id};ln(verified);v(verified);A(Rc("parish"));}}).catch(()=>{if(active){ln(null);v(null);A("login");}});return()=>{active=false;};},[]);');
replace('if(await Nh({...Pe,user:ne}),F)return;','if(F)return;');
replace('Z=((J=ne==null?void 0:ne.user_metadata)==null?void 0:J.role)||""','Z="parish"');
// Remove all now-unreferenced application functions, including client pages and signup helpers.
const removed=[];
for(;;){const ast=parse(source);const candidates=ast.body.filter(n=>n.type==='FunctionDeclaration'&&n.start>source.indexOf('function Rc('));const counts=new Map();walk(ast,n=>{if(n.type==='Identifier')counts.set(n.name,(counts.get(n.name)||0)+1);});const dead=candidates.filter(n=>{let internal=0;walk(n,x=>{if(x.type==='Identifier'&&x.name===n.id.name)internal++;});return counts.get(n.id.name)===internal;});if(!dead.length)break;removed.push(...dead.map(n=>n.id.name));edits(dead.map(n=>[n.start,n.end,'']));}
fs.writeFileSync(file,source);
let html=fs.readFileSync('dist/index.html','utf8');
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,block=>block.includes('function isUserDashboard()')||block.includes('data-ucs-injected')||block.includes('__umrMyRequestsInjected')?'':block);
html=html.replace('parish-user-only-20260919','admin-only-20260920').replace(/<title>.*?<\/title>/,'<title>DioLink · Admin Portal</title>');
fs.writeFileSync('dist/index.html',html);
for(const [name,bytes] of Object.entries(sqlHashes))assert.equal(fs.readFileSync('sql/'+name).toString('base64'),bytes);
console.log(`Removed ${removed.length} unused functions and ${originalLength-source.length} characters. All ${Object.keys(sqlHashes).length} SQL files unchanged.`);
