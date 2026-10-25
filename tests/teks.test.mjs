import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rapikanKeterangan, kunciKeterangan, jarakKeterangan, cariKeteranganSerupa,
} from '../js/teks.js';

test('merapikan spasi, kapital, dan tanda baca', () => {
  assert.equal(rapikanKeterangan('  Panen\u00a0  pisang  '), 'Panen pisang');
  assert.equal(kunciKeterangan('PENGAWASAN - Sore.'), 'pengawasan sore');
});

test('membedakan ejaan sama dan typo dekat', () => {
  const daftar = [{ nilai: 'Pengawasan sore', jumlah: 12 }, { nilai: 'Panen pisang', jumlah: 8 }];
  assert.deepEqual(cariKeteranganSerupa('pengawasan  sore.', daftar),
    { jenis: 'sama', nilai: 'Pengawasan sore', jarak: 0 });
  assert.equal(jarakKeterangan('Pengawsan sore', 'Pengawasan sore', 2), 1);
  assert.equal(cariKeteranganSerupa('Pengawsan sore', daftar)?.jenis, 'mirip');
  assert.equal(cariKeteranganSerupa('Penyiraman pagi', daftar), null);
});

test('angka berbeda tidak pernah dianggap typo', () => {
  const pasangan = [
    ['0.17ha', '0.13ha'],
    ['langsir air 7x', 'langsir air 8x'],
    ['Lembur 2 jam', 'Lembur 1 jam'],
    ['Proporsi luas otomatis (56.0%)', 'Proporsi luas otomatis (5.0%)'],
  ];
  for (const [baru, lama] of pasangan) {
    assert.equal(cariKeteranganSerupa(baru, [{ nilai: lama, jumlah: 20 }]), null);
  }
  assert.equal(cariKeteranganSerupa('Pengawsan 2 jam', [
    { nilai: 'Pengawasan 2 jam', jumlah: 20 },
  ])?.jenis, 'mirip');
});
