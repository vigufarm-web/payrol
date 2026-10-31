import {assertGISMerge,captureGISSnapshot,historicalGISMaster,currentGISDate,gisCycleAt,assertGISMasterStructure,assertGISMasterEdit,assertGISBlockActive} from './gis-model.js';
import {checkHKEntries} from './hk-entry-check.js';
import {purgeExpiredTrash} from './trash-retention.js';
// data.js — isi database dipegang di memori, dibaca & disimpan ke repo GitHub.
//
// Satu file data = seluruh isi database satu aplikasi desktop. Situs ini
// melayani dua bagian (Payroll HK dan Alat Berat & Kendaraan), masing-masing
// punya filenya sendiri di repo yang sama. Hanya satu bagian terbuka pada
// satu waktu.
//
// Nomor `rev` dan `sha` menjaga agar perubahan orang lain tidak tertimpa.

import { bukaAmplop, kunciAmplop } from './kunci.js';
import * as gh from './github.js';
import { unduhTeks } from './ui.js';
import { namaBlokSiklus } from './siklus.js';

const KUNCI_NAMA = 'app.nama';
const KUNCI_PATH = 'app.path';

export const state = {
  path: localStorage.getItem(KUNCI_PATH) || 'data/payroll.json',
  aplikasi: '',      // 'PayrollHK' | 'AlatBerat' — dibaca dari isi file
  data: null,
  meta: null,
  sha: '',
  password: '',
  belumDisimpan: false,
  daftar: null,
  labelTabel: {},    // diisi modul bagian aktif, dipakai labelRef()
};

export const namaPengisi = () => localStorage.getItem(KUNCI_NAMA) || '';
export const setNamaPengisi = (n) => localStorage.setItem(KUNCI_NAMA, (n || '').trim());
export const setPath = (p) => { state.path = p; localStorage.setItem(KUNCI_PATH, p); };

/** Modul bagian aktif mendaftarkan skemanya supaya labelRef() tahu nama baris. */
export const pakaiSkema = (TABEL, REF) => {
  state.labelTabel = TABEL || {};
  state.refTabel = REF || {};
};

/**
 * Baris master ini masih dipakai transaksi mana saja?
 *
 * Dipakai dua tempat: layar master (supaya tombol Hapus menolak lebih dulu
 * dengan keterangan) dan penjaga di hapus() di bawah (supaya jalur lain
 * tidak bisa melewatinya). Dulu penjaganya hanya ada di layar — menghapus
 * blok lewat jalur lain bisa membuat 1.185 baris transaksi kehilangan
 * bloknya dan tertulis "#130 (tidak ada)" di laporan.
 */
export function pemakaiMaster(tabelInduk, id) {
  const pemakai = [];
  const semua = { ...state.labelTabel, ...state.refTabel };
  for (const [nama, def] of Object.entries(semua)) {
    if (nama === tabelInduk) continue;
    for (const f of def?.f || []) {
      if (f.t === 'ref' && f.ref === tabelInduk) {
        const n = baris(nama).filter((r) => !r.deleted_at && Number(r[f.k]) === Number(id)).length;
        if (n) pemakai.push({ tabel: def.judul || nama, n });
      }
    }
  }
  return pemakai;
}

const KOSONG = [];
export function baris(tabel) {
  const semua = state.data?.tabel;
  if (!semua) return KOSONG;
  if (!semua[tabel]) semua[tabel] = [];
  return semua[tabel];
}

export const cari = (tabel, id) => baris(tabel).find((r) => Number(r.id) === Number(id)) || null;

export function labelRef(tabelRef, id) {
  const r = cari(tabelRef, id);
  if (!r) return id == null || id === '' ? '' : `#${id} (tidak ada)`;
  const def = state.labelTabel[tabelRef];
  return def?.label?.(r) ?? String(id);
}

/**
 * Nama blok SEPERTI SAAT ITU, bukan seperti hari ini.
 *
 * Nama blok pisang ikut umur tanamannya, jadi kalau laporan lama dicetak
 * sekarang nama bloknya bisa ikut maju sendiri — blok yang bulan Januari
 * masih R1 jadi tertulis R2. Untuk laporan biaya per siklus itu salah.
 * Baris laporan karena itu memakai tanggal barisnya sendiri (atau tanggal
 * akhir periode untuk angka yang sudah dijumlah), bukan tanggal hari ini.
 *
 * Tanpa `tanggal` hasilnya sama dengan labelRef('blocks', id).
 */
export function labelBlokPada(blockId, tanggal) {
  const r = cari('blocks', blockId);
  if (!r) return labelRef('blocks', blockId);
  const acuan = /^\d{4}-\d{2}-\d{2}$/.test(String(tanggal || '')) ? tanggal : undefined;
  const previous=historicalGISMaster(state.data,r.id,acuan);
  const first=state.data.web?.gis?.master_history?.[r.id]?.[0],useGIS=first&&(!acuan||acuan>=first.at.slice(0,10));
  return namaBlokSiklus(previous?.name||r.nama_blok,previous?previous.planted_on:tanamBlok(r.id),acuan,useGIS?gisCycleAt(state.data,r.id,acuan):null);
}

/**
 * Blok yang dipilih ini milik komoditas/divisi LAIN?
 *
 * Kejadiannya nyata: admin Infrastruktur atau Padi input ke blok pisang,
 * jadi biayanya nempel ke divisi yang salah dan laporan pisang bolong.
 * Bukan dilarang — divisi memang saling bantu — tapi harus kelihatan dulu
 * sebelum disimpan.
 *
 * Mengembalikan daftar blok yang tidak sepadan:
 *   [{ kode, divisiBlok, komoditasBlok }]
 * Kosong berarti tidak ada yang perlu diperingatkan.
 */
