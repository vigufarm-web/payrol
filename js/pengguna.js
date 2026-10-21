// pengguna.js — siapa boleh menginput & merevisi divisi mana.
//
// Yang dibatasi di sini adalah MENULIS (tambah, revisi, hapus), bukan
// melihat. Semua data ada dalam satu berkas terkunci, jadi siapa pun yang
// tahu password data bisa membacanya — itu sifat penyimpanannya, bukan
// sesuatu yang bisa ditutupi dari sisi halaman.
//
// Gunanya: mencegah salah masuk divisi orang lain, dan meninggalkan jejak
// siapa membuat/mengubah baris. Bukan pagar terhadap orang yang berniat
// menembusnya; untuk itu perlu password berbeda per kebun.

import * as D from './data.js';
import { el, tabel, isian, panel, tanya, pesan, kosongkan, kesalahan } from './ui.js';
import { mintaPin, periksaPinAdmin, adminPinTerpasang, hashPin } from './kebun.js';

const KUNCI_SESI = 'app.siapa';

export const HAK = [
  ['input', 'Input baru', 'Boleh menambah HK, borongan, lembur, premi, log alat'],
  ['revisi', 'Revisi & hapus', 'Boleh mengubah dan menghapus baris yang sudah ada'],
  ['setuju', 'Setujui lembur & premi', 'Boleh menyetujui/menolak sebagai kepala kebun'],
  ['laporan', 'Lihat Laporan Kebun', 'Laporan biaya operasional kebunnya sendiri terhadap target'],
  ['upah', 'Lihat rincian upah', 'Halaman Payroll & Rekap — upah per pekerja dan biaya per blok/kegiatan. '
    + 'Tanpa hak ini, angka upah per orang tidak bisa dilihat'],
  ['batal', 'Batalkan persetujuan', 'Boleh membatalkan lembur/premi/log yang telanjur di-acc (kembali jadi menunggu)'],
  ['blok', 'Kelola blok & lahan', 'Admin blok lahan: menambah/mengubah master Blok — nama, luas (ha), divisi, aktif'],
];

// ------------------------------------------------------------ penyimpanan
// Daftar pengguna disimpan SEKALI di bagian induk (Payroll Operasional) dan
// dibaca bagian lain dari sana — satu admin bisa diberi cakupan lintas bagian.
export const BAGIAN_INDUK = 'data/payroll.json';
let pusatCache = null;   // hasil baca dari bagian induk (saat bukan induk)

export async function muatPusat() {
  if (D.state.path === BAGIAN_INDUK) { pusatCache = null; return; }
  try {
    const induk = await D.muatBagianLain(BAGIAN_INDUK);
    pusatCache = induk?.web?.pengguna || null;
    // token yang dibagikan admin di bagian induk berlaku di semua bagian
    const { setTokenBersama } = await import('./github.js');
    if (induk?.web?.token && !D.web().token) setTokenBersama(induk.web.token);
  } catch { pusatCache = null; }
}

const semua = () => {
  if (D.state.path === BAGIAN_INDUK) return D.web().pengguna || {};
  // bagian lain: pakai daftar induk; kalau induk tak terbaca, pakai lokal lama
  return pusatCache || D.web().pengguna || {};
};

/** Cakupan satu pengguna pada satu bagian. Kompatibel dengan entri lama
 *  (tanpa `akses`): entri lama berlaku untuk bagian induk saja. */
function aksesEntry(p, path = D.state.path) {
  if (!p) return null;
  if (p.admin) return { divisi: 'semua' };
  if (p.akses) return p.akses[path] || null;
  return path === BAGIAN_INDUK ? { divisi: p.divisi || [] } : null;
}

/** Boleh membuka bagian (dataset) ini? */
export function bolehBagian(path = D.state.path) {
  if (!adaPengguna()) return true;
  const p = siapa();
  if (!p) return false;
  return !!aksesEntry(p, path);
}

/** Daftar bagian yang boleh dibuka pengguna yang sedang masuk. */
export function bagianBoleh() {
  const ds = D.state.daftar?.dataset || {};
  return Object.keys(ds).filter((p) => bolehBagian(p));
}
export const daftarPengguna = () => Object.entries(semua())
  .map(([id, p]) => ({ id, ...p }))
  .sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));

export const adaPengguna = () => daftarPengguna().some((p) => p.aktif !== false);

/** Pengguna yang sedang masuk di tab ini (null = belum pilih / fitur tidak dipakai). */
export function siapa() {
  const id = sessionStorage.getItem(KUNCI_SESI);
  if (!id) return null;
  const p = semua()[id];
  if (!p || p.aktif === false) return null;
  return { id, ...p };
}

