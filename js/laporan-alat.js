import {operatorPayroll} from './payroll-model.js';
// laporan-alat.js — laporan bagian Alat Berat & Kendaraan:
// Ringkasan per unit, Payroll Operator, Biaya per Lokasi, dan
// Laporan Harian siap tempel ke WhatsApp.
//
// Rumusnya mengikuti README aplikasi desktop:
//   Ltr/KM = total liter / total KM        (konsumsi solar kendaraan)
//   HM/Ltr = total HM / total liter        (jam kerja per liter, alat berat)
//   Upah   = (total HK x tarif harian) + premi tercatat (HM sekali)
//   Biaya solar & servis per lokasi dibagi sebanding HM (atau KM) yang
//   dijalankan unit itu di tiap lokasi.

import * as D from './data.js';
import { TABEL, pakaiHm } from './skema-alat.js';
import { hmPakai, kmPakai, dalamPeriode } from './input-alat.js';
import {
  el, tabel, kosongkan, rupiah, rupiahPenuh, angka, hk as fhk, tanggal as ftanggal,
  pesan, hariIni, taruh,
} from './ui.js';

const biayaSolar = (r) => (Number(r.liter) || 0) * (Number(r.harga_liter) || 0);

function dataPeriode(periode) {
  const saring = dalamPeriode(periode);
  return {
    // HK dan operasi selalu dihitung; status acc hanya mengatur premi/upah jam.
    log: D.baris('work_logs').filter((r) => saring(r) && !r.deleted_at),
    solar: D.baris('fuel_logs').filter(saring),
    servis: D.baris('service_logs').filter(saring),
  };
}

// =====================================================================
// RINGKASAN PER UNIT
// =====================================================================
/**
 * Angka acuan tiap unit dari SELURUH periode yang pernah tercatat — dipakai
 * sebagai pembanding "standar" di Ringkasan unit. Satu bulan saja sering
 * terlalu tipis untuk menilai irit atau boros (mis. bulan ini kebetulan
 * tidak ada catatan solar), jadi angka sepanjang masa dipakai pendamping.
 */
function acuanSemuaPeriode() {
  const per = new Map();
  const ambil = (unitId) => {
    const k = Number(unitId);
    if (!per.has(k)) per.set(k, { hm: 0, km: 0, liter: 0, hari: new Set() });
    return per.get(k);
  };
  for (const r of D.baris('work_logs')) {
    if (r.deleted_at) continue;
    const b = ambil(r.unit_id);
    b.hm += hmPakai(r); b.km += kmPakai(r); b.hari.add(r.tanggal);
  }
  for (const r of D.baris('fuel_logs')) {
    if (r.deleted_at) continue;
    ambil(r.unit_id).liter += Number(r.liter) || 0;
  }
  const hasil = new Map();
  for (const [k, b] of per) {
    hasil.set(k, {
      // ALAT BERAT diukur Ltr/HM (liter per jam kerja) — makin KECIL makin irit
      ltr_hm: b.hm > 0 && b.liter > 0 ? b.liter / b.hm : null,
      // KENDARAAN diukur KM/Ltr (jarak per liter) — makin BESAR makin irit
      km_ltr: b.liter > 0 && b.km > 0 ? b.km / b.liter : null,
      hari: b.hari.size,
    });
  }
  return hasil;
}

export function halamanRingkasanUnit({ periode }) {
  const wadah = el('section');
  const gambarUlang = () => taruh(kosongkan(wadah), isiRingkasanUnit(periode, gambarUlang));
  gambarUlang();
  return wadah;
}

// Pilihan "semua periode" diingat selama sesi — satu bulan sering terlalu
// tipis untuk menilai irit/boros, jadi banyak yang ingin langsung melihat
// angka sejak awal pencatatan.
const KUNCI_SEMUA = 'app.unit.semua';
const semuaPeriodeAktif = () => sessionStorage.getItem(KUNCI_SEMUA) === '1';

