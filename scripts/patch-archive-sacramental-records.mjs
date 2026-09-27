import fs from 'node:fs';

const file = 'dist/assets/index-v20260422157000.js';
let source = fs.readFileSync(file, 'utf8');
const oldImport = 'import { BaptismRecords } from "./baptism-records.js?v=records-popup-20260927";';
const previousModuleImport = 'import { ArchiveSacramentalRecords } from "./archive-sacramental-records.js?v=archive-tables-20260928";';
const currentModuleImport = 'import { ArchiveSacramentalRecords } from "./archive-sacramental-records.js?v=archive-tables-20260928-marriage";';
if (!source.includes(currentModuleImport)) {
  if (source.includes(previousModuleImport)) source = source.replace(previousModuleImport, currentModuleImport);
  else if (!source.includes(oldImport)) throw new Error('Could not find the archive component imports.');
  else source = source.replace(oldImport, `${oldImport}\n${currentModuleImport}`);
}

const anchor = 'const _=Wn.filter(C=>!["record_type","first_name","middle_name","last_name"].includes(C.column));return n.jsxs("div"';
const previousReplacement = 'const _=Wn.filter(C=>!["record_type","first_name","middle_name","last_name"].includes(C.column));if(j.recordType==="Baptism"||j.recordType==="Confirmation")return n.jsx(ArchiveSacramentalRecords,{session:e,React:N,ui:n,request:Tt,recordType:j.recordType,options:wa,onRecordTypeChange:C=>le("recordType",C)});return n.jsxs("div"';
const replacement = 'const _=Wn.filter(C=>!["record_type","first_name","middle_name","last_name"].includes(C.column));if(j.recordType==="Baptism"||j.recordType==="Confirmation"||j.recordType==="Marriage")return n.jsx(ArchiveSacramentalRecords,{session:e,React:N,ui:n,request:Tt,recordType:j.recordType,options:wa,onRecordTypeChange:C=>le("recordType",C)});return n.jsxs("div"';
if (!source.includes(replacement)) {
  if (source.includes(previousReplacement)) source = source.replace(previousReplacement, replacement);
  else if (source.includes(anchor)) source = source.replace(anchor, replacement);
  else throw new Error('Could not find the archive component render point.');
}
const oldLoadEffect = 'N.useEffect(()=>{if(j.recordType!=="Baptism"&&j.recordType!=="Confirmation")X()},[j.recordType]),N.useEffect(()=>{r&&A(C=>({...C,church:C.church||r}))},[r])';
const newLoadEffect = 'N.useEffect(()=>{if(j.recordType!=="Baptism"&&j.recordType!=="Confirmation"&&j.recordType!=="Marriage")X()},[j.recordType]),N.useEffect(()=>{r&&A(C=>({...C,church:C.church||r}))},[r])';
if (!source.includes(newLoadEffect)) {
  if (!source.includes(oldLoadEffect)) throw new Error('Could not find the archive loading effect.');
  source = source.replace(oldLoadEffect, newLoadEffect);
}
fs.writeFileSync(file, source);
console.log('Dedicated archive forms enabled for Baptism, Confirmation, and Marriage.');
