import fs from 'node:fs';
const s = fs.readFileSync('dist/assets/index-v20260422157000.js', 'utf8');
const keys = [
  'BaptismRecords',
  'jsx(BaptismRecords',
  'n.jsx(BaptismRecords',
  'Archive records',
  'Parish Archive',
  'diocese_archive_records',
  'baptism_records',
  'parish-archive',
  'id:"archive"',
  'id:"records"',
];
for (const k of keys) {
  let i = 0;
  let c = 0;
  const count = s.split(k).length - 1;
  console.log(`\n==== ${JSON.stringify(k)} count=${count}`);
  while ((i = s.indexOf(k, i)) !== -1 && c < 4) {
    console.log(s.slice(Math.max(0, i - 160), i + 280).replace(/\s+/g, ' '));
    console.log('---');
    i += k.length;
    c++;
  }
}