function isiRingkasanUnit(periode, gambarUlang) {
  const semuaPeriode = semuaPeriodeAktif();
  const judulPeriode = () => (semuaPeriode ? 'semua periode' : periode.judul());
  // "semua periode" = tanpa saringan tanggal sama sekali
  const { log, solar, servis } = semuaPeriode
    ? {
      log: D.baris('work_logs').filter((r) => !r.deleted_at),
      solar: D.baris('fuel_logs').filter((r) => !r.deleted_at),
      servis: D.baris('service_logs').filter((r) => !r.deleted_at),
    }
    : dataPeriode(periode);
  const acuan = acuanSemuaPeriode();

  const per = new Map();
  const ambil = (unitId) => {
    const k = Number(unitId);
    if (!per.has(k)) {
      const u = D.cari('units', k);
      per.set(k, {
        unit: u ? TABEL.units.label(u) : `#${k} (tidak ada)`,
        kategori: u?.kategori || '',
        hari: new Set(), hm: 0, km: 0, ritase: 0,
        liter: 0, biaya_solar: 0, biaya_servis: 0,
      });
    }
    return per.get(k);
  };

  for (const r of log) {
    const b = ambil(r.unit_id);
    b.hari.add(r.tanggal);
    b.hm += hmPakai(r);
    b.km += kmPakai(r);
    b.ritase += Number(r.ritase) || 0;
  }
  for (const r of solar) {
    const b = ambil(r.unit_id);
    b.liter += Number(r.liter) || 0;
    b.biaya_solar += biayaSolar(r);
  }
  for (const r of servis) ambil(r.unit_id).biaya_servis += Number(r.biaya) || 0;

  const data = [...per.entries()].map(([unitId, b]) => {
    // Satuannya mengikuti jenis unitnya:
    //   ALAT BERAT  -> Ltr/HM  (liter per jam kerja), makin KECIL makin irit
    //   KENDARAAN   -> KM/Ltr  (jarak per liter),     makin BESAR makin irit
    // Tanpa catatan solar, efisiensinya belum bisa dihitung — jangan tampilkan 0.
    const ltr_hm = b.hm > 0 && b.liter > 0 ? b.liter / b.hm : null;
    const km_ltr = b.liter > 0 && b.km > 0 ? b.km / b.liter : null;
    const a = acuan.get(Number(unitId)) || {};
    let banding = '–';
    const tanda = (selisih, kecilLebihBaik) => (Math.abs(selisih) < 0.005 ? 'sama'
      : `${(kecilLebihBaik ? selisih < 0 : selisih > 0) ? '↓' : '↑'} ${angka(Math.abs(selisih), 2)}`);
    if (ltr_hm != null && a.ltr_hm != null) banding = tanda(ltr_hm - a.ltr_hm, true);
    else if (km_ltr != null && a.km_ltr != null) banding = tanda(km_ltr - a.km_ltr, false);
    return {
      ...b,
      hari_operasi: b.hari.size,
      ltr_hm,
      km_ltr,
      std_ltr_hm: a.ltr_hm ?? null,
      std_km_ltr: a.km_ltr ?? null,
      banding,
      total_biaya: b.biaya_solar + b.biaya_servis,
    };
  }).sort((a, b) => a.unit.localeCompare(b.unit, 'id'));

  const totalHm = data.reduce((n, b) => n + b.hm, 0);
  const totalKm = data.reduce((n, b) => n + b.km, 0);
  const totalLiter = data.reduce((n, b) => n + b.liter, 0);
  const totalBiaya = data.reduce((n, b) => n + b.total_biaya, 0);

  const kotak = (l, v, s = '') => el('div', {}, [
    el('dt', { teks: l }),
    el('dd', {}, [v, s ? el('span.satuan', { teks: ' ' + s }) : null]),
  ]);

  return el('section', {}, [
    el('div.lembar', {}, [
      el('dl.angka-utama', {}, [
        kotak('Total jam kerja', angka(totalHm, 1), 'HM'),
        kotak('Total jarak', angka(totalKm, 1), 'KM'),
        kotak('Solar terpakai', angka(totalLiter, 1), 'liter'),
        kotak('Biaya solar + servis', rupiah(totalBiaya), 'Rp'),
      ]),
    ]),
    el('section', {}, [
      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [
          el('h2', { teks: `Per unit — ${judulPeriode()}` }),
          // Pindah antara bulan terpilih dan SEMUA periode sejak awal
          el(`button.tombol-kecil${semuaPeriode ? '' : '.tombol-samar'}`, {
            type: 'button',
            teks: semuaPeriode ? `Lihat ${periode.judul()} saja` : 'Lihat semua periode',
            'aria-pressed': semuaPeriode ? 'true' : 'false',
            onclick: () => {
              sessionStorage.setItem(KUNCI_SEMUA, semuaPeriode ? '0' : '1');
              gambarUlang();
            },
          }),
          el('button.tombol-samar.tombol-kecil', { type: 'button', teks: 'Cetak', onclick: () => window.print() }),
        ]),
        el('div.lembar-isi', {}, [
          tabel([
            { l: 'Unit', k: 'unit' },
            { l: 'Kategori', k: 'kategori' },
            { l: 'Hari operasi', k: 'hari_operasi', jenis: 'angka', total: true },
            { l: 'HM', k: 'hm', jenis: 'angka', pecahan: 1, total: true },
            { l: 'KM', k: 'km', jenis: 'angka', pecahan: 1, total: true },
            { l: 'Ritase', k: 'ritase', jenis: 'angka', total: true },
            { l: 'Liter', k: 'liter', jenis: 'angka', pecahan: 1, total: true },
            { l: 'Biaya solar (Rp)', k: 'biaya_solar', jenis: 'uang', total: true },
            { l: 'Biaya servis (Rp)', k: 'biaya_servis', jenis: 'uang', total: true },
            // ALAT BERAT dinilai Ltr/HM, KENDARAAN dinilai KM/Ltr
            { l: 'Ltr/HM', nilai: (r) => (r.ltr_hm == null ? '–' : angka(r.ltr_hm, 2)), rata: 'angka' },
            { l: 'KM/Ltr', nilai: (r) => (r.km_ltr == null ? '–' : angka(r.km_ltr, 2)), rata: 'angka' },
            // Pembanding sepanjang masa — supaya terlihat periode ini lebih
            // irit atau lebih boros dari kebiasaan unit itu sendiri.
            ...(semuaPeriode ? [] : [
              { l: 'Ltr/HM standar', rata: 'angka',
                nilai: (r) => (r.std_ltr_hm == null ? '–' : angka(r.std_ltr_hm, 2)) },
              { l: 'KM/Ltr standar', rata: 'angka',
                nilai: (r) => (r.std_km_ltr == null ? '–' : angka(r.std_km_ltr, 2)) },
              { l: 'Selisih', rata: 'angka', nilai: (r) => r.banding },
            ]),
          ], data, { kosong: `Belum ada kegiatan unit pada ${judulPeriode()}.` }),
          el('p.bantuan', {
            teks: 'Ltr/HM dipakai untuk ALAT BERAT — liter solar per jam kerja '
              + '(makin kecil makin irit). KM/Ltr dipakai untuk KENDARAAN — jarak per '
              + 'liter (makin besar makin irit). '
              + (semuaPeriode
                ? 'Sedang menampilkan SELURUH periode sejak awal pencatatan, jadi angkanya '
                  + 'paling bisa dipercaya untuk menilai efisiensi.'
                : 'Kolom "standar" dihitung dari SELURUH periode yang pernah tercatat, jadi '
                  + 'bisa dipakai menilai apakah bulan ini lebih irit atau lebih boros dari '
                  + 'kebiasaan unit itu sendiri. Kolom Selisih memakai tanda: ↓ lebih irit, '
                  + '↑ lebih boros.'),
          }),
        ]),
      ]),
    ]),
  ]);
}