export const namaSiapa = () => siapa()?.nama || '';
export const adalahAdmin = () => siapa()?.admin === true;

export function keluar() {
  sessionStorage.removeItem(KUNCI_SESI);
}

// ------------------------------------------------------------------- hak
/**
 * Divisi yang boleh ditulis orang ini.
 * null = semua divisi (fitur pengguna belum dipakai, atau dia admin).
 *
 * Catatan penting: kalau daftar pengguna SUDAH diisi tapi belum ada yang
 * masuk, jawabannya "tidak boleh apa-apa" — bukan "boleh semua". Jadi
 * menutup dialog pilih-nama tidak jadi jalan pintas.
 */
export function divisiBoleh() {
  if (!adaPengguna()) return null;
  const p = siapa();
  if (!p) return [];
  if (p.admin) return null;
  const a = aksesEntry(p);
  if (!a) return [];
  if (a.divisi === 'semua') return null;
  if (!Array.isArray(a.divisi) || !a.divisi.length) return [];
  return a.divisi.map(Number);
}

export function bolehDivisi(divisionId) {
  const boleh = divisiBoleh();
  return boleh === null || boleh.includes(Number(divisionId));
}

export function punyaHak(nama) {
  if (!adaPengguna()) return true;   // fitur pengguna belum dipakai
  const p = siapa();
  if (!p) return false;              // daftar ada tapi belum masuk
  if (p.admin) return true;
  return p.hak?.[nama] === true;
}

export const bolehInput = () => punyaHak('input');
export const bolehRevisi = () => punyaHak('revisi');
export const bolehSetuju = () => punyaHak('setuju');
export const bolehLaporan = () => punyaHak('laporan');
export const bolehBatal = () => punyaHak('batal');

/** Kepala divisi murni: boleh monitor/acc tapi tidak menginput — menunya diringkas. */
export function hanyaKepala() {
  if (!adaPengguna()) return false;
  const p = siapa();
  if (!p || p.admin) return false;
  return !bolehInput() && !bolehRevisi() && (bolehSetuju() || bolehLaporan());
}

/**
 * Menu yang boleh muncul. Catatan jujur: ini menyembunyikan halaman, bukan
 * menyembunyikan DATA — datanya tetap ada di berkas yang sudah terbuka.
 */
const HALAMAN_INPUT = new Set(['hk', 'borongan', 'lembur', 'impor', 'log', 'solar', 'servis']);

export function bolehHalaman(kunci) {
  if (!adaPengguna()) return true;
  const p = siapa();
  // Belum pilih nama tapi PIN admin sudah dibuka di sesi ini: halaman yang
  // memang digembok PIN tetap boleh — penting saat pemilik baru menyusun
  // daftar pengguna pertama kali (dirinya belum ada di daftar).
  if (!p) {
    // Daftar pengguna ada tapi belum ada yang masuk: TIDAK ada halaman yang
    // ditampilkan. Dulu di sini ada mode "Lihat saja", tapi nama pengisi,
    // nama yang meng-acc, dan riwayat perubahan tersebar di banyak halaman —
    // membuka situs tanpa masuk sama saja membocorkan siapa saja yang punya
    // akses. Pemilik masuk lewat akun adminnya sendiri seperti yang lain.
    //
    // SATU pengecualian: halaman Pengguna, dan hanya kalau PIN admin sudah
    // dibuka di sesi ini. Ini bukan "lihat saja" — halaman lain tetap
    // tertutup. Tanpa ini, begitu akun admin PERTAMA dibuat, halaman
    // penyusun daftarnya langsung menutup diri (pembuatnya belum masuk,
    // karena akunnya baru saja ada), jadi daftarnya tidak bisa diteruskan
    // dan akun itu bisa hilang sebelum sempat tersimpan.
    if (kunci === 'pengguna') return sessionStorage.getItem('app.pengguna.buka') === '1';
    return false;
  }
  if (p.admin) return true;
  // Monitoring Semua Divisi menyatukan angka SEMUA divisi dan semua bagian —
  // hanya admin penuh, bukan admin divisi, bukan kepala divisi.
  if (kunci === 'semua') return false;
  // Rincian upah per pekerja: hanya pemegang hak "Lihat rincian upah".
  // Kepala divisi cukup menyetujui lembur/premi — tidak perlu tahu gaji
  // orang per orang. Ringkasan (angka gabungan) tetap terbuka untuk semua.
  if (kunci === 'payroll' || kunci === 'rekap' || kunci === 'operator') return punyaHak('upah');
  // Halaman sistem: data terhapus, riwayat perubahan, pengaturan/token.
  // Riwayat memuat nama siapa menyimpan apa, dan Pengaturan memuat token —
  // dua-duanya urusan admin.
  if (kunci === 'terhapus' || kunci === 'riwayat' || kunci === 'sistem') return false;
  if (kunci === 'kebun' || kunci === 'monitor') return bolehLaporan();
  if (kunci === 'beranda') return bolehSetuju() || bolehLaporan();
  if (kunci === 'persetujuan') return bolehSetuju() || bolehBatal();
  if (kunci === 'target' || kunci === 'pengguna' || kunci === 'tarifpremi') return false;  // admin saja
  if (HALAMAN_INPUT.has(kunci)) return bolehInput() || bolehRevisi();
  return true;
}

