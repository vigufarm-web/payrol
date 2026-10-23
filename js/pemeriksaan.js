// pemeriksaan.js — halaman mutu data dan perbaikan aman.

import * as D from './data.js';
import { periksaData } from './kualitas-data.js';
import { el, tabel, tanya, pesan, angka } from './ui.js';

const labelTingkat = { galat: 'Harus diperiksa', peringatan: 'Perlu ditinjau', info: 'Bisa dirapikan' };

export function halamanPemeriksaan({ gambar, bisaEdit }) {
  const hasil = periksaData(D.state.data);
  const wadah = el('section');

  const terapkan = (daftar) => {
    let n = 0;
    for (const p of daftar) {
      D.ubah(p.tabel, p.id, p.tambalan);
      n++;
    }
    pesan(`${n} baris diperbaiki. Periksa hasilnya lalu Simpan ke GitHub.`, 'sukses', 8);
    gambar();
  };

  const perbaikiAman = async () => {
    if (!hasil.perbaikanAman.length) return;
    const lanjut = await tanya('Terapkan perbaikan aman?', el('div', {}, [
      el('p', { teks: `${hasil.perbaikanAman.length} baris akan dirapikan: spasi/ejaan identik disatukan dan satuan kosong dilengkapi.` }),
      el('p.bantuan', { teks: 'Nilai uang, HK, transaksi ganda, dan referensi rusak tidak diubah otomatis.' }),
    ]), { ya: 'Perbaiki', tidak: 'Batal' });
    if (lanjut) terapkan(hasil.perbaikanAman);
  };

  wadah.append(el('div.lembar', {}, [
    el('div.lembar-kepala', {}, [
      el('h2', { teks: 'Pemeriksaan data' }),
      hasil.perbaikanAman.length && bisaEdit()
        ? el('button.tombol-utama.tombol-kecil', {
          type: 'button', teks: `Perbaiki aman (${hasil.perbaikanAman.length})`, onclick: perbaikiAman,
        }) : null,
    ]),
    el('div.lembar-isi', {}, [
      el('dl.angka-utama', {}, [
        el('div', {}, [el('dt', { teks: 'Harus diperiksa' }), el('dd', { teks: angka(hasil.ringkasan.galat) })]),
        el('div', {}, [el('dt', { teks: 'Perlu ditinjau' }), el('dd', { teks: angka(hasil.ringkasan.peringatan) })]),
        el('div', {}, [el('dt', { teks: 'Perbaikan aman' }), el('dd', { teks: angka(hasil.ringkasan.otomatis) })]),
      ]),
      el('p.bantuan', {
        teks: 'Pemeriksaan mencakup satuan kosong, typo/keterangan kembar, referensi rusak, tarif nol, '
          + 'HK berlebih, nilai hitungan berbeda, transaksi ganda, persetujuan terlambat, dan meter alat.',
      }),
      hasil.masalah.length
        ? tabel([
          { l: 'Status', nilai: (r) => labelTingkat[r.tingkat] || r.tingkat },
          { l: 'Jenis', k: 'jenis' },
          { l: 'Lokasi', nilai: (r) => r.tabel ? `${r.tabel}${r.id != null ? ` #${r.id}` : ''}` : '–' },
          { l: 'Rincian', k: 'detail' },
          {
            l: '', nilai: (r) => (!r.otomatis && r.perbaikan?.length && bisaEdit())
              ? el('button.tombol-samar.tombol-kecil', {
                type: 'button', teks: r.labelPerbaikan || 'Terapkan',
                onclick: async (ev) => {
                  ev.stopPropagation();
                  const lanjut = await tanya('Terapkan perbaikan?', r.detail,
                    { ya: 'Terapkan', tidak: 'Batal' });
                  if (lanjut) terapkan(r.perbaikan);
                },
              }) : null,
          },
        ], hasil.masalah, { kosong: 'Tidak ada masalah terdeteksi.' })
        : el('p.kosong', { teks: 'Data bersih. Tidak ada masalah terdeteksi.' }),
      el('p.bantuan', {
        teks: 'Transaksi ganda dan perbedaan nilai tidak diperbaiki otomatis karena perlu keputusan manusia.',
      }),
    ]),
  ]));
  return wadah;
}
