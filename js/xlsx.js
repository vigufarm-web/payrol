// xlsx.js — membaca berkas Excel (.xlsx) langsung di peramban, tanpa pustaka
// tambahan sama sekali.
//
// Berkas .xlsx sebenarnya sebuah ZIP berisi XML. Peramban modern sudah punya
// DecompressionStream('deflate-raw') untuk membuka isi ZIP, dan DOMParser untuk
// membaca XML-nya — jadi tidak perlu memuat pustaka 400 KB hanya untuk ini.
//
// Yang dibaca: lembar pertama saja, sebagai tabel teks. Cukup untuk template
// input harian.

// ---------------------------------------------------------------- ZIP
const dv = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

/** Cari End Of Central Directory, lalu daftarkan isi ZIP. */
function daftarIsiZip(u8) {
  const v = dv(u8);
  let eocd = -1;
  // EOCD ada di akhir berkas; komentar maksimal 65535 byte
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Berkas ini bukan Excel (.xlsx) yang bisa dibaca.');

  const jumlah = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const isi = new Map();

  for (let i = 0; i < jumlah; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metode = v.getUint16(p + 10, true);
    const ukuranPadat = v.getUint32(p + 20, true);
    const ukuranAsli = v.getUint32(p + 24, true);
    const panjangNama = v.getUint16(p + 28, true);
    const panjangExtra = v.getUint16(p + 30, true);
    const panjangKomentar = v.getUint16(p + 32, true);
    const offsetLokal = v.getUint32(p + 42, true);
    const nama = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + panjangNama));
    isi.set(nama, { metode, ukuranPadat, ukuranAsli, offsetLokal });
    p += 46 + panjangNama + panjangExtra + panjangKomentar;
  }
  return isi;
}

async function bacaBerkasZip(u8, daftar, nama) {
  const e = daftar.get(nama);
  if (!e) return null;
  const v = dv(u8);
  if (v.getUint32(e.offsetLokal, true) !== 0x04034b50) return null;
  const panjangNama = v.getUint16(e.offsetLokal + 26, true);
  const panjangExtra = v.getUint16(e.offsetLokal + 28, true);
  const mulai = e.offsetLokal + 30 + panjangNama + panjangExtra;
  const potong = u8.subarray(mulai, mulai + e.ukuranPadat);

  if (e.metode === 0) return new TextDecoder().decode(potong);   // tidak dipadatkan
  if (e.metode !== 8) throw new Error('Isi berkas Excel memakai pemadatan yang tidak dikenal.');
  const aliran = new Blob([potong]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(aliran).arrayBuffer());
}

// --------------------------------------------------------------- Excel
const KOLOM = (ref) => {
  // "BC12" -> indeks kolom 0-basis
  let n = 0;
  for (const c of ref) {
    const k = c.charCodeAt(0);
    if (k < 65 || k > 90) break;
    n = n * 26 + (k - 64);
  }
  return n - 1;
};

/** Angka seri tanggal Excel -> "YYYY-MM-DD" (epoch 30 Des 1899). */
function tanggalDariSeri(n) {
  const ms = Math.round((Number(n) - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Gaya mana saja yang berformat tanggal (dipakai untuk mengubah seri jadi tanggal). */
function gayaTanggal(xmlGaya) {
  const tanggal = new Set();
  if (!xmlGaya) return tanggal;
  const doc = new DOMParser().parseFromString(xmlGaya, 'application/xml');
  const bawaanTanggal = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57, 58]);
  const format = new Map();
  for (const n of doc.getElementsByTagName('numFmt')) {
    const kode = n.getAttribute('formatCode') || '';
    format.set(Number(n.getAttribute('numFmtId')),
      /[dmyh]/i.test(kode.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '')));
  }
  const xfs = doc.getElementsByTagName('cellXfs')[0];
  if (!xfs) return tanggal;
  [...xfs.getElementsByTagName('xf')].forEach((xf, i) => {
    const id = Number(xf.getAttribute('numFmtId') || 0);
    if (bawaanTanggal.has(id) || format.get(id)) tanggal.add(i);
  });
  return tanggal;
}

