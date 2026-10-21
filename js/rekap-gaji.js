// rekap-gaji.js — Unduhan "Rekap Gaji Tenaga Kerja Harian" (.xlsx) dengan
// susunan lembar mengikuti format rekap perusahaan:
//   1. Summary Pembayaran   : per orang (gabungan semua divisi) + tanda tangan
//   2. Summary Jobdesk      : per divisi x kegiatan
//   3. Lampiran per Divisi  : per divisi x orang (subtotal per divisi)
//   4. Detail Upah Normal   : matriks orang x tanggal
//   5. Detail Upah Lembur   : matriks orang x tanggal (hanya yang di-acc)
//   6. Detail Upah Premi    : matriks orang x tanggal (hanya yang di-acc)
//   7. Penjualan            : kosong, diisi manual
//   8. Peringatan HK        : orang-hari dengan HK melebihi batas
// Termasuk upah operator Alat Berat & Kendaraan (dibaca dari bagiannya,
// hanya log yang sudah di-acc). Hanya untuk admin semua-divisi.

import * as D from './data.js';
import { unduhXlsx, S } from './xlsx-tulis.js';
import { el, pesan, panel, isian } from './ui.js';

const rapiRek = (s) => String(s || '').replace(/\D/g, '');
const fmtTgl = (iso) => iso;   // kepala kolom matriks memakai tanggal ISO, ringkas

function daftarTanggal(dari, sampai) {
  // pakai UTC murni supaya tidak bergeser sehari karena zona waktu
  const keluar = [];
  const d = new Date(`${dari}T00:00:00Z`);
  const akhir = new Date(`${sampai}T00:00:00Z`);
  for (; d <= akhir; d.setUTCDate(d.getUTCDate() + 1)) {
    keluar.push(d.toISOString().slice(0, 10));
  }
  return keluar;
}

