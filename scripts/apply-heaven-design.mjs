import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const parser = { exports: {} };
parser.module = { exports: parser.exports };
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'], parser);
const parse = s => parser.exports.parse(s, { ecmaVersion: 'latest', sourceType: 'module' });
const bundle = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(bundle, 'utf8');
function replace(before, after) {
  assert.equal(source.split(before).length, 2, `Expected one match: ${before.slice(0, 80)}`);
  source = source.replace(before, after);
}
for (const [before, after] of [
  ['Diocese Workspace Login', 'DioLink'],
  ['Sign in and open the Diocese, Parish, or User dashboard as separate workspaces.', 'A little closer to your parish.'],
  ['Run daily parish operations with less friction', 'A peaceful space to serve.'],
  ['Handle certificate queues, office schedules, livestream updates, and sacramental service requests in one view.', 'Care for your community, one day at a time. Manage requests, parish records, and schedules in one simple place.'],
  ['Keep the member experience simple and welcoming', 'Faith brings us closer.'],
  ['Open the user portal for livestreams, parish notices, worship schedules, and community updates.', 'Stay connected to your parish. Find a Mass, request a certificate, or reach out whenever you need a helping hand.'],
  ['Parish Office Access', 'SERVING WITH CARE'],
  ['Member Access', 'FAITH · COMMUNITY · CONNECTION'],
  ['title:"Catbalogan Parish Dashboard"', 'title:"Your parish, at a glance"'],
  ['description:"Live parish workspace for office transactions, liturgy, and announcements."', 'description:"A clear view of today’s requests, schedules, and community updates."'],
  ['children:"Good Morning!"', 'children:"YOUR PARISH COMMUNITY"'],
  ['children:"Welcome!"', 'children:"You belong here."'],
  ['children:"We\'re glad to have you here."', 'children:"A moment of connection, a little peace of mind."'],
  ['children:"How can we serve you today?"', 'children:"How can we help you today?"'],
  ['children:"Live parish workspace for "+$e+". All data below is pulled from your parish records in real time."', 'children:"A new day to care for your community. Keep requests moving and help parish life flourish."'],
  ['children:"Parish Account"', 'children:"WELCOME TO YOUR PARISH OFFICE"'],
  ['message:"Fetching pending requests from Supabase."', 'message:"Getting the latest requests…"'],
  ['message:"Fetching today\'s events from Supabase."', 'message:"Getting today’s schedule…"'],
  ['message:"Fetching announcements from Supabase."', 'message:"Getting parish announcements…"'],
]) replace(before, after);
replace('"User Registration":"Log In"', '"Create your account":"Welcome back"');
replace('`Register ${p.label}`', '"Create an account"');
replace('`Open ${p.destinationLabel}`', '"Sign in"');
replace('placeholder:h?"Enter registered email":"Enter username"', 'placeholder:h?"you@example.com":"Enter username"');
replace('placeholder:`Enter password for ${p.label.toLowerCase()} access`', 'placeholder:"Enter your password"');
replace('const H=k,se=', 'const H=E||k,se=');
replace('onClick:()=>{a($.id),y(null),$.id==="diocese"&&l("login")}', 'onKeyDown:ev=>{if(ev.key==="ArrowLeft"||ev.key==="ArrowRight"){ev.preventDefault();const next=fr[(fr.findIndex(v=>v.id===$.id)+1)%fr.length];a(next.id);y(null);setTimeout(()=>document.getElementById(`login-role-tab-${next.id}`)?.focus(),0)}},onClick:()=>{a($.id),y(null)}');
replace('[agreeTerms,setAgreeTerms]=N.useState(!1)', '[showPassword,setShowPassword]=N.useState(false),[agreeTerms,setAgreeTerms]=N.useState(!1)');
replace('role:"tabpanel","aria-labelledby":`login-role-tab-${p.id}`', 'role:"tabpanel","aria-labelledby":`login-role-tab-${p.id}`,onKeyDown:ev=>{if(!u&&ev.key==="Enter"&&ev.target.tagName==="INPUT"&&ev.target.type!=="checkbox"&&!o&&agreeTerms){ev.preventDefault();H()}}');
const passwordInput = 'n.jsx("input",{id:`${p.id}-login-password`,name:`${p.id}LoginPassword`,type:"password",value:x.password,placeholder:"Enter your password",autoComplete:"current-password",onChange:$=>S("password",$.target.value)})';
replace(passwordInput, 'n.jsxs("div",{className:"heaven-password",children:[' + passwordInput.replace('type:"password"', 'type:showPassword?"text":"password"') + ',n.jsx("button",{type:"button",className:"heaven-password__toggle","aria-label":showPassword?"Hide password":"Show password","aria-pressed":showPassword,onClick:()=>setShowPassword(v=>!v),children:n.jsxs("svg",{viewBox:"0 0 24 24","aria-hidden":"true",children:[n.jsx("path",{d:"M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"}),n.jsx("circle",{cx:"12",cy:"12",r:"2.4",fill:"none",stroke:"currentColor",strokeWidth:"1.8"}),showPassword?n.jsx("path",{d:"M4 4 20 20",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round"}):null]})})]})');

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach(x => walk(x, visit));
    else if (v && typeof v === 'object') walk(v, visit);
  }
}
const ast = parse(source);
const edits = [];
const home = ast.body.find(node => node.id?.name === 'kg');
walk(home, node => {
  if (node.type === 'CallExpression' && node.arguments[1]?.type === 'ObjectExpression' && node.arguments[1].properties.some(p => p.key?.name === 'className' && p.value?.value === 'dio-assistant')) edits.push([node.start, node.end, 'null']);
});
const shell = ast.body.find(node => node.id?.name === 'gg');
walk(shell, node => {
  if (node.type === 'ConditionalExpression' && node.test.name === 'k' && source.slice(node.consequent.start, node.consequent.end).includes('className:"user-topbar-menu"')) {
    edits.push([node.start, node.end, 'n.jsxs(n.Fragment,{children:[' + source.slice(node.consequent.start, node.consequent.end) + ',E?' + source.slice(node.alternate.start, node.alternate.end) + ':null]})']);
  }
});
assert.equal(edits.length, 2);
for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + value + source.slice(end);
parse(source);
fs.writeFileSync(bundle, source);

let html = fs.readFileSync('dist/index.html', 'utf8');
html = html.replace('<html lang="en">', '<html lang="en" data-design="heaven">');
html = html.replace(/<style id="senior-friendly-theme">[\s\S]*?<\/style>/, '<!-- Typography and accessible text sizing are styled in heaven.css. -->');
html = html.replace('</head>', '  <link rel="stylesheet" href="/dist/assets/heaven.css?v=20260919-1">\n  </head>');
html = html.replace('parish-user-cleanup-20260919', 'heaven-design-20260919');
html = html.replace('<title>Diocese of Calbayog Admin Dashboard</title>', '<title>DioLink · Your parish, closer</title>');
fs.writeFileSync('dist/index.html', html);