// =====================================================================
// PAYROLL OPERATOR
// =====================================================================
export function halamanPayrollOperator({ periode }) {
  const data=operatorPayroll(D.state.data,...periode.rentang());

  let tampilRekening = false;
  const tempat = el('div');
  const kolom = () => [
    { l: 'Operator', k: 'nama' },
    { l: 'Hari kerja', k: 'hari_kerja', jenis: 'angka', total: true },
    { l: 'Total HK', k: 'hk', jenis: 'hk', total: true },
    { l: 'Jam HM', k: 'jam_hm', jenis: 'angka', pecahan: 1, total: true },
    { l: 'Upah harian (Rp)', k: 'upah_harian', jenis: 'uang', total: true },
    { l: 'Premi (Rp)', k: 'premi', jenis: 'uang', total: true },
    { l: 'Total (Rp)', k: 'total', jenis: 'uang', total: true },
    ...(tampilRekening ? [{ l: 'Bank', k: 'bank' }, { l: 'No. rekening', k: 'rekening' }] : []),
  ];
  const gambarTabel = () => {
    kosongkan(tempat).append(tabel(kolom(), data, {
      kosong: `Belum ada data upah operator pada ${periode.judul()}.`,
    }));
  };
  gambarTabel();

  return el('section', {}, [
    el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: `Upah operator — ${periode.judul()}` }),
        el('label.samar', { style: 'display:flex;gap:.3rem;align-items:center;font-size:.85rem' }, [
          el('input', { type: 'checkbox', onchange: (e) => { tampilRekening = e.target.checked; gambarTabel(); } }),
          'Tampilkan bank & rekening',
        ]),
        el('button.tombol-samar', { type: 'button', teks: 'Cetak', onclick: () => window.print() }),
      ]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', {
          teks: 'Upah = (Total HK × tarif harian) + premi tercatat (HM dibayar sekali). '
            + 'Total HK dihitung otomatis dari log harian, dibagi proporsional kalau operator kerja di beberapa lokasi dalam sehari.',
        }),
        tempat,
      ]),
    ]),
  ]);
}