// ------------------------------------------------------- kumpulkan angka
export async function dataRekap(dari, sampai) {
  const dalam = (r) => !r.deleted_at && r.tanggal >= dari && r.tanggal <= sampai;
  const namaDiv = new Map(D.baris('divisions').map((d) => [Number(d.id), d.nama_divisi]));

  const orang = new Map();     // "divisi|id" -> baris orang
  const ambil = (divisi, kunciId, nama, rek) => {
    const k = `${divisi}|${kunciId}`;
    if (!orang.has(k)) {
      orang.set(k, { divisi, nama, rek: rapiRek(rek) || 'norekening',
        hk: 0, gaji: 0, tambahan: 0, normal: {}, lembur: {}, premi: {} });
    }
    return orang.get(k);
  };
  const jobdesk = new Map();   // divisi -> Map(kegiatan -> {hk,pokok,tambahan})
  const job = (divisi, label) => {
    if (!jobdesk.has(divisi)) jobdesk.set(divisi, new Map());
    const m = jobdesk.get(divisi);
    const l = (label || '(tanpa keterangan)').trim() || '(tanpa keterangan)';
    if (!m.has(l)) m.set(l, { hk: 0, pokok: 0, tambahan: 0 });
    return m.get(l);
  };

  // ---- payroll: HK harian
  for (const r of D.baris('daily_payroll')) {
    if (!dalam(r)) continue;
    const e = D.cari('employees', r.employee_id);
    const div = namaDiv.get(Number(r.division_id)) || `#${r.division_id}`;
    const o = ambil(div, `p${r.employee_id}`, e?.nama || `#${r.employee_id}`, e?.rekening);
    const n = Number(r.nominal) || 0;
    o.hk += Number(r.hk) || 0;
    o.gaji += n;
    o.normal[r.tanggal] = (o.normal[r.tanggal] || 0) + n;
    const labelJob = r.job || D.labelRef('job_types', r.job_type_id);
    const j = job(div, labelJob);
    j.hk += Number(r.hk) || 0; j.pokok += n;
  }
  // ---- payroll: borongan (ikut gaji pokok)
  for (const r of D.baris('borongan_transactions')) {
    if (!dalam(r)) continue;
    const e = D.cari('employees', r.employee_id);
    const div = namaDiv.get(Number(r.division_id)) || `#${r.division_id}`;
    const o = ambil(div, `p${r.employee_id}`, e?.nama || `#${r.employee_id}`, e?.rekening);
    const n = Number(r.nominal) || 0;
    o.gaji += n;
    o.normal[r.tanggal] = (o.normal[r.tanggal] || 0) + n;
    job(div, 'Borongan').pokok += n;
  }
  // ---- payroll: lembur & premi (HANYA yang sudah di-acc)
  for (const [tabel, kantong] of [['lembur_transactions', 'lembur'], ['premi_transactions', 'premi']]) {
    for (const r of D.baris(tabel)) {
      if (!dalam(r) || !D.disetujui(tabel, r.id)) continue;
      const e = D.cari('employees', r.employee_id);
      const div = namaDiv.get(Number(r.division_id)) || '(tanpa divisi)';
      const o = ambil(div, `p${r.employee_id}`, e?.nama || `#${r.employee_id}`, e?.rekening);
      const n = Number(r.nominal) || 0;
      o.tambahan += n;
      o[kantong][r.tanggal] = (o[kantong][r.tanggal] || 0) + n;
      job(div, r.keterangan_manual || D.labelRef('wage_components', r.wage_component_id)).tambahan += n;
    }
  }

  // ---- operator alat berat & kendaraan (dari bagiannya sendiri)
  let alatTerbaca = false;
  const alat = await D.muatBagianLain('data/alat-berat.json');
  if (alat?.tabel?.work_logs) {
    alatTerbaca = true;
    const DIV = 'Alat Berat & Kendaraan';
    const op = new Map((alat.tabel.operators || []).map((o) => [Number(o.id), o]));
    const acc = (id) => {
      const c = alat.web?.persetujuan?.work_logs?.[String(id)];
      return !c || c.status === 'disetujui';   // data lama tanpa catatan = sah
    };
    for (const r of alat.tabel.work_logs) {
      if (!dalam(r) || !acc(r.id)) continue;
      const o0 = op.get(Number(r.operator_id));
      const o = ambil(DIV, `a${r.operator_id}`, o0?.nama || `Operator #${r.operator_id}`, o0?.no_rekening);
      const jam = Math.max(0, (Number(r.hm_akhir) || 0) - (Number(r.hm_awal) || 0));
      const pokok = (Number(r.hk) || 0) * (Number(o0?.tarif_harian) || 0)
        + jam * (Number(o0?.tarif_jam) || 0);
      const premi = Number(r.premi) || 0;
      o.hk += Number(r.hk) || 0;
      o.gaji += pokok;
      o.tambahan += premi;
      if (pokok) o.normal[r.tanggal] = (o.normal[r.tanggal] || 0) + pokok;
      if (premi) o.premi[r.tanggal] = (o.premi[r.tanggal] || 0) + premi;
      const j = job(DIV, r.kegiatan || 'Operasional alat');
      j.hk += Number(r.hk) || 0; j.pokok += pokok; j.tambahan += premi;
    }
  }

  // ---- peringatan HK > batas (payroll, per orang per tanggal)
  const batas = D.maksHkPerHari();
  const perHari = new Map();
  for (const r of D.baris('daily_payroll')) {
    if (!dalam(r)) continue;
    const k = `${r.employee_id}|${r.tanggal}`;
    perHari.set(k, (perHari.get(k) || 0) + (Number(r.hk) || 0));
  }
  const peringatan = [...perHari.entries()]
    .filter(([, n]) => n > batas + 1e-9)
    .map(([k, n]) => {
      const [id, tanggal] = k.split('|');
      return { nama: D.labelRef('employees', id), tanggal, hk: n };
    })
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  const baris = [...orang.values()]
    .sort((a, b) => a.divisi.localeCompare(b.divisi, 'id') || a.nama.localeCompare(b.nama, 'id'));
  return { baris, jobdesk, peringatan, batas, alatTerbaca, tanggal: daftarTanggal(dari, sampai) };
}

// ----------------------------------------------------------- susun sheet
const kepalaLaporan = (judulKecil, dari, sampai, lebarKolom) => {
  const kol = String.fromCharCode(64 + Math.min(lebarKolom, 26));
  return {
    baris: [
      [S.judul('PT. VIGU FARM INDONESIA')],
      [S.sub('REKAP GAJI TENAGA KERJA HARIAN')],
      [S.kecil(`Periode : ${dari} s/d ${sampai}`)],
      [S.sub(judulKecil)],
      [],
    ],
    merges: [1, 2, 3, 4].map((r) => `A${r}:${kol}${r}`),
  };
};

