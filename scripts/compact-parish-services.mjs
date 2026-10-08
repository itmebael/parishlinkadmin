import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='dist/assets/index-v20260422157000.js';
let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function Ch('),end=source.indexOf('function Rg(',start);
let component=source.slice(start,end);
if(!component.includes('parish-services-screen')) {
  const render=component.indexOf('return n.jsxs("div",{className:"screen-grid",children:');
  const card='n.jsxs("article",{className:"glass-card page-card screen-grid__full",children:';
  const first=component.indexOf(card,render),second=component.indexOf(card,first+card.length);
  assert.ok(render>=0&&first>render&&second>first);
  assert.ok(component.slice(first,second).includes('Services are loaded from the live service records.'));
  component=component.slice(0,first)+component.slice(second);
  component=component.replace('return n.jsxs("div",{className:"screen-grid",children:', 'return n.jsxs("div",{className:"screen-grid parish-services-screen",children:');
  source=source.slice(0,start)+component+source.slice(end);
  fs.writeFileSync(file,source);
}
console.log('Removed live services card and marked the compact services screen.');
