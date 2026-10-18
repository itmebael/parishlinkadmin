import assert from 'node:assert/strict';
import {buildParishReport,reportDateOnly} from '../dist/assets/parish-report-print.js';
const html=buildParishReport({parish:'Test Parish & Chapel',from:'2026-10-01',to:'2026-10-31',generated:'2026-10-19T13:45:00Z',rows:[{reference_number:'CERT-TEST-1',client_name:'Test Member',service_name:'Baptismal Certificate',booking_status:'Booked',created_at:'2026-10-18T16:30:00Z'},{reference_number:'APT-TEST-2',client_name:'Another Member',service_name:'Mass booking',booking_status:'Confirmed',created_at:'2026-10-19T03:00:00Z'}]});
assert.ok(html.includes('Test Parish &amp; Chapel'));assert.ok(html.includes('CERT-TEST-1'));assert.ok(html.includes('APT-TEST-2'));assert.ok(html.includes('Certificate requests by type'));assert.ok(!html.includes('13:45'));assert.ok(!html.includes('16:30'));assert.equal(reportDateOnly('2026-10-18T16:30:00Z'),'October 19, 2026');
assert.ok(buildParishReport({parish:'Test',from:'2026-10-01',to:'2026-10-31',rows:[]}).includes('No requests match'));
assert.ok(!buildParishReport({parish:'<script>bad()</script>',from:'2026-10-01',to:'2026-10-31',rows:[]}).includes('<script>'));
console.log('PASS: printable parish header, request rows, summary, date-only formatting, empty state, and escaped content.');
