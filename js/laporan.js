// laporan.js — halaman laporan: Ringkasan, Payroll per pekerja, dan Rekap
// biaya per divisi/blok/kegiatan. Semua angka dihitung dari data di memori.

import * as D from './data.js';
import * as P from './pengguna.js';
import { dialogRekapGaji } from './rekap-gaji.js';
import { TABEL } from './skema-payroll.js';
import {
  el, tabel, kosongkan, rupiah, rupiahPenuh, angka, hk as fhk, tanggal as ftanggal,
  namaBulan, pesan, taruh, pilihParuh, periodeParuh,
} from './ui.js';

const hidup = (t) => D.baris(t).filter((r) => !r.deleted_at);

function dalamPeriode(periode) {
  const [a, b] = periode.rentang();
  return (r) => r.tanggal >= a && r.tanggal <= b;
}

/** Kumpulkan semua transaksi periode ini per jenis. */
function transaksiPeriode(periode) {
  const saring = dalamPeriode(periode);
  return {
    hk: hidup('daily_payroll').filter(saring),
    borongan: hidup('borongan_transactions').filter(saring),
    lembur: hidup('lembur_transactions').filter(saring),
    premi: hidup('premi_transactions').filter(saring),
    kelompok: D.baris('borongan_group').filter((r) => !r.deleted_at && saring(r)),
  };
}

const jumlah = (baris, kolom = 'nominal') => baris.reduce((n, r) => n + (Number(r[kolom]) || 0), 0);

/** Nominal borongan kelompok per anggota (dibagi sesuai baris anggota). */
function boronganKelompokPerPekerja(kelompok) {
  const peta = new Map();
  const idKelompok = new Set(kelompok.map((g) => Number(g.id)));
  for (const m of D.baris('borongan_group_members')) {
    if (!idKelompok.has(Number(m.group_id))) continue;
    const k = Number(m.employee_id);
    peta.set(k, (peta.get(k) || 0) + (Number(m.nominal) || 0));
  }
  return peta;
}

// =====================================================================
// RINGKASAN
// =====================================================================
function kotakAngka(label, nilai, satuan = '') {
  return el('div', {}, [
    el('dt', { teks: label }),
    el('dd', {}, [nilai, satuan ? el('span.satuan', { teks: ' ' + satuan }) : null]),
  ]);
}

/**
 * Grafik batang HK per tanggal.
 * Satu seri, satu warna — judulnya sudah menyebut isinya, jadi tidak perlu legenda.
 * Angka per batang sengaja tidak ditulis semua; nilainya muncul saat disentuh,
 * dan tabel di bawah menyediakan angka lengkapnya.
 */
function grafikHarian(barisHk, periode) {
  const hariAkhir = new Date(periode.tahun, periode.bulan, 0).getDate();
  const per = new Array(hariAkhir).fill(0);
  for (const r of barisHk) {
    const h = Number(String(r.tanggal).slice(8, 10));
    if (h >= 1 && h <= hariAkhir) per[h - 1] += Number(r.hk) || 0;
  }
  const maks = Math.max(...per, 1);
  if (!barisHk.length) return el('p.kosong', { teks: 'Belum ada HK pada periode ini.' });

  const batang = per.map((v, i) => el('div', {
    style: `height:${(v / maks) * 100}%;border-radius:4px 4px 0 0`,
    title: `${i + 1} ${namaBulan(periode.bulan)}: ${fhk(v)} HK`,
    'aria-hidden': 'true',
  }));

  return el('figure', { style: 'margin:0' }, [
    el('figcaption.bantuan', {
      teks: `HK per tanggal — puncaknya ${fhk(maks)} HK. Sentuh batang untuk melihat angkanya.`,
      style: 'margin-bottom:.4rem',
    }),
    el('div.grafik', {}, batang),
    el('div.grafik-sumbu', {}, [
      el('span', { teks: `1 ${namaBulan(periode.bulan).slice(0, 3)}` }),
      el('span', { teks: `${Math.ceil(hariAkhir / 2)}` }),
      el('span', { teks: `${hariAkhir} ${namaBulan(periode.bulan).slice(0, 3)}` }),
    ]),
  ]);
}