/** Khusus tombol "Monitoring Semua Divisi" di menu kiri — admin penuh saja. */
export const bolehMonitorSemua = () => bolehHalaman('semua');

/** Boleh mengelola halaman yang digembok PIN admin (pengguna/target/tarif)?
 *  Admin yang masuk jelas boleh. Belum ada yang masuk tapi PIN admin sudah
 *  dibuka di sesi ini juga boleh — PIN itulah gemboknya; penting saat pemilik
 *  pertama kali menyusun daftar pengguna (dirinya belum ada di daftar). */
export function bolehKelolaTerkunci(flag) {
  if (!adaPengguna()) return true;
  const p = siapa();
  if (p) return p.admin === true;
  return sessionStorage.getItem(flag) === '1';
}

/** Master data umumnya hanya admin; master Blok boleh juga dipegang
 *  "admin blok lahan" (hak Kelola blok & lahan). */
/** Master mana yang boleh dibuka/diubah seseorang.
 *  - Blok      : hanya "Admin blok lahan" (hak blok) atau admin penuh — blok
 *                menentukan luas yang jadi dasar bagi upah, jadi satu pintu.
 *  - Divisi    : hanya admin penuh (ini struktur kebunnya).
 *  - Komponen  : hanya admin penuh — tarif lembur/premi/borongan berlaku untuk
 *    upah         semua divisi, jadi satu pintu supaya tarifnya tidak berbeda-beda.
 *  - Lainnya   : admin divisi yang boleh input/revisi juga boleh mengelola,
 *                supaya tidak perlu menunggu admin pusat. Daftarnya disaring
 *                sesuai pemakaian di divisinya (lihat saringMaster di master.js). */
const MASTER_ADMIN_SAJA = new Set(['divisions', 'wage_components']);
const LABEL_ADMIN_SAJA = {
  divisions: 'Master Divisi',
  wage_components: 'Master Komponen Upah',
};
export function bolehMasterTabel(namaTabel) {
  if (!adaPengguna()) return true;
  if (siapa()?.admin === true) return true;
  if (namaTabel === 'blocks') return punyaHak('blok');
  if (MASTER_ADMIN_SAJA.has(namaTabel)) return false;
  // hak "blok" saja tidak cukup untuk master lain — penjaga tulis pun
  // menolaknya, jadi menunya tidak boleh menjanjikan yang tidak bisa dipakai
  return punyaHak('input') || punyaHak('revisi');
}
export function bolehMaster() {
  if (!adaPengguna()) return true;
  const p = siapa();
  if (!p) return false;
  return p.admin === true || punyaHak('blok') || punyaHak('input') || punyaHak('revisi');
}

/** Dipakai layar: apakah baris ini boleh dia ubah? */
export function bolehUbahBaris(baris) {
  if (!baris) return bolehRevisi();
  const div = baris.division_id;
  if (div == null) return bolehRevisi();
  return bolehRevisi() && bolehDivisi(div);
}

// ---------------------------------------------------------------- penjaga
const TABEL_MASTER = new Set([
  'employees', 'divisions', 'blocks', 'activities', 'job_types', 'wage_components',
  'units', 'operators',
]);

/**
 * Dipanggil data.js sebelum setiap tambah/ubah/hapus.
 * Mengembalikan alasan penolakan (string) atau null kalau boleh.
 */
