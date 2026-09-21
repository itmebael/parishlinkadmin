import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
const source = fs.readFileSync(file, 'utf8');
const oldText = 'n.jsx("h4",{children:"Archive Records"}),n.jsx("p",{className:"page-card__lead",children:"Saved entries using the requested archive columns."})]}),n.jsxs(G,{tone:"blue",children:[ve(s.length)," records"]})]}),i?n.jsx(Q,{tone:"info",title:"Loading archive records",message:"Fetching archive records now."})';
const newText = 'n.jsx("h4",{children:j.recordType==="Baptism"?"Baptism Records":"Archive Records"}),n.jsx("p",{className:"page-card__lead",children:j.recordType==="Baptism"?"Baptism records saved for your parish.":"Saved entries using the requested archive columns."})]}),n.jsxs(G,{tone:"blue",children:[ve(s.length)," records"]})]}),j.recordType==="Baptism"?n.jsx(BaptismRecords,{session:e,React:N,ui:n,request:Tt}):i?n.jsx(Q,{tone:"info",title:"Loading archive records",message:"Fetching archive records now."})';
const matches = source.split(oldText).length - 1;

if (matches === 0 && source.includes(newText)) {
  console.log('Archive Baptism table branch is already applied.');
} else if (matches === 1) {
  fs.writeFileSync(file, source.replace(oldText, newText));
  console.log('Archive Baptism table branch applied.');
} else {
  throw new Error(`Expected one Archive Records branch, found ${matches}.`);
}
