// monitor-semua.js — "Pantauan": satu halaman yang menyatukan
// angka dari SEMUA bagian di repo ini — Payroll Operasional (semua divisi)
// dan Alat Berat & Kendaraan — supaya admin bisa memantau semuanya tanpa
// berpindah-pindah bagian.
//
// Hanya untuk admin penuh. Halaman ini MEMBACA saja, tidak pernah mengubah
// data bagian lain (bagian lain dibaca lewat D.muatBagianLain()).
//
// Aturan angkanya sama persis dengan laporan masing-masing bagian:
//   • Lembur & premi hanya dihitung kalau SUDAH di-acc kepala divisi.
//   • HK dan operasi alat langsung dihitung; upah jam/lembur & premi menunggu acc.
//   • Upah operator = (HK x tarif harian) + tambahan yang sudah disetujui.

import * as D from './data.js';
import {
  el, tabel, kosongkan, taruh, rupiah, angka, hk as fhk, pesan, waktu,
  pilihParuh, periodeParuh, tanya, isian, pilihan, namaBulan,
} from './ui.js';
import { unduhXlsx, S } from './xlsx-tulis.js';

const nol = (v) => Number(v) || 0;
const hmPakai = (r) => Math.max(0, nol(r.hm_akhir) - nol(r.hm_awal));
const kmPakai = (r) => Math.max(0, nol(r.km_akhir) - nol(r.km_awal));

/** Catatan persetujuan di data bagian mana pun (bukan hanya yang aktif).
 *  Baris tanpa catatan = data lama, dianggap sudah sah. */
const accDi = (data, tabelNama, id) => {
  const c = data?.web?.persetujuan?.[tabelNama]?.[String(id)];
  return !c || c.status === 'disetujui';
};
const menungguDi = (data, tabelNama, id) => (
  data?.web?.persetujuan?.[tabelNama]?.[String(id)]?.status === 'menunggu'
);
const barisDi = (data, tabelNama) => data?.tabel?.[tabelNama] || [];

/**
 * Semua bagian di repo ini, siap dibaca. Bagian yang sedang terbuka diambil
 * dari memori (jadi perubahan yang belum disimpan pun ikut terlihat); bagian
 * lain diambil dari GitHub memakai password yang sama.
 */
async function bacaSemuaBagian() {
  const dataset = D.state.daftar?.dataset || {};
  const hasil = [];
  const gagal = [];
  const daftarPath = Object.keys(dataset).length ? Object.keys(dataset) : [D.state.path];
  for (const path of daftarPath) {
    const meta = dataset[path] || {};
    if (path === D.state.path) {
      hasil.push({
        path,
        label: meta.label || path,
        aplikasi: D.state.aplikasi || meta.aplikasi,
        meta,
        data: D.state.data,
        aktif: true,
      });
      continue;
    }
    const lain = await D.muatBagianLain(path);
    if (!lain?.tabel) { gagal.push(meta.label || path); continue; }
    hasil.push({
      path,
      label: meta.label || path,
      aplikasi: lain.aplikasi || meta.aplikasi,
      meta,
      data: lain,
      aktif: false,
    });
  }
  return { bagian: hasil, gagal };
}

// ------------------------------------------------------------ hitungan
/** Ringkasan per divisi dari satu bagian Payroll HK. */
function hitungPayroll(data, dari, sampai) {
  const dalam = (r) => !r.deleted_at && r.tanggal >= dari && r.tanggal <= sampai;
  const namaDiv = new Map(barisDi(data, 'divisions').map((d) => [Number(d.id), d.nama_divisi]));
  const per = new Map();
  const ambil = (divId) => {
    const k = divId == null ? 0 : Number(divId);
    if (!per.has(k)) {
      per.set(k, {
        divisi: k === 0 ? '(tanpa divisi)' : (namaDiv.get(k) || `#${divId}`),
        jenis: 'Operasional',
        orang: new Set(),
        hk: 0, pokok: 0, lembur: 0, premi: 0,
        solar: 0, servis: 0,
        tungguGrup: new Set(), tungguRp: 0,
      });
    }
    return per.get(k);
  };

  for (const r of barisDi(data, 'daily_payroll')) {
    if (!dalam(r)) continue;
    const b = ambil(r.division_id);
    b.orang.add(Number(r.employee_id));
    b.hk += nol(r.hk);
    b.pokok += nol(r.nominal);
  }
  for (const r of barisDi(data, 'borongan_transactions')) {
    if (!dalam(r)) continue;
    const b = ambil(r.division_id);
    b.orang.add(Number(r.employee_id));
    b.pokok += nol(r.nominal);
  }
  for (const [tabelNama, kantong] of [['lembur_transactions', 'lembur'], ['premi_transactions', 'premi']]) {
    for (const r of barisDi(data, tabelNama)) {
      if (r.tanggal < dari || r.tanggal > sampai) continue;
      if (r.deleted_at) continue;             // dihapus / ditolak
      const b = ambil(r.division_id);
      if (menungguDi(data, tabelNama, r.id)) {
        // Satu lembur yang dibagi ke beberapa blok hanya satu pekerjaan dan
        // satu keputusan. Pantauan harus menghitung grup, bukan pecahan baris.
        b.tungguGrup.add([tabelNama, r.employee_id, r.tanggal,
          r.wage_component_id, r.keterangan_manual || r.catatan || ''].join('|'));
        b.tungguRp += nol(r.nominal);
        continue;
      }
      if (!accDi(data, tabelNama, r.id)) continue;
      b.orang.add(Number(r.employee_id));
      b[kantong] += nol(r.nominal);
    }
  }
  return [...per.values()].map((b) => {
    const { tungguGrup, ...hasil } = b;
    return {
      ...hasil,
      orang: b.orang.size,
      tunggu: tungguGrup.size,
      total: b.pokok + b.lembur + b.premi,
    };
  }).sort((a, b) => String(a.divisi).localeCompare(String(b.divisi), 'id'));
}

