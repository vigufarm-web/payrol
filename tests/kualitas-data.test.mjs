import test from 'node:test';
import assert from 'node:assert/strict';
import { periksaData } from '../js/kualitas-data.js';

const dasar = () => ({
  aplikasi: 'PayrollHK',
  tabel: {
    employees: [{ id: 1, nama: 'A' }],
    divisions: [{ id: 1, nama_divisi: 'Pisang' }],
    blocks: [{ id: 1, division_id: 1, nama_blok: 'P01' }],
    activities: [{ id: 1, nama_kegiatan: 'Rawat' }],
    job_types: [{ id: 1, activity_id: 1, nama_jenis: 'Pengawasan' }],
    wage_components: [{ id: 1, satuan: 'jam' }],
    app_settings: [{ max_hk_per_hari: 1 }],
    daily_payroll: [], borongan_transactions: [], lembur_transactions: [], premi_transactions: [],
  },
  web: { persetujuan: {} },
});

const hk = (id, nilai, job = 'Pengawasan sore') => ({
  id, tanggal: '2026-10-01', employee_id: 1, division_id: 1, block_id: 1,
  activity_id: 1, job_type_id: 1, hk: nilai, tarif_hk_snapshot: 100000,
  nominal: Math.round(nilai * 100000), job,
});

test('mendeteksi HK berlebih, referensi rusak, dan transaksi ganda', () => {
  const data = dasar();
  data.tabel.daily_payroll.push(hk(1, 0.75), hk(2, 0.75));
  data.tabel.daily_payroll[1].block_id = 999;
  const hasil = periksaData(data);
  assert.ok(hasil.masalah.some((x) => x.jenis === 'HK melebihi batas'));
  assert.ok(hasil.masalah.some((x) => x.jenis === 'Referensi tidak ditemukan'));
});

test('menyiapkan perbaikan aman untuk satuan kosong dan spasi', () => {
  const data = dasar();
  data.tabel.daily_payroll.push(hk(1, 1, '  Pengawasan   sore  '));
  data.tabel.lembur_transactions.push({
    id: 10, nomor_transaksi: 'LM-1', tanggal: '2026-10-01', employee_id: 1,
    division_id: 1, block_id: 1, wage_component_id: 1, qty: 2,
    satuan: '', tarif_snapshot: 20000, nominal: 40000,
  });
  const hasil = periksaData(data);
  const unit = hasil.perbaikanAman.find((x) => x.tabel === 'lembur_transactions' && x.id === 10);
  const teks = hasil.perbaikanAman.find((x) => x.tabel === 'daily_payroll' && x.id === 1);
  assert.equal(unit.tambalan.satuan, 'jam');
  assert.equal(teks.tambalan.job, 'Pengawasan sore');
});

test('menyarankan penggabungan typo dan menandai persetujuan terlambat', () => {
  const data = dasar();
  data.tabel.daily_payroll.push(hk(1, 0.25), hk(2, 0.25), hk(3, 0.25), hk(4, 0.25, 'Pengawsan sore'));
  data.tabel.lembur_transactions.push({
    id: 10, nomor_transaksi: 'LM-1', tanggal: '2026-10-01', created_at: '2026-10-01T00:00:00Z',
    employee_id: 1, division_id: 1, block_id: 1, wage_component_id: 1,
    qty: 2, satuan: 'jam', tarif_snapshot: 20000, nominal: 40000,
  });
  data.web.persetujuan.lembur_transactions = {
    10: { status: 'menunggu', waktu: '2026-10-01T00:00:00Z' },
  };
  const hasil = periksaData(data, { sekarang: new Date('2026-10-22T00:00:00Z') });
  assert.ok(hasil.masalah.some((x) => x.jenis === 'Kemungkinan pekerjaan kembar'));
  assert.ok(hasil.masalah.some((x) => x.jenis === 'Persetujuan terlambat'));
});

test('mendeteksi meter mundur dan data solar tidak lengkap', () => {
  const data = {
    aplikasi: 'AlatBerat',
    tabel: {
      units: [{ id: 1 }], operators: [{ id: 1 }],
      work_logs: [{ id: 1, tanggal: '2026-10-01', unit_id: 1, operator_id: 1, hm_awal: 10, hm_akhir: 9 }],
      fuel_logs: [{ id: 2, tanggal: '2026-10-01', unit_id: 1, operator_id: 1, liter: 0, harga_liter: 10000 }],
      service_logs: [],
    },
  };
  const hasil = periksaData(data);
  assert.ok(hasil.masalah.some((x) => x.jenis === 'Meter mundur'));
  assert.ok(hasil.masalah.some((x) => x.jenis === 'Data solar tidak lengkap'));
});
