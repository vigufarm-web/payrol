// xlsx-tulis.js — penulis berkas Excel (.xlsx) murni di peramban, tanpa
// pustaka luar. Mendukung banyak sheet, sel gabung (merge), lebar kolom,
// huruf tebal, warna kepala tabel, garis tepi, dan format angka ribuan.
//
// Pemakaian:
//   await unduhXlsx('Rekap.xlsx', [
//     { nama: 'Sheet1', lebar: [6, 28, 14], merges: ['A1:C1'],
//       baris: [[S.judul('PT ...')], [S.kepala('No'), S.kepala('Nama')], ...] },
//   ]);

// ------------------------------------------------------------- gaya sel
// Nomor gaya harus cocok dengan urutan <xf> di styles.xml di bawah.
export const GAYA = {
  biasa: 0, judul: 1, sub: 2, kecil: 3,
  kepala: 4, teks: 5, uang: 6, angka: 7,
  totalTeks: 8, totalUang: 9, totalAngka: 10,
  tebal: 11, strip: 12,
  pita: 13,        // pita judul bagian (latar hijau tua, huruf putih)
  tanggal: 14,     // tanggal dd/mm/yyyy
  isianUang: 15,   // sel kosong siap diisi tangan (latar kuning muda)
  isianTeks: 16,
  catatan: 17,     // keterangan kecil miring
};

// pembuat sel praktis
export const S = {
  judul: (v) => ({ v, g: GAYA.judul }),
  sub: (v) => ({ v, g: GAYA.sub }),
  kecil: (v) => ({ v, g: GAYA.kecil }),
  kepala: (v) => ({ v, g: GAYA.kepala }),
  teks: (v) => ({ v: v ?? '', g: GAYA.teks }),
  // angka rupiah: 0/null ditulis "-" seperti kebiasaan rekap manual
  uang: (v) => (Number(v) ? { v: Number(v), g: GAYA.uang } : { v: '-', g: GAYA.strip }),
  angka: (v) => (Number(v) ? { v: Math.round(Number(v) * 100) / 100, g: GAYA.angka } : { v: '-', g: GAYA.strip }),
  uangT: (v) => ({ v: Math.round(Number(v) || 0), g: GAYA.totalUang }),
  angkaT: (v) => ({ v: Math.round((Number(v) || 0) * 100) / 100, g: GAYA.totalAngka }),
  teksT: (v) => ({ v: v ?? '', g: GAYA.totalTeks }),
  tebal: (v) => ({ v: v ?? '', g: GAYA.tebal }),
  kosong: () => ({ v: '', g: GAYA.teks }),
  pita: (v) => ({ v, g: GAYA.pita }),
  tanggal: (v) => ({ v: v ?? '', g: GAYA.tanggal }),
  isianUang: () => ({ v: '', g: GAYA.isianUang }),
  isianTeks: () => ({ v: '', g: GAYA.isianTeks }),
  catatan: (v) => ({ v, g: GAYA.catatan }),
  // rumus Excel (dihitung sendiri oleh Excel saat dibuka)
  rumus: (f, gaya = GAYA.uang) => ({ f, g: gaya }),
  rumusT: (f) => ({ f, g: GAYA.totalUang }),
};

const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function kolomHuruf(n) {        // 1 -> A, 27 -> AA
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

// ------------------------------------------------------------ XML sheet
function sheetXml({ lebar = [], merges = [], baris = [], bekukan = 0, bekuKolom = 0, filter = null }) {
  const kol = lebar.length
    ? `<cols>${lebar.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const isi = baris.map((sel, r) => {
    const kolom = (sel || []).map((c, i) => {
      if (c == null) return '';
      const ref = `${kolomHuruf(i + 1)}${r + 1}`;
      const g = c.g ? ` s="${c.g}"` : '';
      if (c.f) return `<c r="${ref}"${g}><f>${esc(String(c.f).replace(/^=/, ''))}</f></c>`;
      if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${g}><v>${c.v}</v></c>`;
      if (c.v === '' || c.v == null) return `<c r="${ref}"${g}/>`;
      return `<c r="${ref}"${g} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${kolom}</row>`;
  }).join('');
  const gab = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  const beku = (bekukan || bekuKolom)
    ? `<sheetViews><sheetView workbookViewId="0"><pane ${bekuKolom ? `xSplit="${bekuKolom}" ` : ''}`
      + `${bekukan ? `ySplit="${bekukan}" ` : ''}`
      + `topLeftCell="${kolomHuruf(bekuKolom + 1)}${bekukan + 1}" `
      + `activePane="${bekuKolom && bekukan ? 'bottomRight' : bekuKolom ? 'topRight' : 'bottomLeft'}" `
      + 'state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const saring = filter ? `<autoFilter ref="${filter}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${beku}${kol}<sheetData>${isi}</sheetData>${saring}${gab}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.0#"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="6"><font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><i/><sz val="9"/><color rgb="FF666666"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDEAE0"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F6F3"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F5132"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF8DC"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="18">
