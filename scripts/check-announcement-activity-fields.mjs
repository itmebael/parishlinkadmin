import assert from 'node:assert/strict';
import {announcementDraft,announcementActivities} from '../dist/assets/parish-announcement-table-20261009.js';
const input={activities:[{date:'2026-10-20',activity:'Parish Mass',barangay:'Brgy. 1, Calbiga',organization:'Youth Ministry'}]};
const saved=announcementDraft(input);assert.deepEqual(announcementActivities(saved),input.activities);assert.deepEqual(announcementActivities({content:'2026-10-20\tOld activity'})[0],{date:'2026-10-20',activity:'Old activity',barangay:'',organization:''});assert.throws(()=>announcementDraft({activities:[{date:'2026-10-20',activity:'Mass',barangay:'Bad\nrow'}]}));console.log('PASS: barangay/organization save and reload, legacy activities, and delimiter validation.');
