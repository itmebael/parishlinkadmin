import assert from 'node:assert/strict';
import {buildRecordReport} from '../dist/assets/record-report-download.js';
const html=buildRecordReport({parish:'Test & Parish',records:[{name:'Test Person',id:1,created_at:'2026-10-19T08:30:00Z'}],config:{title:'Baptism records',name:'name',fields:['id','name','created_at']},labels:{id:'Record number',name:'Name',created_at:'Recorded on'}});
assert.ok(html.includes('Test &amp; Parish'));assert.ok(html.includes('Test Person'));assert.ok(html.includes('October 19, 2026'));assert.ok(!html.includes('08:30'));assert.ok(html.includes('Print / Save as PDF'));assert.ok(html.includes('Download report'));console.log('PASS: record report data, parish header, date-only values, and preview actions.');