<xf/>
<xf fontId="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf fontId="3" applyFont="1"/>
<xf fontId="0" applyFont="1"/>
<xf fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf fontId="2" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="3" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="2" fillId="3" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf fontId="2" applyFont="1"/>
<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf fontId="4" fillId="4" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="166" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fillId="5" borderId="1" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf fillId="5" borderId="1" applyFill="1" applyBorder="1"/>
<xf fontId="5" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// --------------------------------------------------------------- zip
const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = TABEL_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

async function deflate(b) {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(b); w.close();
  const potongan = [];
  const rd = cs.readable.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; potongan.push(value); }
  const n = potongan.reduce((a, p) => a + p.length, 0);
  const keluar = new Uint8Array(n);
  let o = 0;
  for (const p of potongan) { keluar.set(p, o); o += p.length; }
  return keluar;
}

async function buatZip(berkas) {   // berkas: [{ nama, isi: Uint8Array }]
  const bagian = []; const pusat = []; let offset = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of berkas) {
    const nama = new TextEncoder().encode(f.nama);
    const crc = crc32(f.isi);
    const padat = await deflate(f.isi);
    const lokal = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(padat.length), ...u32(f.isi.length), ...u16(nama.length), ...u16(0),
      ...nama]);
    bagian.push(lokal, padat);
    pusat.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(padat.length), ...u32(f.isi.length), ...u16(nama.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nama]));
    offset += lokal.length + padat.length;
  }
  const dirMulai = offset;
  const dirIsi = pusat.reduce((a, p) => a + p.length, 0);
  const akhir = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(berkas.length), ...u16(berkas.length),
    ...u32(dirIsi), ...u32(dirMulai), ...u16(0)]);
  const total = offset + dirIsi + akhir.length;
  const keluar = new Uint8Array(total);
  let o = 0;
  for (const p of [...bagian, ...pusat, akhir]) { keluar.set(p, o); o += p.length; }
  return keluar;
}

// ------------------------------------------------------------- utama
export async function buatXlsx(sheets) {
  const enc = (s) => new TextEncoder().encode(s);
  const daftarSheet = sheets.map((s, i) => ({ ...s, id: i + 1 }));
  const berkas = [
    { nama: '[Content_Types].xml', isi: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${daftarSheet.map((s) => `<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`) },
    { nama: '_rels/.rels', isi: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`) },
    { nama: 'xl/workbook.xml', isi: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${daftarSheet.map((s) => `<sheet name="${esc(s.nama)}" sheetId="${s.id}" r:id="rIdS${s.id}"/>`).join('')}</sheets>
</workbook>`) },
    { nama: 'xl/_rels/workbook.xml.rels', isi: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${daftarSheet.map((s) => `<Relationship Id="rIdS${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join('\n')}
<Relationship Id="rIdStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`) },
    { nama: 'xl/styles.xml', isi: enc(STYLES) },
    ...daftarSheet.map((s) => ({ nama: `xl/worksheets/sheet${s.id}.xml`, isi: enc(sheetXml(s)) })),
  ];
  return buatZip(berkas);
}

export async function unduhXlsx(namaFile, sheets) {
  const isi = await buatXlsx(sheets);
  const url = URL.createObjectURL(new Blob([isi], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = namaFile;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