function penjaga(aksi, tabelNama, isi) {
  if (!adaPengguna()) return null;

  const p = siapa();
  if (!p) return 'Belum ada yang masuk. Pilih nama Anda dulu lewat tombol di menu kiri.';
  if (p.admin) return null;

  if (TABEL_MASTER.has(tabelNama)) {
    if (tabelNama === 'blocks') {
      return punyaHak('blok') ? null
        : `Master Blok hanya bisa diubah pemegang hak "Kelola blok & lahan". `
          + `${p.nama} tidak punya hak itu.`;
    }
    if (MASTER_ADMIN_SAJA.has(tabelNama)) {
      return `${LABEL_ADMIN_SAJA[tabelNama] || 'Master ini'} hanya bisa diubah admin. `
        + `${p.nama} tidak punya hak itu.`;
    }
    if (punyaHak('input') || punyaHak('revisi')) return null;
    return `${p.nama} tidak punya hak mengubah master data.`;
  }

  const perlu = aksi === 'tambah' ? 'input' : aksi === 'tolak' ? 'setuju' : 'revisi';
  const labelAksi = { tambah: 'menginput', ubah: 'merevisi', hapus: 'menghapus', tolak: 'menolak' }[aksi];
  if (!punyaHak(perlu)) return `${p.nama} tidak punya hak ${labelAksi}.`;

  const div = isi?.division_id;
  if (div != null && !bolehDivisi(div)) {
    return `${p.nama} tidak boleh ${labelAksi} data divisi `
      + `${D.labelRef('divisions', div)}.`;
  }
  return null;
}

/** Dipasang sekali saat aplikasi mulai. */
export const pasangPenjaga = () => D.pasangPenjagaTulis(penjaga);

// --------------------------------------------------------------- memilih
/** Layar "siapa yang mengisi" setelah password data benar. */
export async function pilihPengguna({ wajib = true } = {}) {
  const orang = daftarPengguna().filter((p) => p.aktif !== false);
  if (!orang.length) return true;

  return new Promise((selesai) => {
    const tempatGalat = el('div');
    // nama DIKETIK, bukan dipilih dari daftar — supaya siapa saja yang punya
    // akses tidak bisa dilihat orang lain dari layar masuk
    const inNama = el('input', { type: 'text', autocomplete: 'off', spellcheck: false });
    const inPin = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });
    const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

    const gagalMasuk = () => {
      // sengaja tidak membedakan nama tak terdaftar vs PIN keliru,
      // supaya nama pengguna tidak bisa ditebak-tebak dari layar ini
      kosongkan(tempatGalat).append(kesalahan(['Nama atau PIN salah.']));
      tempatGalat.append(el('p.bantuan', {
        teks: 'Nama harus persis seperti yang didaftarkan admin (huruf besar/kecil bebas). '
          + 'Kalau akun Anda baru saja dibuat, daftar terbaru sudah diambil otomatis — '
          + 'coba sekali lagi, atau muat ulang halaman (Ctrl+Shift+R).',
      }));
      inPin.value = '';
      inNama.select();
    };

    // Daftar pengguna di layar ini bisa saja tertinggal (akun baru dibuat admin
    // setelah tab ini dibuka). Kalau nama tidak ketemu, ambil daftar terbaru
    // dari GitHub sekali lalu coba lagi — supaya akun baru langsung bisa masuk.
    let sudahSegarkan = false;
    const segarkanDaftar = async () => {
      if (sudahSegarkan || D.modeLokal() || D.state.belumDisimpan) return false;
      sudahSegarkan = true;
      try {
        if (D.state.path === BAGIAN_INDUK) await D.muatUlang();
        else { D.lupakanBagianLain(BAGIAN_INDUK); await muatPusat(); }
        const baru = daftarPengguna().filter((x) => x.aktif !== false);
        orang.length = 0; orang.push(...baru);
        return true;
      } catch { return false; }
    };

    const masuk = async (lagi = false) => {
      kosongkan(tempatGalat);
      let cocok = orang.find((x) => norm(x.nama) === norm(inNama.value));
      if (!cocok && !lagi && await segarkanDaftar()) { await masuk(true); return; }
      if (!cocok) { gagalMasuk(); return; }
      const p = semua()[cocok.id];
      if (p.pin) {
        const { hash } = await hashPin(inPin.value, p.pin.salt);
        if (hash !== p.pin.hash) { gagalMasuk(); return; }
      }
      sessionStorage.setItem(KUNCI_SESI, cocok.id);
      // nama pengisi ikut nama pengguna, supaya jejak di tiap baris &
      // di commit GitHub konsisten dan tidak bisa diketik sembarangan
      D.setNamaPengisi(p.nama);
      pan.tutup();
      selesai(true);
    };
    inPin.addEventListener('keydown', (e) => { if (e.key === 'Enter') masuk(); });
    inNama.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inPin.focus(); } });

    const tombol = [
      // TIDAK ada "Lihat saja": daftar pengguna, nama pengisi, dan nama yang
      // meng-acc tersebar di banyak halaman, jadi membuka situs tanpa masuk
      // sama saja membocorkan siapa saja yang punya akses. Pemilik sudah
      // punya akun admin sendiri, jadi tidak perlu jalan masuk cadangan.
      wajib ? null : el('button.tombol-samar', {
        type: 'button', teks: 'Batal',
        onclick: () => { pan.tutup(); selesai(false); },
      }),
      el('button.tombol-utama', { type: 'button', teks: 'Masuk', onclick: masuk }),
    ].filter(Boolean);

    const pan = panel('Siapa yang mengisi?', el('div', {}, [
      tempatGalat,
      el('p', { teks: 'Ketik nama Anda persis seperti yang didaftarkan, supaya tiap baris '
        + 'tercatat atas nama Anda dan hanya divisi Anda yang terbuka untuk diubah.' }),
      isian('Nama *', inNama),
      isian('PIN', inPin, { bantuan: 'Kosongkan kalau nama Anda belum dipasangi PIN.' }),
      wajib
        ? el('p.bantuan', { teks: 'Harus masuk dulu — tanpa nama, isi situs tidak ditampilkan.' })
        : null,
    ]), tombol);

    setTimeout(() => inNama.focus(), 50);
  });
}

