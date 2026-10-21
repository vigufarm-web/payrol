// monitor-semua.js — "Monitoring Semua Divisi": satu halaman yang menyatukan
// angka dari SEMUA bagian di repo ini — Payroll Operasional (semua divisi)
// dan Alat Berat & Kendaraan — supaya admin bisa memantau semuanya tanpa
// berpindah-pindah bagian.
//
// Hanya untuk admin penuh. Halaman ini MEMBACA saja, tidak pernah mengubah
// data bagian lain (bagian lain dibaca lewat D.muatBagianLain()).
//
// Aturan angkanya sama persis dengan laporan masing-masing bagian:
//   • Lembur & premi hanya dihitung kalau SUDAH di-acc kepala divisi.
//   • Log alat berat hanya dihitung kalau SUDAH di-acc.
//   • Upah operator = (HK x tarif harian) + (jam HM x tarif per jam) + premi.

import * as D from './data.js';
import {
  el, tabel, kosongkan, taruh, rupiah, angka, hk as fhk, pesan, waktu,
} from './ui.js';

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
        tunggu: 0, tungguRp: 0,
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
        b.tunggu += 1;                        // belum di-acc: tidak ikut total
        b.tungguRp += nol(r.nominal);
        continue;
      }
      if (!accDi(data, tabelNama, r.id)) continue;
      b.orang.add(Number(r.employee_id));
      b[kantong] += nol(r.nominal);
    }
  }
  return [...per.values()].map((b) => ({
    ...b,
    orang: b.orang.size,
    total: b.pokok + b.lembur + b.premi,
  })).sort((a, b) => String(a.divisi).localeCompare(String(b.divisi), 'id'));
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
    if (menungguDi(data, 'work_logs', r.id)) { b.tunggu += 1; continue; }
    if (!accDi(data, 'work_logs', r.id)) continue;
    const o = op.get(Number(r.operator_id));
    b.hari.add(r.tanggal);
    b.hm += hmPakai(r);
    b.km += kmPakai(r);
    b.ritase += nol(r.ritase);
    b.hkOp += nol(r.hk);
    b.upah += nol(r.hk) * nol(o?.tarif_harian) + hmPakai(r) * nol(o?.tarif_jam);
    b.premi += nol(r.premi);
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

// ------------------------------------------------------------- halaman
export function halamanMonitorSemua({ periode }) {
  const wadah = el('section');
  const tempat = el('div', {}, [el('p.samar', { teks: 'Mengambil data semua bagian…' })]);
  wadah.append(tempat);

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
        tunggu: tungguAlat,
        tungguRp: 0,
        total: upahAlat,
      });
    }

    taruh(kosongkan(tempat),
      el('div.lembar', {}, [
        el('dl.angka-utama', {}, [
          kotak('Total HK pekerja', fhk(totalHk), 'HK'),
          kotak('Upah operasional', rupiah(upahOperasional), 'Rp'),
          kotak('Upah operator alat', rupiah(upahAlat), 'Rp'),
          kotak('Solar + servis', rupiah(biayaUnit), 'Rp'),
          kotak('TOTAL SEMUA', rupiah(upahOperasional + upahAlat + biayaUnit), 'Rp'),
        ]),
        el('p.bantuan', {
          teks: 'Lembur, premi, dan log alat yang masih menunggu acc kepala divisi '
            + 'BELUM ikut dihitung di angka-angka ini — jumlahnya ada di kolom "Menunggu acc".',
        }),
      ]),

      gagal.length
        ? el('div.kesalahan', { role: 'alert',
          teks: `Bagian ini tidak bisa dibaca: ${gagal.join(', ')}. `
            + 'Biasanya karena passwordnya berbeda atau berkasnya belum diupload. '
            + 'Angka di halaman ini belum termasuk bagian tersebut.' })
        : null,

      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [
          el('h2', { teks: `Semua divisi — ${periode.judul()}` }),
          el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: 'Ambil data terbaru',
            onclick: () => {
              D.lupakanBagianLain();     // buang simpanan bagian lain
              taruh(kosongkan(tempat), el('p.samar', { teks: 'Mengambil data terbaru…' }));
              gambarIsi().catch((e) => pesan(`Gagal memuat ulang: ${e.message}`, 'galat', 6));
            },
          }),
          el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: 'Cetak', onclick: () => window.print(),
          }),
        ]),
        el('div.lembar-isi', {}, [
          tabel([
            { l: 'Divisi', k: 'divisi' },
            { l: 'Jenis', k: 'jenis' },
            { l: 'Orang/unit', k: 'orang', jenis: 'angka', total: true },
            { l: 'HK', k: 'hk', jenis: 'angka', pecahan: 2, total: true },
            { l: 'Upah pokok (Rp)', k: 'pokok', jenis: 'uang', total: true },
            { l: 'Lembur (Rp)', k: 'lembur', jenis: 'uang', total: true },
            { l: 'Premi (Rp)', k: 'premi', jenis: 'uang', total: true },
            { l: 'Total (Rp)', k: 'total', jenis: 'uang', total: true },
            { l: 'Menunggu acc', k: 'tunggu', jenis: 'angka', total: true },
          ], semuaDivisi, { kosong: `Belum ada data pada ${periode.judul()}.` }),
        ]),
      ]),

      barisUnit.length ? el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Alat berat & kendaraan — per unit' })]),
        el('div.lembar-isi', {}, [
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
            teks: 'Ltr/KM untuk dump truck & kendaraan (makin kecil makin irit). '
              + 'HM/Ltr untuk alat berat (makin besar makin irit).',
          }),
        ]),
      ]) : null,

      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Status data tiap bagian' })]),
        el('div.lembar-isi', {}, [
          tabel([
            { l: 'Bagian', k: 'bagian' },
            { l: 'Revisi', k: 'rev', jenis: 'angka' },
            { l: 'Terakhir disimpan', nilai: (r) => (r.diperbarui ? waktu(r.diperbarui) : '–') },
            { l: 'Sumber', k: 'sumber' },
          ], statusData, { kosong: 'Tidak ada bagian terbaca.' }),
          (tungguOperasional || tungguAlat)
            ? el('p.bantuan', {
              teks: `Menunggu acc kepala divisi: ${tungguOperasional} lembur/premi `
                + `di payroll operasional dan ${tungguAlat} log di alat berat & kendaraan.`,
            })
            : el('p.bantuan', { teks: 'Tidak ada yang menunggu acc pada periode ini.' }),
        ]),
      ]),
    );
  };

  gambarIsi().catch((e) => pesan(`Gagal menyusun monitoring: ${e.message}`, 'galat', 6));
  return wadah;
}
