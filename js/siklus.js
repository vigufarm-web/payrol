// siklus.js — umur tanaman pisang dihitung dari TANGGAL TANAM.
//
// Kebun pisang dipanen berulang dari rumpun yang sama. Siklusnya dihitung
// dalam MST (Minggu Setelah Tanam):
//
//   Indukan (R0) : minggu 1–52
//   R1           : minggu 53–91
//   R2           : minggu 92–130
//   R3           : minggu 131–169
//   lewat itu    : "R3+" — tidak dilanjutkan ke R4, karena biasanya
//                  kebunnya sudah dibongkar atau ditanam ulang.
//
// Berkas ini sengaja TANPA ketergantungan ke modul lain supaya bisa dipakai
// skema, halaman master, maupun laporan tanpa bikin lingkaran impor.

export const SIKLUS = [
  { kode: 'R0', label: 'Indukan (R0)', dari: 1, sampai: 52 },
  { kode: 'R1', label: 'R1', dari: 53, sampai: 91 },
  { kode: 'R2', label: 'R2', dari: 92, sampai: 130 },
  { kode: 'R3', label: 'R3', dari: 131, sampai: 169 },
];

const HARI = 86400000;

/** Tanggal hari ini (zona waktu setempat) dalam bentuk YYYY-MM-DD. */
export const hariIniIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);

/**
 * Umur dalam MINGGU SETELAH TANAM. Hari tanam = minggu ke-1 (bukan 0),
 * mengikuti cara hitung di lapangan.
 * Mengembalikan null kalau tanggalnya kosong/tidak sah, atau belum ditanam.
 */
export function mst(tanggalTanam, acuan = hariIniIso()) {
  if (!tanggalTanam || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalTanam)) return null;
  const tanam = Date.parse(`${tanggalTanam}T00:00:00Z`);
  const kini = Date.parse(`${acuan}T00:00:00Z`);
  if (Number.isNaN(tanam) || Number.isNaN(kini)) return null;
  if (kini < tanam) return null;                 // tanggal tanam di masa depan
  return Math.floor((kini - tanam) / (7 * HARI)) + 1;
}

/** Siklus pada umur tertentu. Lewat R3 mengembalikan kode 'R3+'. */
export function siklusDariMst(minggu) {
  if (minggu == null) return null;
  const s = SIKLUS.find((x) => minggu >= x.dari && minggu <= x.sampai);
  if (s) return { ...s, minggu };
  return { kode: 'R3+', label: 'lewat R3', dari: 170, sampai: null, minggu };
}

/** Siklus langsung dari tanggal tanam. */
export const siklusBlok = (tanggalTanam, acuan) => siklusDariMst(mst(tanggalTanam, acuan));

/**
 * Nama blok yang DITAMPILKAN: kode dasarnya ditambah siklus hasil hitungan.
 * Nama yang TERSIMPAN tidak ikut berubah — kalau tanggal tanamnya dibetulkan
 * atau dihapus, tampilannya ikut berubah sendiri tanpa menyentuh data.
 *
 *   dasar "A01" + tanam 2024-01-02  ->  "A01 (R2)"
 *   dasar "A01" tanpa tanggal tanam ->  "A01"
 */
export function namaBlokSiklus(namaDasar, tanggalTanam, acuan) {
  const dasar = String(namaDasar ?? '').trim();
  const s = siklusBlok(tanggalTanam, acuan);
  if (!s) return dasar;
  return s.kode === 'R0' ? `${dasar} (Indukan)` : `${dasar} (${s.kode})`;
}

/**
 * Buang akhiran siklus yang dulu diketik manual: "A01 (R1)" -> "A01".
 * Dipakai saat tanggal tanam mulai diisi, supaya siklusnya tidak tertulis
 * dua kali ("A01 (R1) (R2)").
 */
export function dasarNamaBlok(nama) {
  return String(nama ?? '').trim()
    .replace(/\s*\((?:R[0-9]\+?|Indukan(?:\s*\(R0\))?)\)\s*$/i, '')
    .trim();
}