/**
 * Ganti PIN sendiri — tiap orang mengurus PIN-nya masing-masing, tanpa
 * harus minta admin. PIN lama wajib dimasukkan (kalau sudah punya), supaya
 * orang yang kebetulan menemukan layar terbuka tidak bisa menguncinya.
 *
 * Daftar pengguna hanya ada di bagian induk, jadi penggantian hanya bisa
 * dilakukan dari sana — kalau tidak, PIN-nya akan tertulis ke berkas bagian
 * lain dan tidak terbaca saat masuk.
 */
export async function gantiPinSendiri() {
  const id = sessionStorage.getItem(KUNCI_SESI);
  const p = id ? semua()[id] : null;
  if (!p) { pesan('Masuk dulu dengan nama Anda untuk mengganti PIN.', 'awas', 6); return false; }
  if (D.state.path !== BAGIAN_INDUK) {
    pesan('Ganti PIN dilakukan dari bagian Payroll Operasional — daftar penggunanya '
      + 'disimpan di sana. Pindah bagian dulu lewat tombol di menu kiri.', 'awas', 9);
    return false;
  }

  return new Promise((selesai) => {
    const tempatGalat = el('div');
    const inLama = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });
    const inBaru = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });
    const inUlang = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });

    const simpan = async () => {
      kosongkan(tempatGalat);
      const salah = [];
      const baru = inBaru.value.trim();
      if (p.pin) {
        const { hash } = await hashPin(inLama.value, p.pin.salt);
        if (hash !== p.pin.hash) salah.push('PIN lama salah.');
      }
      if (!baru) salah.push('PIN baru harus diisi.');
      else if (baru.length < 4) salah.push('PIN baru minimal 4 angka.');
      else if (!/^\d+$/.test(baru)) salah.push('PIN hanya boleh angka.');
      if (baru !== inUlang.value.trim()) salah.push('Ulangi PIN tidak sama dengan PIN baru.');
      if (salah.length) { tempatGalat.append(kesalahan(salah)); return; }

      const pinBaru = await hashPin(baru);
      D.setWeb((w) => {
        w.pengguna ||= {};
        if (!w.pengguna[id]) return;
        w.pengguna[id] = { ...w.pengguna[id], pin: pinBaru };
      });
      pan.tutup();
      pesan(`PIN ${p.nama} diganti. Jangan lupa Simpan ke GitHub supaya berlaku `
        + 'di perangkat lain.', 'sukses', 9);
      selesai(true);
    };
    inUlang.addEventListener('keydown', (e) => { if (e.key === 'Enter') simpan(); });

    const pan = panel('Ganti PIN saya', el('div', {}, [
      tempatGalat,
      el('p', { teks: `PIN untuk masuk sebagai ${p.nama}. Hanya Anda yang perlu tahu — `
        + 'admin pun tidak bisa melihatnya, hanya bisa menghapusnya kalau Anda lupa.' }),
      p.pin ? isian('PIN lama *', inLama) : null,
      isian('PIN baru *', inBaru, { bantuan: 'Minimal 4 angka.' }),
      isian('Ulangi PIN baru *', inUlang),
    ]), [
      el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => { pan.tutup(); selesai(false); } }),
      el('button.tombol-utama', { type: 'button', teks: 'Simpan PIN', onclick: simpan }),
    ]);
    setTimeout(() => (p.pin ? inLama : inBaru).focus(), 50);
  });
}

