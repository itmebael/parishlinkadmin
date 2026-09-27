import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const anchor = '{id:"parish-announcement",label:"Announcement",icon:"announcement"},';
const entries = '{id:"parish-records",label:"Records",icon:"requests"},{id:"parish-archive",label:"Archive",icon:"reports"},';
if (!source.includes(entries)) {
  assert.equal(source.split(anchor).length - 1, 1, 'Expected one parish navigation list');
  source = source.replace(anchor, anchor + entries);
  fs.writeFileSync(file, source);
}
const htmlFile = 'dist/index.html';
const html = fs.readFileSync(htmlFile, 'utf8').replace(
  /index-v20260422157000\.js\?v=[^"\s]+/,
  'index-v20260422157000.js?v=records-archive-navigation-20260927'
);
fs.writeFileSync(htmlFile, html);
console.log('Restored Records and Archive navigation and refreshed the bundle version.');
