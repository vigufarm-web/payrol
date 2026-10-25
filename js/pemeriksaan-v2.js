// pemeriksaan-v2.js — mutu data dengan saringan, halaman, pratinjau, dan undo.
import * as D from './data.js';
import { periksaData } from './kualitas-data.js';
import { el, tabel, tanya, pesan, angka, kosongkan, pilihan } from './ui.js';

const labelTingkat = { galat: 'Harus diperiksa', peringatan: 'Perlu ditinjau', info: 'Bisa dirapikan' };
const PER_HALAMAN = 50;
const ruteTabel = { daily_payroll: 'hk', borongan_transactions: 'borongan', lembur_transactions: 'lembur',
  premi_transactions: 'lembur', work_logs: 'log', fuel_logs: 'solar', service_logs: 'servis',
  activities: 'master/activities', job_types: 'master/job_types', wage_components: 'master/wage_components' };

export function halamanPemeriksaan({ bisaEdit, periode }) {
  let hasil = periksaData(D.state.data);
  let terakhirDiterapkan = [];
  const saring = { tingkat: 'semua', jenis: 'semua', cari: '', halaman: 1 };
  const wadah = el('section');
  const tempatIsi = el('div');
  const snapshot = (daftar) => daftar.map((p) => {
    const baris = D.cari(p.tabel, p.id) || {};
    return { tabel: p.tabel, id: p.id,
      tambalan: Object.fromEntries(Object.keys(p.tambalan).map((k) => [k, baris[k]])) };
  });
  const terapkan = (daftar) => {
    terakhirDiterapkan = snapshot(daftar);
    for (const p of daftar) D.ubah(p.tabel, p.id, p.tambalan);
    hasil = periksaData(D.state.data);
    pesan(`${daftar.length} baris diperbaiki. Anda masih bisa membatalkan sebelum menyimpan.`, 'sukses', 8);
    gambarIsi();
  };
  const batalkanTerakhir = () => {
    if (!terakhirDiterapkan.length) return;
    const kembali = snapshot(terakhirDiterapkan);
    for (const p of terakhirDiterapkan) D.ubah(p.tabel, p.id, p.tambalan);
    terakhirDiterapkan = kembali;
    hasil = periksaData(D.state.data);
    pesan('Perbaikan terakhir dibatalkan.', 'sukses', 6);
    gambarIsi();
  };
  const perbaikiAman = async () => {
    if (!hasil.perbaikanAman.length) return;
    const contoh = hasil.masalah.filter((x) => x.otomatis).slice(0, 8);
    const lanjut = await tanya('Pratinjau perbaikan aman', el('div', {}, [
      el('p', { teks: `${hasil.perbaikanAman.length} baris akan dirapikan. Berikut contoh perubahan:` }),
      el('ul', {}, contoh.map((x) => el('li', { teks: `${x.tabel} #${x.id}: ${x.detail}` }))),
      hasil.perbaikanAman.length > contoh.length
        ? el('p.bantuan', { teks: `…dan ${hasil.perbaikanAman.length - contoh.length} baris lainnya.` }) : null,
      el('p.bantuan', { teks: 'Nilai uang, HK, transaksi ganda, dan referensi rusak tidak diubah otomatis.' }),
    ]), { ya: 'Terapkan', tidak: 'Batal' });
    if (lanjut) terapkan(hasil.perbaikanAman);
  };
  const bukaMasalah = (r) => {
    const tujuan = ruteTabel[r.tabel];
    if (!tujuan) return;
    const baris = r.id != null ? D.cari(r.tabel, r.id) : null;
    const tanggal = r.tanggal || baris?.tanggal;
    if (tanggal) {
      const [tahun, bulan] = tanggal.split('-').map(Number);
      periode?.set(bulan, tahun);
    }
    location.hash = `#/${tujuan}`;
  };
  const gambarIsi = () => {
    kosongkan(tempatIsi);
    const jenis = [...new Set(hasil.masalah.map((x) => x.jenis))].sort((a, b) => a.localeCompare(b, 'id'));
    let tampil = hasil.masalah.filter((x) => saring.tingkat === 'semua' || x.tingkat === saring.tingkat)
      .filter((x) => saring.jenis === 'semua' || x.jenis === saring.jenis);
    const q = saring.cari.toLocaleLowerCase('id');
    if (q) tampil = tampil.filter((x) => `${x.jenis} ${x.tabel} ${x.id ?? ''} ${x.detail}`.toLocaleLowerCase('id').includes(q));
    const jumlahHalaman = Math.max(1, Math.ceil(tampil.length / PER_HALAMAN));
    saring.halaman = Math.min(saring.halaman, jumlahHalaman);
    const halaman = tampil.slice((saring.halaman - 1) * PER_HALAMAN, saring.halaman * PER_HALAMAN);
    const tingkat = pilihan([{ nilai: 'semua', label: 'Semua status' }, { nilai: 'galat', label: 'Harus diperiksa' },
      { nilai: 'peringatan', label: 'Perlu ditinjau' }, { nilai: 'info', label: 'Bisa dirapikan' }], saring.tingkat,
    { kosongLabel: null, saatUbah: (e) => { saring.tingkat = e.target.value; saring.halaman = 1; gambarIsi(); } });
    const pilihJenis = pilihan([{ nilai: 'semua', label: 'Semua jenis' }, ...jenis.map((x) => ({ nilai: x, label: x }))],
      saring.jenis, { kosongLabel: null, saatUbah: (e) => { saring.jenis = e.target.value; saring.halaman = 1; gambarIsi(); } });
    const cari = el('input', { type: 'search', placeholder: 'Cari rincian, tabel, atau ID…', nilai: saring.cari,
      onchange: (e) => { saring.cari = e.target.value; saring.halaman = 1; gambarIsi(); } });
    tempatIsi.append(el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [el('h2', { teks: 'Pemeriksaan data' }),
        hasil.perbaikanAman.length && bisaEdit() ? el('button.tombol-utama.tombol-kecil', {
          type: 'button', teks: `Pratinjau & perbaiki (${hasil.perbaikanAman.length})`, onclick: perbaikiAman }) : null,
        terakhirDiterapkan.length ? el('button.tombol-samar.tombol-kecil', {
          type: 'button', teks: 'Batalkan perbaikan terakhir', onclick: batalkanTerakhir }) : null]),
      el('div.lembar-isi', {}, [
        el('dl.angka-utama', {}, [
          el('div', {}, [el('dt', { teks: 'Harus diperiksa' }), el('dd', { teks: angka(hasil.ringkasan.galat) })]),
          el('div', {}, [el('dt', { teks: 'Perlu ditinjau' }), el('dd', { teks: angka(hasil.ringkasan.peringatan) })]),
          el('div', {}, [el('dt', { teks: 'Perbaikan aman' }), el('dd', { teks: angka(hasil.ringkasan.otomatis) })])]),
        el('div.form-baris', {}, [tingkat, pilihJenis, cari]),
        el('p.bantuan', { teks: `Menampilkan ${halaman.length} dari ${tampil.length} hasil tersaring. Maksimal ${PER_HALAMAN} per halaman agar layar tetap ringan.` }),
        halaman.length ? tabel([
          { l: 'Status', nilai: (r) => labelTingkat[r.tingkat] || r.tingkat }, { l: 'Jenis', k: 'jenis' },
          { l: 'Lokasi', nilai: (r) => r.tabel ? `${r.tabel}${r.id != null ? ` #${r.id}` : ''}` : '–' },
          { l: 'Rincian', k: 'detail' },
          { l: '', nilai: (r) => el('span', { style: 'display:flex;gap:.35rem;flex-wrap:wrap' }, [
            ruteTabel[r.tabel] ? el('button.tombol-samar.tombol-kecil', { type: 'button', teks: 'Buka halaman',
              onclick: (ev) => { ev.stopPropagation(); bukaMasalah(r); } }) : null,
            (!r.otomatis && r.perbaikan?.length && bisaEdit()) ? el('button.tombol-utama.tombol-kecil', {
              type: 'button', teks: r.labelPerbaikan || 'Terapkan', onclick: async (ev) => {
                ev.stopPropagation();
                if (await tanya('Terapkan perbaikan?', r.detail, { ya: 'Terapkan', tidak: 'Batal' })) terapkan(r.perbaikan);
              } }) : null]) },
        ], halaman, { kosong: 'Tidak ada masalah terdeteksi.' })
          : el('p.kosong', { teks: hasil.masalah.length ? 'Tidak ada hasil yang cocok dengan saringan.' : 'Data bersih. Tidak ada masalah terdeteksi.' }),
        tampil.length > PER_HALAMAN ? el('div.dialog-aksi', {}, [
          el('button.tombol-samar.tombol-kecil', { type: 'button', teks: '‹ Sebelumnya', disabled: saring.halaman <= 1,
            onclick: () => { saring.halaman--; gambarIsi(); } }),
          el('span.status-sinkron', { teks: `Halaman ${saring.halaman} dari ${jumlahHalaman}` }),
          el('button.tombol-samar.tombol-kecil', { type: 'button', teks: 'Berikutnya ›', disabled: saring.halaman >= jumlahHalaman,
            onclick: () => { saring.halaman++; gambarIsi(); } })]) : null,
        el('p.bantuan', { teks: 'Transaksi ganda dan perbedaan nilai tidak diperbaiki otomatis karena perlu keputusan manusia.' })])
    ]));
  };
  wadah.append(tempatIsi);
  gambarIsi();
  return wadah;
}
