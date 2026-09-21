import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const oldAddress = 'Catbalogan City, Samar 6700 (Philippines)';
const newAddress = 'Calbiga, Samar 6715, Philippines';
const matches = source.split(oldAddress).length - 1;

assert.equal(matches, 2, `Expected two certificate address defaults, found ${matches}.`);
source = source.split(oldAddress).join(newAddress);
fs.writeFileSync(file, source);
console.log('Certificate address defaults updated for Calbiga Parish.');