/** Ringkasan per unit dari satu bagian Alat Berat & Kendaraan. */
function hitungAlat(data, dari, sampai) {
  const dalam = (r) => !r.deleted_at && r.tanggal >= dari && r.tanggal <= sampai;
  const unit = new Map(barisDi(data, 'units').map((u) => [Number(u.id), u]));
  const op = new Map(barisDi(data, 'operators').map((o) => [Number(o.id), o]));
  const per = new Map();
  const ambil = (unitId) => {
    const k = Number(unitId);
    if (!per.has(k)) {
      const u = unit.get(k);
      per.set(k, {
        unit: u ? `${u.kode} — ${u.nama}` : `#${unitId} (tidak ada)`,
        kategori: u?.kategori || '',
        hari: new Set(), hm: 0, km: 0, ritase: 0, hkOp: 0,
        liter: 0, solar: 0, servis: 0, upah: 0, premi: 0,
        tunggu: 0,
      });
    }
    return per.get(k);
  };

  for (const r of barisDi(data, 'work_logs')) {
    if (r.deleted_at || r.tanggal < dari || r.tanggal > sampai) continue;
    const b = ambil(r.unit_id);
    const tambahanSah = accDi(data, 'work_logs', r.id);
    const o = op.get(Number(r.operator_id));
    const nilaiTambahan = hmPakai(r) * nol(o?.tarif_jam) + nol(r.premi);
    if (menungguDi(data, 'work_logs', r.id) && nilaiTambahan > 0) b.tunggu += 1;
    b.hari.add(r.tanggal);
    b.hm += hmPakai(r);
    b.km += kmPakai(r);
    b.ritase += nol(r.ritase);
    b.hkOp += nol(r.hk);
    b.upah += nol(r.hk) * nol(o?.tarif_harian);
    if (tambahanSah) {
      b.upah += hmPakai(r) * nol(o?.tarif_jam);
      b.premi += nol(r.premi);
    }
  }
  for (const r of barisDi(data, 'fuel_logs')) {
    if (!dalam(r)) continue;
    const b = ambil(r.unit_id);
    b.liter += nol(r.liter);
    b.solar += nol(r.liter) * nol(r.harga_liter);
  }
  for (const r of barisDi(data, 'service_logs')) {
    if (!dalam(r)) continue;
    ambil(r.unit_id).servis += nol(r.biaya);
  }

  return [...per.values()].map((b) => ({
    ...b,
    hari_operasi: b.hari.size,
    // tanpa catatan solar efisiensinya belum bisa dihitung — jangan tampilkan 0
    ltr_km: b.km > 0 && b.liter > 0 ? b.liter / b.km : null,
    hm_ltr: b.liter > 0 && b.hm > 0 ? b.hm / b.liter : null,
    total: b.upah + b.premi + b.solar + b.servis,
  })).sort((a, b) => String(a.kategori).localeCompare(String(b.kategori), 'id')
    || String(a.unit).localeCompare(String(b.unit), 'id'));
}

// --------------------------------------------------- unduh data mentah
//
// Ringkasan di layar hanya angka jadi. Untuk diperiksa sendiri di Excel,
// admin perlu barisnya satu per satu. Dua lembar mentah di bawah ini
// memakai aturan acc yang SAMA dengan ringkasannya, lalu menuliskan
// statusnya di kolom tersendiri supaya terlihat mana yang belum di-acc.