export function blokLainKomoditas(divisionId, blockIds) {
  const divIni = Number(divisionId) || 0;
  if (!divIni) return [];
  const namaDivIni = String(cari('divisions', divIni)?.nama_divisi || '');
  const hasil = [];
  for (const id of (Array.isArray(blockIds) ? blockIds : [blockIds])) {
    if (id == null || id === '') continue;
    const b = cari('blocks', id);
    if (!b) continue;
    const divBlok = Number(b.division_id) || 0;
    if (!divBlok || divBlok === divIni) continue;
    const kom = String(b.komoditas || '').trim();
    // Kalau komoditas blok sama dengan nama divisi yang sedang input, anggap
    // masih sepadan (mis. divisi "Pisang" input blok berkomoditas "Pisang"
    // yang kebetulan tercatat di divisi lain).
    if (kom && namaDivIni && kom.toLowerCase() === namaDivIni.toLowerCase()) continue;
    hasil.push({
      kode: b.kode_blok,
      divisiBlok: labelRef('divisions', divBlok),
      komoditasBlok: kom,
    });
  }
  return hasil;
}

/**
 * Apakah baris master masih boleh dipakai di transaksi baru.
 * Payroll memakai kolom `status` ('Aktif'), Alat Berat memakai `aktif` (1/0).
 */
export function barisAktif(r) {
  if (r == null) return false;
  if ('status' in r) return (r.status ?? 'Aktif') === 'Aktif';
  if ('aktif' in r) return Number(r.aktif) === 1;
  return true;
}

export const aktif = (tabel) => baris(tabel).filter(barisAktif);

const idBaru = (tabel) => baris(tabel).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
const sekarang = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// ------------------------------------------- pengaturan & persetujuan web
// Disimpan di bagian `web` pada berkas data, bukan di tabel database, supaya
// aplikasi desktop tidak perlu diubah skemanya.

const WEB_KOSONG = () => ({ kebun: {}, target: {}, persetujuan: {}, adminPin: null });


// Dipanggil setiap ada perubahan yang belum disimpan. Modul app memasang
// pendengar di sini untuk simpan-otomatis.
let pendengarBerubah = null;
export const saatBerubah = (fn) => { pendengarBerubah = fn; };
function tandaiBerubah() {
  state.belumDisimpan = true;
  jadwalkanDraf();
  try { pendengarBerubah?.(); } catch { /* jangan ganggu alur input */ }
}

// ---------------------------------------------------------------------
// DRAF CADANGAN LOKAL — pengaman mati listrik / tab tertutup.
// Beberapa detik setelah perubahan, seluruh data ditulis TERENKRIPSI ke
// penyimpanan peramban. Saat situs dibuka lagi dan ternyata ada draf yang
// belum sempat terkirim (rev-nya masih sama dengan berkas di GitHub),
// pengguna ditawari memulihkannya — tidak perlu mengulang input.
// Draf dihapus otomatis begitu penyimpanan ke GitHub berhasil.
// ---------------------------------------------------------------------
const kunciDraf = () => `app.draf.${state.path}`;
let timerDraf = null;
function jadwalkanDraf() {
  if (!state.password || !state.data) return;
  clearTimeout(timerDraf);
  timerDraf = setTimeout(async () => {
    try {
      const amp = await kunciAmplop(state.data, state.password, { draf: true });
      localStorage.setItem(kunciDraf(), JSON.stringify({
        rev: Number(state.data.rev) || 0, waktu: new Date().toISOString(), amp }));
    } catch { /* penyimpanan penuh / terblokir — lewati saja */ }
  }, 2500);
}

export function hapusDraf() {
  clearTimeout(timerDraf);
  try { localStorage.removeItem(kunciDraf()); } catch { /* abaikan */ }
}

/** Draf yang belum terkirim dari sesi sebelumnya, atau null. */
export async function drafTersimpan() {
  try {
    const mentah = localStorage.getItem(kunciDraf());
    if (!mentah || !state.data) return null;
    const { rev, waktu, amp } = JSON.parse(mentah);
    if (Number(rev) !== (Number(state.data.rev) || 0)) {
      // sudah ada simpanan lebih baru (dari sini atau komputer lain) — basi
      localStorage.removeItem(kunciDraf());
      return null;
    }
    const isi = await bukaAmplop(amp, state.password);
    return { waktu, data: isi };
  } catch { return null; }
}

/** Pakai draf sebagai data aktif (belum tersimpan -> ikut simpan otomatis). */
export function pakaiDraf(draf) {
  state.data = draf.data;
  state.aplikasi = draf.data.aplikasi || state.aplikasi;
  gh.setTokenBersama(draf.data.web?.token || '');
  tandaiBerubah();
}

// ---------------------------------------------------------------------
// CADANGAN VERSI TERSIMPAN — dua salinan terenkripsi terakhir per dataset.
// Berbeda dari draf: cadangan menyimpan keadaan SEBELUM penyimpanan, sehingga
// kesalahan yang telanjur terkirim tetap dapat dipulihkan dengan satu tombol.
// ---------------------------------------------------------------------
const kunciCadangan = () => `app.cadangan.${state.path}`;

async function simpanCadanganLokal() {
  if (!state.password || !state.dasarJson) return;
  try {
    const data = JSON.parse(state.dasarJson);
    const amp = await kunciAmplop(data, state.password, { cadangan: true, rev: Number(data.rev) || 0 });
    const lama = JSON.parse(localStorage.getItem(kunciCadangan()) || '[]');
    const waktu = new Date().toISOString();
    const daftar = [{ id: waktu, waktu, rev: Number(data.rev) || 0, amp },
      ...lama.filter((x) => Number(x.rev) !== Number(data.rev))].slice(0, 2);
    localStorage.setItem(kunciCadangan(), JSON.stringify(daftar));
  } catch { /* penyimpanan penuh/terblokir — GitHub tetap menjadi cadangan utama */ }
}

export function daftarCadanganLokal() {
  try {
    return JSON.parse(localStorage.getItem(kunciCadangan()) || '[]')
      .map(({ id, waktu, rev }) => ({ id, waktu, rev }));
  } catch { return []; }
}

