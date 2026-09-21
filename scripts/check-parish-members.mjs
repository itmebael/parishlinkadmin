import assert from 'node:assert/strict';
import { loadParishMembers } from '../dist/assets/parish-members.js';

const session = { email: 'office@example.test', parish_id: 'stale-id' };
const parish = { id: 'current-id', parish_name: 'St. Mary Parish' };
const calls = [];
const rows = await loadParishMembers(session, async (table, query) => {
  const params = new URLSearchParams(query);
  calls.push({ table, params });
  if (table === 'parishes') return [parish];
  const offset = Number(params.get('offset'));
  if (params.get('parish_id') === 'is.null') {
    assert.equal(params.get('parish_name'), 'ilike.St. Mary Parish');
    return offset ? [] : [{ id: 'legacy' }];
  }
  assert.equal(params.get('parish_id'), 'eq.current-id');
  // Simulate a server page cap smaller than the requested 500 rows.
  return offset === 0 ? [{ id: 'a' }, { id: 'b' }] : offset === 2 ? [{ id: 'c' }] : [];
});
assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c', 'legacy']);
assert.equal(calls[0].params.get('email'), 'eq.office@example.test');

await assert.rejects(loadParishMembers({}, async () => {
  throw new Error('An unscoped request must not run');
}), /Could not find the parish/);

await assert.rejects(loadParishMembers(session, async table => {
  if (table === 'parishes') return [parish];
  throw new Error('permission denied');
}), /permission denied/);

const oldSchema = await loadParishMembers(session, async (table, query) => {
  if (table === 'parishes') return [parish];
  const params = new URLSearchParams(query);
  if (params.has('parish_name')) throw new Error('column registered_users.parish_name does not exist');
  return params.get('offset') === '0' ? [{ id: 'a' }] : [];
});
assert.equal(oldSchema.length, 1);

const empty = await loadParishMembers({ parish_id: parish.id }, async table => table === 'parishes' ? [parish] : []);
assert.deepEqual(empty, []);

await assert.rejects(loadParishMembers(session, async (table, query) => {
  if (table === 'parishes') return [parish];
  if (query.includes('parish_name')) throw new Error('Network request failed');
  return [];
}), /Network request failed/);

console.log('Member lookup checks passed: parish resolution, pagination, legacy names, missing columns, empty results and errors.');