// =====================================================================
// BIAYA PER LOKASI
// =====================================================================
export function halamanBiayaLokasi({ periode }) {
  const { log, solar, servis } = dataPeriode(periode);

  // Dasar pembagian: total HM (atau KM) tiap unit pada periode ini
  const dasarUnit = new Map();
  for (const r of log) {
    const k = Number(r.unit_id);
    const d = dasarUnit.get(k) || { hm: 0, km: 0 };
    d.hm += hmPakai(r);
    d.km += kmPakai(r);
    dasarUnit.set(k, d);
  }
  const biayaUnit = new Map();
  const tambahBiaya = (unitId, jenis, n) => {
    const k = Number(unitId);
    const b = biayaUnit.get(k) || { solar: 0, servis: 0 };
    b[jenis] += n;
    biayaUnit.set(k, b);
  };
  for (const r of solar) tambahBiaya(r.unit_id, 'solar', biayaSolar(r));
  for (const r of servis) tambahBiaya(r.unit_id, 'servis', Number(r.biaya) || 0);

  const TANPA = '(tanpa lokasi)';
  const BELUM = '(belum ada log kerja)';
  const per = new Map();
  const ambil = (nama) => {
    if (!per.has(nama)) per.set(nama, { lokasi: nama, hm: 0, km: 0, hk: 0, tenaga: 0, solar: 0, servis: 0 });
    return per.get(nama);
  };

  // tenaga kerja + hasil kerja per lokasi
  for (const r of log) {
    const b = ambil(r.lokasi?.trim() || TANPA);
    const o = D.cari('operators', r.operator_id);
    const hk = Number(r.hk) || 0;
    b.hk += hk;
    b.hm += hmPakai(r);
    b.km += kmPakai(r);
    b.tenaga += hk * (Number(o?.tarif_harian) || 0);
    if (D.disetujui('work_logs', r.id)) {
      b.tenaga += (Number(r.premi) || 0);
    }
  }

  // solar & servis dibagi sebanding HM (atau KM) unit itu di tiap lokasi
  for (const [unitId, biaya] of biayaUnit) {
    const dasar = dasarUnit.get(unitId);
    const unit = D.cari('units', unitId);
    const pakaiJam = pakaiHm(unit) && (dasar?.hm || 0) > 0;
    const totalDasar = pakaiJam ? dasar.hm : (dasar?.km || 0);
    if (!totalDasar) {
      const b = ambil(BELUM);
      b.solar += biaya.solar;
      b.servis += biaya.servis;
      continue;
    }
    const barisUnit = log.filter((r) => Number(r.unit_id) === Number(unitId));
    const bagian = new Map();
    for (const r of barisUnit) {
      const nama = r.lokasi?.trim() || TANPA;
      bagian.set(nama, (bagian.get(nama) || 0) + (pakaiJam ? hmPakai(r) : kmPakai(r)));
    }
    let sisaSolar = biaya.solar;
    let sisaServis = biaya.servis;
    const daftar = [...bagian.entries()];
    daftar.forEach(([nama, nilai], i) => {
      const b = ambil(nama);
      const porsiSolar = i === daftar.length - 1
        ? sisaSolar : Math.round((biaya.solar * nilai) / totalDasar);
      const porsiServis = i === daftar.length - 1
        ? sisaServis : Math.round((biaya.servis * nilai) / totalDasar);
      b.solar += porsiSolar;
      b.servis += porsiServis;
      sisaSolar -= porsiSolar;
      sisaServis -= porsiServis;
    });
  }

  const data = [...per.values()]
    .map((b) => ({ ...b, total: b.tenaga + b.solar + b.servis }))
    .sort((a, b) => b.total - a.total);

  return el('section', {}, [
    el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: `Biaya per lokasi — ${periode.judul()}` }),
        el('button.tombol-samar.tombol-kecil', { type: 'button', teks: 'Cetak', onclick: () => window.print() }),
      ]),
      el('div.lembar-isi', {}, [
        tabel([
          { l: 'Lokasi', k: 'lokasi' },
          { l: 'HK', k: 'hk', jenis: 'hk', total: true },
          { l: 'HM', k: 'hm', jenis: 'angka', pecahan: 1, total: true },
          { l: 'KM', k: 'km', jenis: 'angka', pecahan: 1, total: true },
          { l: 'Tenaga kerja (Rp)', k: 'tenaga', jenis: 'uang', total: true },
          { l: 'Solar (Rp)', k: 'solar', jenis: 'uang', total: true },
          { l: 'Servis (Rp)', k: 'servis', jenis: 'uang', total: true },
          { l: 'Total (Rp)', k: 'total', jenis: 'uang', total: true },
        ], data, { kosong: `Belum ada biaya tercatat pada ${periode.judul()}.` }),
        el('p.bantuan', {
          teks: 'Lokasi hanya diisi di Log Harian. Biaya solar & servis dibagi otomatis ke tiap lokasi '
            + 'sebanding HM (atau KM) yang dijalankan unit itu di sana, jadi totalnya selalu sama dengan biaya aslinya. '
            + 'Unit yang punya biaya tapi tidak ada log kerja masuk ke "(belum ada log kerja)".',
        }),
      ]),
    ]),
  ]);
}

