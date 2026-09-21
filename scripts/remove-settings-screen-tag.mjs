import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const before = '"parish-settings":{title:"Parish Setting",description:"Adjust parish workspace notifications, reminders, and preferences.",badge:"Setting"}';
const after = '"parish-settings":{title:"Parish Setting",description:"Adjust parish workspace notifications, reminders, and preferences.",badge:""}';
assert.equal(source.split(before).length - 1, 1, 'Could not find the Parish Setting tag.');
source = source.replace(before, after);
fs.writeFileSync(file, source);
console.log('Parish Setting screen tag removed.');
