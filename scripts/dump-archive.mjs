import fs from 'node:fs';
const s = fs.readFileSync('dist/assets/index-v20260422157000.js', 'utf8');

function dump(label, start, len = 2500) {
  console.log('\n======== ' + label + ' @' + start + ' ========');
  console.log(s.slice(start, start + len));
}

dump('Qc start', s.indexOf('function Qc('), 1800);
dump('parish-archive case', s.indexOf('case"parish-archive"'), 400);
dump('nav archive', s.indexOf('{id:"parish-archive"'), 200);
dump('Dc parish-archive', s.indexOf('"parish-archive":{title'), 400);
dump('zg', s.indexOf('function zg({workspaceSession'), 200);
