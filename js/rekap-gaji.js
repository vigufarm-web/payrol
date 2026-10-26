import {payrollLedger,payrollWorkers,operatorPayroll} from './payroll-model.js';
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
// HK selalu masuk; lembur/premi hanya yang di-acc). Hanya untuk admin semua-divisi.

import * as D from './data.js';
import { unduhXlsx, S } from './xlsx-tulis.js';
import { el, pesan, panel, isian } from './ui.js';

const rapiRek = (s) => String(s || '').replace(/\D/g, '');
// Samakan ejaan: "Pengawasan sore" & "Pengawasan Sore" dihitung SATU.
// Yang ditampilkan adalah ejaan yang paling sering dipakai.
const kunciLabel = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
function ejaanUtama(hitungan) {          // Map(kunci -> Map(ejaan -> berapa kali))
  const pilih = new Map();
  for (const [kunci, varian] of hitungan) {
    let terbaik = null; let n = -1;
    for (const [ejaan, jml] of varian) {
      // paling sering; kalau seri, yang huruf kapitalnya lebih rapi
      const skor = jml * 1000 + (/^[A-Z]/.test(ejaan) ? 1 : 0);
      if (skor > n) { n = skor; terbaik = ejaan; }
    }
    pilih.set(kunci, terbaik);
  }
  return pilih;
}
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
export async function dataRekap(dari, sampai, {alatData}={}) {
  const dalam = (r) => !r.deleted_at && r.tanggal >= dari && r.tanggal <= sampai;
  const namaDiv = new Map(D.baris('divisions').map((d) => [Number(d.id), d.nama_divisi]));

  const orang = new Map();     // "divisi|id" -> baris orang
  const ambil = (divisi, kunciId, nama, rek) => {
    const k = `${divisi}|${kunciId}`;
    if (!orang.has(k)) {
      orang.set(k, { identity:kunciId, divisi, nama, rek: rapiRek(rek) || 'norekening',
        hk: 0, gaji: 0, tambahan: 0, normal: {}, lembur: {}, premi: {} });
    }
    return orang.get(k);
  };
  const jobdesk = new Map();   // divisi -> Map(kunciLabel -> {hk,pokok,tambahan})
  const ejaan = new Map();     // kunciLabel -> Map(ejaan asli -> jumlah pemakaian)
  const job = (divisi, label) => {
    if (!jobdesk.has(divisi)) jobdesk.set(divisi, new Map());
    const m = jobdesk.get(divisi);
    const asli = String(label || '').trim() || '(tanpa keterangan)';
    const k = kunciLabel(asli);
    if (!ejaan.has(k)) ejaan.set(k, new Map());
    const v = ejaan.get(k);
    v.set(asli, (v.get(asli) || 0) + 1);
    if (!m.has(k)) m.set(k, { hk: 0, pokok: 0, tambahan: 0 });
    return m.get(k);
  };

  for(const r of payrollLedger(D.state.data,dari,sampai)){
    const e=D.cari('employees',r.employee_id),div=namaDiv.get(Number(r.division_id))||`#${r.division_id}`,o=ambil(div,`p${r.employee_id}`,e?.nama||`#${r.employee_id}`,e?.rekening),normal=['hk','borongan'].includes(r.type),kantong=normal?'normal':r.type;
    o.hk+=r.hk;if(normal)o.gaji+=r.amount;else o.tambahan+=r.amount;
    o[kantong][r.tanggal]=(o[kantong][r.tanggal]||0)+r.amount;
    const label=r.type==='hk'?(r.job||D.labelRef('job_types',r.job_type_id)):r.type==='borongan'?'Borongan':r.keterangan_manual||D.labelRef('wage_components',r.wage_component_id),j=job(div,label);
    j.hk+=r.hk;if(normal)j.pokok+=r.amount;else j.tambahan+=r.amount;
  }

  // ---- operator alat berat & kendaraan (dari bagiannya sendiri)
  let alatTerbaca = false;
  const alat = alatData!==undefined?alatData:D.state.aplikasi==='AlatBerat'?D.state.data:await D.muatBagianLain('data/alat-berat.json');
  if(!alat?.tabel?.work_logs)throw new Error('Data alat belum terbaca. Muat ulang/sambungkan bagian alat agar rekap gabungan tidak kurang.');
  if (alat?.tabel?.work_logs) {
    alatTerbaca = true;
    const DIV = 'Alat Berat & Kendaraan';
    const op = new Map((alat.tabel.operators || []).map((o) => [Number(o.id), o]));
    const acc = (id) => {
      const c = alat.web?.persetujuan?.work_logs?.[String(id)];
      return !c || c.status === 'disetujui';   // data lama tanpa catatan = sah
    };
    for (const r of alat.tabel.work_logs) {
      if (!dalam(r)) continue;
      const o0 = op.get(Number(r.operator_id));
      const o = ambil(DIV, `a${r.operator_id}`, o0?.nama || `Operator #${r.operator_id}`, o0?.no_rekening);
      const jam = Math.max(0, (Number(r.hm_akhir) || 0) - (Number(r.hm_awal) || 0));
      const tambahanSah = acc(r.id);
      const pokok=(Number(r.hk)||0)*(Number(o0?.tarif_harian)||0),lembur=tambahanSah?jam*(Number(o0?.tarif_jam)||0):0;
      const premi = tambahanSah ? (Number(r.premi) || 0) : 0;
      o.hk += Number(r.hk) || 0;
      o.gaji += pokok;
      o.tambahan += lembur+premi;
      if(lembur)o.lembur[r.tanggal]=(o.lembur[r.tanggal]||0)+lembur;
      if (pokok) o.normal[r.tanggal] = (o.normal[r.tanggal] || 0) + pokok;
      if (premi) o.premi[r.tanggal] = (o.premi[r.tanggal] || 0) + premi;
      const j = job(DIV, r.kegiatan || 'Operasional alat');
      j.hk += Number(r.hk) || 0; j.pokok += pokok; j.tambahan += lembur+premi;
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
  const totals=rows=>({hk:rows.reduce((n,r)=>n+Number(r.hk||0),0),total:rows.reduce((n,r)=>n+Number(r.total??(r.gaji+r.tambahan)),0)}),payroll=totals(payrollWorkers(D.state.data,dari,sampai)),operator=totals(operatorPayroll(alat,dari,sampai));
  for(const [prefix,expected] of [['p',payroll],['a',operator]]){const actual=totals(baris.filter(r=>r.identity.startsWith(prefix)));if(Math.abs(actual.hk-expected.hk)>1e-6||Math.abs(actual.total-expected.total)>.005)throw new Error('Audit rekap tidak cocok dengan aplikasi. Unduhan dibatalkan agar angka tidak berbeda.');}
  const audit={payroll,operator,combined:{hk:payroll.hk+operator.hk,total:payroll.total+operator.total}};
  return { audit, baris, jobdesk, labelKegiatan: ejaanUtama(ejaan), peringatan, batas, alatTerbaca,
    tanggal: daftarTanggal(dari, sampai) };
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

export async function susunRekap(dari, sampai, options={}) {
  const { audit, baris, jobdesk, labelKegiatan, peringatan, batas, alatTerbaca, tanggal } = await dataRekap(dari, sampai, options);

  // ---- 1. Summary Pembayaran: gabungkan ID pekerja stabil lintas divisi; nama sama tidak digabung tanpa bukti
  const perOrang = new Map();
  for (const b of baris) {
    const k = b.identity;
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
  s1.filter = 'A6:G6';
  s1.bekuKolom = 2;   // No & Nama tetap terlihat
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
  s2.filter = `A6:F6`;
  let g2 = { hk: 0, pokok: 0, tambahan: 0 };
  const barisTotalDivisi = new Map();   // divisi -> nomor baris totalnya (untuk rumus di bawah)
  for (const div of [...jobdesk.keys()].sort((a, b) => a.localeCompare(b, 'id'))) {
    const m = jobdesk.get(div);
    const sub = { hk: 0, pokok: 0, tambahan: 0 };
    const urut = [...m.keys()]
      .map((k) => ({ k, tampil: labelKegiatan.get(k) || k }))
      .sort((a, b) => a.tampil.localeCompare(b.tampil, 'id'));
    for (const { k, tampil } of urut) {
      const x = m.get(k);
      s2.baris.push([S.teks(div), S.teks(tampil), S.angka(x.hk), S.uang(x.pokok),
        S.uang(x.tambahan), S.uang(x.pokok + x.tambahan)]);
      sub.hk += x.hk; sub.pokok += x.pokok; sub.tambahan += x.tambahan;
    }
    s2.baris.push([S.teksT(div), S.teksT(`${div} Total`), S.angkaT(sub.hk),
      S.uangT(sub.pokok), S.uangT(sub.tambahan), S.uangT(sub.pokok + sub.tambahan)]);
    barisTotalDivisi.set(div, s2.baris.length);   // 1-indeks = panjang setelah push
    g2.hk += sub.hk; g2.pokok += sub.pokok; g2.tambahan += sub.tambahan;
  }
  s2.baris.push([S.teksT('Grand Total'), S.teksT(''), S.angkaT(g2.hk),
    S.uangT(g2.pokok), S.uangT(g2.tambahan), S.uangT(g2.pokok + g2.tambahan)]);

  // ---- bagian tambahan: Biaya Operasional & Penjualan (penjualan diisi manual)
  const divisiUrut = [...barisTotalDivisi.keys()];
  s2.baris.push([]);
  const rPita = s2.baris.length + 1;
  s2.baris.push([S.pita('BIAYA OPERASIONAL & PENJUALAN')]);
  s2.merges.push(`A${rPita}:F${rPita}`);
  s2.baris.push(['Divisi', 'Biaya Operasional (Rp)', 'Penjualan (Rp)', 'Selisih (Rp)', '', ''].map(S.kepala));
  const rAwal = s2.baris.length + 1;
  for (const div of divisiUrut) {
    const r = s2.baris.length + 1;
    s2.baris.push([
      S.teks(div),
      S.rumus(`F${barisTotalDivisi.get(div)}`),                      // biaya = total divisi di atas
      S.rumus(`SUMIF(Penjualan!$A:$A,A${r},Penjualan!$D:$D)`),       // penjualan dari lembar Penjualan
      S.rumus(`C${r}-B${r}`),
      S.kosong(), S.kosong(),
    ]);
  }
  const rAkhir = s2.baris.length;
  s2.baris.push([S.teksT('Total'),
    S.rumusT(`SUM(B${rAwal}:B${rAkhir})`),
    S.rumusT(`SUM(C${rAwal}:C${rAkhir})`),
    S.rumusT(`SUM(D${rAwal}:D${rAkhir})`),
    S.teksT(''), S.teksT('')]);
  s2.baris.push([]);
  s2.baris.push([S.catatan('Penjualan diisi di lembar "Penjualan" — angkanya otomatis masuk ke sini '
    + 'lewat nama divisi. Selisih = Penjualan − Biaya Operasional.')]);

  // ---- 3. Lampiran per Divisi
  const s3 = kepalaLaporan('LAMPIRAN PER DIVISI', dari, sampai, 7);
  s3.nama = 'Lampiran per Divisi';
  s3.lebar = [22, 30, 15, 7, 14, 16, 15];
  s3.bekukan = 6;
  s3.baris.push(['Divisi', 'Nama', 'No Rek', 'HK', 'Gaji (Rp)', 'Lembur+Premi (Rp)', 'Total Gaji (Rp)'].map(S.kepala));
  s3.filter = 'A6:G6';
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
    s.bekuKolom = 3;   // Divisi/Nama/Rekening tetap terlihat saat menggulir tanggal
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
  const s7 = kepalaLaporan('PENJUALAN (diisi manual)', dari, sampai, 5);
  s7.nama = 'Penjualan';
  s7.lebar = [22, 14, 34, 18, 16];
  s7.bekukan = 6;
  s7.baris.push(['Divisi', 'Tanggal', 'Keterangan / Pembeli', 'Jumlah (Rp)', ''].map(S.kepala));
  const rJualAwal = s7.baris.length + 1;
  const BARIS_JUAL = 40;
  for (let i = 0; i < BARIS_JUAL; i++) {
    s7.baris.push([S.isianTeks(), S.isianTeks(), S.isianTeks(), S.isianUang(), S.kosong()]);
  }
  const rJualAkhir = s7.baris.length;
  s7.baris.push([S.teksT('Grand Total'), S.teksT(''), S.teksT(''),
    S.rumusT(`SUM(D${rJualAwal}:D${rJualAkhir})`), S.teksT('')]);
  s7.baris.push([]);
  s7.baris.push([S.catatan('Isi NAMA DIVISI persis seperti di lembar Summary Jobdesk '
    + `(${divisiUrut.join(', ')}) supaya jumlahnya otomatis masuk ke bagian `
    + '"Biaya Operasional & Penjualan". Tanggal boleh diketik dd/mm/yyyy.')]);

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

  s8.baris.push([], [S.tebal('AUDIT KECOCOKAN DENGAN APLIKASI')], ['Cakupan','HK','Total Rp'].map(S.kepala));
  for(const [label,v] of [['Payroll aktif',audit.payroll],['Operator alat',audit.operator],['Gabungan Excel',audit.combined]])s8.baris.push([S.teks(label),S.angka(v.hk),S.uang(v.total)]);
  s8.baris.push([S.catatan('CSV mengikuti payroll yang tampil. Rekap Excel menggabungkan payroll aktif dan operator; subtotal di atas diperiksa sebelum unduhan.')]);
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
      + 'Lembur & premi yang belum di-acc TIDAK ikut dihitung. CSV sama dengan payroll yang tampil; Excel menggabungkan payroll aktif dan operator. Lembar Peringatan HK memuat audit subtotal masing-masing dan total gabungan.' }),
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