const ACC_LABEL = (data, tabelNama, id) => (
  menungguDi(data, tabelNama, id) ? 'Menunggu acc'
    : (accDi(data, tabelNama, id) ? 'Sudah acc' : 'Ditolak')
);

/** Status satu baris untuk kolom "Status" di unduhan. Baris yang sudah
 *  dihapus IKUT diunduh — admin yang mengaudit perlu tahu apa yang dibuang,
 *  siapa yang membuang, dan kapan — tapi ditandai jelas dan tidak ikut total. */
const STATUS_BARIS = (data, tabelNama, r) => (
  r.deleted_at ? `Dihapus${r.deleted_by ? ` oleh ${r.deleted_by}` : ''}`
    : ACC_LABEL(data, tabelNama, r.id)
);
const jejak = (r) => ({
  nomor: r.nomor_transaksi || '',
  dibuatOleh: r.created_by || '',
  dibuat: r.created_at || '',
  diubah: r.updated_at && r.updated_at !== r.created_at ? r.updated_at : '',
});

/** Baris mentah satu bagian Payroll HK. */
function mentahPayroll(data, dari, sampai) {
  const peta = (nm, kunci) => new Map(barisDi(data, nm).map((r) => [Number(r.id), r[kunci]]));
  const div = peta('divisions', 'nama_divisi');
  const blok = peta('blocks', 'nama_blok');
  const keg = peta('activities', 'nama_kegiatan');
  const jen = peta('job_types', 'nama_jenis');
  const komp = peta('wage_components', 'nama_komponen');
  const satKomp = peta('wage_components', 'satuan');
  const emp = new Map(barisDi(data, 'employees').map((r) => [Number(r.id), r]));
  const nm = (m, id) => (id == null || id === '' ? '' : (m.get(Number(id)) || `#${id}`));
  const keluar = [];
  const tambah = (jenis, r, extra) => {
    const e = emp.get(Number(r.employee_id));
    keluar.push({
      ...jejak(r),
      tanggal: r.tanggal, jenis,
      divisi: nm(div, r.division_id),
      blok: nm(blok, r.block_id),
      nik: e?.nik || '', pekerja: e?.nama || `#${r.employee_id}`,
      hk: 0, qty: 0, satuan: '', tarif: 0, nominal: nol(r.nominal),
      keterangan: r.keterangan_manual || r.catatan || '',
      acc: 'Sudah acc',
      ...extra,
    });
  };
  for (const r of barisDi(data, 'daily_payroll')) {
    if (r.tanggal < dari || r.tanggal > sampai) continue;
    tambah('HK harian', r, { hk: nol(r.hk), tarif: nol(r.tarif_hk_snapshot),
      kegiatan: nm(keg, r.activity_id), pekerjaan: nm(jen, r.job_type_id),
      acc: STATUS_BARIS(data, 'daily_payroll', r) });
  }
  for (const r of barisDi(data, 'borongan_transactions')) {
    if (r.tanggal < dari || r.tanggal > sampai) continue;
    tambah('Borongan', r, { qty: nol(r.qty), satuan: r.satuan || satKomp.get(Number(r.wage_component_id)) || 'satuan',
      tarif: nol(r.tarif_snapshot), komponen: nm(komp, r.wage_component_id),
      acc: STATUS_BARIS(data, 'borongan_transactions', r) });
  }
  for (const [nmTabel, label] of [['lembur_transactions', 'Lembur'], ['premi_transactions', 'Premi']]) {
    for (const r of barisDi(data, nmTabel)) {
      if (r.tanggal < dari || r.tanggal > sampai) continue;
      tambah(label, r, { qty: nol(r.qty),
        satuan: r.satuan || satKomp.get(Number(r.wage_component_id)) || (label === 'Lembur' ? 'jam' : 'satuan'),
        tarif: nol(r.tarif_snapshot), komponen: nm(komp, r.wage_component_id),
        acc: STATUS_BARIS(data, nmTabel, r) });
    }
  }
  return keluar.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal))
    || String(a.divisi).localeCompare(String(b.divisi), 'id'));
}

