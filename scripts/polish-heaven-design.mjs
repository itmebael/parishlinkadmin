import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const parser = { exports: {} }; parser.module = { exports: parser.exports };
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'], parser);
const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
function change(before, after) { assert.equal(source.split(before).length, 2, before); source = source.replace(before, after); }
change('eyebrow:"PRMS",title:$e,caption:"Live parish records and office dashboard",footerLabel:"Parish office sync",footerValue:"99.2%",footerNote:"Last parish backup today at 8:22 AM"', 'eyebrow:"PARISH OFFICE",title:"DioLink",caption:$e,footerLabel:"DioLink for parishes",footerValue:"",footerNote:"Here to serve your community."');
change('eyebrow:"Parish Workspace",title:$e,subtitle:"Welcome to your live parish administration dashboard"', 'eyebrow:"WELCOME BACK",title:"Parish office",subtitle:$e');
change('Review Diocese events beside parish events, appointments, and bookings.', 'Your parish events, Mass schedules, and service bookings in one calendar.');
const ast = parser.exports.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
function walk(node, visit) { if (!node || typeof node !== 'object') return; if(node.type)visit(node); for(const v of Object.values(node)){if(Array.isArray(v))v.forEach(x=>walk(x,visit));else if(v&&typeof v==='object')walk(v,visit);} }
const edits=[];
const calendar=ast.body.find(node=>node.id?.name==='$g');
walk(calendar,node=>{
  if(node.type==='CallExpression'&&node.arguments[1]?.type==='ObjectExpression'){
    const properties=node.arguments[1].properties;
    const className=properties.find(p=>p.key?.name==='className')?.value?.value;
    if(className==='glass-card page-card screen-grid__full parish-calendar-tabs-card')edits.push([node.start,node.end,'null']);
    if(className==='screen-grid__full parish-calendar-tab-panel'){
      const child=properties.find(p=>p.key?.name==='children').value;
      edits.push([node.start,node.end,source.slice(child.alternate.start,child.alternate.end)]);
    }
  }
  if(node.type==='FunctionDeclaration'&&['ee','he'].includes(node.id.name))edits.push([node.start,node.end,'']);
});
const parish=ast.body.find(node=>node.id?.name==='Rg');
walk(parish,node=>{
  if(node.type==='CallExpression'&&node.arguments[1]?.type==='ObjectExpression'&&node.arguments[1].properties.some(p=>p.key?.name==='className'&&['mini-dots','live-button'].includes(p.value?.value))) edits.push([node.start,node.end,'null']);
});
const frame=ast.body.find(node=>node.id?.name==='_g');
walk(frame,node=>{
  if(node.type==='CallExpression'&&node.arguments[0]?.value==='button')edits.push([node.start,node.end,'(ra.some(m=>m.id===e)||e==="user-correction")?null:'+source.slice(node.start,node.end)]);
});
for(const [start,end,value]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+value+source.slice(end);
change('N.useEffect(()=>{ee(),g()},[])', 'N.useEffect(()=>{g()},[])');
change('description:"Parish events and service bookings for the Catbalogan parish office."', 'description:"Mass schedules, parish events, and appointments, together in one place."');
parser.exports.parse(source,{ecmaVersion:'latest',sourceType:'module'});
fs.writeFileSync(file,source);
