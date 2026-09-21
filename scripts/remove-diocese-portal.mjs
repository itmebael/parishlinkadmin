import fs from 'node:fs';

// The deployed application is maintained in this prebuilt bundle.
const bundlePath = 'dist/assets/index-v20260422157000.js';
let bundle = fs.readFileSync(bundlePath, 'utf8');
function replaceOnce(before, after) {
  if (bundle.split(before).length !== 2) throw new Error(`Expected one match: ${before.slice(0, 60)}`);
  bundle = bundle.replace(before, after);
}
function removeBetween(start, end, replacement = '') {
  const from = bundle.indexOf(start);
  const to = bundle.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing section: ${start}`);
  replaceOnce(bundle.slice(from, to), replacement);
}
removeBetween('Gi=[{id:"dashboard"', ',Zi=[', 'Gi=[]');
removeBetween('fr=[{id:"diocese"', '{id:"parish",label:"Parish"', 'fr=[');
removeBetween('if(p.id==="diocese"){var _HC_DIOCESE=', 'try{c(!0);const M=await $f');
removeBetween('N.useEffect(()=>{p.id==="diocese"', 'N.useEffect(()=>{const $=Tf()');
replaceOnce('useState({diocese:{identifier:"",password:""},parish:', 'useState({parish:');
replaceOnce('if(!_ses||typeof _ses!=="object")return null;', 'if(!_ses||typeof _ses!=="object")return null;if(_ses.role==="diocese"){window.sessionStorage.removeItem(Xi);return null;}');
replaceOnce('function A(b){if(typeof window>"u")return;l(!1);', 'function A(b){if(typeof window>"u")return;b=Uc(b);l(!1);');
fs.writeFileSync(bundlePath, bundle);

const htmlPath = 'dist/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');
// Remove the Parish-to-Diocese messaging entry point and its implementation.
const chatMarker = html.indexOf('Parish <-> Diocese chat widget.');
if (chatMarker < 0) throw new Error('Missing Diocese chat widget');
const chatStart = html.lastIndexOf('<!--', chatMarker);
const chatEnd = html.indexOf('</script>', chatMarker) + '</script>'.length;
if (chatStart < 0 || chatEnd < chatMarker) throw new Error('Missing chat boundaries');
html = html.slice(0, chatStart) + html.slice(chatEnd);
html = html.replace('?v=parish-decline-reinject-20260428', '?v=parish-user-only-20260919');
fs.writeFileSync(htmlPath, html);