export async function pulihkanCadanganLokal(id) {
  const daftar = JSON.parse(localStorage.getItem(kunciCadangan()) || '[]');
  const cadangan = daftar.find((x) => x.id === id);
  if (!cadangan) throw new Error('Cadangan lokal tidak ditemukan.');
  const data = await bukaAmplop(cadangan.amp, state.password);
  if (data.aplikasi !== state.aplikasi) throw new Error('Cadangan berasal dari bagian aplikasi lain.');
  data.rev = Math.max(Number(state.data?.rev) || 0, Number(data.rev) || 0);
  state.data = data;
  gh.setTokenBersama(data.web?.token || '');
  Promise.all([import('./gis-panel.js'),import('./pengguna.js')]).then(([m,p])=>m.startGISAuto({D:{state},app:'payrol',isAdmin:p.adalahAdmin,canEdit:()=>!!gh.ambilToken(),markChanged:tandaiBerubah})).catch(()=>{});
  tandaiBerubah();
  return data;
}

export async function pulihkanVersiGitHub(ref) {
  const { isi } = await gh.bacaFilePadaRef(state.path, ref);
  if (!isi) throw new Error('Versi GitHub tidak ditemukan.');
  const data = await bukaAmplop(isi, state.password);
  if (data.aplikasi !== state.aplikasi) throw new Error('Versi berasal dari bagian aplikasi lain.');
  data.rev = Math.max(Number(state.data?.rev) || 0, Number(data.rev) || 0);
  state.data = data;
  gh.setTokenBersama(data.web?.token || '');
  tandaiBerubah();
  return data;
}

export function web() {
  if (!state.data) return WEB_KOSONG();
  if (!state.data.web) state.data.web = WEB_KOSONG();
  const w = state.data.web;
  w.kebun ||= {};
  w.target ||= {};
  w.persetujuan ||= {};
  w.divisiKaryawan ||= {};
  w.tanamBlok ||= {};
  return w;
}

// ------------------------------------------------ tanggal tanam tiap blok
// Tabel `blocks` di database desktop tidak punya kolom tanggal tanam, jadi
// disimpan di bagian `web` (khusus situs, ikut terbawa saat Kirim/Tarik).
// Dipakai menghitung umur tanaman (MST) dan siklus PC/R1/R2/R3/R4.

export const tanamBlok = (blockId) => currentGISDate(state.data,blockId) ?? (currentGISDate(state.data,blockId)===null?null:web().tanamBlok?.[String(blockId)]||null);

export function setTanamBlok(blockId, tanggal) {
  if(web().gis?.authoritative)throw new Error('Tanggal tanam dikelola hanya melalui Peta Kebun.');
  if(web().gis?.mappings?.[blockId]&&(tanggal||null)!==tanamBlok(blockId))throw new Error('Tanggal tanam berasal dari GIS. Ubah melalui Peta Kebun.');
  const bersih = /^\d{4}-\d{2}-\d{2}$/.test(String(tanggal || '')) ? tanggal : null;
  setWeb((w) => {
    w.tanamBlok ||= {};
    if (bersih) w.tanamBlok[String(blockId)] = bersih;
    else delete w.tanamBlok[String(blockId)];
  });
  return bersih;
}

// ------------------------------------------------- divisi tiap karyawan
// Tabel `employees` di database aplikasi desktop TIDAK punya kolom divisi —
// satu daftar dipakai bersama semua divisi. Supaya admin tetap bisa
// menetapkan "orang ini anggota Pisang", penetapannya disimpan di bagian
// `web` (khusus situs, ikut terbawa saat Kirim/Tarik desktop tapi tidak
// mengubah struktur databasenya). Satu orang boleh lebih dari satu divisi
// karena memang ada yang kerja lintas divisi.

/** Divisi yang DITETAPKAN admin untuk satu karyawan (array id, bisa kosong). */
export function divisiKaryawan(employeeId) {
  const v = web().divisiKaryawan?.[String(employeeId)];
  return Array.isArray(v) ? v.map(Number) : [];
}

/** Semua penetapan sekaligus: Map(employeeId -> [divisionId]). */
export function petaDivisiKaryawan() {
  const peta = new Map();
  for (const [k, v] of Object.entries(web().divisiKaryawan || {})) {
    if (Array.isArray(v) && v.length) peta.set(Number(k), v.map(Number));
  }
  return peta;
}