// ------------------------------------------------------ halaman pengaturan
export function halamanPengguna({ gambar, bisaEdit }) {
  const wadah = el('section');
  // sekali PIN admin dibuka, tetap terbuka selama tab masih hidup — supaya
  // gambar ulang penuh (yang memunculkan tombol Simpan) tidak minta PIN lagi
  let terbuka = sessionStorage.getItem('app.pengguna.buka') === '1';

  const gambarIsi = () => {
    kosongkan(wadah);

    if (!terbuka) {
      wadah.append(el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Pengguna & hak akses' })]),
        el('div.lembar-isi', {}, [
          el('p', {
            teks: adminPinTerpasang()
              ? 'Halaman ini menentukan siapa boleh menginput dan merevisi divisi mana. '
                + 'Masukkan PIN admin untuk membukanya.'
              : 'PIN admin belum dipasang. Pasang dulu di menu Pengaturan Kebun, '
                + 'supaya daftar pengguna di sini tidak bisa diubah sembarang orang.',
          }),
          el('button.tombol-utama', {
            type: 'button',
            teks: 'Masukkan PIN admin',
            onclick: async () => {
              const ok = await mintaPin('PIN admin',
                'PIN ini melindungi daftar pengguna dan hak aksesnya.', periksaPinAdmin);
              if (ok) { terbuka = true; sessionStorage.setItem('app.pengguna.buka', '1'); gambarIsi(); }
            },
          }),
        ]),
      ]));
      return;
    }

    const diInduk = D.state.path === BAGIAN_INDUK;
    if (!diInduk) {
      wadah.append(el('div.petunjuk', {}, [
        `Daftar pengguna disimpan terpusat di bagian ${
          D.state.daftar?.dataset?.[BAGIAN_INDUK]?.label || 'Payroll Operasional'}. `
        + 'Untuk menambah atau mengubah, buka menu Pengguna di bagian itu.',
      ]));
    }
    wadah.append(el('div.petunjuk', {}, [
      el('p', { teks: 'Pembatasan ini berlaku untuk MENGINPUT dan MEREVISI, bukan untuk melihat. '
        + 'Semua data ada dalam satu berkas terkunci, jadi siapa pun yang tahu password data '
        + 'tetap bisa membaca seluruhnya.' }),
      el('p', { teks: 'Gunanya mencegah salah masuk divisi orang lain dan mencatat siapa '
        + 'membuat atau mengubah tiap baris. Untuk pemisahan yang betul-betul tidak bisa ditembus, '
        + 'tiap kebun perlu password datanya sendiri.' }),
    ]));

    const dataset = D.state.daftar?.dataset || {};
    const ringkasAkses = (p) => {
      if (p.admin) return 'Semua bagian';
      if (!p.akses) {
        return (p.divisi || []).map((d) => D.labelRef('divisions', d)).join(', ') || '—';
      }
      return Object.entries(p.akses).map(([path, a]) => {
        const label = dataset[path]?.label || path;
        if (a.divisi === 'semua') return `${label}: semua`;
        const nama = (a.divisi || []).map((d) => (path === D.state.path
          ? D.labelRef('divisions', d) : null)).filter(Boolean);
        return `${label}: ${nama.length ? nama.join(', ') : `${(a.divisi || []).length} divisi`}`;
      }).join(' · ') || '—';
    };
    const baris = daftarPengguna().map((p) => ({
      id: p.id,
      nama: p.nama + (p.admin ? ' (admin)' : ''),
      pin: p.pin ? 'Ya' : 'Belum',
      divisi: ringkasAkses(p),
      hak: p.admin ? 'Semua'
        : HAK.filter(([k]) => p.hak?.[k]).map(([, l]) => l).join(', ') || 'Hanya melihat',
      status: p.aktif === false ? 'Tidak aktif' : 'Aktif',
    }));

    wadah.append(el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: 'Daftar pengguna' }),
        bisaEdit() && diInduk ? el('button.tombol-utama.tombol-kecil', {
          type: 'button', teks: 'Tambah pengguna', onclick: () => formPengguna(null, gambar),
        }) : null,
      ]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', { teks: 'Klik satu baris untuk mengubahnya. Selama daftar ini kosong, '
          + 'situs berjalan seperti biasa — semua orang yang punya token bisa mengisi apa saja.' }),
        tabel([
          { l: 'Nama', k: 'nama' },
          { l: 'PIN', k: 'pin' },
          { l: 'Boleh di mana', k: 'divisi' },
          { l: 'Boleh', k: 'hak' },
          { l: 'Status', k: 'status' },
        ], baris, {
          kosong: 'Belum ada pengguna. Tanpa daftar ini, pembatasan tidak berlaku.',
          saatKlik: bisaEdit() && diInduk ? (r) => formPengguna(r.id, gambar) : null,
        }),
      ]),
    ]));
  };

  gambarIsi();
  return wadah;
}

