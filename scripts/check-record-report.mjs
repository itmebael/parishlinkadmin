import assert from 'node:assert/strict';
import {buildRecordReport} from '../dist/assets/record-report-download.js';
const html=buildRecordReport({parish:'Test & Parish',records:[{name:'Test Person',id:1,created_at:'2026-10-19T08:30:00Z'}],config:{title:'Baptism records',name:'name',fields:['id','name','created_at']},labels:{id:'Record number',name:'Name',created_at:'Recorded on'}});
assert.ok(html.includes('Test &amp; Parish'));assert.ok(html.includes('Test Person'));assert.ok(html.includes('October 19, 2026'));assert.ok(!html.includes('08:30'));assert.ok(html.includes('Print / Save as PDF'));assert.ok(html.includes('Download report'));console.log('PASS: record report data, parish header, date-only values, and preview actions.');

const detailed=buildRecordReport({parish:'Test Parish',records:[{id:7,name:'A <script>bad()</script>',year_baptism:1941,month_batism:4,date_batism:12,fee:0,godparents:'Names & witnesses'}],config:{title:'Baptism records',name:'name',fields:['id','name','year_baptism','month_batism','date_batism','fee','godparents']},labels:{fee:'Fee',godparents:'Godparents'},filters:{year:'1941',month:'4',search:'A & B',searchBy:'name'}});
assert.ok(detailed.includes('April 12 1941'));assert.ok(detailed.includes('Year: 1941'));assert.ok(detailed.includes('Month: April'));assert.ok(detailed.includes('A &amp; B'));assert.ok(detailed.includes('<dd>0</dd>'));assert.ok(detailed.includes('Names &amp; witnesses'));assert.ok(!detailed.includes('<script>bad()'));
assert.ok(detailed.includes('class="record-detail"'));assert.ok(!detailed.includes('onload='));
assert.ok(buildRecordReport({parish:'Test',records:[],config:{title:'Marriage records',name:'name_family_name',fields:[]}}).includes('No records match these filters.'));
console.log('PASS: detailed report, numeric date formatting, zero values, filter summary, safe text, and empty state.');
