import test from 'node:test';
import assert from 'node:assert/strict';

test('block selection prefers an active mapped alias without filtering unrelated records', async () => {
  globalThis.localStorage = { getItem: () => null };
  const D = await import('../js/data.js');
  const blocks = [
    { id: 1, status: 'Tidak Aktif', gis_canonical_local_id: 1 },
    { id: 2, status: 'Aktif', gis_canonical_local_id: 1 },
    { id: 3, status: 'Aktif', gis_active: false },
  ];
  D.state.data = { web: { gis: { mappings: { 1: 'gis-p01', 2: 'gis-p01' } } },
    tabel: { blocks, employees: [{ id: 1, status: 'Aktif' }] } };
  assert.deepEqual(D.aktif('blocks').map(r => r.id), [2]);
  assert.deepEqual(D.aktif('employees').map(r => r.id), [1]);
  assert.equal(blocks[1].gis_canonical_local_id, 1); // reading does not rewrite stored data
});