/** Baris mentah satu bagian Alat Berat & Kendaraan. */
function mentahAlat(data, dari, sampai) {
  const unit = new Map(barisDi(data, 'units').map((u) => [Number(u.id), u]));
  const op = new Map(barisDi(data, 'operators').map((o) => [Number(o.id), o]));
  const namaUnit = (id) => { const u = unit.get(Number(id));
    return u ? `${u.kode} — ${u.nama}` : `#${id}`; };
  const keluar = [];
  for (const r of barisDi(data, 'work_logs')) {
    if (r.tanggal < dari || r.tanggal > sampai) continue;
    const o = op.get(Number(r.operator_id));
    keluar.push({
      ...jejak(r),
      tanggal: r.tanggal, jenis: 'Log kerja', unit: namaUnit(r.unit_id),
      kategori: unit.get(Number(r.unit_id))?.kategori || '',
      operator: o?.nama || '', hk: nol(r.hk),
      hm: hmPakai(r), km: kmPakai(r), ritase: nol(r.ritase), liter: 0,
      biaya: nol(r.hk) * nol(o?.tarif_harian) + (accDi(data, 'work_logs', r.id)
        ? hmPakai(r) * nol(o?.tarif_jam) + nol(r.premi) : 0),
      keterangan: r.keterangan || r.catatan || '',
      acc: STATUS_BARIS(data, 'work_logs', r),
    });
  }
  for (const r of barisDi(data, 'fuel_logs')) {
    if (r.tanggal < dari || r.tanggal > sampai) continue;
    keluar.push({ ...jejak(r), tanggal: r.tanggal, jenis: 'Solar', unit: namaUnit(r.unit_id),
      kategori: unit.get(Number(r.unit_id))?.kategori || '', operator: '',
      hk: 0, hm: 0, km: 0, ritase: 0, liter: nol(r.liter),
      biaya: nol(r.liter) * nol(r.harga_liter),
      keterangan: r.keterangan || '', acc: STATUS_BARIS(data, 'fuel_logs', r) });
  }
  for (const r of barisDi(data, 'service_logs')) {
    if (r.tanggal < dari || r.tanggal > sampai) continue;
    keluar.push({ ...jejak(r), tanggal: r.tanggal, jenis: 'Servis', unit: namaUnit(r.unit_id),
      kategori: unit.get(Number(r.unit_id))?.kategori || '', operator: '',
      hk: 0, hm: 0, km: 0, ritase: 0, liter: 0, biaya: nol(r.biaya),
      keterangan: r.uraian || r.keterangan || '',
      acc: STATUS_BARIS(data, 'service_logs', r) });
  }
  return keluar.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal))
    || String(a.unit).localeCompare(String(b.unit), 'id'));
}

/** Rentang tanggal dari pilihan di kotak unduhan. */
function rentangUnduh(mode, bulan, tahun, periodeKini) {
  if (mode === 'kini') return [...periodeKini.rentang(), periodeKini.judul()];
  if (mode === 'semua') return ['0001-01-01', '9999-12-31', 'Semua data'];
  if (mode === 'tahun') return [`${tahun}-01-01`, `${tahun}-12-31`, `Tahun ${tahun}`];
  const b = String(bulan).padStart(2, '0');
  const akhir = new Date(Date.UTC(Number(tahun), Number(bulan), 0)).getUTCDate();
  return [`${tahun}-${b}-01`, `${tahun}-${b}-${akhir}`, `${namaBulan(Number(bulan))} ${tahun}`];
}

