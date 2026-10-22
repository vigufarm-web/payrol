// siklus.js — umur tanaman pisang dihitung dari TANGGAL TANAM.
//
// Kode dan batasnya diambil dari berkas Monitoring Kebun Pisang milik kebun
// sendiri (lembar "Daftar": PC, R1, R2, R3, R4), bukan istilah umum.
// PC = Plant Crop, yaitu tanaman indukan. Sesudahnya ratoon R1..R4.
//
//   PC  : minggu 0–52     (tahun pertama)
//   R1  : minggu 53–91
//   R2  : minggu 92–130
//   R3  : minggu 131–169
//   R4  : minggu 170 ke atas
//
// BATAS INI DITENTUKAN KEBUN, BUKAN DITURUNKAN DARI DATA. Perlu dicatat:
// 8 blok (A02, A03, A04, A06, A07, A08, B01, B02) umurnya 88–91 minggu dan
// di berkas Monitoring Kebun Pisang statusnya ditulis tangan "R2", tapi
// dengan batas 53–91 situs menampilkannya "R1". Jadi untuk ke-8 blok itu
// situs dan berkas Monitoring memang beda, dan itu disengaja — sudah
// dipilih kebun pada 22 Okt 2026. Kalau suatu saat mau dibikin sama,
// ubah batas R1 jadi 53–87 dan R2 jadi 88–122; uji_siklus_blok.mjs
// menyimpan daftar ke-8 blok itu supaya perbedaannya tidak hilang diam-diam.
//
// Umur dihitung SAMA PERSIS dengan rumus di berkas kebun:
//     =INT((TODAY()-TanggalTanam)/7)
// jadi angka minggu di situs selalu sama dengan angka di Excel. Hari tanam
// = minggu 0 (bukan 1).
//
// Berkas ini sengaja TANPA ketergantungan ke modul lain supaya bisa dipakai
// skema, halaman master, maupun laporan tanpa bikin lingkaran impor.

export const SIKLUS = [
  { kode: 'PC', label: 'PC (indukan)', dari: 0, sampai: 52 },
  { kode: 'R1', label: 'R1', dari: 53, sampai: 91 },
  { kode: 'R2', label: 'R2', dari: 92, sampai: 130 },
  { kode: 'R3', label: 'R3', dari: 131, sampai: 169 },
  { kode: 'R4', label: 'R4', dari: 170, sampai: null },
];

/** Kode siklus yang boleh dipilih tangan kalau hitungan otomatis tidak pas. */
export const KODE_SIKLUS = SIKLUS.map((x) => x.kode);

const HARI = 86400000;

/** Tanggal hari ini (zona waktu setempat) dalam bentuk YYYY-MM-DD. */
export const hariIniIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);

/**
 * Umur dalam MINGGU SETELAH TANAM, memakai rumus berkas kebun:
 * INT((acuan - tanggalTanam) / 7). Hari tanam = minggu 0.
 * Mengembalikan null kalau tanggalnya kosong/tidak sah, atau belum ditanam.
 */
export function mst(tanggalTanam, acuan = hariIniIso()) {
  if (!tanggalTanam || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalTanam)) return null;
  const tanam = Date.parse(`${tanggalTanam}T00:00:00Z`);
  const kini = Date.parse(`${acuan}T00:00:00Z`);
  if (Number.isNaN(tanam) || Number.isNaN(kini)) return null;
  if (kini < tanam) return null;                 // tanggal tanam di masa depan
  return Math.floor((kini - tanam) / (7 * HARI));
}

/** Siklus pada umur tertentu. R4 tidak punya batas atas. */
export function siklusDariMst(minggu) {
  if (minggu == null) return null;
  const s = SIKLUS.find((x) => minggu >= x.dari && (x.sampai == null || minggu <= x.sampai));
  return s ? { ...s, minggu } : null;
}

/** Siklus langsung dari tanggal tanam. */
export const siklusBlok = (tanggalTanam, acuan) => siklusDariMst(mst(tanggalTanam, acuan));

/**
 * Nama blok yang DITAMPILKAN: kode dasarnya ditambah siklus.
 *
 * `paksa` dipakai kalau siklus blok itu diisi tangan — kebun kadang tahu
 * blok sudah masuk ratoon berikutnya lebih cepat atau lebih lambat dari
 * hitungan minggu, dan yang di lapangan itu yang benar.
 *
 * Nama yang TERSIMPAN tidak ikut berubah — kalau tanggal tanamnya dibetulkan
 * atau dihapus, tampilannya ikut berubah sendiri tanpa menyentuh data.
 *
 *   dasar "A01" + tanam 2025-05-22  ->  "A01 (R1)"
 *   dasar "A01" tanpa tanggal tanam ->  "A01"
 */
export function namaBlokSiklus(namaDasar, tanggalTanam, acuan, paksa = null) {
  const dasar = String(namaDasar ?? '').trim();
  if (paksa && KODE_SIKLUS.includes(paksa)) return `${dasar} (${paksa})`;
  const s = siklusBlok(tanggalTanam, acuan);
  return s ? `${dasar} (${s.kode})` : dasar;
}

/**
 * Buang akhiran siklus yang dulu diketik manual: "A01 (R1)" -> "A01".
 * Dipakai saat tanggal tanam mulai diisi, supaya siklusnya tidak tertulis
 * dua kali ("A01 (R1) (R2)"). Istilah lama (R0/Indukan) ikut dibuang supaya
 * data yang sudah ada tetap kebaca.
 */
export function dasarNamaBlok(nama) {
  return String(nama ?? '').trim()
    .replace(/\s*\((?:PC|R[0-9]\+?|Indukan(?:\s*\(R0\))?)\)\s*$/i, '')
    .trim();
}