/** Tetapkan divisi karyawan. Daftar kosong = hapus penetapannya. */
export function setDivisiKaryawan(employeeId, daftar) {
  const bersih = [...new Set((daftar || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  setWeb((w) => {
    w.divisiKaryawan ||= {};
    if (bersih.length) w.divisiKaryawan[String(employeeId)] = bersih;
    else delete w.divisiKaryawan[String(employeeId)];
  });
  return bersih;
}

/** Ubah bagian `web` lewat fungsi, lalu tandai ada perubahan. */
export function setWeb(ubah) {
  const w = web();
  ubah(w);
  tandaiBerubah();
  return w;
}

export const catatanPersetujuan = (tabel, id) => web().persetujuan?.[tabel]?.[String(id)] || null;

/**
 * Membatalkan persetujuan yang sudah telanjur diberikan: statusnya kembali
 * "menunggu" (jadi tidak dihitung lagi di laporan), dan tercatat siapa yang
 * membatalkan beserta keputusan sebelumnya — tidak ada yang hilang diam-diam.
 */
export function batalkan(tabel, id, oleh) {
  const row=cari(tabel,id);if(row){periksaTulis('batal',tabel,row);if(periodeTerkunci(row.tanggal))throw new Error('Periode dikunci. Gunakan koreksi periode berikutnya.');catatRevisiTambahan(tabel,id,'batalkan persetujuan');}
  setWeb((w) => {
    w.persetujuan[tabel] ||= {};
    const c = w.persetujuan[tabel][String(id)] || {};
    w.persetujuan[tabel][String(id)] = {
      ...c,
      status: 'menunggu',
      dibatalkan: { oleh, waktu: sekarang(), sebelumnya: c.status || 'disetujui', olehSebelumnya: c.oleh || '' },
    };
  });
}

/** Daftar id baris satu tabel menurut status persetujuannya. */
export function daftarStatus(tabel, status) {
  const semua = web().persetujuan?.[tabel] || {};
  return Object.entries(semua).filter(([, c]) => c.status === status).map(([id]) => Number(id));
}

/**
 * Baris lembur/premi dihitung di laporan bila sudah disetujui.
 * Baris TANPA catatan persetujuan dianggap sudah disetujui — itu data lama
 * yang dibuat sebelum fitur ini ada, dan tidak boleh hilang dari laporan.
 */
export function disetujui(tabel, id) {
  const c = catatanPersetujuan(tabel, id);
  return !c || c.status === 'disetujui';
}

export const menungguPersetujuan = (tabel, id) => catatanPersetujuan(tabel, id)?.status === 'menunggu';

/** Tandai baris baru sebagai menunggu persetujuan kepala kebun. */
export function tandaiMenunggu(tabel, id) {
  setWeb((w) => {
    w.persetujuan[tabel] ||= {};
    w.persetujuan[tabel][String(id)] = {
      status: 'menunggu',
      diinput: namaPengisi() || 'Web',
      waktu: sekarang(),
    };
  });
}

export function setujui(tabel, id, oleh) {
  if(periodeTerkunci(cari(tabel,id)?.tanggal))throw new Error('Periode dikunci. Gunakan koreksi periode berikutnya.');
  catatRevisiTambahan(tabel,id,'setujui');
  setWeb((w) => {
    w.persetujuan[tabel] ||= {};
    const c = w.persetujuan[tabel][String(id)] || {};
    w.persetujuan[tabel][String(id)] = { ...c, status: 'disetujui', oleh, waktu: sekarang() };
  });
}

/** Ditolak = dihapus (masih bisa dipulihkan dari Data terhapus). */
export function tolak(tabel, id, oleh, alasan = '') {
  if(periodeTerkunci(cari(tabel,id)?.tanggal))throw new Error('Periode dikunci. Gunakan koreksi periode berikutnya.');
  catatRevisiTambahan(tabel,id,'tolak');
  setWeb((w) => {
    w.persetujuan[tabel] ||= {};
    const c = w.persetujuan[tabel][String(id)] || {};
    w.persetujuan[tabel][String(id)] = {
      ...c, status: 'ditolak', oleh, waktu: sekarang(), alasan: String(alasan || '').trim(),
    };
  });
  // Pada log alat, yang ditolak hanya premi dan upah jam/lemburnya.
  // HK serta catatan operasi tetap sah dan tidak boleh ikut terhapus.
  if (tabel !== 'work_logs') hapus(tabel, id, { lunak: true, aksi: 'tolak' });
}

/** Hapus kebutuhan persetujuan (mis. log alat tanpa premi/upah jam). */
export function tanpaPersetujuan(tabel, id) {
  setWeb((w) => {
    if (w.persetujuan?.[tabel]) delete w.persetujuan[tabel][String(id)];
  });
}

// ------------------------------------------------------- khusus payroll
export const pengaturan = () => baris('app_settings')[0] || {};
export const maksHkPerHari = () => Math.min(1,Number(pengaturan().max_hk_per_hari)||1);

export function periodeTerkunci(tanggal) {
  if (!tanggal) return false;
  const [th, bl] = String(tanggal).split('-').map(Number);
  return baris('payroll_lock').some(
    (r) => Number(r.tahun) === th && Number(r.bulan) === bl && Number(r.status_lock) === 1);
}

/**
 * HK orang ini pada satu tanggal, DIPECAH per divisi.
 * Dipakai untuk membedakan dua hal yang kelihatannya sama:
 *   • dobel input di divisi yang SAMA  → salah, ditolak
 *   • orang yang memang kerja di DUA divisi pada hari yang sama
 *     (mis. pagi di Padi, sore di Pisang) → boleh, tapi admin yang
 *     menginput terakhir diberi peringatan supaya upahnya tidak dobel.
 * Mengembalikan Map(division_id -> total HK). Divisi kosong kuncinya 0.
 */
export function hkHariPerDivisi(employeeId, tanggal, kecualiId = null) {
  const per = new Map();
  for (const r of baris('daily_payroll')) {
    if (r.deleted_at) continue;
    if (Number(r.employee_id) !== Number(employeeId)) continue;
    if (r.tanggal !== tanggal) continue;
    if (Number(r.id) === Number(kecualiId)) continue;
    const k = r.division_id == null ? 0 : Number(r.division_id);
    per.set(k, (per.get(k) || 0) + (Number(r.hk) || 0));
  }
  return per;
}

export function totalHkHari(employeeId, tanggal, kecualiId = null) {
  return baris('daily_payroll')
    .filter((r) => !r.deleted_at
      && Number(r.employee_id) === Number(employeeId)
      && r.tanggal === tanggal
      && Number(r.id) !== Number(kecualiId))
    .reduce((n, r) => n + (Number(r.hk) || 0), 0);
}

/**
 * Membagi satu angka HK ke beberapa blok.
 *
 * mode 'luas'  → sebanding luas tiap blok (makin luas makin besar HK-nya)
 * mode 'rata'  → dibagi sama besar
 *
 * Kalau ada blok yang luasnya kosong/0, pembagian per luas tidak bisa
 * dipakai (nanti blok itu dapat 0 HK), jadi otomatis jatuh ke 'rata' dan
 * itu dilaporkan lewat `cara` + `tanpaLuas` supaya bisa ditampilkan.
 *
 * Blok terakhir menyerap sisa pembulatan supaya jumlahnya persis totalHk.
 */
export function bagiHkPerBlok(blokIds, totalHk, mode = 'luas') {
  const n = blokIds.length;
  if (!n || !(totalHk > 0)) return { bagian: [], cara: 'rata', tanpaLuas: [] };

  const blok = blokIds.map((id) => cari('blocks', id));
  const luas = blok.map((b) => Number(b?.luas) || 0);
  const tanpaLuas = [];
  blok.forEach((b, i) => { if (luas[i] <= 0) tanpaLuas.push(b?.nama_blok || String(blokIds[i])); });
  const totalLuas = luas.reduce((a, b) => a + b, 0);
  const pakaiLuas = mode !== 'rata' && !tanpaLuas.length && totalLuas > 0;

  const bulat = (v) => Math.round(v * 10000) / 10000;
  const bagian = [];
  let sisa = totalHk;
  for (let i = 0; i < n; i += 1) {
    const nilai = i === n - 1
      ? bulat(sisa)
      : bulat(pakaiLuas ? (totalHk * luas[i]) / totalLuas : totalHk / n);
    bagian.push(nilai);
    sisa = bulat(sisa - nilai);
  }
  return { bagian, cara: pakaiLuas ? 'luas' : 'rata', tanpaLuas };
}

// ---------------------------------------------------------------- memuat
export async function muatDaftar() {
  try {
    const { isi } = await gh.bacaFile('data/daftar.json');
    state.daftar = isi;
    return isi;
  } catch {
    return null;
  }
}

/** Baca meta publik saja (tanpa password), untuk layar kunci. */
export async function intipMeta(path = state.path) {
  const { isi } = await gh.bacaFile(path);
  if (!isi) return null;
  if (path === state.path) state.meta = isi.meta || null;
  return isi.meta || null;
}

export async function muat(password, path = state.path) {
  const { isi, sha } = await gh.bacaFile(path);
  if (!isi) {
    throw new Error(`Belum ada file data di repo (${path}). `
      + 'Kirim data dulu dari aplikasi desktop lewat menu Sinkron GitHub.');
  }
  const data = await bukaAmplop(isi, password);
  if (!data.aplikasi) throw new Error('Isi file data tidak dikenali.');
  state.path = path;
  state.aplikasi = data.aplikasi;
  state.data = data;
  state.meta = isi.meta || null;
  state.sha = sha;
  state.password = password;
  state.belumDisimpan = false;
  // potret "dasar" untuk penggabungan otomatis saat dua admin menyimpan
  // hampir bersamaan (lihat gabungTiga di bawah)
  state.dasarJson = JSON.stringify(data);
  // token bersama (kalau admin menyimpannya di berkas) langsung berlaku
  gh.setTokenBersama(data.web?.token || '');
  return data;
}

export const muatUlang = () => muat(state.password, state.path);

/**
 * Membaca BAGIAN LAIN (mis. payroll.json dari bagian alat berat) hanya untuk
 * dibaca — dipakai monitor gabungan kepala divisi Infra. Memakai password
 * yang sama dengan bagian yang sedang terbuka; kalau passwordnya beda atau
 * berkasnya tidak ada, mengembalikan null tanpa menggagalkan halaman.
 */
const simpananLain = {};
export async function muatBagianLain(path) {
  if (path in simpananLain) return simpananLain[path];
  try {
    const { isi } = await gh.bacaFile(path);
    if (!isi) throw new Error('kosong');
    const data = await bukaAmplop(isi, state.password);
    simpananLain[path] = data;
  } catch {
    simpananLain[path] = null;
  }
  return simpananLain[path];
}
export const lupakanBagianLain = () => { for (const k of Object.keys(simpananLain)) delete simpananLain[k]; };

// ------------------------------------------- HK lintas bagian (anti dobel)
const rapiNama = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
const rapiRek = (r) => String(r || '').replace(/[^0-9]/g, '');

/**
 * Peta HK per orang per tanggal dari SEMUA bagian LAIN di repo ini —
 * bagian payroll lain (mis. dari Padi+Infra: membaca Pisang) MAUPUN bagian
 * Alat Berat (hari kerja operator). Kuncinya nama + nomor rekening, karena
 * nama saja banyak yang kembar.
 *
 * Tujuannya satu: mencegah satu orang dibayar dua kali pada hari yang sama
 * dari dua bagian berbeda.
 */
export async function petaHkBagianLain() {
  const per = [];   // [{ nama, rek, bagian, perTanggal: {tgl: hk} }]
  const dataset = state.daftar?.dataset || {};
  for (const [path, meta] of Object.entries(dataset)) {
    if (path === state.path) continue;
    const lain = await muatBagianLain(path);
    if (!lain?.tabel) continue;
    const label = meta.label || path;

    // Bagian Alat Berat: orangnya ada di tabel `operators`, hari kerjanya di
    // `work_logs`. Beberapa orang terdaftar DI DUA TEMPAT — sebagai pekerja
    // kebun sekaligus operator — jadi tanpa ini, satu orang bisa dibayar
    // HK kebun dan upah operator pada hari yang sama tanpa ada yang menegur.
    if ((lain.aplikasi || meta?.aplikasi) === 'AlatBerat') {
      const op = new Map();
      for (const o of lain.tabel.operators || []) {
        op.set(Number(o.id), { nama: rapiNama(o.nama), rek: rapiRek(o.no_rekening),
          asli: o.nama, bagian: label, perTanggal: {} });
      }
      for (const r of lain.tabel.work_logs || []) {
        if (r.deleted_at) continue;
        const c = lain.web?.persetujuan?.work_logs?.[String(r.id)];
        if (c && c.status !== 'disetujui') continue;     // belum di-acc: belum dihitung
        const o = op.get(Number(r.operator_id));
        if (!o) continue;
        o.perTanggal[r.tanggal] = (o.perTanggal[r.tanggal] || 0) + (Number(r.hk) || 0);
      }
      for (const o of op.values()) if (Object.keys(o.perTanggal).length) per.push(o);
      continue;
    }
    if ((lain.aplikasi || meta?.aplikasi) !== 'PayrollHK') continue;
    const orang = new Map();
    for (const e of lain.tabel.employees || []) {
      orang.set(Number(e.id), { nama: rapiNama(e.nama), rek: rapiRek(e.rekening),
        asli: e.nama, bagian: label, perTanggal: {} });
    }
    for (const r of lain.tabel.daily_payroll || []) {
      if (r.deleted_at) continue;
      const o = orang.get(Number(r.employee_id));
      if (!o) continue;
      o.perTanggal[r.tanggal] = (o.perTanggal[r.tanggal] || 0) + (Number(r.hk) || 0);
    }
    for (const o of orang.values()) if (Object.keys(o.perTanggal).length) per.push(o);
  }
  return per;
}

/**
 * HK orang ini pada satu tanggal di bagian lain.
 * Cocok pasti  = nama sama DAN rekening sama (dua-duanya terisi).
 * Cocok lemah  = nama sama tapi salah satu rekeningnya kosong.
 * Rekening terisi dan BERBEDA = orang lain, tidak dihitung.
 */
export function hkLintas(peta, emp, tanggal) {
  const nama = rapiNama(emp?.nama);
  const rek = rapiRek(emp?.rekening);
  let hk = 0; const dari = []; let lemah = false;
  for (const o of peta) {
    if (o.nama !== nama) continue;
    if (rek && o.rek && o.rek !== rek) continue;      // rekening beda = orang lain
    const n = o.perTanggal[tanggal] || 0;
    if (!(n > 0)) continue;
    hk += n;
    dari.push(`${o.bagian}`);
    if (!rek || !o.rek) lemah = true;
  }
  return hk > 0 ? { hk, bagian: [...new Set(dari)].join(', '), lemah } : null;
}

// -------------------------------------------------------------- menyimpan
/** Penghitung isi untuk meta publik — beda per bagian, tanpa data pribadi. */
function hitungIsi() {
  const hidup = (t) => baris(t).filter((r) => !r.deleted_at);
  if (state.aplikasi === 'AlatBerat') {
    return {
      jumlah: {
        unit: baris('units').length,
        operator: baris('operators').length,
        log_kerja: baris('work_logs').length,
        solar: baris('fuel_logs').length,
        servis: baris('service_logs').length,
      },
      tanggal: baris('work_logs').map((r) => r.tanggal).filter(Boolean).sort(),
    };
  }
  return {
    jumlah: {
      karyawan: baris('employees').length,
      hk: hidup('daily_payroll').length,
      borongan: hidup('borongan_transactions').length,
      lembur: hidup('lembur_transactions').length,
      premi: hidup('premi_transactions').length,
    },
    tanggal: hidup('daily_payroll').map((r) => r.tanggal).filter(Boolean).sort(),
  };
}

function susunMeta() {
  const { jumlah, tanggal } = hitungIsi();
  return {
    aplikasi: state.aplikasi,
    label: state.meta?.label || (state.aplikasi === 'AlatBerat' ? 'Alat Berat & Kendaraan' : 'Payroll HK'),
    rev: Number(state.data.rev) || 0,
    diperbarui: new Date().toISOString().slice(0, 19),
    dari: namaPengisi() ? `Web — ${namaPengisi()}` : 'Web',
    jumlah,
    periode: { dari: tanggal[0] || '', sampai: tanggal.at(-1) || '' },
  };
}

/** Mode lokal: halaman dibuka tanpa repo GitHub (mis. ujicoba di komputer). */
export const modeLokal = () => !gh.lokasiRepo();

export async function simpan(pesan) {
  if (!state.data) throw new Error('Belum ada data yang dimuat.');
  if (!state.password) throw new Error('Password data belum dimasukkan.');
  state.gabungTerakhir = 0;
  await simpanCadanganLokal();

  const judul = namaPengisi() ? `${pesan} (${namaPengisi()})` : pesan;
  // Dua admin bisa menyimpan hampir bersamaan: yang kedua kena tolak (409).
  // Alih-alih menyerah, perubahan LOKAL digabungkan ke data TERBARU lalu
  // dicoba simpan lagi — tidak ada input siapa pun yang hilang.
  for (let percobaan = 0; ; percobaan++) {
    state.data.rev = (Number(state.data.rev) || 0) + 1;
    state.data.dibuat = new Date().toISOString().slice(0, 19);
    state.data.dari = namaPengisi() ? `Web — ${namaPengisi()}` : 'Web';
    const meta = susunMeta();
    const amplop = await kunciAmplop(state.data, state.password, meta);

    // Tanpa repo tidak ada tempat mengirim, jadi hasilnya diunduh sebagai
    // berkas (ujicoba di komputer sendiri).
    if (modeLokal()) {
      const nama = state.path.split('/').pop() || 'data.json';
      unduhTeks(nama, JSON.stringify(amplop), 'application/json');
      state.meta = meta;
      state.belumDisimpan = false;
      hapusDraf();
      return state.data.rev;
    }

    try {
      state.sha = await gh.tulisFile(state.path, amplop, state.sha, judul);
      state.meta = meta;
      state.belumDisimpan = false;
      state.dasarJson = JSON.stringify(state.data);
      hapusDraf();   // input sudah aman di GitHub
      perbaruiDaftar(meta).catch(() => { /* daftar hanya pelengkap tampilan */ });
      return state.data.rev;
    } catch (e) {
      state.data.rev -= 1;
      if (!e.bentrok || percobaan >= 2) throw e;
      const { isi, sha } = await gh.bacaFile(state.path);
      if (!isi) throw e;
      const terbaru = await bukaAmplop(isi, state.password);
      const dasar = state.dasarJson ? JSON.parse(state.dasarJson) : terbaru;
      state.data = gabungTiga(dasar, state.data, terbaru);
      state.aplikasi = state.data.aplikasi || state.aplikasi;
      state.sha = sha;
      state.dasarJson = JSON.stringify(terbaru);
      state.gabungTerakhir++;
    }
  }
}

/**
 * Gabung tiga arah: `dasar` (data saat terakhir dimuat), `lokal` (dengan
 * perubahan admin ini), `remote` (yang terlanjur tersimpan admin lain).
 * - Baris BARU lokal: diberi id (dan nomor transaksi) baru supaya tidak
 *   menabrak baris baru admin lain.
 * - Baris yang DIUBAH lokal: menimpa baris yang sama di remote.
 * - Baris yang DIHAPUS lokal: dihapus juga dari remote.
 * - Pengaturan web (target, pengguna, persetujuan, dll): hanya kunci yang
 *   benar-benar diubah lokal yang menimpa; sisanya ikut remote.
 */
export function gabungTiga(dasar, lokal, remote) {
  assertGISMerge(dasar,lokal,remote);
  const hasil = JSON.parse(JSON.stringify(remote));
  hasil.tabel ||= {};
  const beda = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  const petaId = {};   // tabel -> Map(id lokal baru -> id final)

  for (const t of Object.keys(lokal.tabel || {})) {
    const barisDasar = new Map(((dasar.tabel || {})[t] || []).map((r) => [Number(r.id), r]));
    hasil.tabel[t] ||= [];
    const barisHasil = hasil.tabel[t];
    const petaHasil = new Map(barisHasil.map((r) => [Number(r.id), r]));
    let maksId = 0;
    for (const r of barisHasil) maksId = Math.max(maksId, Number(r.id) || 0);
    const nomorAda = new Set(barisHasil.map((r) => r.nomor_transaksi).filter(Boolean));
    petaId[t] = new Map();

    const idLokal = new Set();
    for (const l of (lokal.tabel[t] || [])) {
      const id = Number(l.id);
      idLokal.add(id);
      const d = barisDasar.get(id);
      if (d) {
        if (beda(l, d)) {
          const r = petaHasil.get(id);
          if (r) Object.assign(r, l);   // perubahan lokal menang di baris itu
          // kalau admin lain sudah menghapus permanen barisnya, biarkan
        }
      } else if (!(petaHasil.has(id) && !beda(petaHasil.get(id), l))) {
        // baris BARU lokal -> id baru (hindari tabrakan id baris baru remote)
        const baru = { ...l, id: ++maksId };
        if (baru.nomor_transaksi) {
          while (nomorAda.has(baru.nomor_transaksi)) baru.nomor_transaksi += '-B';
          nomorAda.add(baru.nomor_transaksi);
        }
        petaId[t].set(id, baru.id);
        barisHasil.push(baru);
        petaHasil.set(baru.id, baru);
      }
    }
    // dihapus permanen secara lokal -> hapus juga di hasil
    for (const [id] of barisDasar) {
      if (idLokal.has(id)) continue;
      const i = barisHasil.findIndex((r) => Number(r.id) === id);
      if (i >= 0) barisHasil.splice(i, 1);
    }
  }

  // ---- pengaturan web
  hasil.web ||= {};
  const dW = dasar.web || {};
  const lW = lokal.web || {};
  for (const kunci of ['adminPin', 'token']) {
    if (!beda(lW[kunci], dW[kunci])) continue;
    if (lW[kunci] === undefined) delete hasil.web[kunci];
    else hasil.web[kunci] = lW[kunci];
  }
  for (const sub of ['target', 'kebun', 'unitPremi', 'pengguna', 'targetAlat', 'divisiKaryawan', 'tanamBlok']) {
    const dS = dW[sub] || {};
    const lS = lW[sub] || {};
    for (const k of new Set([...Object.keys(dS), ...Object.keys(lS)])) {
      if (!beda(lS[k], dS[k])) continue;
      hasil.web[sub] ||= {};
      if (lS[k] === undefined) delete hasil.web[sub][k];
      else hasil.web[sub][k] = lS[k];
    }
  }
  const dP = dW.persetujuan || {};
  const lP = lW.persetujuan || {};
  for (const t of Object.keys(lP)) {
    for (const idK of Object.keys(lP[t] || {})) {
      if (!beda(lP[t][idK], (dP[t] || {})[idK])) continue;
      const idFinal = petaId[t]?.get(Number(idK)) ?? idK;
      hasil.web.persetujuan ||= {};
      hasil.web.persetujuan[t] ||= {};
      hasil.web.persetujuan[t][String(idFinal)] = lP[t][idK];
    }
  }
  return hasil;
}

async function perbaruiDaftar(meta) {
  const { isi, sha } = await gh.bacaFile('data/daftar.json');
  const dataset = { ...(isi?.dataset || {}) };
  dataset[state.path] = {
    label: meta.label, aplikasi: meta.aplikasi, rev: meta.rev,
    diperbarui: meta.diperbarui, jumlah: meta.jumlah, periode: meta.periode,
  };
  await gh.tulisFile('data/daftar.json', { dataset, diperbarui: meta.diperbarui }, sha,
    'Web: perbarui daftar dataset');
}

// ------------------------------------------------------------- perubahan
// -------------------------------------------------- penjaga hak menulis
// Dipasang oleh pengguna.js. Semua jalan menulis lewat sini — form,
// input massal, salin hari, maupun impor Excel — jadi tidak ada pintu
// samping yang perlu ditambal satu-satu.
let penjagaTulis = null;
export const pasangPenjagaTulis = (fn) => { penjagaTulis = fn; };

function periksaTulis(aksi, tabel, isi) {
  const alasan = alasanTulis(aksi, tabel, isi);
  if (alasan) throw new Error(alasan);
}

/** Versi yang tidak melempar — untuk memeriksa lebih dulu, mis. pratinjau impor. */
export const alasanTulis = (aksi, tabel, isi) =>
  (penjagaTulis ? penjagaTulis(aksi, tabel, isi) : null);

export function tambah(tabel, isi) {
  assertGISMasterStructure(state.data,'payrol',tabel);
  if(tabel!=='blocks')assertGISBlockActive(state.data,'payrol',isi);
  periksaTulis('tambah', tabel, isi);
  if(tabel==='daily_payroll'&&!isi.deleted_at)checkHKEntries(state.data,[isi]);
  const r = { id: idBaru(tabel), created_at: sekarang(), ...isi };
  // tabel payroll punya updated_at; tabel alat berat tidak
  if (baris(tabel).some((x) => 'updated_at' in x) || state.aplikasi === 'PayrollHK') {
    r.updated_at = sekarang();
  }
  baris(tabel).push(r);
  captureGISSnapshot(state.data,'payrol',tabel,r);
  tandaiBerubah();
  return r;
}

export function tambahanTerkunci(tabel,id){
 const r=cari(tabel,id);if(!r)return false;
 const perlu=['lembur_transactions','premi_transactions'].includes(tabel)||(tabel==='work_logs'&&(Number(r.premi)>0));
 return perlu&&disetujui(tabel,id);
}
function catatRevisiTambahan(tabel,id,aksi){if(!['lembur_transactions','premi_transactions','work_logs'].includes(tabel))return;const w=web();w.riwayatTambahan||=[];w.riwayatTambahan.push({tabel,id,aksi,oleh:namaPengisi()||'Web',waktu:sekarang(),sebelum:structuredClone(cari(tabel,id)),persetujuan:structuredClone(catatanPersetujuan(tabel,id))});}
export function hapusTambahanAlat(id){const r=cari('work_logs',id);if(!r)throw new Error('Log tidak ditemukan');periksaTulis('hapus','work_logs',r);if(periodeTerkunci(r.tanggal))throw new Error('Periode dikunci. Gunakan koreksi periode berikutnya.');if(tambahanTerkunci('work_logs',id))throw new Error('Minta kepala divisi membatalkan persetujuan terlebih dahulu.');catatRevisiTambahan('work_logs',id,'hapus tambahan');setWeb(w=>{w.persetujuan.work_logs||={};w.persetujuan.work_logs[String(id)]={...(w.persetujuan.work_logs[String(id)]||{}),status:'dihapus',oleh:namaPengisi()||'Web',waktu:sekarang()};});}
export function bersihkanSampah(){const n=purgeExpiredTrash(state.data);if(n){web().pembersihanSampah={jumlah:n,waktu:sekarang(),oleh:namaPengisi()||'Admin'};tandaiBerubah();}return n;}

export function ubah(tabel, id, tambalan) {
  assertGISMasterEdit(state.data,'payrol',tabel,id,tambalan);
  const r = cari(tabel, id);
  if (!r) throw new Error('Baris tidak ditemukan.');
  const tambahan=['lembur_transactions','premi_transactions','work_logs'].includes(tabel),hkOnly=tabel==='work_logs'&&Object.keys(tambalan).every(k=>k==='hk');
  if(tambahan&&!hkOnly){if(periodeTerkunci(r.tanggal)||periodeTerkunci(tambalan.tanggal))throw new Error('Periode dikunci. Gunakan koreksi periode berikutnya.');if(tambahanTerkunci(tabel,id)&&!(r.deleted_at&&tambalan.deleted_at===null))throw new Error('Transaksi sudah disetujui. Minta kepala divisi membatalkan persetujuan terlebih dahulu sebelum merevisi atau menghapus.');}
  periksaTulis('ubah', tabel, r);            // divisi ASAL
  periksaTulis('ubah', tabel, { ...r, ...tambalan }); // dan divisi tujuan
  if(tabel==='daily_payroll'&&!({...r,...tambalan}).deleted_at)checkHKEntries(state.data,[{...r,...tambalan}],{excludeIds:[id]});
  if(tambahan&&!hkOnly)catatRevisiTambahan(tabel,id,'revisi');
  const changedBlock='block_id' in tambalan&&String(tambalan.block_id)!==String(r.block_id);
  if(changedBlock)assertGISBlockActive(state.data,'payrol',{...r,...tambalan});
  Object.assign(r, tambalan);
  captureGISSnapshot(state.data,'payrol',tabel,r,{replace:changedBlock});
  if ('updated_at' in r) r.updated_at = sekarang();
  // Setiap revisi lembur/premi menggugurkan keputusan lama, dari jalur mana
  // pun revisinya dilakukan (form, perbaikan data, atau pemulihan).
  if (['lembur_transactions', 'premi_transactions'].includes(tabel) && !r.deleted_at) {
    const w = web();
    w.persetujuan[tabel] ||= {};
    const lama = w.persetujuan[tabel][String(id)] || {};
    w.persetujuan[tabel][String(id)] = {
      ...lama, status: 'menunggu', diinput: namaPengisi() || 'Web', waktu: sekarang(),
    };
  }
  tandaiBerubah();
  return r;
}

/** `lunak` hanya untuk tabel yang punya kolom deleted_at (transaksi payroll). */
export function hapus(tabel, id, { lunak = false, aksi = 'hapus' } = {}) {
  assertGISMasterStructure(state.data,'payrol',tabel);
  const daftar = baris(tabel);
  const i = daftar.findIndex((r) => Number(r.id) === Number(id));
  if (i < 0) throw new Error('Baris tidak ditemukan.');
  if(['lembur_transactions','premi_transactions','work_logs'].includes(tabel)){if(periodeTerkunci(daftar[i].tanggal))throw new Error('Periode dikunci. Gunakan koreksi periode berikutnya.');if(tambahanTerkunci(tabel,id))throw new Error('Minta kepala divisi membatalkan persetujuan terlebih dahulu sebelum menghapus.');}
  periksaTulis(aksi, tabel, daftar[i]);
  catatRevisiTambahan(tabel,id,'hapus');
  // Baris master yang masih dipakai transaksi TIDAK boleh dibuang — kalau
  // dibuang, transaksinya tetap ada tapi kehilangan acuannya dan tertulis
  // "(tidak ada)" di laporan. Dijaga di sini, bukan hanya di layar, supaya
  // jalur mana pun kena. Hapus lunak (tabel transaksi) tidak terpengaruh.
  if (!lunak) {
    const pemakai = pemakaiMaster(tabel, id);
    if (pemakai.length) {
      throw new Error(`Masih dipakai ${pemakai.map((x) => `${x.tabel}: ${x.n} baris`).join(', ')}`
        + ' — ubah statusnya jadi "Tidak Aktif" saja, jangan dihapus.');
    }
  }
  if (lunak) {
    daftar[i].deleted_at = sekarang();
    daftar[i].deleted_by = namaPengisi() || 'Web';
  } else {
    daftar.splice(i, 1);
  }
  tandaiBerubah();
}

export function pulihkan(tabel, id) {
  ubah(tabel, id, { deleted_at: null, deleted_by: null });
}

/** Nomor transaksi PREFIX-YYYYMMDD-000001 (hanya dipakai bagian Payroll). */
export function nomorBaru(tabel, prefix, tanggal) {
  const padat = String(tanggal).replaceAll('-', '');
  const awalan = `${prefix}-${padat}-`;
  let maks = 0;
  for (const r of baris(tabel)) {
    const n = r.nomor_transaksi;
    if (typeof n === 'string' && n.startsWith(awalan)) {
      const urut = parseInt(n.slice(awalan.length), 10);
      if (Number.isFinite(urut) && urut > maks) maks = urut;
    }
  }
  return awalan + String(maks + 1).padStart(6, '0');
}

export const siklusGIS=(id,at)=>gisCycleAt(state.data,id,at);
