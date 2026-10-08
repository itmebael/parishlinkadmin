import fs from 'node:fs';
import assert from 'node:assert/strict';

const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('function Oc(');
const end = source.indexOf('function Ch(', start);
assert.ok(start >= 0 && end > start, 'Certificate renderer must exist');
let renderer = source.slice(start, end);
const marker = 'return n.jsxs("div",{className:"certificate-template",children:';
assert.ok(renderer.includes(marker), 'Original certificate return must exist');
if (!renderer.includes('certificate-baptism-reference')) {
  const branch = `if(t.type.toLowerCase().includes("baptism")){
    const row=(label,value,extra="")=>n.jsxs("div",{className:"certificate-line "+extra,children:[label?n.jsx("span",{children:label}):null,n.jsx("strong",{children:value||""})]});
    return n.jsxs("div",{className:"certificate-template certificate-baptism-reference","data-certificate-type":"baptism",children:[
      n.jsxs("div",{className:"certificate-template__masthead",children:[
        n.jsx("img",{src:"/logocalbayog.png",alt:"Diocese of Calbayog crest"}),
        n.jsxs("div",{className:"certificate-template__parish",children:[n.jsx("span",{children:"Diocese of Calbayog"}),n.jsx("strong",{children:/st\\.?\\s*bartholomew/i.test(o||"")?"Our Lady of the Annunciation Parish":o||"Our Lady of the Annunciation Parish"}),n.jsx("small",{children:c||"Calbiga, Samar 6715, Philippines"})]}),
        n.jsx("img",{src:x||"/dist/assets/virgen-maria-anunciacion.png",alt:"Parish artwork"})
      ]}),
      n.jsx("div",{className:"certificate-template__title",children:n.jsx("h3",{children:"CERTIFICATE OF BAPTISM"})}),
      n.jsxs("div",{className:"certificate-template__body",children:[
        n.jsx("p",{className:"certificate-baptism-intro",children:"THIS IS TO CERTIFY THAT"}),
        row("",r,"certificate-line--baptism-name"),row("WAS BORN IN",i),row("ON THE",l?re(l):""),row("CHILD OF",a),row("AND",s),
        n.jsx("p",{className:"certificate-baptism-rite",children:"WAS SOLEMNLY BAPTIZED ACCORDING TO THE RITES OF THE ROMAN CATHOLIC CHURCH"}),
        row("ON THE",d?re(d):""),row("BY THE REV. FR.",A),row("THE SPONSORS BEING",h),row("AND",e.additionalSponsor),
        row("AS RECORDED IN THE BAPTISMAL REGISTER NO.",w,"certificate-line--baptism-register"),
        n.jsxs("div",{className:"certificate-register-line certificate-register-line--baptism",children:[n.jsx("span",{children:"PAGE"}),n.jsx("strong",{children:y||""}),n.jsx("span",{children:"LINE"}),n.jsx("strong",{children:j||""}),n.jsx("span",{children:"DATE OF ISSUE"}),n.jsx("strong",{children:v?re(v):""})]}),
        u?row("PURPOSE",u):null
      ]}),
      n.jsxs("div",{className:"certificate-template__footer",children:[
        n.jsx("div",{className:"certificate-template__seal",children:n.jsx("span",{children:"Parish Seal"})}),
        n.jsxs("div",{className:"certificate-baptism-signatures",children:[
          n.jsxs("div",{className:"certificate-template__signature",children:[E?n.jsx("img",{className:"certificate-template__esignature",src:E,alt:"E-signature"}):null,n.jsx("strong",{children:A||"________________________"}),n.jsx("span",{children:p||"Parish Priest"})]}),
          n.jsxs("div",{className:"certificate-template__signature",children:[n.jsx("strong",{children:e.secretaryName||"________________________"}),n.jsx("span",{children:"Parish Secretary"})]})
        ]})
      ]})
    ]});
  }`;
  renderer = renderer.replace(marker, branch + marker);
  source = source.slice(0, start) + renderer + source.slice(end);
  const formMarker = 'n.jsxs("label",{className:"login-field login-field--wide",children:[n.jsx("span",{children:"Right Logo"})';
  assert.ok(source.includes(formMarker), 'Logo field must exist');
  const fields = `u.certificateType.toLowerCase().includes("baptism")?n.jsxs("label",{className:"login-field",children:[n.jsx("span",{children:"Parish Secretary Name"}),n.jsx("input",{id:"secretaryName",name:"secretaryName",type:"text",value:u.secretaryName||"",onChange:g=>k("secretaryName",g.target.value)})]}):null,u.certificateType.toLowerCase().includes("baptism")?n.jsxs("label",{className:"login-field",children:[n.jsx("span",{children:"Additional Sponsor"}),n.jsx("input",{id:"additionalSponsor",name:"additionalSponsor",type:"text",value:u.additionalSponsor||"",onChange:g=>k("additionalSponsor",g.target.value)})]}):null,`;
  source = source.replace(formMarker, fields + formMarker);
  fs.writeFileSync(file, source);
}
console.log('Baptism certificate reference layout applied.');
