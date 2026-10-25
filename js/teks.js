// teks.js — perapian teks bebas agar laporan tidak pecah karena spasi/ejaan.

export const rapikanKeterangan = (nilai) => String(nilai ?? '')
  .replace(/[\s\u00a0]+/g, ' ')
  .trim();

export const kunciKeterangan = (nilai) => rapikanKeterangan(nilai)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('id-ID')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Angka adalah isi, bukan ejaan. Dua keterangan hanya boleh dianggap typo
 * bila urutan angkanya persis sama (7x tidak boleh disarankan menjadi 8x,
 * 0,17 ha tidak boleh menjadi 0,13 ha, dan 2 jam bukan 1 jam). */
export const angkaKeterangan = (nilai) => (rapikanKeterangan(nilai).match(/\d+(?:[.,]\d+)?/g) || [])
  .map((x) => x.replace(',', '.'));

/** Jarak edit dengan batas kecil. Nilai di atas batas dikembalikan sebagai batas + 1. */
export function jarakKeterangan(a, b, batas = 2) {
  const x = kunciKeterangan(a);
  const y = kunciKeterangan(b);
  if (x === y) return 0;
  if (Math.abs(x.length - y.length) > batas) return batas + 1;
  let sebelum = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const kini = [i];
    let terkecil = kini[0];
    for (let j = 1; j <= y.length; j++) {
      const biaya = x[i - 1] === y[j - 1] ? 0 : 1;
      kini[j] = Math.min(kini[j - 1] + 1, sebelum[j] + 1, sebelum[j - 1] + biaya);
      terkecil = Math.min(terkecil, kini[j]);
    }
    if (terkecil > batas) return batas + 1;
    sebelum = kini;
  }
  return sebelum[y.length] > batas ? batas + 1 : sebelum[y.length];
}

/**
 * Cari ejaan lama yang paling masuk akal.
 * - sama: beda kapital, spasi, atau tanda baca; aman disamakan otomatis.
 * - mirip: kemungkinan typo 1–2 karakter; harus dikonfirmasi pengguna.
 */
export function cariKeteranganSerupa(nilai, daftar) {
  const bersih = rapikanKeterangan(nilai);
  const kunci = kunciKeterangan(bersih);
  if (!kunci) return null;

  const urut = [...daftar]
    .map((x) => ({ nilai: rapikanKeterangan(x.nilai), jumlah: Number(x.jumlah) || 0 }))
    .filter((x) => x.nilai)
    .sort((a, b) => b.jumlah - a.jumlah || a.nilai.localeCompare(b.nilai, 'id'));
  const sama = urut.find((x) => kunciKeterangan(x.nilai) === kunci);
  if (sama) return { jenis: 'sama', nilai: sama.nilai, jarak: 0 };

  if (kunci.length < 5) return null;
  const batas = kunci.length >= 12 ? 2 : 1;
  const kata = kunci.split(' ').length;
  const awal = kunci[0];
  const calon = urut
    .filter((x) => {
      const k = kunciKeterangan(x.nilai);
      const angkaAsli = angkaKeterangan(bersih);
      const angkaCalon = angkaKeterangan(x.nilai);
      return k[0] === awal && k.split(' ').length === kata
        && angkaAsli.length === angkaCalon.length
        && angkaAsli.every((n, i) => n === angkaCalon[i]);
    })
    .map((x) => ({ ...x, jarak: jarakKeterangan(kunci, x.nilai, batas) }))
    .filter((x) => x.jarak <= batas)
    .sort((a, b) => a.jarak - b.jarak || b.jumlah - a.jumlah);
  if (!calon.length) return null;
  if (calon[1] && calon[1].jarak === calon[0].jarak && calon[1].jumlah === calon[0].jumlah) return null;
  return { jenis: 'mirip', nilai: calon[0].nilai, jarak: calon[0].jarak };
}