/**
 * Ringkasan — angka gabungan satu periode.
 *
 * Dibungkus supaya bisa digambar ulang saat paruh periode gajian diganti
 * (1–15 / 16–akhir / sebulan penuh), dan supaya bagian Alat Berat &
 * Kendaraan — yang datanya ada di berkas lain — bisa diisi belakangan
 * tanpa menahan tampilnya angka payroll.
 */
export function halamanRingkasan({ periode }) {
  const wadah = el('section');
  const isi = el('div');
  const gambarIsi = () => {
    const per = periodeParuh(periode);
    taruh(kosongkan(isi), isiRingkasan(per));
    tempelAlatBerat(isi, per);
  };
  taruh(wadah, pilihParuh(() => gambarIsi()), isi);
  gambarIsi();
  return wadah;
}

/**
 * Bagian "Alat Berat & Kendaraan" di Ringkasan. Datanya dibaca dari berkas
 * bagian sebelah, jadi ditempel setelah angka payroll tampil. Kalau berkasnya
 * tidak terbaca (password beda / belum diupload), bagian ini dilewati diam —
 * angka payroll tidak boleh ikut gagal karenanya.
 */
const JALUR_ALAT = 'data/alat-berat.json';
async function tempelAlatBerat(tempat, per) {
  if (D.state.aplikasi !== 'PayrollHK') return;
  // Jangan meminta berkas yang memang tidak terdaftar di daftar.json —
  // permintaannya akan dijawab 404 dan mengotori log galat tanpa guna.
  if (!D.state.daftar?.dataset?.[JALUR_ALAT]) return;
  const tempatAlat = el('section');
  tempat.append(tempatAlat);
  let alat = null;
  try { alat = await D.muatBagianLain(JALUR_ALAT); } catch { /* lewati */ }
  if (!alat?.tabel?.work_logs) { tempatAlat.remove(); return; }

  const [dari, sampai] = per.rentang();
  const nol = (v) => Number(v) || 0;
  const accAlat = (id) => {
    const c = alat.web?.persetujuan?.work_logs?.[String(id)];
    return !c || c.status === 'disetujui';
  };
  const op = new Map((alat.tabel.operators || []).map((o) => [Number(o.id), o]));
  let upah = 0; let premi = 0; let hm = 0; let km = 0; let hkOp = 0;
  const unit = new Set();
  for (const r of alat.tabel.work_logs) {
    if (r.deleted_at || r.tanggal < dari || r.tanggal > sampai) continue;
    const o = op.get(Number(r.operator_id));
    const jam = Math.max(0, nol(r.hm_akhir) - nol(r.hm_awal));
    const tambahanSah = accAlat(r.id);
    hm += jam;
    km += Math.max(0, nol(r.km_akhir) - nol(r.km_awal));
    hkOp += nol(r.hk);
    upah += nol(r.hk) * nol(o?.tarif_harian);
    if (tambahanSah) {
      upah += jam * nol(o?.tarif_jam);
      premi += nol(r.premi);
    }
    unit.add(Number(r.unit_id));
  }
  // HK/log operasi langsung sah; hanya tambahan yang menunggu persetujuan.
  if (!unit.size) { tempatAlat.remove(); return; }

  taruh(tempatAlat, el('div.lembar', {}, [
    el('div.lembar-kepala', {}, [el('h2', { teks: 'Alat Berat & Kendaraan' })]),
    el('div.lembar-isi', {}, [
      tabel([
        { l: 'Jenis', k: 'jenis' },
        { l: 'Nilai (Rp)', k: 'nilai', jenis: 'uang', total: true },
      ], [
        // Hanya upah & premi operator. Solar dan servis sengaja TIDAK ikut —
        // itu biaya unit, bukan upah orang, dan tempatnya di laporan bagian
        // Alat Berat & Kendaraan sendiri.
        { jenis: 'Upah operator', nilai: Math.round(upah) },
        { jenis: 'Premi operator', nilai: Math.round(premi) },
      ], { kosong: 'Belum ada kegiatan unit pada periode ini.' }),
      el('p.bantuan', {
        teks: `${unit.size} unit beroperasi · ${angka(hkOp, 2)} HK operator · `
          + `${angka(hm, 1)} HM · ${angka(km, 1)} KM. `
          + 'Angka ini TIDAK ikut dijumlahkan ke "Total upah" di atas — itu khusus '
          + 'pekerja kebun. Log yang belum di-acc belum dihitung. Biaya solar & servis '
          + 'ada di Laporan ALB & Kendaraan, bukan di sini.',
      }),
    ]),
  ]));
}

