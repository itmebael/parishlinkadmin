import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const before = 'children:showPassword?"Hide":"Show"';
const after = 'children:n.jsxs("svg",{viewBox:"0 0 24 24","aria-hidden":"true",children:[n.jsx("path",{d:"M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"}),n.jsx("circle",{cx:"12",cy:"12",r:"2.4",fill:"none",stroke:"currentColor",strokeWidth:"1.8"}),showPassword?n.jsx("path",{d:"M4 4 20 20",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round"}):null]})';
assert.equal(source.split(before).length - 1, 1, 'Could not find the password visibility button.');
source = source.replace(before, after);
fs.writeFileSync(file, source);
console.log('Password visibility eye icon added.');