// ------------------------------------------------------------- halaman
export function halamanMonitorSemua({ periode: periodeBulan }) {
  const wadah = el('section');
  const tempat = el('div', {}, [el('p.samar', { teks: 'Mengambil data semua bagian…' })]);
  // paruh periode gajian (1–15 / 16–akhir / sebulan penuh), sama seperti
  // Ringkasan dan Laporan Kebun
  let periode = periodeParuh(periodeBulan);
  taruh(wadah, pilihParuh(() => {
    periode = periodeParuh(periodeBulan);
    taruh(kosongkan(tempat), el('p.samar', { teks: 'Menghitung ulang…' }));
    gambarIsi().catch((e) => pesan(`Gagal memuat ulang: ${e.message}`, 'galat', 6));
  }), tempat);

  /** Kotak pilihan periode lalu unduh .xlsx. Halaman ini admin saja, jadi
   *  unduhannya pun otomatis hanya bisa dipakai admin. */
  const unduhSemua = async () => {
    const thnKini = Number(periodeBulan.tahun) || new Date().getFullYear();
    const tahunAda = [];
    for (let t = thnKini + 1; t >= thnKini - 6; t--) tahunAda.push({ nilai: t, label: String(t) });
    const inMode = pilihan([
      { nilai: 'kini', label: `Periode yang sedang dilihat — ${periode.judul()}` },
      { nilai: 'bulan', label: 'Satu bulan tertentu' },
      { nilai: 'tahun', label: 'Satu tahun penuh' },
      { nilai: 'semua', label: 'SEMUA data (sejak awal)' },
    ], 'kini', { kosongLabel: null });
    const inBulan = pilihan(
      Array.from({ length: 12 }, (_, i) => ({ nilai: i + 1, label: namaBulan(i + 1) })),
      Number(periodeBulan.bulan) || 1, { kosongLabel: null });
    const inTahun = pilihan(tahunAda, thnKini, { kosongLabel: null });
    const barisBulan = isian('Bulan', inBulan);
    const barisTahun = isian('Tahun', inTahun);
    const sesuaikan = () => {
      barisBulan.style.display = inMode.value === 'bulan' ? '' : 'none';
      barisTahun.style.display = (inMode.value === 'bulan' || inMode.value === 'tahun') ? '' : 'none';
    };
    inMode.addEventListener('change', sesuaikan);
    sesuaikan();

    const setuju = await tanya('Unduh data ke Excel', el('div', {}, [
      el('p', { teks: 'Berisi ringkasan per divisi DAN semua barisnya satu per satu — '
        + 'payroll operasional dan alat berat & kendaraan, masing-masing di lembar sendiri.' }),
      isian('Periode', inMode),
      barisBulan,
      barisTahun,
      el('p.bantuan', { teks: 'Semua baris ikut terunduh — termasuk yang belum di-acc dan yang '
        + 'SUDAH DIHAPUS — masing-masing ditandai di kolom "Status". Ikut juga nomor transaksi, '
        + 'siapa yang menginput, dan kapan. Baris TOTAL hanya menjumlah yang sudah acc.' }),
    ]), { ya: 'Unduh', tidak: 'Batal' });
    if (!setuju) return;

    const [dari, sampai, judulPeriode] = rentangUnduh(
      inMode.value, inBulan.value, inTahun.value, periode);
    pesan('Menyiapkan berkas Excel…', 'info', 4);
    try {
      let bagian = [];
      ({ bagian } = await bacaSemuaBagian());
      const lembar = [];
      const ringkas = [];
      const mentahOp = [];
      const mentahAl = [];
      for (const b of bagian) {
        if (b.aplikasi === 'AlatBerat') {
          mentahAl.push(...mentahAlat(b.data, dari, sampai));
        } else {
          ringkas.push(...hitungPayroll(b.data, dari, sampai));
          mentahOp.push(...mentahPayroll(b.data, dari, sampai));
        }
      }
      const unitRingkas = [];
      for (const b of bagian) {
        if (b.aplikasi === 'AlatBerat') unitRingkas.push(...hitungAlat(b.data, dari, sampai));
      }
      if (unitRingkas.length) {
        const jumlahUnit = (k) => unitRingkas.reduce((n, r) => n + nol(r[k]), 0);
        ringkas.push({
          divisi: 'Alat Berat & Kendaraan', jenis: 'Unit',
          orang: new Set(unitRingkas.map((r) => r.unit)).size,
          hk: jumlahUnit('hkOp'), pokok: jumlahUnit('upah'), lembur: 0,
          premi: jumlahUnit('premi'), solar: jumlahUnit('solar'), servis: jumlahUnit('servis'),
          total: jumlahUnit('total'), tunggu: jumlahUnit('tunggu'),
        });
      }

      const kepala = (judul, kolom) => [
        [S.judul(`PT VIGU FARM INDONESIA — ${judul}`)],
        [S.kecil(`Periode: ${judulPeriode}  (${dari} s/d ${sampai})`)],
        [S.kecil(`Dibuat: ${new Date().toLocaleString('id-ID')} oleh ${D.namaPengisi() || 'admin'}`)],
        [],
        kolom.map((k) => S.kepala(k)),
      ];

      // --- lembar 1: ringkasan per divisi
      lembar.push({
        nama: 'Ringkasan',
        lebar: [26, 14, 12, 10, 16, 14, 14, 14, 14, 16, 14],
        baris: [
          ...kepala('Ringkasan Semua Divisi',
            ['Divisi', 'Jenis', 'Orang/unit', 'HK', 'Upah pokok', 'Lembur', 'Premi',
              'Solar', 'Servis', 'Total', 'Menunggu acc']),
          ...ringkas.map((r) => [S.teks(r.divisi), S.teks(r.jenis), S.angka(r.orang),
            S.angka(r.hk), S.uang(r.pokok), S.uang(r.lembur), S.uang(r.premi),
            S.uang(r.solar), S.uang(r.servis), S.uang(r.total), S.angka(r.tunggu)]),
          [S.teksT('TOTAL'), S.teksT(''), S.angkaT(ringkas.reduce((n, r) => n + nol(r.orang), 0)),
            S.angkaT(ringkas.reduce((n, r) => n + nol(r.hk), 0)),
            S.uangT(ringkas.reduce((n, r) => n + nol(r.pokok), 0)),
            S.uangT(ringkas.reduce((n, r) => n + nol(r.lembur), 0)),
            S.uangT(ringkas.reduce((n, r) => n + nol(r.premi), 0)),
            S.uangT(ringkas.reduce((n, r) => n + nol(r.solar), 0)),
            S.uangT(ringkas.reduce((n, r) => n + nol(r.servis), 0)),
            S.uangT(ringkas.reduce((n, r) => n + nol(r.total), 0)),
            S.angkaT(ringkas.reduce((n, r) => n + nol(r.tunggu), 0))],
        ],
      });

      // --- lembar 2: semua baris payroll operasional
      const KOLOM_OP = ['Tanggal', 'Jenis', 'Divisi', 'Blok', 'NIK', 'Pekerja', 'Kegiatan',
        'Jenis pekerjaan', 'HK', 'Jumlah', 'Satuan', 'Tarif', 'Nilai (Rp)', 'Keterangan',
        'Status', 'Nomor transaksi', 'Diinput oleh', 'Waktu input', 'Terakhir diubah'];
      lembar.push({
        nama: 'Operasional',
        lebar: [12, 13, 20, 18, 12, 24, 20, 20, 9, 10, 10, 14, 14, 24, 20, 22, 16, 18, 18],
        baris: [
          ...kepala('Payroll Operasional — semua baris', KOLOM_OP),
          ...mentahOp.map((r) => [S.tanggal(r.tanggal), S.teks(r.jenis), S.teks(r.divisi),
            S.teks(r.blok), S.teks(r.nik), S.teks(r.pekerja),
            S.teks(r.kegiatan || r.komponen || ''), S.teks(r.pekerjaan || ''),
            S.angka(r.hk), S.angka(r.qty), S.teks(r.satuan), S.uang(r.tarif),
            S.uang(r.nominal), S.teks(r.keterangan), S.teks(r.acc),
            S.teks(r.nomor), S.teks(r.dibuatOleh), S.teks(r.dibuat), S.teks(r.diubah)]),
          [S.teksT(`${mentahOp.length} baris`), ...Array(11).fill(S.teksT('')),
            S.uangT(mentahOp.filter((r) => r.acc === 'Sudah acc')
              .reduce((n, r) => n + nol(r.nominal), 0)),
            S.teksT('(hanya yang sudah acc)'), ...Array(5).fill(S.teksT(''))],
        ],
      });

      // --- lembar 3: alat berat & kendaraan
      const KOLOM_AL = ['Tanggal', 'Jenis', 'Unit', 'Kategori', 'Operator', 'HK', 'HM', 'KM',
        'Ritase', 'Liter', 'Biaya (Rp)', 'Keterangan', 'Status', 'Nomor transaksi',
        'Diinput oleh', 'Waktu input', 'Terakhir diubah'];
      lembar.push({
        nama: 'Alat Berat',
        lebar: [12, 12, 26, 16, 18, 9, 10, 10, 9, 10, 16, 24, 20, 22, 16, 18, 18],
        baris: [
          ...kepala('Alat Berat & Kendaraan — semua baris', KOLOM_AL),
          ...mentahAl.map((r) => [S.tanggal(r.tanggal), S.teks(r.jenis), S.teks(r.unit),
            S.teks(r.kategori), S.teks(r.operator), S.angka(r.hk), S.angka(r.hm),
            S.angka(r.km), S.angka(r.ritase), S.angka(r.liter), S.uang(r.biaya),
            S.teks(r.keterangan), S.teks(r.acc),
            S.teks(r.nomor), S.teks(r.dibuatOleh), S.teks(r.dibuat), S.teks(r.diubah)]),
          [S.teksT(`${mentahAl.length} baris`), ...Array(9).fill(S.teksT('')),
            S.uangT(mentahAl.filter((r) => r.acc === 'Sudah acc')
              .reduce((n, r) => n + nol(r.biaya), 0)),
            S.teksT('(hanya yang sudah acc)'), ...Array(5).fill(S.teksT(''))],
        ],
      });

      // --- lembar 4: ringkasan per unit
      if (unitRingkas.length) {
        lembar.push({
          nama: 'Per Unit',
          lebar: [26, 16, 12, 10, 10, 10, 10, 12, 14, 14, 14, 16],
          baris: [
            ...kepala('Alat Berat & Kendaraan — per unit',
              ['Unit', 'Kategori', 'Hari operasi', 'HK operator', 'HM', 'KM', 'Ritase',
                'Liter', 'Upah', 'Premi', 'Solar', 'Servis']),
            ...unitRingkas.map((r) => [S.teks(r.unit), S.teks(r.kategori),
              S.angka(r.hari_operasi), S.angka(r.hkOp), S.angka(r.hm), S.angka(r.km),
              S.angka(r.ritase), S.angka(r.liter), S.uang(r.upah), S.uang(r.premi),
              S.uang(r.solar), S.uang(r.servis)]),
          ],
        });
      }

      const berkas = `Pantauan_${judulPeriode.replace(/[^\w]+/g, '_')}.xlsx`;
      await unduhXlsx(berkas, lembar);
      pesan(`${berkas} diunduh — ${mentahOp.length} baris operasional, `
        + `${mentahAl.length} baris alat berat.`, 'sukses', 8);
    } catch (e) {
      pesan(`Gagal menyiapkan Excel: ${e.message}`, 'galat', 10);
    }
  };

  const kotak = (l, v, s = '') => el('div', {}, [
    el('dt', { teks: l }),
    el('dd', {}, [v, s ? el('span.satuan', { teks: ' ' + s }) : null]),
  ]);

  const gambarIsi = async () => {
    const [dari, sampai] = periode.rentang();
    let bagian = []; let gagal = [];
    try {
      ({ bagian, gagal } = await bacaSemuaBagian());
    } catch (e) {
      taruh(kosongkan(tempat), el('div.kesalahan', { role: 'alert', teks: `Gagal membaca data: ${e.message}` }));
      return;
    }

    const barisDivisi = [];
    const barisUnit = [];
    const statusData = [];
    for (const b of bagian) {
      statusData.push({
        bagian: b.label,
        rev: b.data?.rev ?? '–',
        diperbarui: b.data?.dibuat || b.meta?.diperbarui || '',
        sumber: b.aktif ? 'Sedang dibuka' : 'Dibaca dari GitHub',
      });
      if (b.aplikasi === 'AlatBerat') barisUnit.push(...hitungAlat(b.data, dari, sampai));
      else barisDivisi.push(...hitungPayroll(b.data, dari, sampai));
    }

    const jml = (arr, k) => arr.reduce((n, r) => n + nol(r[k]), 0);
    const upahOperasional = jml(barisDivisi, 'total');
    const upahAlat = jml(barisUnit, 'upah') + jml(barisUnit, 'premi');
    const biayaUnit = jml(barisUnit, 'solar') + jml(barisUnit, 'servis');
    const totalHk = jml(barisDivisi, 'hk');
    const tungguOperasional = jml(barisDivisi, 'tunggu');
    const tungguAlat = jml(barisUnit, 'tunggu');

    // ALB & kendaraan ikut masuk tabel per divisi sebagai satu baris, supaya
    // "semua divisi" benar-benar lengkap dalam satu tabel.
    const semuaDivisi = [...barisDivisi];
    if (barisUnit.length) {
      semuaDivisi.push({
        divisi: 'Alat Berat & Kendaraan',
        jenis: 'Unit',
        orang: new Set(barisUnit.map((u) => u.unit)).size,
        hk: jml(barisUnit, 'hkOp'),
        pokok: jml(barisUnit, 'upah'),
        lembur: 0,
        premi: jml(barisUnit, 'premi'),
        solar: jml(barisUnit, 'solar'),
        servis: jml(barisUnit, 'servis'),
        tunggu: tungguAlat,
        tungguRp: 0,
        total: upahAlat + biayaUnit,
      });
    }

    taruh(kosongkan(tempat),
      el('div.lembar.pantauan-utama', {}, [
        el('div.lembar-kepala', {}, [
          el('h2', { teks: `Pantauan operasional — ${periode.judul()}` }),
          el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: 'Ambil data terbaru',
            onclick: () => {
              D.lupakanBagianLain();     // buang simpanan bagian lain
              taruh(kosongkan(tempat), el('p.samar', { teks: 'Mengambil data terbaru…' }));
              gambarIsi().catch((e) => pesan(`Gagal memuat ulang: ${e.message}`, 'galat', 6));
            },
          }),
          el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: 'Unduh Excel',
            title: 'Semua baris operasional & alat berat — bisa pilih periode, tahun, atau semua data',
            onclick: () => { unduhSemua(); },
          }),
          el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: 'Cetak', onclick: () => window.print(),
          }),
        ]),
        el('div.lembar-isi', {}, [
          el('dl.angka-utama', {}, [
            kotak('Total HK pekerja', fhk(totalHk), 'HK'),
            kotak('Upah operasional', rupiah(upahOperasional), 'Rp'),
            kotak('Upah operator alat', rupiah(upahAlat), 'Rp'),
            kotak('Solar + servis', rupiah(biayaUnit), 'Rp'),
            kotak('Total biaya', rupiah(upahOperasional + upahAlat + biayaUnit), 'Rp'),
          ]),
          el('p.bantuan.pantauan-catatan', {
            teks: 'Angka hanya memuat transaksi yang sudah disetujui. Kolom "Menunggu acc" '
              + 'menunjukkan pekerjaan yang belum masuk ke total.',
          }),
          gagal.length
            ? el('div.kesalahan', { role: 'alert',
              teks: `Bagian ini tidak bisa dibaca: ${gagal.join(', ')}. `
                + 'Biasanya karena password berbeda atau berkas belum diunggah. '
                + 'Angka di pantauan belum mencakup bagian tersebut.' })
            : null,
          el('h3.pantauan-subjudul', { teks: 'Ringkasan seluruh divisi' }),
          tabel([
            { l: 'Divisi', k: 'divisi' },
            { l: 'Jenis', k: 'jenis' },
            { l: 'Orang/unit', k: 'orang', jenis: 'angka', total: true },
            { l: 'HK', k: 'hk', jenis: 'angka', pecahan: 2, total: true },
            { l: 'Upah pokok (Rp)', k: 'pokok', jenis: 'uang', total: true },
            { l: 'Lembur (Rp)', k: 'lembur', jenis: 'uang', total: true },
            { l: 'Premi (Rp)', k: 'premi', jenis: 'uang', total: true },
            { l: 'Solar (Rp)', k: 'solar', jenis: 'uang', total: true },
            { l: 'Servis (Rp)', k: 'servis', jenis: 'uang', total: true },
            { l: 'Total (Rp)', k: 'total', jenis: 'uang', total: true },
            { l: 'Menunggu acc', k: 'tunggu', jenis: 'angka', total: true },
          ], semuaDivisi, { kosong: `Belum ada data pada ${periode.judul()}.` }),
          barisUnit.length ? el('details.pantauan-rincian', {}, [
            el('summary', { teks: `Rincian alat berat & kendaraan (${barisUnit.length} unit)` }),
            el('div.pantauan-rincian-isi', {}, [
              tabel([
                { l: 'Unit', k: 'unit' },
                { l: 'Kategori', k: 'kategori' },
                { l: 'Hari operasi', k: 'hari_operasi', jenis: 'angka', total: true },
                { l: 'HM', k: 'hm', jenis: 'angka', pecahan: 1, total: true },
                { l: 'KM', k: 'km', jenis: 'angka', pecahan: 1, total: true },
                { l: 'Ritase', k: 'ritase', jenis: 'angka', total: true },
                { l: 'Liter', k: 'liter', jenis: 'angka', pecahan: 1, total: true },
                { l: 'Ltr/KM', nilai: (r) => (r.ltr_km == null ? '–' : angka(r.ltr_km, 2)), rata: 'angka' },
                { l: 'HM/Ltr', nilai: (r) => (r.hm_ltr == null ? '–' : angka(r.hm_ltr, 2)), rata: 'angka' },
                { l: 'Upah operator (Rp)', k: 'upah', jenis: 'uang', total: true },
                { l: 'Premi (Rp)', k: 'premi', jenis: 'uang', total: true },
                { l: 'Solar (Rp)', k: 'solar', jenis: 'uang', total: true },
                { l: 'Servis (Rp)', k: 'servis', jenis: 'uang', total: true },
                { l: 'Total (Rp)', k: 'total', jenis: 'uang', total: true },
              ], barisUnit, { kosong: 'Belum ada kegiatan unit pada periode ini.' }),
              el('p.bantuan', {
                teks: 'Ltr/KM untuk kendaraan (makin kecil makin irit). '
                  + 'HM/Ltr untuk alat berat (makin besar makin irit).',
              }),
            ]),
          ]) : null,
          el('details.pantauan-rincian', {}, [
            el('summary', { teks: `Status sumber data (${statusData.length} bagian)` }),
            el('div.pantauan-rincian-isi', {}, [
              tabel([
                { l: 'Bagian', k: 'bagian' },
                { l: 'Revisi', k: 'rev', jenis: 'angka' },
                { l: 'Terakhir disimpan', nilai: (r) => (r.diperbarui ? waktu(r.diperbarui) : '–') },
                { l: 'Sumber', k: 'sumber' },
              ], statusData, { kosong: 'Tidak ada bagian terbaca.' }),
              (tungguOperasional || tungguAlat)
                ? el('p.bantuan', {
                  teks: `Menunggu acc: ${tungguOperasional} lembur/premi payroll dan ${tungguAlat} tambahan Infra.`,
                })
                : el('p.bantuan', { teks: 'Tidak ada transaksi yang menunggu persetujuan.' }),
            ]),
          ]),
        ]),
      ]),
    );
  };

  gambarIsi().catch((e) => pesan(`Gagal menyusun pantauan: ${e.message}`, 'galat', 6));
  return wadah;
}