function isiRingkasan(periode) {
  const t = transaksiPeriode(periode);
  const kelompokPerPekerja = boronganKelompokPerPekerja(t.kelompok);

  const totalHk = t.hk.reduce((n, r) => n + (Number(r.hk) || 0), 0);
  const upahHk = jumlah(t.hk);
  const upahBorongan = jumlah(t.borongan) + [...kelompokPerPekerja.values()].reduce((a, b) => a + b, 0);
  const upahLembur = jumlah(t.lembur);
  const upahPremi = jumlah(t.premi);
  const total = upahHk + upahBorongan + upahLembur + upahPremi;

  const pekerjaAktif = new Set([
    ...t.hk.map((r) => r.employee_id),
    ...t.borongan.map((r) => r.employee_id),
    ...t.lembur.map((r) => r.employee_id),
    ...t.premi.map((r) => r.employee_id),
    ...kelompokPerPekerja.keys(),
  ]);

  const rincian = [
    { jenis: 'HK harian', baris: t.hk.length, nilai: upahHk },
    { jenis: 'Borongan', baris: t.borongan.length + t.kelompok.length, nilai: upahBorongan },
    { jenis: 'Lembur', baris: t.lembur.length, nilai: upahLembur },
    { jenis: 'Premi', baris: t.premi.length, nilai: upahPremi },
  ];

  // biaya per divisi (HK + borongan + lembur + premi yang punya divisi)
  const perDivisi = new Map();
  const tambahDivisi = (id, n) => {
    const k = id == null || id === '' ? 0 : Number(id);
    perDivisi.set(k, (perDivisi.get(k) || 0) + n);
  };
  for (const r of t.hk) tambahDivisi(r.division_id, Number(r.nominal) || 0);
  for (const r of t.borongan) tambahDivisi(r.division_id, Number(r.nominal) || 0);
  for (const r of t.lembur) tambahDivisi(r.division_id, Number(r.nominal) || 0);
  for (const r of t.premi) tambahDivisi(r.division_id, Number(r.nominal) || 0);
  const divisiBaris = [...perDivisi.entries()]
    .map(([id, nilai]) => ({ divisi: id ? D.labelRef('divisions', id) : '(tanpa divisi)', nilai }))
    .sort((a, b) => b.nilai - a.nilai);

  const terakhir = [...t.hk].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))[0];

  return el('section', {}, [
    el('div.lembar', {}, [
      el('dl.angka-utama', {}, [
        kotakAngka('Total HK', fhk(totalHk), 'HK'),
        kotakAngka('Total upah', rupiah(total), 'Rp'),
        kotakAngka('Pekerja tercatat', angka(pekerjaAktif.size), `dari ${angka(D.aktif('employees').length)} aktif`),
        kotakAngka('Rata-rata per pekerja', pekerjaAktif.size ? rupiah(total / pekerjaAktif.size) : '–', 'Rp'),
      ]),
    ]),

    el('section', {}, [
      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: `Pergerakan harian — ${periode.judul()}` })]),
        el('div.lembar-isi', {}, [
          grafikHarian(t.hk, periode),
          terakhir
            ? el('p.bantuan', { style: 'margin-top:.7rem', teks: `Input HK terakhir: ${ftanggal(terakhir.tanggal)}.` })
            : null,
        ]),
      ]),
    ]),

    el('section', {}, [
      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Upah menurut jenis' })]),
        el('div.lembar-isi', {}, [
          tabel([
            { l: 'Jenis', k: 'jenis' },
            { l: 'Jumlah baris', k: 'baris', jenis: 'angka', total: true },
            { l: 'Nilai (Rp)', k: 'nilai', jenis: 'uang', total: true },
          ], rincian, { kosong: 'Belum ada transaksi pada periode ini.' }),
        ]),
      ]),
    ]),

    el('section', {}, [
      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Biaya per divisi' })]),
        el('div.lembar-isi', {}, [
          tabel([
            { l: 'Divisi', k: 'divisi' },
            { l: 'Biaya (Rp)', k: 'nilai', jenis: 'uang', total: true },
          ], divisiBaris, { kosong: 'Belum ada biaya tercatat.' }),
        ]),
      ]),
    ]),
  ]);
}