/**
 * Baca .xlsx -> { judul: [...], baris: [{kolom: nilai}], jumlahBaris }
 * Baris pertama yang terisi dianggap judul kolom.
 */
export async function bacaExcel(berkas) {
  const u8 = new Uint8Array(await berkas.arrayBuffer());
  const daftar = daftarIsiZip(u8);

  // lembar pertama menurut workbook.xml.rels; kalau gagal, pakai sheet1.xml
  let namaLembar = 'xl/worksheets/sheet1.xml';
  if (!daftar.has(namaLembar)) {
    const cari = [...daftar.keys()].filter((n) => /^xl\/worksheets\/.*\.xml$/.test(n)).sort();
    if (!cari.length) throw new Error('Berkas Excel ini tidak berisi lembar kerja.');
    namaLembar = cari[0];
  }

  const [xmlLembar, xmlTeks, xmlGaya] = await Promise.all([
    bacaBerkasZip(u8, daftar, namaLembar),
    bacaBerkasZip(u8, daftar, 'xl/sharedStrings.xml'),
    bacaBerkasZip(u8, daftar, 'xl/styles.xml'),
  ]);

  const teksBersama = [];
  if (xmlTeks) {
    const doc = new DOMParser().parseFromString(xmlTeks, 'application/xml');
    for (const si of doc.getElementsByTagName('si')) {
      // gabungkan semua <t>, karena satu sel bisa terbagi beberapa potongan
      teksBersama.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
    }
  }
  const setGayaTanggal = gayaTanggal(xmlGaya);

  const doc = new DOMParser().parseFromString(xmlLembar, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Isi berkas Excel tidak terbaca.');
  }

  const barisMentah = [];
  for (const row of doc.getElementsByTagName('row')) {
    const sel = [];
    for (const c of row.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') || '';
      const idx = KOLOM(ref);
      if (idx < 0) continue;
      const jenis = c.getAttribute('t');
      let nilai = '';
      if (jenis === 'inlineStr') {
        nilai = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('');
      } else {
        const v = c.getElementsByTagName('v')[0];
        const isiV = v ? v.textContent : '';
        if (jenis === 's') nilai = teksBersama[Number(isiV)] ?? '';
        else if (jenis === 'b') nilai = isiV === '1' ? 'TRUE' : 'FALSE';
        else if (isiV !== '' && setGayaTanggal.has(Number(c.getAttribute('s') || -1))) {
          nilai = tanggalDariSeri(isiV);
        } else nilai = isiV;
      }
      sel[idx] = String(nilai).trim();
    }
    barisMentah.push(sel);
  }

  // baris judul = baris pertama yang punya minimal 2 sel terisi
  let iJudul = barisMentah.findIndex((s) => s.filter((x) => x !== undefined && x !== '').length >= 2);
  if (iJudul < 0) throw new Error('Berkas Excel ini kosong.');
  const judul = (barisMentah[iJudul] || []).map((x) => (x || '').trim());

  const baris = [];
  for (let i = iJudul + 1; i < barisMentah.length; i++) {
    const sel = barisMentah[i] || [];
    if (!sel.some((x) => x !== undefined && String(x).trim() !== '')) continue;   // baris kosong
    const obj = { _baris: i + 1 };   // nomor baris seperti di Excel
    judul.forEach((j, k) => { if (j) obj[j] = sel[k] === undefined ? '' : String(sel[k]).trim(); });
    baris.push(obj);
  }

  return { judul: judul.filter(Boolean), baris, jumlahBaris: baris.length };
}

/** Cek dukungan peramban sebelum menawarkan fitur impor. */
export const bisaBacaExcel = () => typeof DecompressionStream !== 'undefined';