async function formPengguna(id, saatSelesai) {
  const ada = id ? { id, ...(D.web().pengguna || {})[id] } : null;
  const tempatGalat = el('div');
  const inNama = el('input', { type: 'text', nilai: ada?.nama || '', placeholder: 'mis. A — Admin Pisang' });
  const inPin = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });
  const inAdmin = el('input', { type: 'checkbox' });
  if (ada?.admin) inAdmin.checked = true;
  const inAktif = el('input', { type: 'checkbox' });
  inAktif.checked = ada ? ada.aktif !== false : true;

  // ---- cakupan per BAGIAN: bagian mana + divisi mana yang boleh
  // (daftar divisi bagian lain dibaca dari berkasnya masing-masing)
  const dataset = D.state.daftar?.dataset || { [BAGIAN_INDUK]: { label: 'Bagian ini', aplikasi: 'PayrollHK' } };
  const cakupan = [];   // { path, label, jenis, cSemua, centang: Map(divId -> c) }
  for (const [path, meta] of Object.entries(dataset)) {
    const aksesLama = ada?.akses?.[path]
      || (path === BAGIAN_INDUK && ada && !ada.akses ? { divisi: ada.divisi || [] } : null);
    const baris = { path, label: meta.label || path, jenis: meta.aplikasi, centang: new Map() };
    baris.cSemua = el('input', { type: 'checkbox' });
    if (aksesLama?.divisi === 'semua' || (baris.jenis !== 'PayrollHK' && aksesLama)) baris.cSemua.checked = true;
    if (baris.jenis === 'PayrollHK') {
      let divisi = [];
      if (path === D.state.path) divisi = D.aktif('divisions');
      else {
        const lain = await D.muatBagianLain(path);
        divisi = (lain?.tabel?.divisions || []).filter((d) => (d.status || 'Aktif') === 'Aktif');
      }
      for (const d of divisi) {
        const c = el('input', { type: 'checkbox' });
        if (Array.isArray(aksesLama?.divisi) && aksesLama.divisi.map(Number).includes(Number(d.id))) c.checked = true;
        baris.centang.set(Number(d.id), { c, nama: d.nama_divisi });
      }
    }
    cakupan.push(baris);
  }

  const kotakCakupan = el('div', {}, cakupan.map((b) => el('div', {
    style: 'border:1px solid var(--garis-tipis);border-radius:8px;padding:.55rem .7rem;margin-bottom:.55rem',
  }, [
    el('label', { style: 'display:flex;gap:.45rem;align-items:center;font-size:.9rem' }, [
      b.cSemua, el('strong', { teks: b.label }),
      el('span.bantuan', { teks: b.jenis === 'PayrollHK' ? '— semua divisi' : '— seluruh bagian' }),
    ]),
    b.centang.size ? el('div', { style: 'display:flex;flex-wrap:wrap;gap:.7rem;margin:.4rem 0 0 1.6rem' },
      [...b.centang.values()].map(({ c, nama }) => el('label', {
        style: 'display:flex;gap:.3rem;align-items:center;font-size:.88rem',
      }, [c, nama]))) : null,
  ])));

  const centangHak = new Map();
  const kotakHak = el('div', {}, HAK.map(([k, label, ket]) => {
    const c = el('input', { type: 'checkbox' });
    if (ada?.hak?.[k]) c.checked = true;
    centangHak.set(k, c);
    return el('label', {
      style: 'display:flex;gap:.45rem;align-items:flex-start;padding:.2rem 0;font-size:.9rem',
    }, [c, el('span', {}, [el('strong', { teks: label }), el('br'), el('span.bantuan', { teks: ket })])]);
  }));

  const sesuaikanAdmin = () => {
    const a = inAdmin.checked;
    kotakCakupan.style.opacity = a ? '.45' : '';
    kotakHak.style.opacity = a ? '.45' : '';
    const semuaC = cakupan.flatMap((b) => [b.cSemua, ...[...b.centang.values()].map((x) => x.c)]);
    for (const c of [...semuaC, ...centangHak.values()]) c.disabled = a;
  };
  inAdmin.addEventListener('change', sesuaikanAdmin);
  sesuaikanAdmin();

  const simpan = async () => {
    const nama = inNama.value.trim();
    const salah = [];
    if (!nama) salah.push('Nama harus diisi.');

    const akses = {};
    for (const b of cakupan) {
      if (b.cSemua.checked) { akses[b.path] = { divisi: 'semua' }; continue; }
      const dipilih = [...b.centang.entries()].filter(([, x]) => x.c.checked).map(([idD]) => idD);
      if (dipilih.length) akses[b.path] = { divisi: dipilih };
    }
    if (!inAdmin.checked && !Object.keys(akses).length) {
      salah.push('Ceklis minimal satu bagian/divisi, atau jadikan admin.');
    }
    if (!ada && !inPin.value) salah.push('PIN harus diisi untuk pengguna baru.');
    // jangan sampai terkunci: daftar harus selalu punya minimal satu admin aktif
    const adaAdminLain = Object.entries(D.web().pengguna || {})
      .some(([k, u]) => k !== id && u.admin && u.aktif !== false);
    if (!adaAdminLain && !(inAdmin.checked && inAktif.checked)) {
      salah.push('Harus ada minimal satu akun Admin yang aktif. Buat akun Anda sendiri '
        + 'dengan centang "Admin" lebih dulu, baru tambahkan admin-admin divisi.');
    }
    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); return; }

    const pin = inPin.value ? await hashPin(inPin.value) : (ada?.pin || null);
    const kunci = id || `u${Date.now().toString(36)}`;
    D.setWeb((w) => {
      w.pengguna ||= {};
      w.pengguna[kunci] = {
        nama,
        pin,
        admin: inAdmin.checked,
        akses: inAdmin.checked ? {} : akses,
        hak: inAdmin.checked ? {} : Object.fromEntries(
          [...centangHak.entries()].map(([k, c]) => [k, c.checked])),
        aktif: inAktif.checked,
      };
    });
    p.tutup();
    pesan(`Pengguna ${nama} disimpan. Jangan lupa Simpan.`, 'sukses');
    saatSelesai();
  };

  const hapusOrang = async () => {
    const sisa = Object.entries(D.web().pengguna || {}).filter(([k]) => k !== id);
    if (sisa.length && !sisa.some(([, u]) => u.admin && u.aktif !== false)) {
      kosongkan(tempatGalat).append(kesalahan([
        'Tidak bisa dihapus: dia admin aktif terakhir. Jadikan orang lain admin dulu.']));
      return;
    }
    const lanjut = await tanya(`Hapus pengguna ${ada.nama}?`,
      'Baris yang pernah dia buat tidak ikut terhapus — namanya tetap tercatat di sana.',
      { ya: 'Hapus', bahaya: true });
    if (!lanjut) return;
    D.setWeb((w) => { delete w.pengguna[id]; });
    if (sessionStorage.getItem(KUNCI_SESI) === id) keluar();
    p.tutup();
    pesan(`Pengguna ${ada.nama} dihapus. Jangan lupa Simpan.`, 'sukses');
    saatSelesai();
  };

  const p = panel(ada ? `Ubah pengguna — ${ada.nama}` : 'Tambah pengguna', el('div', {}, [
    tempatGalat,
    isian('Nama *', inNama, { bantuan: 'Tulis sekalian perannya supaya gampang dikenali.' }),
    isian('PIN', inPin, {
      bantuan: ada ? 'Kosongkan kalau PIN-nya tidak diganti.' : 'Dipakai saat dia membuka situs.',
    }),
    el('label', { style: 'display:flex;gap:.45rem;align-items:center;margin:.6rem 0' },
      [inAdmin, el('strong', { teks: 'Admin — boleh semua bagian, semua divisi, semua hak' })]),
    el('label', { style: 'display:block;font-size:.85rem;font-weight:600;margin:.8rem 0 .3rem' },
      ['Boleh membuka & mengisi di mana saja (ceklis bagian / divisinya)']),
    kotakCakupan,
    el('label', { style: 'display:block;font-size:.85rem;font-weight:600;margin:.9rem 0 .3rem' },
      ['Boleh apa saja (berlaku di semua yang diceklis)']),
    kotakHak,
    el('label', { style: 'display:flex;gap:.45rem;align-items:center;margin-top:.8rem' },
      [inAktif, 'Aktif']),
    el('p.bantuan', { style: 'margin-top:.8rem', teks: 'Master data lain (karyawan, kegiatan, unit) '
      + 'hanya admin; master Blok bisa dipegang pemegang hak "Kelola blok & lahan".' }),
  ]), [
    ...(ada ? [el('button.tombol-samar', {
      type: 'button', teks: 'Hapus', onclick: hapusOrang,
    })] : []),
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan', onclick: simpan }),
  ]);
}

