import assert from 'node:assert/strict';
import {reportRange,aggregateRequests} from '../dist/assets/report-charts.js';
assert.deepEqual([reportRange('week','2026-10-18').start,reportRange('week','2026-10-18').end],['2026-10-12','2026-10-19']);
assert.equal(reportRange('month','2026-12-31').end,'2027-01-01');
assert.equal(reportRange('year','2026-10-19').start,'2026-01-01');
const rows=[{reference_number:'CERT-1',service_name:'Baptismal Certificate',created_at:'2026-10-18T16:30:00Z'},{reference_number:'APT-1',service_name:'Mass booking',created_at:'2026-10-19T01:00:00Z'},{reference_number:'CERT-2',service_name:'Baptismal Certificate',created_at:'2026-10-19T02:00:00Z'},{reference_number:'CERT-3',service_name:'Marriage Certificate',created_at:'2026-09-30T12:00:00Z'}];
const day=aggregateRequests(rows,'day','2026-10-19');assert.equal(day.bookings,1);assert.equal(day.certificates,2);assert.equal(day.buckets[0].certificates,1);assert.deepEqual(day.types,[['Baptismal Certificate',2]]);assert.equal(aggregateRequests(rows,'year','2026-10-19').certificates,3);assert.equal(aggregateRequests([],'month','2026-10-19').buckets.length,31);
console.log('PASS: day/week/month/year boundaries, Singapore timezone, distinct request types, rankings, and empty periods.');