// =====================================================================
// PAYROLL PER PEKERJA
// =====================================================================
function barisPayroll(periode) {
  const t = transaksiPeriode(periode);
  const kelompok = boronganKelompokPerPekerja(t.kelompok);
  const peta = new Map();

  const ambil = (id) => {
    const k = Number(id);
    if (!peta.has(k)) {
      const e = D.cari('employees', k);
      peta.set(k, {
        employee_id: k,
        nik: e?.nik || '',
        nama: e?.nama || `#${k} (tidak ada)`,
        bank: e?.bank || '',
        rekening: e?.rekening || '',
        hari: new Set(),
        hk: 0, upah_hk: 0, borongan: 0, lembur: 0, premi: 0,
      });
    }
    return peta.get(k);
  };

  for (const r of t.hk) {
    const b = ambil(r.employee_id);
    b.hk += Number(r.hk) || 0;
    b.upah_hk += Number(r.nominal) || 0;
    b.hari.add(r.tanggal);
  }
  for (const r of t.borongan) ambil(r.employee_id).borongan += Number(r.nominal) || 0;
  for (const [id, n] of kelompok) ambil(id).borongan += n;
  for (const r of t.lembur) ambil(r.employee_id).lembur += Number(r.nominal) || 0;
  for (const r of t.premi) ambil(r.employee_id).premi += Number(r.nominal) || 0;

  return [...peta.values()]
    .map((b) => ({ ...b, hari_kerja: b.hari.size, total: b.upah_hk + b.borongan + b.lembur + b.premi }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

function unduhCsv(namaFile, kolom, data) {
  const bariskan = (nilai) => {
    const s = String(nilai ?? '');
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const isi = [kolom.map((k) => bariskan(k.l)).join(';')]
    .concat(data.map((r) => kolom.map((k) => bariskan(k.nilai ? k.nilai(r) : r[k.k])).join(';')))
    .join('\r\n');
  // BOM supaya Excel membaca huruf beraksen dengan benar
  const berkas = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(berkas);
  const a = el('a', { href: url, download: namaFile });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  pesan(`${namaFile} diunduh.`, 'sukses');
}

export function halamanPayroll({ periode }) {
  const data = barisPayroll(periode);
  let tampilkanRekening = false;
  const tempat = el('div');

  const kolomDasar = () => [
    { l: 'NIK', k: 'nik' },
    { l: 'Nama', k: 'nama' },
    { l: 'Hari kerja', k: 'hari_kerja', jenis: 'angka', total: true },
    { l: 'HK', k: 'hk', jenis: 'hk', total: true },
    { l: 'Upah HK (Rp)', k: 'upah_hk', jenis: 'uang', total: true },
    { l: 'Borongan (Rp)', k: 'borongan', jenis: 'uang', total: true },
    { l: 'Lembur (Rp)', k: 'lembur', jenis: 'uang', total: true },
    { l: 'Premi (Rp)', k: 'premi', jenis: 'uang', total: true },
    { l: 'Total (Rp)', k: 'total', jenis: 'uang', total: true },
    ...(tampilkanRekening
      ? [{ l: 'Bank', k: 'bank' }, { l: 'No. rekening', k: 'rekening' }]
      : []),
  ];

  const gambarTabel = () => {
    kosongkan(tempat).append(tabel(kolomDasar(), data, {
      kosong: `Belum ada data upah pada ${periode.judul()}.`,
    }));
  };
  gambarTabel();

  return el('section', {}, [
    el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: `Upah pekerja — ${periode.judul()}` }),
        el('label.samar', { style: 'display:flex;gap:.3rem;align-items:center;font-size:.85rem' }, [
          el('input', {
            type: 'checkbox',
            onchange: (e) => { tampilkanRekening = e.target.checked; gambarTabel(); },
          }),
          'Tampilkan bank & rekening',
        ]),
        el('button.tombol-samar', {
          type: 'button', teks: 'Unduh CSV',
          onclick: () => unduhCsv(
            `Payroll ${periode.judul()}.csv`,
            [...kolomDasar(), { l: 'Bank', k: 'bank' }, { l: 'No. rekening', k: 'rekening' }],
            data),
        }),
        // rekap gaji resmi (8 lembar) — khusus admin yang pegang semua divisi
        (!P.adaPengguna() || P.siapa()?.admin === true) ? el('button.tombol-utama.tombol-kecil', {
          type: 'button', teks: 'Unduh Rekap Gaji (Excel)',
          onclick: () => dialogRekapGaji(periode),
        }) : null,
        el('button.tombol-samar', { type: 'button', teks: 'Cetak', onclick: () => window.print() }),
      ]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', {
          teks: 'Upah HK = jumlah (HK × tarif saat dicatat). Borongan sudah termasuk bagian dari borongan kelompok.',
        }),
        tempat,
      ]),
    ]),
  ]);
}