export async function susunRekap(dari, sampai) {
  const { baris, jobdesk, peringatan, batas, alatTerbaca, tanggal } = await dataRekap(dari, sampai);

  // ---- 1. Summary Pembayaran: gabungkan per ORANG (nama+rek) lintas divisi
  const perOrang = new Map();
  for (const b of baris) {
    const k = `${b.nama.toLowerCase()}|${b.rek}`;
    if (!perOrang.has(k)) perOrang.set(k, { nama: b.nama, rek: b.rek, hk: 0, gaji: 0, tambahan: 0 });
    const o = perOrang.get(k);
    o.hk += b.hk; o.gaji += b.gaji; o.tambahan += b.tambahan;
  }
  const urut = [...perOrang.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  const s1 = kepalaLaporan('SUMMARY PEMBAYARAN TENAGA KERJA', dari, sampai, 7);
  s1.nama = 'Summary Pembayaran';
  s1.lebar = [5, 30, 15, 7, 14, 16, 15];
  s1.bekukan = 6;
  s1.baris.push(['No', 'Nama', 'Rek', 'HK', 'Gaji (Rp)', 'Lembur+Premi (Rp)', 'Total Gaji (Rp)'].map(S.kepala));
  urut.forEach((o, i) => s1.baris.push([
    { v: i + 1, g: 12 }, S.teks(o.nama), S.teks(o.rek), S.angka(o.hk),
    S.uang(o.gaji), S.uang(o.tambahan), S.uang(o.gaji + o.tambahan)]));
  const tHk = urut.reduce((a, o) => a + o.hk, 0);
  const tGaji = urut.reduce((a, o) => a + o.gaji, 0);
  const tTambah = urut.reduce((a, o) => a + o.tambahan, 0);
  s1.baris.push([S.teksT(''), S.teksT('Grand Total'), S.teksT(''), S.angkaT(tHk),
    S.uangT(tGaji), S.uangT(tTambah), S.uangT(tGaji + tTambah)]);
  const r0 = s1.baris.length;
  s1.baris.push([], [S.tebal('Dibuat oleh,'), null, null, S.tebal('Disetujui oleh,')],
    [], [], [S.teks('(................................)'), null, null, S.teks('(................................)')]);
  s1.merges.push(`A${r0 + 2}:C${r0 + 2}`, `D${r0 + 2}:G${r0 + 2}`,
    `A${r0 + 5}:C${r0 + 5}`, `D${r0 + 5}:G${r0 + 5}`);

  // ---- 2. Summary Jobdesk
  const s2 = kepalaLaporan('SUMMARY TABEL JOBDESK', dari, sampai, 6);
  s2.nama = 'Summary Jobdesk';
  s2.lebar = [22, 48, 8, 16, 17, 16];
  s2.bekukan = 6;
  s2.baris.push(['Team', 'Kegiatan', 'HK', 'Gaji Pokok (Rp)', 'Lembur/Premi (Rp)', 'Total Gaji (Rp)'].map(S.kepala));
  let g2 = { hk: 0, pokok: 0, tambahan: 0 };
  for (const div of [...jobdesk.keys()].sort((a, b) => a.localeCompare(b, 'id'))) {
    const m = jobdesk.get(div);
    let sub = { hk: 0, pokok: 0, tambahan: 0 };
    for (const keg of [...m.keys()].sort((a, b) => a.localeCompare(b, 'id'))) {
      const x = m.get(keg);
      s2.baris.push([S.teks(div), S.teks(keg), S.angka(x.hk), S.uang(x.pokok),
        S.uang(x.tambahan), S.uang(x.pokok + x.tambahan)]);
      sub.hk += x.hk; sub.pokok += x.pokok; sub.tambahan += x.tambahan;
    }
    s2.baris.push([S.teksT(div), S.teksT(`${div} Total`), S.angkaT(sub.hk),
      S.uangT(sub.pokok), S.uangT(sub.tambahan), S.uangT(sub.pokok + sub.tambahan)]);
    g2.hk += sub.hk; g2.pokok += sub.pokok; g2.tambahan += sub.tambahan;
  }
  s2.baris.push([S.teksT('Grand Total'), S.teksT(''), S.angkaT(g2.hk),
    S.uangT(g2.pokok), S.uangT(g2.tambahan), S.uangT(g2.pokok + g2.tambahan)]);

  // ---- 3. Lampiran per Divisi
  const s3 = kepalaLaporan('LAMPIRAN PER DIVISI', dari, sampai, 7);
  s3.nama = 'Lampiran per Divisi';
  s3.lebar = [22, 30, 15, 7, 14, 16, 15];
  s3.bekukan = 6;
  s3.baris.push(['Divisi', 'Nama', 'No Rek', 'HK', 'Gaji (Rp)', 'Lembur+Premi (Rp)', 'Total Gaji (Rp)'].map(S.kepala));
  let divAktif = null; let sub3 = null; let g3 = { hk: 0, gaji: 0, tambahan: 0 };
  const tutupSub = () => {
    if (!sub3) return;
    s3.baris.push([S.teksT(divAktif), S.teksT(`${divAktif} Total`), S.teksT(''),
      S.angkaT(sub3.hk), S.uangT(sub3.gaji), S.uangT(sub3.tambahan), S.uangT(sub3.gaji + sub3.tambahan)]);
  };
  for (const b of baris) {
    if (b.divisi !== divAktif) { tutupSub(); divAktif = b.divisi; sub3 = { hk: 0, gaji: 0, tambahan: 0 }; }
    s3.baris.push([S.teks(b.divisi), S.teks(b.nama), S.teks(b.rek), S.angka(b.hk),
      S.uang(b.gaji), S.uang(b.tambahan), S.uang(b.gaji + b.tambahan)]);
    sub3.hk += b.hk; sub3.gaji += b.gaji; sub3.tambahan += b.tambahan;
    g3.hk += b.hk; g3.gaji += b.gaji; g3.tambahan += b.tambahan;
  }
  tutupSub();
  s3.baris.push([S.teksT('Grand Total'), S.teksT(''), S.teksT(''), S.angkaT(g3.hk),
    S.uangT(g3.gaji), S.uangT(g3.tambahan), S.uangT(g3.gaji + g3.tambahan)]);

  // ---- 4/5/6. matriks harian
  const matriks = (judul, namaSheet, ambilKantong) => {
    const nKol = 3 + tanggal.length + 1;
    const s = kepalaLaporan(judul, dari, sampai, Math.min(nKol, 26));
    s.nama = namaSheet;
    s.lebar = [20, 28, 14, ...tanggal.map(() => 11), 13];
    s.bekukan = 6;
    s.baris.push(['Divisi', 'Nama', 'Rekening', ...tanggal.map(fmtTgl), 'Grand Total'].map(S.kepala));
    const totalKolom = tanggal.map(() => 0);
    let adaIsi = false; let totalSemua = 0;
    for (const b of baris) {
      const kantong = ambilKantong(b);
      const jumlah = Object.values(kantong).reduce((a, n) => a + n, 0);
      if (!jumlah) continue;
      adaIsi = true; totalSemua += jumlah;
      s.baris.push([S.teks(b.divisi), S.teks(b.nama), S.teks(b.rek),
        ...tanggal.map((t, i) => { totalKolom[i] += kantong[t] || 0; return S.uang(kantong[t]); }),
        S.uang(jumlah)]);
    }
    s.baris.push([S.teksT(''), S.teksT('Grand Total'), S.teksT(''),
      ...totalKolom.map(S.uangT), S.uangT(totalSemua)]);
    if (!adaIsi) s.baris.push([S.teks('Tidak ada data pada periode ini.')]);
    return s;
  };
  const s4 = matriks('UPAH NORMAL', 'Detail Upah Normal', (b) => b.normal);
  const s5 = matriks('UPAH LEMBUR (disetujui)', 'Detail Upah Lembur', (b) => b.lembur);
  const s6 = matriks('UPAH PREMI (disetujui)', 'Detail Upah Premi', (b) => b.premi);

  // ---- 7. Penjualan (kosong, diisi manual)
  const s7 = kepalaLaporan('PENJUALAN (diisi manual)', dari, sampai, 7);
  s7.nama = 'Penjualan';
  s7.lebar = [13, 26, 18, 10, 10, 14, 16];
  s7.baris.push(['Tanggal', 'Pembeli / Uraian', 'Komoditas', 'Qty', 'Satuan', 'Harga (Rp)', 'Total (Rp)'].map(S.kepala));
  for (let i = 0; i < 30; i++) s7.baris.push([S.kosong(), S.kosong(), S.kosong(), S.kosong(), S.kosong(), S.kosong(), S.kosong()]);
  s7.baris.push([S.teksT(''), S.teksT('Total'), S.teksT(''), S.teksT(''), S.teksT(''), S.teksT(''), S.uangT(0)]);

  // ---- 8. Peringatan HK
  const s8 = { nama: 'Peringatan HK', lebar: [34, 14, 8], baris: [], merges: [] };
  if (!peringatan.length) {
    s8.baris.push([S.tebal(`Tidak ada peringatan - semua orang total HK per hari <= ${batas}`)]);
  } else {
    s8.baris.push([S.tebal(`PERIKSA: total HK per orang per hari melebihi batas ${batas}`)], []);
    s8.baris.push(['Nama', 'Tanggal', 'HK'].map(S.kepala));
    for (const w of peringatan) s8.baris.push([S.teks(w.nama), S.teks(w.tanggal), S.angka(w.hk)]);
  }
  if (!alatTerbaca) {
    s8.baris.push([], [S.tebal('Catatan: bagian Alat Berat & Kendaraan tidak terbaca — upah operator belum ikut di rekap ini.')]);
  }

  return [s1, s2, s3, s4, s5, s6, s7, s8];
}

export async function unduhRekapGaji(dari, sampai) {
  const sheets = await susunRekap(dari, sampai);
  await unduhXlsx(`Rekap_Gaji_${dari}_sd_${sampai}.xlsx`, sheets);
}

// ---------------------------------------------------------------- tombol
/** Dialog pilih periode lalu unduh. Dipanggil dari halaman Payroll. */
export function dialogRekapGaji(periode) {
  const b = String(periode.bulan).padStart(2, '0');
  const dd = (n) => String(n).padStart(2, '0');
  const akhirBulan = new Date(periode.tahun, periode.bulan, 0).getDate();
  // Rentang tanggal BEBAS — gajian per 2 minggu tanggalnya tidak selalu sama.
  const inDari = el('input', { type: 'date', nilai: `${periode.tahun}-${b}-01` });
  const inSampai = el('input', { type: 'date', nilai: `${periode.tahun}-${b}-15` });
  const catatan = el('p.bantuan', { teks: ' ' });
  const hitungHari = () => {
    const a = new Date(`${inDari.value}T00:00:00Z`);
    const z = new Date(`${inSampai.value}T00:00:00Z`);
    if (!inDari.value || !inSampai.value || Number.isNaN(+a) || Number.isNaN(+z)) {
      catatan.textContent = 'Isi tanggal mulai dan tanggal akhir.'; return;
    }
    if (z < a) { catatan.textContent = 'Tanggal akhir tidak boleh sebelum tanggal mulai.'; return; }
    const hari = Math.round((z - a) / 86400000) + 1;
    catatan.textContent = `Rentang ${hari} hari.`;
  };
  inDari.addEventListener('change', hitungHari);
  inSampai.addEventListener('change', hitungHari);
  const pintasan = (label, dari, sampai) => el('button.tombol-samar.tombol-kecil', {
    type: 'button', teks: label,
    onclick: () => { inDari.value = dari; inSampai.value = sampai; hitungHari(); },
  });
  const p = panel('Unduh Rekap Gaji (Excel)', el('div', {}, [
    el('p', { teks: 'Berisi 8 lembar: summary pembayaran, jobdesk, lampiran per divisi, '
      + 'detail harian (normal/lembur/premi), lembar penjualan kosong, dan peringatan HK. '
      + 'Lembur & premi yang belum di-acc TIDAK ikut dihitung.' }),
    el('div.baris-isian', {}, [
      isian('Dari tanggal *', inDari),
      isian('Sampai tanggal *', inSampai),
    ]),
    catatan,
    el('label', { style: 'display:block;font-size:.85rem;font-weight:600;margin:.6rem 0 .3rem',
      teks: 'Pintasan periode' }),
    el('div', { style: 'display:flex;flex-wrap:wrap;gap:.4rem' }, [
      pintasan(`1–15 ${b}/${periode.tahun}`, `${periode.tahun}-${b}-01`, `${periode.tahun}-${b}-15`),
      pintasan(`16–${akhirBulan} ${b}/${periode.tahun}`, `${periode.tahun}-${b}-16`, `${periode.tahun}-${b}-${dd(akhirBulan)}`),
      pintasan(`Sebulan ${b}/${periode.tahun}`, `${periode.tahun}-${b}-01`, `${periode.tahun}-${b}-${dd(akhirBulan)}`),
    ]),
  ]), [
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', {
      type: 'button', teks: 'Unduh',
      onclick: async (e) => {
        const dari = inDari.value; const sampai = inSampai.value;
        if (!dari || !sampai || sampai < dari) { hitungHari(); return; }
        e.target.disabled = true; e.target.textContent = 'Menyusun…';
        try {
          await unduhRekapGaji(dari, sampai);
          p.tutup();
          pesan(`Rekap gaji ${dari} s/d ${sampai} terunduh.`, 'sukses', 6);
        } catch (err) {
          e.target.disabled = false; e.target.textContent = 'Unduh';
          pesan(`Gagal menyusun rekap: ${err.message}`, 'awas', 8);
        }
      },
    }),
  ]);
}
