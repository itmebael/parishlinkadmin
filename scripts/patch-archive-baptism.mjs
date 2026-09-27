import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
const source = fs.readFileSync(file, 'utf8');
const oldText = 'j.recordType==="Baptism"?n.jsx(BaptismRecords,{session:e,React:N,ui:n,request:Tt}):i?n.jsx(Q,{tone:"info",title:"Loading archive records",message:"Fetching archive records now."})';
const newText = 'i?n.jsx(Q,{tone:"info",title:"Loading archive records",message:"Fetching archive records now."})';
const matches = source.split(oldText).length - 1;

if (matches === 0 && !source.includes(oldText)) {
  console.log('Archive Baptism embed is already removed.');
} else if (matches === 1) {
  fs.writeFileSync(file, source.replace(oldText, newText));
  console.log('Archive Baptism embed removed.');
} else {
  throw new Error(`Expected one Archive Records branch, found ${matches}.`);
}