// =====================================================================
// LAPORAN HARIAN (siap tempel ke WhatsApp)
// =====================================================================
function susunLaporanHarian(tgl) {
  const log = D.baris('work_logs').filter((r) => r.tanggal === tgl && !r.deleted_at);
  const solar = D.baris('fuel_logs').filter((r) => r.tanggal === tgl);
  const servis = D.baris('service_logs').filter((r) => r.tanggal === tgl);
  const unitAktif = D.aktif('units').sort((a, b) => a.kode.localeCompare(b.kode, 'id'));

  const garis = [`*LAPORAN HARIAN UNIT*`, ftanggal(tgl), ''];
  for (const u of unitAktif) {
    const logU = log.filter((r) => Number(r.unit_id) === Number(u.id));
    const servisU = servis.filter((r) => Number(r.unit_id) === Number(u.id));
    const solarU = solar.filter((r) => Number(r.unit_id) === Number(u.id));
    const rusak = servisU.some((r) => r.jenis === 'Perbaikan / Kerusakan');

    let status;
    if (logU.length) status = 'Operasi';
    else if (rusak) status = 'Rusak / perbaikan';
    else if (servisU.length) status = 'Servis';
    else status = 'Nonaktif';

    garis.push(`*${u.kode} — ${u.nama}*: ${status}`);
    for (const r of logU) {
      const bagian = [];
      const o = D.cari('operators', r.operator_id);
      if (o) bagian.push(o.nama);
      if (r.lokasi) bagian.push(r.lokasi);
      if (r.kegiatan) bagian.push(r.kegiatan);
      if (hmPakai(r)) bagian.push(`${angka(hmPakai(r), 1)} HM`);
      if (kmPakai(r)) bagian.push(`${angka(kmPakai(r), 1)} KM`);
      if (Number(r.ritase)) bagian.push(`${angka(r.ritase)} rit`);
      garis.push(`  • ${bagian.join(' · ')}`);
    }
    for (const r of servisU) {
      garis.push(`  • ${r.jenis}${r.deskripsi ? ': ' + r.deskripsi : ''}`
        + (Number(r.biaya) ? ` (${rupiahPenuh(r.biaya)})` : ''));
    }
    const liter = solarU.reduce((n, r) => n + (Number(r.liter) || 0), 0);
    if (liter) garis.push(`  • BBM hari ini ${angka(liter, 1)} liter`);
    garis.push('');
  }
  return garis.join('\n').trimEnd();
}

