import test from 'node:test';
import assert from 'node:assert/strict';

const simpanan = new Map();
globalThis.localStorage = {
  getItem: (k) => simpanan.get(k) ?? null,
  setItem: (k, v) => simpanan.set(k, String(v)),
};
const { rekomendasiAnggaran } = await import('../js/kebun.js');
const D = await import('../js/data.js');
const { nilaiPersetujuanAlat,rincianPersetujuanAlat } = await import('../js/input-operasional-alat.js');

test('rekomendasi berhenti pada tanggal input terakhir, bukan tanggal hari ini', () => {
  const k = rekomendasiAnggaran(
    { total: 4_000_000, totalHk: 40, upahHk: 4_000_000 },
    8_000_000, '2026-10-16', '2026-10-31', '2026-10-23');
  assert.equal(k.hariJalan, 8);
  assert.equal(k.hariSisa, 8);
  assert.equal(k.rpPerHari, 500_000);
  assert.equal(k.proyeksi, 8_000_000);
  assert.equal(k.tanggalAcuan, '2026-10-23');
});

test('tanpa input terakhir rekomendasi tidak mengarang hari berjalan', () => {
  const k = rekomendasiAnggaran(
    { total: 0, totalHk: 0, upahHk: 0 }, 8_000_000,
    '2026-10-16', '2026-10-31', null);
  assert.equal(k.hariJalan, 0);
  assert.equal(k.belumMulai, true);
});

test('persetujuan Infra menghitung premi sekali tanpa lembur HM atau HK', () => {
  D.state.data = {
    aplikasi: 'AlatBerat', web: { persetujuan: {} },
    tabel: {
      operators: [{ id: 1, tarif_harian: 100_000, tarif_jam: 20_000 }],
      work_logs: [{ id: 7, operator_id: 1, hk: 1, hm_awal: 10, hm_akhir: 12, premi: 15_000 }],
    },
  };
  const nilai = nilaiPersetujuanAlat(D.state.data.tabel.work_logs[0]);
  assert.equal(nilai.upahJam, 0);
  assert.equal(nilai.premi, 15_000);
  assert.equal(nilai.total, 15_000);
  assert.equal('upahHk' in nilai, false);
});

test('menolak tambahan Infra tidak menghapus HK atau log operasinya', () => {
  D.state.data = {
    aplikasi: 'AlatBerat', web: { persetujuan: {} },
    tabel: { work_logs: [{ id: 9, hk: 1, hm_awal: 20, hm_akhir: 21, premi: 10_000 }] },
  };
  D.tolak('work_logs', 9, 'Kepala Infra', 'Premi tidak sesuai');
  assert.equal(D.cari('work_logs', 9).deleted_at, undefined);
  assert.equal(D.cari('work_logs', 9).hk, 1);
  assert.equal(D.catatanPersetujuan('work_logs', 9).status, 'ditolak');
});

test('revisi lembur selalu menggugurkan persetujuan lama', () => {
  D.state.data = {
    aplikasi: 'PayrollHK',
    web: { persetujuan: { lembur_transactions: { 3: { status: 'disetujui', oleh: 'Kepala' } } } },
    tabel: { lembur_transactions: [{ id: 3, nominal: 50_000, catatan: 'Awal' }] },
  };
  assert.throws(()=>D.ubah('lembur_transactions',3,{catatan:'Keterangan direvisi'}),/kepala divisi/);
  D.batalkan('lembur_transactions',3,'Kepala');
  D.ubah('lembur_transactions', 3, { catatan: 'Keterangan direvisi' });
  assert.equal(D.catatanPersetujuan('lembur_transactions', 3).status, 'menunggu');
  assert.equal(D.cari('lembur_transactions', 3).catatan, 'Keterangan direvisi');
});

test('rincian persetujuan menampilkan ritase dan tarif tanpa mengganti premi tercatat',()=>{D.state.data={web:{unitPremi:{1:{rit:5000}}},tabel:{operators:[{id:1,tarif_jam:20000}]}};const r={unit_id:1,operator_id:1,ritase:12,premi:77500,hm_awal:0,hm_akhir:0};const text=rincianPersetujuanAlat(r);assert.match(text,/12,00 rit/);assert.match(text,/77.500/);assert.equal(r.premi,77500);});

test('dasar premi checks configured KM before inferring ritase and keeps recorded money',()=>{
 const row={unit_id:1,km_awal:100,km_akhir:128,ritase:31,premi:28000};
 D.state.data={web:{unitPremi:{1:{km:1000,rit:2500}}},tabel:{}};
 let text=rincianPersetujuanAlat(row);assert.match(text,/Cocok dengan tarif unit saat ini: 28,00 KM/);assert.doesNotMatch(text,/Kemungkinan/);
 row.premi=77500;text=rincianPersetujuanAlat(row);assert.match(text,/Cocok dengan tarif unit saat ini: 31,00 rit/);assert.match(text,/Pembanding KM/);assert.match(text,/28.000/);assert.equal(row.premi,77500);
 row.premi=30000;text=rincianPersetujuanAlat(row);assert.match(text,/Mengikuti isian ritase manual/);assert.doesNotMatch(text,/Peringatan/);assert.equal(row.premi,30000);
 row.ritase=0;text=rincianPersetujuanAlat(row);assert.match(text,/Peringatan/);row.premi_manual=true;text=rincianPersetujuanAlat(row);assert.match(text,/Mengikuti nominal premi manual/);assert.doesNotMatch(text,/Peringatan/);delete row.premi_manual;row.ritase=31;
 row.premi=105500;text=rincianPersetujuanAlat(row);assert.match(text,/Cocok dengan tarif unit saat ini: 28,00 KM.*31,00 rit/);
 D.state.data.web.unitPremi[1]={km:1000,rit:28000/31};row.premi=28000;text=rincianPersetujuanAlat(row);assert.match(text,/Lebih dari satu dasar cocok/);
});