// =====================================================================
// REKAP per divisi / blok / kegiatan
// =====================================================================
function rekapMenurut(periode, ambilKunci, labelKunci) {
  const t = transaksiPeriode(periode);
  const peta = new Map();
  const tambah = (kunci, { hk = 0, nominal = 0 }) => {
    const k = kunci == null || kunci === '' ? 0 : Number(kunci);
    const b = peta.get(k) || { kunci: k, hk: 0, nominal: 0, baris: 0 };
    b.hk += hk; b.nominal += nominal; b.baris += 1;
    peta.set(k, b);
  };
  for (const r of t.hk) tambah(ambilKunci(r, 'hk'), { hk: Number(r.hk) || 0, nominal: Number(r.nominal) || 0 });
  for (const r of t.borongan) tambah(ambilKunci(r, 'borongan'), { nominal: Number(r.nominal) || 0 });
  for (const r of t.lembur) tambah(ambilKunci(r, 'lembur'), { nominal: Number(r.nominal) || 0 });
  for (const r of t.premi) tambah(ambilKunci(r, 'premi'), { nominal: Number(r.nominal) || 0 });

  return [...peta.values()]
    .map((b) => ({ ...b, label: b.kunci ? labelKunci(b.kunci) : '(tidak diisi)' }))
    .sort((a, b) => b.nominal - a.nominal);
}

function lembarRekap(judul, data, labelKolom) {
  return el('div.lembar', {}, [
    el('div.lembar-kepala', {}, [
      el('h2', { teks: judul }),
      el('button.tombol-samar.tombol-kecil', {
        type: 'button', teks: 'Unduh CSV',
        onclick: () => unduhCsv(`${judul}.csv`, [
          { l: labelKolom, k: 'label' },
          { l: 'Baris', k: 'baris' },
          { l: 'HK', k: 'hk' },
          { l: 'Biaya', k: 'nominal' },
        ], data),
      }),
    ]),
    el('div.lembar-isi', {}, [
      tabel([
        { l: labelKolom, k: 'label' },
        { l: 'Baris', k: 'baris', jenis: 'angka', total: true },
        { l: 'HK', k: 'hk', jenis: 'hk', total: true },
        { l: 'Biaya (Rp)', k: 'nominal', jenis: 'uang', total: true },
      ], data, { kosong: 'Belum ada data pada periode ini.' }),
    ]),
  ]);
}

export function halamanRekap({ periode }) {
  const perDivisi = rekapMenurut(periode, (r) => r.division_id, (id) => D.labelRef('divisions', id));
  // nama blok dihitung pada AKHIR periode yang dilihat, supaya rekap bulan
  // lama tidak ikut berganti siklus saat dicetak ulang hari ini
  const akhirPeriode = periode.rentang()[1];
  const perBlok = rekapMenurut(periode, (r) => r.block_id,
    (id) => D.labelBlokPada(id, akhirPeriode));
  const perKegiatan = rekapMenurut(
    periode,
    (r, jenis) => (jenis === 'hk' || jenis === 'borongan' ? r.activity_id : null),
    (id) => D.labelRef('activities', id),
  );

  return el('section', {}, [
    lembarRekap('Rekap per divisi', perDivisi, 'Divisi'),
    el('div', { style: 'height:1.6rem' }),
    lembarRekap('Rekap per blok', perBlok, 'Blok'),
    el('div', { style: 'height:1.6rem' }),
    lembarRekap('Rekap per kegiatan', perKegiatan, 'Kegiatan'),
    el('p.bantuan', {
      style: 'margin-top:1rem',
      teks: 'Lembur dan premi ikut terhitung di divisi/blok bila kolomnya diisi; kalau kosong masuk ke "(tidak diisi)". '
        + 'Rekap per kegiatan hanya mencakup HK harian dan borongan, karena lembur/premi tidak punya kolom kegiatan.',
    }),
  ]);
}
