import fs from 'node:fs';
const path = 'dist/assets/index-v20260422157000.js';
const source = fs.readFileSync(path, 'utf8');
const entry = '{id:"parish-services",label:"Services",icon:"services"}';
if (!source.includes(entry)) throw new Error('Services sidebar entry not found.');
fs.writeFileSync(path, source.replace(entry, '{id:"parish-services",label:"Certificate",icon:"services"}'));
