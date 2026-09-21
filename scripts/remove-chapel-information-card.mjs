import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('function Bg()');
const end = source.indexOf('function Kc(', start);
assert.ok(start >= 0 && end > start, 'Could not find the Chapel Information component.');

const replacement = `function Bg(){var _pr=N.useState([]),priests=_pr[0],setPriests=_pr[1];var _l=N.useState(true),loading=_l[0],setLoading=_l[1];var _e=N.useState(null),err=_e[0],setErr=_e[1];N.useEffect(function(){var cancelled=false;(async function(){if(!Y){setLoading(false);return;}try{var pne=encodeURIComponent("*"+Zr+"*");var rows=await de("parish_priests","select=id,full_name,role,ministry,birthdate,civil_status,profile_picture_url&parish_name=ilike."+pne+"&order=created_at.asc").catch(function(){return[];});if(cancelled)return;setPriests(rows||[]);}catch(ex){if(!cancelled)setErr(V(ex));}finally{if(!cancelled)setLoading(false);}})();return function(){cancelled=true;};},[]);return n.jsx("div",{className:"screen-grid",children:n.jsxs("article",{className:"glass-card page-card",children:[n.jsxs("div",{className:"glass-card__header",children:[n.jsx("h4",{children:"Parish Priests"}),n.jsx("button",{type:"button",className:"mini-dots","aria-label":"More options",children:n.jsx(te,{})})]}),loading?n.jsx(ce,{title:"Loading",message:"Fetching priest records from Supabase."}):err?n.jsx(Q,{tone:"error",title:"Could not load priests",message:err}):priests.length===0?n.jsx(ce,{title:"No priests on file",message:"Add priest records to your parish to see them here."}):n.jsx("div",{className:"detail-list detail-list--stack",children:priests.map(function(p){return n.jsxs("div",{className:"detail-list__item detail-list__item--stack",children:[n.jsxs("div",{className:"detail-list__meta",children:[n.jsx("strong",{children:p.full_name||"Unnamed"}),n.jsx("span",{children:(p.role||"Priest")+(p.ministry?(" · "+p.ministry):"")})]}),n.jsx(G,{tone:"blue",children:p.civil_status||"Active"})]},p.id);})})]})})}`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source);
console.log('Chapel Information card removed.');