let tglLaporan = null;

export function halamanLaporanHarian({ periode }) {
  const [a, b] = periode.rentang();
  let tgl = tglLaporan && tglLaporan >= a && tglLaporan <= b ? tglLaporan : hariIni();
  if (tgl < a || tgl > b) tgl = b;
  tglLaporan = tgl;

  const kotak = el('textarea', {
    readonly: true, style: 'width:100%;min-height:22rem;font-family:inherit;font-size:.9rem',
    'aria-label': 'Teks laporan harian',
  });
  const perbarui = () => { kotak.value = susunLaporanHarian(tgl); };
  perbarui();

  const inTanggal = el('input', {
    type: 'date', nilai: tgl, min: a, max: b, 'aria-label': 'Tanggal laporan',
    onchange: (e) => { tgl = e.target.value; tglLaporan = tgl; perbarui(); },
  });

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(kotak.value);
      pesan('Teks laporan disalin. Tinggal tempel di WhatsApp.', 'sukses');
    } catch {
      kotak.removeAttribute('readonly');
      kotak.select();
      pesan('Tekan Ctrl+C untuk menyalin teks yang sudah tersorot.', 'awas', 6);
      kotak.setAttribute('readonly', '');
    }
  };

  return el('section', {}, [
    el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: 'Laporan harian' }),
        inTanggal,
        el('button.tombol-utama', { type: 'button', teks: 'Salin teks', onclick: salin }),
      ]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', {
          teks: 'Status tiap unit pada tanggal terpilih: Operasi (ada log kerja), Servis, Rusak / perbaikan, '
            + 'atau Nonaktif kalau tidak ada catatan sama sekali.',
        }),
        kotak,
      ]),
    ]),
  ]);
}
