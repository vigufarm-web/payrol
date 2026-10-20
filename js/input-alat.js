// input-alat.js — halaman input bagian Alat Berat & Kendaraan:
// Log Harian (HM/KM/ritase), Isi Solar, dan Servis Unit.
//
// Aturan HK mengikuti aplikasi desktop: operator mengisi "Total HK hari ini"
// (maksimal 1), lalu total itu DIBAGI OTOMATIS ke semua baris log operator
// tersebut pada tanggal yang sama, proporsional terhadap HM (atau KM) yang
// dijalankan tiap baris. Baris tanpa HM/KM dibagi rata.

import * as D from './data.js';
import { TABEL, JENIS_SERVIS, pakaiHm, pakaiKm } from './skema-alat.js';
import {
  el, tabel, isian, pilihan, pilihanCari, kesalahan, panel, tanya, pesan, kosongkan, taruh,
  rupiah, rupiahPenuh, angka, hk as fhk, tanggal as ftanggal, hariIni,
} from './ui.js';
import {
  mintaPin, periksaPinAdmin, adminPinTerpasang, rentangPeriode,
  rekomendasiAnggaran, kotakRekomendasi,
} from './kebun.js';

const opsiUnit = (idSekarang = null) => {
  const o = D.aktif('units').map((r) => ({ nilai: r.id, label: TABEL.units.label(r) }));
  if (idSekarang && !o.some((x) => String(x.nilai) === String(idSekarang))) {
    o.unshift({ nilai: idSekarang, label: D.labelRef('units', idSekarang) + ' (tidak aktif)' });
  }
  return o;
};
const opsiOperator = (idSekarang = null) => {
  const o = D.aktif('operators').map((r) => ({ nilai: r.id, label: r.nama }));
  if (idSekarang && !o.some((x) => String(x.nilai) === String(idSekarang))) {
    o.unshift({ nilai: idSekarang, label: D.labelRef('operators', idSekarang) + ' (tidak aktif)' });
  }
  return o;
};

const dalamPeriode = (periode) => {
  const [a, b] = periode.rentang();
  return (r) => r.tanggal >= a && r.tanggal <= b;
};

const hmPakai = (r) => Math.max(0, (Number(r.hm_akhir) || 0) - (Number(r.hm_awal) || 0));
const kmPakai = (r) => Math.max(0, (Number(r.km_akhir) || 0) - (Number(r.km_awal) || 0));

/** Daftar lokasi yang pernah dipakai, untuk saran pengisian. */
const daftarLokasi = () => [...new Set(D.baris('work_logs').map((r) => r.lokasi).filter(Boolean))].sort();

/** Tarif premi per unit: Rp per HM dan Rp per KM (diatur admin). */
export const tarifPremiUnit = (unitId) => {
  const t = D.web().unitPremi?.[String(unitId)] || {};
  return { hm: Number(t.hm) || 0, km: Number(t.km) || 0 };
};

/** Premi otomatis satu log = HM dipakai x tarif/HM + KM dipakai x tarif/KM. */
export function premiOtomatis(unitId, log) {
  const t = tarifPremiUnit(unitId);
  return Math.round(hmPakai(log) * t.hm + kmPakai(log) * t.km);
}

/** Meter terakhir yang tercatat untuk satu unit. */
function meterTerakhir(unitId, kecualiId = null) {
  const log = D.baris('work_logs')
    .filter((r) => Number(r.unit_id) === Number(unitId) && Number(r.id) !== Number(kecualiId))
    .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || Number(a.id) - Number(b.id));
  const akhir = log.at(-1);
  return { hm: Number(akhir?.hm_akhir) || 0, km: Number(akhir?.km_akhir) || 0, ada: !!akhir };
}

/**
 * Pembacaan meter TERTINGGI yang tercatat sampai (dan termasuk) satu
 * tanggal. Dipakai untuk mengisi HM/KM awal otomatis: meter tidak mungkin
 * mundur, jadi acuannya selalu angka tertinggi sebelum hari itu.
 */
function meterSebelum(unitId, tanggal, kecualiId = null) {
  const log = D.baris('work_logs').filter((r) => !r.deleted_at
    && Number(r.unit_id) === Number(unitId)
    && Number(r.id) !== Number(kecualiId)
    && String(r.tanggal) <= String(tanggal));
  const maks = (k) => log.reduce((n, r) => Math.max(n, Number(r[k]) || 0), 0);
  return { hm: maks('hm_akhir'), km: maks('km_akhir'), ada: log.length > 0 };
}

/**
 * Cari pasangan log berurutan yang meternya MUNDUR — tanggal lebih baru
 * tapi angkanya lebih kecil. Itu selalu salah ketik (entah tanggalnya,
 * entah meternya), jadi ditampilkan sebagai peringatan di halaman log.
 */
function meterMundur() {
  const perUnit = new Map();
  for (const r of D.baris('work_logs')) {
    if (r.deleted_at) continue;
    if (!perUnit.has(r.unit_id)) perUnit.set(r.unit_id, []);
    perUnit.get(r.unit_id).push(r);
  }
  const masalah = [];
  for (const [unitId, log] of perUnit) {
    const unit = D.cari('units', unitId);
    log.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || Number(a.id) - Number(b.id));
    // dibandingkan PER HARI (pembacaan tertinggi hari itu vs hari
    // sebelumnya) — beberapa log di hari yang sama tidak bikin salah tangkap,
    // dan satu salah ketik hanya menghasilkan satu-dua peringatan
    for (const [k, label, pakai] of [['hm_akhir', 'HM', pakaiHm], ['km_akhir', 'KM', pakaiKm]]) {
      if (!pakai(unit)) continue;
      const perHari = new Map();
      for (const r of log) {
        const nilai = Number(r[k]) || 0;
        if (nilai > 0) perHari.set(r.tanggal, Math.max(perHari.get(r.tanggal) || 0, nilai));
      }
      let acuan = null;
      for (const [tanggal, nilai] of [...perHari.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (acuan && nilai < acuan.nilai - 1e-9) {
          masalah.push(`${D.labelRef('units', unitId)}: ${label} ${angka(nilai, 1)} pada `
            + `${ftanggal(tanggal)} lebih kecil dari ${angka(acuan.nilai, 1)} pada `
            + `${ftanggal(acuan.tanggal)} — meter tidak mungkin mundur, periksa tanggal atau angkanya`);
        }
        acuan = { nilai, tanggal };
      }
    }
  }
  return masalah;
}

/**
 * Bagi `totalHk` ke seluruh baris log operator pada satu tanggal,
 * proporsional terhadap HM (atau KM) tiap baris.
 */
function sebarHk(operatorId, tgl, totalHk) {
  const grup = D.baris('work_logs').filter(
    (r) => Number(r.operator_id) === Number(operatorId) && r.tanggal === tgl);
  if (!grup.length) return;
  const bobotHm = grup.map(hmPakai);
  const bobotKm = grup.map(kmPakai);
  const jmlHm = bobotHm.reduce((a, b) => a + b, 0);
  const jmlKm = bobotKm.reduce((a, b) => a + b, 0);
  const bobot = jmlHm > 0 ? bobotHm : jmlKm > 0 ? bobotKm : grup.map(() => 1);
  const jml = bobot.reduce((a, b) => a + b, 0) || grup.length;

  let sisa = totalHk;
  grup.forEach((r, i) => {
    const bagian = i === grup.length - 1
      ? Math.max(0, Math.round(sisa * 10000) / 10000)       // baris terakhir menyerap sisa pembulatan
      : Math.round((totalHk * bobot[i]) / jml * 10000) / 10000;
    sisa -= bagian;
    D.ubah('work_logs', r.id, { hk: bagian });
  });
}

const totalHkGrup = (operatorId, tgl) => D.baris('work_logs')
  .filter((r) => Number(r.operator_id) === Number(operatorId) && r.tanggal === tgl)
  .reduce((n, r) => n + (Number(r.hk) || 0), 0);

// =====================================================================
// LOG HARIAN
// =====================================================================
function formLog(barisAda, tglAwal, saatSelesai) {
  const tempatGalat = el('div');
  const catatanMeter = el('p.bantuan', { teks: ' ' });

  const inTanggal = el('input', { type: 'date', nilai: barisAda?.tanggal || tglAwal || hariIni() });
  const inUnit = pilihan(opsiUnit(barisAda?.unit_id), barisAda?.unit_id, { saatUbah: () => aturMeter() });
  const inOperator = pilihanCari(opsiOperator(barisAda?.operator_id), barisAda?.operator_id,
    { tempat: 'Ketik nama operator…', saatUbah: () => aturTotalHk() });

  const inHmAwal = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.hm_awal ?? '' });
  const inHmAkhir = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.hm_akhir ?? '' });
  const inKmAwal = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.km_awal ?? '' });
  const inKmAkhir = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.km_akhir ?? '' });
  const inRitase = el('input', { type: 'number', step: '1', min: '0', nilai: barisAda?.ritase ?? 0 });
  const inTotalHk = el('input', { type: 'number', step: '0.05', min: '0', max: '1', nilai: 1 });
  const inKegiatan = el('input', { type: 'text', nilai: barisAda?.kegiatan ?? '' });
  const inLokasi = pilihanCari(daftarLokasi().map((l) => ({ nilai: l, label: l })), null,
    { tempat: 'mis. Blok A01' });
  const inPremi = el('input', { type: 'number', step: '1000', min: '0', nilai: barisAda?.premi ?? 0 });
  let premiManual = barisAda != null;   // baris lama: angka tersimpan jangan ditimpa
  inPremi.addEventListener('input', () => { premiManual = true; });
  const catatanPremi = el('p.bantuan', { teks: ' ' });
  const hitungPremi = () => {
    const unit = D.cari('units', inUnit.value);
    if (!unit) { catatanPremi.textContent = ' '; return; }
    const t = tarifPremiUnit(unit.id);
    if (!t.hm && !t.km) {
      catatanPremi.textContent = 'Tarif premi unit ini belum diatur (menu Tarif Premi Unit) — premi diisi manual.';
      return;
    }
    const log = { hm_awal: inHmAwal.value, hm_akhir: inHmAkhir.value, km_awal: inKmAwal.value, km_akhir: inKmAkhir.value };
    const nilai = premiOtomatis(unit.id, log);
    const rinci = [];
    if (t.hm && hmPakai(log)) rinci.push(`${angka(hmPakai(log), 1)} HM × ${rupiahPenuh(t.hm)}`);
    if (t.km && kmPakai(log)) rinci.push(`${angka(kmPakai(log), 1)} KM × ${rupiahPenuh(t.km)}`);
    catatanPremi.textContent = rinci.length
      ? `Premi otomatis: ${rinci.join(' + ')} = ${rupiahPenuh(nilai)}` + (premiManual ? ' (diubah manual)' : '')
      : 'Isi meternya dulu — premi dihitung dari HM/KM yang terpakai.';
    if (!premiManual) inPremi.value = nilai;
  };
  const inCatatan = el('input', { type: 'text', nilai: barisAda?.catatan ?? '' });
  if (barisAda?.lokasi) inLokasi.setNilai(barisAda.lokasi);

  const barisHm = el('div.baris-isian', {}, [isian('HM awal', inHmAwal), isian('HM akhir', inHmAkhir)]);
  const barisKm = el('div.baris-isian', {}, [isian('KM awal', inKmAwal), isian('KM akhir', inKmAkhir)]);
  const bungkusRitase = isian('Ritase', inRitase, { bantuan: 'Jumlah rit angkut (dump truck).' });

  const tombolMeterHm = el('button.tombol-kecil', { type: 'button', teks: 'HM terakhir' });
  const tombolMeterKm = el('button.tombol-kecil', { type: 'button', teks: 'KM terakhir' });

  // HM/KM awal otomatis: pembacaan tertinggi sebelum tanggal ini.
  // Admin tinggal mengisi angka meter SAAT INI (kolom akhir); angka itu
  // otomatis jadi "awal" untuk log hari berikutnya.
  const isiAwalOtomatis = () => {
    if (barisAda) return;   // baris lama dibiarkan seperti tersimpan
    const unit = D.cari('units', inUnit.value);
    if (!unit) return;
    const m = meterSebelum(unit.id, inTanggal.value);
    if (pakaiHm(unit)) inHmAwal.value = m.hm || '';
    if (pakaiKm(unit)) inKmAwal.value = m.km || '';
  };

  const aturMeter = () => {
    const unit = D.cari('units', inUnit.value);
    barisHm.style.display = pakaiHm(unit) ? '' : 'none';
    barisKm.style.display = pakaiKm(unit) ? '' : 'none';
    bungkusRitase.style.display = unit?.kategori === 'DUMP TRUCK' ? '' : 'none';
    tombolMeterHm.style.display = pakaiHm(unit) ? '' : 'none';
    tombolMeterKm.style.display = pakaiKm(unit) ? '' : 'none';
    isiAwalOtomatis();
    perbaruiCatatan();
    hitungPremi();
  };

  const perbaruiCatatan = () => {
    const unit = D.cari('units', inUnit.value);
    if (!unit) { catatanMeter.textContent = 'Pilih unit dulu.'; return; }
    const akhir = meterSebelum(unit.id, inTanggal.value, barisAda?.id);
    const bagian = [];
    if (akhir.ada) {
      if (pakaiHm(unit)) bagian.push(`HM tertinggi sebelum tanggal ini ${angka(akhir.hm, 1)}`);
      if (pakaiKm(unit)) bagian.push(`KM tertinggi sebelum tanggal ini ${angka(akhir.km, 1)}`);
    } else {
      bagian.push('Belum ada log sebelumnya untuk unit ini.');
    }
    const selisihHm = pakaiHm(unit) ? hmPakai({ hm_awal: inHmAwal.value, hm_akhir: inHmAkhir.value }) : 0;
    const selisihKm = pakaiKm(unit) ? kmPakai({ km_awal: inKmAwal.value, km_akhir: inKmAkhir.value }) : 0;
    if (selisihHm) bagian.push(`HM dipakai ${angka(selisihHm, 1)} jam`);
    if (selisihKm) bagian.push(`KM dipakai ${angka(selisihKm, 1)} km`);
    catatanMeter.textContent = bagian.join(' · ');
  };

  tombolMeterHm.addEventListener('click', () => {
    const unit = D.cari('units', inUnit.value);
    if (unit) { inHmAwal.value = meterSebelum(unit.id, inTanggal.value, barisAda?.id).hm; perbaruiCatatan(); }
  });
  tombolMeterKm.addEventListener('click', () => {
    const unit = D.cari('units', inUnit.value);
    if (unit) { inKmAwal.value = meterSebelum(unit.id, inTanggal.value, barisAda?.id).km; perbaruiCatatan(); }
  });
  for (const i of [inHmAwal, inHmAkhir, inKmAwal, inKmAkhir]) {
    i.addEventListener('input', () => { perbaruiCatatan(); hitungPremi(); });
  }

  const catatanHk = el('p.bantuan', { teks: ' ' });
  const aturTotalHk = () => {
    const opId = inOperator.nilaiTerpilih();
    if (!opId) { catatanHk.textContent = 'Pilih operator dulu.'; return; }
    const sudah = totalHkGrup(opId, inTanggal.value);
    const lain = D.baris('work_logs').filter(
      (r) => Number(r.operator_id) === Number(opId) && r.tanggal === inTanggal.value
        && Number(r.id) !== Number(barisAda?.id)).length;
    if (barisAda) inTotalHk.value = sudah || 1;
    catatanHk.textContent = lain
      ? `Operator ini sudah punya ${lain} baris log di tanggal tsb. Total HK akan dibagi `
        + 'otomatis ke semua barisnya, sebanding dengan HM/KM tiap baris.'
      : 'Belum ada log lain untuk operator ini di tanggal tsb.';
  };
  inTanggal.addEventListener('change', () => { aturTotalHk(); isiAwalOtomatis(); perbaruiCatatan(); });
  aturMeter(); aturTotalHk();

  const simpan = async () => {
    const unit = D.cari('units', inUnit.value);
    const opId = inOperator.nilaiTerpilih();
    const salah = [];
    if (!inTanggal.value) salah.push('Tanggal harus diisi.');
    if (!unit) salah.push('Unit harus dipilih.');
    if (!opId) salah.push('Operator belum dipilih (ketik nama lalu pilih dari daftar).');

    const hmA = Number(inHmAwal.value) || 0;
    const hmB = Number(inHmAkhir.value) || 0;
    const kmA = Number(inKmAwal.value) || 0;
    const kmB = Number(inKmAkhir.value) || 0;
    if (unit && pakaiHm(unit) && inHmAkhir.value !== '' && hmB < hmA) {
      salah.push('HM akhir tidak boleh lebih kecil dari HM awal.');
    }
    if (unit && pakaiKm(unit) && inKmAkhir.value !== '' && kmB < kmA) {
      salah.push('KM akhir tidak boleh lebih kecil dari KM awal.');
    }
    const totalHk = Number(inTotalHk.value);
    if (!(totalHk > 0) || totalHk > 1) salah.push('Total HK hari ini harus antara 0 dan 1.');

    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); badan.scrollTop = 0; return; }

    // Peringatan (bukan penolakan): meter tidak nyambung atau mundur
    const acuan = meterSebelum(unit.id, inTanggal.value, barisAda?.id);
    const rincian = [];
    if (acuan.ada) {
      if (pakaiHm(unit) && inHmAwal.value !== '' && Math.abs(hmA - acuan.hm) > 0.05) {
        rincian.push(`HM awal ${angka(hmA, 1)} tidak sama dengan pembacaan tertinggi sebelumnya, ${angka(acuan.hm, 1)}`);
      }
      if (pakaiKm(unit) && inKmAwal.value !== '' && Math.abs(kmA - acuan.km) > 0.05) {
        rincian.push(`KM awal ${angka(kmA, 1)} tidak sama dengan pembacaan tertinggi sebelumnya, ${angka(acuan.km, 1)}`);
      }
      if (pakaiHm(unit) && hmB > 0 && hmB < acuan.hm - 1e-9) {
        rincian.push(`HM saat ini ${angka(hmB, 1)} LEBIH KECIL dari ${angka(acuan.hm, 1)} yang sudah `
          + 'tercatat sebelum tanggal ini — meter tidak mungkin mundur');
      }
      if (pakaiKm(unit) && kmB > 0 && kmB < acuan.km - 1e-9) {
        rincian.push(`KM saat ini ${angka(kmB, 1)} LEBIH KECIL dari ${angka(acuan.km, 1)} yang sudah `
          + 'tercatat sebelum tanggal ini — meter tidak mungkin mundur');
      }
    }
    // log pada tanggal SESUDAH ini yang angkanya lebih kecil dari yang baru diketik
    const sesudah = D.baris('work_logs').filter((r) => !r.deleted_at
      && Number(r.unit_id) === Number(unit.id)
      && Number(r.id) !== Number(barisAda?.id)
      && String(r.tanggal) > inTanggal.value);
    const terkecil = (k) => sesudah.filter((r) => Number(r[k]) > 0)
      .reduce((n, r) => Math.min(n, Number(r[k])), Infinity);
    const hmDepan = terkecil('hm_akhir');
    const kmDepan = terkecil('km_akhir');
    if (pakaiHm(unit) && hmB > 0 && hmDepan < hmB - 1e-9) {
      rincian.push(`HM saat ini ${angka(hmB, 1)} lebih besar dari log tanggal sesudahnya (${angka(hmDepan, 1)})`);
    }
    if (pakaiKm(unit) && kmB > 0 && kmDepan < kmB - 1e-9) {
      rincian.push(`KM saat ini ${angka(kmB, 1)} lebih besar dari log tanggal sesudahnya (${angka(kmDepan, 1)})`);
    }
    if (rincian.length) {
      const lanjut = await tanya('Periksa meternya dulu', el('div', {}, [
        el('ul', {}, rincian.map((t) => el('li', { teks: t + '.' }))),
        el('p', { teks: 'Bisa jadi tanggalnya keliru, meternya salah ketik, atau ada log yang kelewat. Tetap simpan?' }),
      ]), { ya: 'Tetap simpan', tidak: 'Perbaiki dulu' });
      if (!lanjut) return;
    }

    const isi = {
      tanggal: inTanggal.value,
      unit_id: unit.id,
      operator_id: opId,
      hm_awal: pakaiHm(unit) ? hmA : 0,
      hm_akhir: pakaiHm(unit) ? hmB : 0,
      km_awal: pakaiKm(unit) ? kmA : 0,
      km_akhir: pakaiKm(unit) ? kmB : 0,
      ritase: unit.kategori === 'DUMP TRUCK' ? (Number(inRitase.value) || 0) : 0,
      kegiatan: inKegiatan.value.trim(),
      lokasi: (inLokasi.querySelector('input').value || '').trim(),
      premi: Number(inPremi.value) || 0,
      catatan: inCatatan.value.trim(),
      hk: 0,
    };
    let idLog;
    if (barisAda) { D.ubah('work_logs', barisAda.id, isi); idLog = barisAda.id; }
    else idLog = D.tambah('work_logs', isi).id;

    // HM/KM dan premi harus di-acc kepala divisi dulu sebelum dihitung;
    // revisi pun kembali masuk antrean
    D.tandaiMenunggu('work_logs', idLog);

    sebarHk(opId, inTanggal.value, totalHk);

    p.tutup();
    pesan((barisAda ? 'Log harian diperbarui' : 'Log harian ditambahkan')
      + ' — menunggu acc kepala divisi sebelum dihitung di laporan.', 'sukses', 6);
    saatSelesai();
  };

  const badan = el('div', {}, [
    tempatGalat,
    isian('Tanggal *', inTanggal),
    isian('Unit *', inUnit),
    isian('Operator *', inOperator),
    el('div', { style: 'display:flex;gap:.4rem;margin-bottom:.4rem' }, [tombolMeterHm, tombolMeterKm]),
    barisHm,
    barisKm,
    barisAda ? null : el('p.bantuan', {
      teks: 'Kolom awal terisi otomatis dari pembacaan tertinggi sebelum tanggal ini — '
        + 'Anda tinggal mengisi angka meter SAAT INI di kolom akhir. Angka itu otomatis jadi '
        + '"awal" untuk log hari berikutnya. Kalau angkanya tidak urut, muncul peringatan.',
    }),
    catatanMeter,
    bungkusRitase,
    isian('Total HK hari ini *', inTotalHk, {
      bantuan: 'Kerja penuh = 1. Kalau operator ini kerja di beberapa lokasi pada hari yang sama, '
        + 'angka ini dibagi otomatis ke tiap barisnya.',
    }),
    catatanHk,
    isian('Kegiatan', inKegiatan),
    isian('Lokasi', inLokasi, { bantuan: 'Dipakai untuk rekap biaya per lokasi.' }),
    isian('Premi (Rp)', inPremi, { bantuan: 'Terisi otomatis dari tarif premi unit; boleh ditimpa manual.' }),
    catatanPremi,
    isian('Catatan', inCatatan),
  ]);

  const aksi = [];
  if (barisAda) {
    aksi.push(el('button.tombol-bahaya.tombol-kecil', {
      type: 'button', teks: 'Hapus', style: 'margin-right:auto',
      onclick: async () => {
        p.tutup();
        if (!await tanya('Hapus log harian?',
          'Baris ini dihapus permanen. HK operator pada tanggal itu dihitung ulang.',
          { ya: 'Hapus', bahaya: true })) return;
        const opId2 = Number(barisAda.operator_id);
        const tgl2 = barisAda.tanggal;
        const totalLama = totalHkGrup(opId2, tgl2);
        D.hapus('work_logs', barisAda.id);
        sebarHk(opId2, tgl2, Math.min(1, totalLama));
        pesan('Log harian dihapus.', 'sukses');
        saatSelesai();
      },
    }));
  }
  aksi.push(
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan', onclick: simpan }),
  );
  const p = panel(barisAda ? 'Ubah log harian' : 'Tambah log harian', badan, aksi);
}

let tglLog = null;

export function halamanLogHarian({ periode, gambar, bisaEdit }) {
  const wadah = el('section');

  // data lama yang meternya tidak urut langsung kelihatan di sini,
  // supaya salah ketik tanggal/meter tidak mengendap diam-diam
  const takUrut = meterMundur();
  if (takUrut.length) {
    wadah.append(el('div.petunjuk', {}, [
      el('strong', { teks: 'Meter tidak urut — periksa log berikut:' }),
      el('ul', {}, takUrut.slice(0, 6).map((t) => el('li', { teks: t }))),
      takUrut.length > 6 ? el('p', { teks: `…dan ${takUrut.length - 6} lagi.` }) : null,
    ].filter(Boolean)));
  }
  const [a, b] = periode.rentang();
  let tgl = tglLog && tglLog >= a && tglLog <= b ? tglLog : hariIni();
  if (tgl < a || tgl > b) tgl = a;
  tglLog = tgl;

  const tempat = el('div');
  const inTanggal = el('input', {
    type: 'date', nilai: tgl, min: a, max: b, 'aria-label': 'Tanggal',
    onchange: (e) => { tgl = e.target.value; tglLog = tgl; gambarIsi(); },
  });

  const gambarIsi = () => {
    const data = D.baris('work_logs').filter((r) => r.tanggal === tgl)
      .sort((x, y) => D.labelRef('units', x.unit_id).localeCompare(D.labelRef('units', y.unit_id), 'id'));
    taruh(kosongkan(tempat), tabel([
      { l: 'Unit', nilai: (r) => D.labelRef('units', r.unit_id) },
      { l: 'Operator', nilai: (r) => D.labelRef('operators', r.operator_id) },
      { l: 'HM dipakai', nilai: hmPakai, jenis: 'angka', pecahan: 1, total: true },
      { l: 'KM dipakai', nilai: kmPakai, jenis: 'angka', pecahan: 1, total: true },
      { l: 'Ritase', k: 'ritase', jenis: 'angka', total: true },
      { l: 'HK', k: 'hk', jenis: 'hk', total: true },
      { l: 'Lokasi', k: 'lokasi' },
      { l: 'Kegiatan', k: 'kegiatan' },
      { l: 'Premi (Rp)', k: 'premi', jenis: 'uang', total: true },
      { l: 'Status', nilai: (r) => (D.menungguPersetujuan('work_logs', r.id)
        ? el('span.chip.chip-tunggu', { teks: 'Menunggu acc' })
        : el('span.chip.chip-ok', { teks: 'OK' })) },
    ], data, {
      kosong: `Belum ada log pada ${ftanggal(tgl)}.`,
      saatKlik: bisaEdit() ? (r) => formLog(r, tgl, () => { gambarIsi(); gambar(); }) : null,
    }));
  };

  wadah.append(el('div.lembar', {}, [
    el('div.lembar-kepala', {}, [
      el('h2', { teks: 'Log harian unit' }),
      inTanggal,
      bisaEdit()
        ? el('button.tombol-utama', {
          type: 'button', teks: 'Tambah log',
          onclick: () => formLog(null, tgl, () => { gambarIsi(); gambar(); }),
        })
        : null,
    ]),
    el('div.lembar-isi', {}, [tempat]),
  ]));
  gambarIsi();
  if (!bisaEdit()) {
    wadah.prepend(el('div.petunjuk', {}, ['Mode lihat. Masukkan token GitHub di Pengaturan untuk bisa input data.']));
  }
  return wadah;
}

// =====================================================================
// ISI SOLAR
// =====================================================================
function formSolar(barisAda, saatSelesai) {
  const tempatGalat = el('div');
  const hitungan = el('p.bantuan', { teks: ' ' });
  const inTanggal = el('input', { type: 'date', nilai: barisAda?.tanggal || hariIni() });
  const inUnit = pilihan(opsiUnit(barisAda?.unit_id), barisAda?.unit_id);
  const inOperator = pilihan(opsiOperator(barisAda?.operator_id), barisAda?.operator_id);
  const inLiter = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.liter ?? '' });
  const inHarga = el('input', { type: 'number', step: '100', min: '0', nilai: barisAda?.harga_liter ?? '' });
  const inHm = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.hm ?? '' });
  const inKm = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.km ?? '' });
  const inLokasi = el('input', { type: 'text', nilai: barisAda?.lokasi ?? '' });
  const inCatatan = el('input', { type: 'text', nilai: barisAda?.catatan ?? '' });

  const perbarui = () => {
    const t = (Number(inLiter.value) || 0) * (Number(inHarga.value) || 0);
    hitungan.textContent = `Total biaya ${rupiahPenuh(t)}`;
  };
  inLiter.addEventListener('input', perbarui);
  inHarga.addEventListener('input', perbarui);
  perbarui();

  const simpan = () => {
    const salah = [];
    if (!inTanggal.value) salah.push('Tanggal harus diisi.');
    if (!inUnit.value) salah.push('Unit harus dipilih.');
    if (!(Number(inLiter.value) > 0)) salah.push('Liter harus lebih dari 0.');
    if (!(Number(inHarga.value) >= 0)) salah.push('Harga per liter tidak boleh minus.');
    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); badan.scrollTop = 0; return; }
    const isi = {
      tanggal: inTanggal.value,
      unit_id: Number(inUnit.value),
      operator_id: inOperator.value ? Number(inOperator.value) : null,
      liter: Number(inLiter.value),
      harga_liter: Number(inHarga.value) || 0,
      hm: Number(inHm.value) || 0,
      km: Number(inKm.value) || 0,
      lokasi: inLokasi.value.trim(),
      catatan: inCatatan.value.trim(),
    };
    if (barisAda) D.ubah('fuel_logs', barisAda.id, isi);
    else D.tambah('fuel_logs', isi);
    p.tutup();
    pesan(barisAda ? 'Pengisian solar diperbarui.' : 'Pengisian solar dicatat.', 'sukses');
    saatSelesai();
  };

  const badan = el('div', {}, [
    tempatGalat,
    isian('Tanggal *', inTanggal),
    isian('Unit *', inUnit),
    isian('Operator', inOperator),
    el('div.baris-isian', {}, [isian('Liter *', inLiter), isian('Harga per liter (Rp) *', inHarga)]),
    hitungan,
    el('div.baris-isian', {}, [isian('Posisi HM', inHm), isian('Posisi KM', inKm)]),
    isian('Tempat pengisian', inLokasi),
    isian('Catatan', inCatatan),
  ]);

  const aksi = [];
  if (barisAda) {
    aksi.push(el('button.tombol-bahaya.tombol-kecil', {
      type: 'button', teks: 'Hapus', style: 'margin-right:auto',
      onclick: async () => {
        p.tutup();
        if (!await tanya('Hapus catatan solar?', 'Baris ini dihapus permanen.',
          { ya: 'Hapus', bahaya: true })) return;
        D.hapus('fuel_logs', barisAda.id);
        pesan('Catatan solar dihapus.', 'sukses');
        saatSelesai();
      },
    }));
  }
  aksi.push(
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan', onclick: simpan }),
  );
  const p = panel(barisAda ? 'Ubah pengisian solar' : 'Catat pengisian solar', badan, aksi);
}

export function halamanSolar({ periode, gambar, bisaEdit }) {
  const tempat = el('div');
  const gambarIsi = () => {
    const data = D.baris('fuel_logs').filter(dalamPeriode(periode))
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    kosongkan(tempat).append(tabel([
      { l: 'Tanggal', k: 'tanggal', jenis: 'tanggal' },
      { l: 'Unit', nilai: (r) => D.labelRef('units', r.unit_id) },
      { l: 'Liter', k: 'liter', jenis: 'angka', pecahan: 1, total: true },
      { l: 'Harga/liter (Rp)', k: 'harga_liter', jenis: 'uang' },
      { l: 'Biaya (Rp)', nilai: (r) => (Number(r.liter) || 0) * (Number(r.harga_liter) || 0), jenis: 'uang', total: true },
      { l: 'Posisi HM', k: 'hm', jenis: 'angka', pecahan: 1 },
      { l: 'Tempat', k: 'lokasi' },
    ], data, {
      kosong: `Belum ada pengisian solar pada ${periode.judul()}.`,
      saatKlik: bisaEdit() ? (r) => formSolar(r, () => { gambarIsi(); gambar(); }) : null,
    }));
  };
  gambarIsi();
  const wadah = el('section', {}, [
    el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: 'Isi solar' }),
        bisaEdit()
          ? el('button.tombol-utama', {
            type: 'button', teks: 'Catat pengisian',
            onclick: () => formSolar(null, () => { gambarIsi(); gambar(); }),
          })
          : null,
      ]),
      el('div.lembar-isi', {}, [tempat]),
    ]),
  ]);
  if (!bisaEdit()) {
    wadah.prepend(el('div.petunjuk', {}, ['Mode lihat. Masukkan token GitHub di Pengaturan untuk bisa input data.']));
  }
  return wadah;
}

// =====================================================================
// SERVIS UNIT
// =====================================================================
function formServis(barisAda, saatSelesai) {
  const tempatGalat = el('div');
  const inTanggal = el('input', { type: 'date', nilai: barisAda?.tanggal || hariIni() });
  const inUnit = pilihan(opsiUnit(barisAda?.unit_id), barisAda?.unit_id);
  const inJenis = pilihan(JENIS_SERVIS.map((j) => ({ nilai: j, label: j })),
    barisAda?.jenis || 'Servis Berkala', { kosongLabel: '— pilih —' });
  const inDeskripsi = el('input', { type: 'text', nilai: barisAda?.deskripsi ?? '' });
  const inBiaya = el('input', { type: 'number', step: '1000', min: '0', nilai: barisAda?.biaya ?? '' });
  const inHm = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.hm ?? '' });
  const inKm = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.km ?? '' });
  const inBengkel = el('input', { type: 'text', nilai: barisAda?.bengkel ?? '' });
  const inCatatan = el('input', { type: 'text', nilai: barisAda?.catatan ?? '' });

  const simpan = () => {
    const salah = [];
    if (!inTanggal.value) salah.push('Tanggal harus diisi.');
    if (!inUnit.value) salah.push('Unit harus dipilih.');
    if (!inJenis.value) salah.push('Jenis servis harus dipilih.');
    if (Number(inBiaya.value) < 0) salah.push('Biaya tidak boleh minus.');
    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); badan.scrollTop = 0; return; }
    const isi = {
      tanggal: inTanggal.value,
      unit_id: Number(inUnit.value),
      jenis: inJenis.value,
      deskripsi: inDeskripsi.value.trim(),
      biaya: Number(inBiaya.value) || 0,
      hm: Number(inHm.value) || 0,
      km: Number(inKm.value) || 0,
      bengkel: inBengkel.value.trim(),
      lokasi: barisAda?.lokasi ?? '',
      catatan: inCatatan.value.trim(),
    };
    if (barisAda) D.ubah('service_logs', barisAda.id, isi);
    else D.tambah('service_logs', isi);
    p.tutup();
    pesan(barisAda ? 'Catatan servis diperbarui.' : 'Servis dicatat.', 'sukses');
    saatSelesai();
  };

  const badan = el('div', {}, [
    tempatGalat,
    isian('Tanggal *', inTanggal),
    isian('Unit *', inUnit),
    isian('Jenis servis *', inJenis),
    isian('Deskripsi', inDeskripsi),
    isian('Biaya (Rp)', inBiaya),
    el('div.baris-isian', {}, [isian('Posisi HM', inHm), isian('Posisi KM', inKm)]),
    isian('Bengkel', inBengkel),
    isian('Catatan', inCatatan),
  ]);

  const aksi = [];
  if (barisAda) {
    aksi.push(el('button.tombol-bahaya.tombol-kecil', {
      type: 'button', teks: 'Hapus', style: 'margin-right:auto',
      onclick: async () => {
        p.tutup();
        if (!await tanya('Hapus catatan servis?', 'Baris ini dihapus permanen.',
          { ya: 'Hapus', bahaya: true })) return;
        D.hapus('service_logs', barisAda.id);
        pesan('Catatan servis dihapus.', 'sukses');
        saatSelesai();
      },
    }));
  }
  aksi.push(
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan', onclick: simpan }),
  );
  const p = panel(barisAda ? 'Ubah catatan servis' : 'Catat servis unit', badan, aksi);
}

export function halamanServis({ periode, gambar, bisaEdit }) {
  const tempat = el('div');
  const gambarIsi = () => {
    const data = D.baris('service_logs').filter(dalamPeriode(periode))
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    kosongkan(tempat).append(tabel([
      { l: 'Tanggal', k: 'tanggal', jenis: 'tanggal' },
      { l: 'Unit', nilai: (r) => D.labelRef('units', r.unit_id) },
      { l: 'Jenis', k: 'jenis' },
      { l: 'Deskripsi', k: 'deskripsi' },
      { l: 'Posisi HM', k: 'hm', jenis: 'angka', pecahan: 1 },
      { l: 'Bengkel', k: 'bengkel' },
      { l: 'Biaya (Rp)', k: 'biaya', jenis: 'uang', total: true },
    ], data, {
      kosong: `Belum ada servis pada ${periode.judul()}.`,
      saatKlik: bisaEdit() ? (r) => formServis(r, () => { gambarIsi(); gambar(); }) : null,
    }));
  };
  gambarIsi();
  const wadah = el('section', {}, [
    el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: 'Servis unit' }),
        bisaEdit()
          ? el('button.tombol-utama', {
            type: 'button', teks: 'Catat servis',
            onclick: () => formServis(null, () => { gambarIsi(); gambar(); }),
          })
          : null,
      ]),
      el('div.lembar-isi', {}, [tempat]),
    ]),
  ]);
  if (!bisaEdit()) {
    wadah.prepend(el('div.petunjuk', {}, ['Mode lihat. Masukkan token GitHub di Pengaturan untuk bisa input data.']));
  }
  return wadah;
}


// =====================================================================
// HALAMAN: Tarif premi per unit (admin, dikunci PIN admin)
// =====================================================================
export function halamanTarifPremi({ gambar, bisaEdit }) {
  const wadah = el('section');
  // sekali dibuka, tetap terbuka selama tab hidup (lihat halamanPengaturanKebun)
  let terbuka = sessionStorage.getItem('app.tarif.buka') === '1';

  const gambarIsi = () => {
    kosongkan(wadah);
    if (!terbuka) {
      wadah.append(el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Tarif premi unit' })]),
        el('div.lembar-isi', {}, [
          el('p', { teks: adminPinTerpasang()
            ? 'Rp per HM dan Rp per KM tiap unit — dasar hitungan premi operator. Masukkan PIN admin.'
            : 'PIN admin belum dipasang (pasang di bagian Payroll Operasional, menu Pengaturan Kebun). '
              + 'Halaman ini tetap bisa dibuka selama PIN belum ada.' }),
          el('button.tombol-utama', {
            type: 'button', teks: adminPinTerpasang() ? 'Masukkan PIN admin' : 'Buka',
            onclick: async () => {
              if (!adminPinTerpasang()) { terbuka = true; sessionStorage.setItem('app.tarif.buka', '1'); gambarIsi(); return; }
              if (await mintaPin('PIN admin', 'PIN ini melindungi tarif premi unit.', periksaPinAdmin)) {
                terbuka = true; sessionStorage.setItem('app.tarif.buka', '1'); gambarIsi();
              }
            },
          }),
        ]),
      ]));
      return;
    }

    const baris = D.aktif('units').map((u) => {
      const t = tarifPremiUnit(u.id);
      return { id: u.id, unit: TABEL.units.label(u), kategori: u.kategori || '', hm: t.hm, km: t.km };
    });
    wadah.append(el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [el('h2', { teks: 'Tarif premi per unit' })]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', { teks: 'Klik satu baris untuk mengisi tarifnya. Premi di form log harian '
          + 'dihitung otomatis: HM dipakai × Rp/HM + KM dipakai × Rp/KM.' }),
        tabel([
          { l: 'Unit', k: 'unit' },
          { l: 'Kategori', k: 'kategori' },
          { l: 'Rp per HM', k: 'hm', jenis: 'uang' },
          { l: 'Rp per KM', k: 'km', jenis: 'uang' },
        ], baris, {
          kosong: 'Belum ada unit aktif.',
          saatKlik: bisaEdit() ? (r) => formTarif(r, () => { gambarIsi(); gambar(); }) : null,
        }),
      ]),
    ]));
  };

  const formTarif = (r, saatSelesai) => {
    const inHm = el('input', { type: 'number', step: '100', min: '0', nilai: r.hm || '' });
    const inKm = el('input', { type: 'number', step: '100', min: '0', nilai: r.km || '' });
    const pn = panel(`Tarif premi — ${r.unit}`, el('div', {}, [
      el('div.baris-isian', {}, [
        isian('Rp per HM', inHm, { bantuan: 'Untuk alat berat (dihitung dari HM terpakai).' }),
        isian('Rp per KM', inKm, { bantuan: 'Untuk kendaraan (dihitung dari KM terpakai).' }),
      ]),
      el('p.bantuan', { teks: 'Kosongkan dua-duanya kalau unit ini preminya diisi manual.' }),
    ]), [
      el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => pn.tutup() }),
      el('button.tombol-utama', {
        type: 'button', teks: 'Simpan',
        onclick: () => {
          D.setWeb((w) => {
            w.unitPremi ||= {};
            w.unitPremi[String(r.id)] = { hm: Number(inHm.value) || 0, km: Number(inKm.value) || 0 };
          });
          pn.tutup();
          pesan('Tarif premi disimpan. Jangan lupa Simpan ke GitHub.', 'sukses');
          saatSelesai(); gambar();
        },
      }),
    ]);
  };

  gambarIsi();
  return wadah;
}

// =====================================================================
// HALAMAN: Persetujuan log alat berat (kepala divisi Infra)
// =====================================================================
export function jumlahMenungguAlat() {
  return D.baris('work_logs').filter((r) => !r.deleted_at
    && D.menungguPersetujuan('work_logs', r.id)).length;
}

export function halamanPersetujuanAlat({ gambar, bisaEdit, hak }) {
  const bolehSetuju = hak?.setuju || (() => true);
  const bolehBatal = hak?.batal || (() => false);
  const wadah = el('section');
  const tempat = el('div');

  const gambarIsi = () => {
    kosongkan(tempat);
    const menunggu = D.baris('work_logs')
      .filter((r) => !r.deleted_at && D.menungguPersetujuan('work_logs', r.id))
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));

    const putuskan = async (baris, setuju) => {
      if (!bisaEdit()) { pesan('Aktifkan mode edit dulu.', 'awas', 6); return; }
      if (!bolehSetuju()) { pesan('Anda tidak diberi hak menyetujui.', 'awas', 6); return; }
      const daftarPutus = baris ? [baris] : menunggu;
      if (!baris) {
        const lanjut = await tanya(
          setuju ? `Setujui semua ${menunggu.length} log?` : `Tolak semua ${menunggu.length} log?`,
          setuju ? 'Semua HM/KM dan preminya langsung dihitung di laporan.'
            : 'Semua log itu dihapus (masih bisa dipulihkan).',
          { ya: setuju ? 'Setujui semua' : 'Tolak semua', bahaya: !setuju });
        if (!lanjut) return;
      }
      for (const r of daftarPutus) {
        if (setuju) D.setujui('work_logs', r.id, D.namaPengisi() || 'Kepala divisi');
        else D.tolak('work_logs', r.id, D.namaPengisi() || 'Kepala divisi');
      }
      pesan(`${daftarPutus.length} log ${setuju ? 'disetujui' : 'ditolak'}. Jangan lupa Simpan.`, 'sukses', 6);
      gambarIsi(); gambar();
    };

    if (!menunggu.length) {
      tempat.append(el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Tidak ada yang menunggu' })]),
        el('div.lembar-isi', {}, [el('p', { teks: 'Semua log harian sudah diputuskan. '
          + 'Log baru (termasuk revisinya) akan muncul di sini.' })]),
      ]));
    } else {
      const nilai = menunggu.reduce((n, r) => n + (Number(r.premi) || 0), 0);
      tempat.append(el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [
          el('h2', { teks: `Log menunggu — ${menunggu.length} baris · premi ${rupiahPenuh(nilai)}` }),
          el('button.tombol-utama.tombol-kecil', { type: 'button', teks: 'Setujui semua', onclick: () => putuskan(null, true) }),
        ]),
        el('div.lembar-isi', {}, [
          tabel([
            { l: 'Tanggal', nilai: (r) => ftanggal(r.tanggal) },
            { l: 'Unit', nilai: (r) => D.labelRef('units', r.unit_id) },
            { l: 'Operator', nilai: (r) => D.labelRef('operators', r.operator_id) },
            { l: 'HM', nilai: hmPakai, jenis: 'angka', pecahan: 1 },
            { l: 'KM', nilai: kmPakai, jenis: 'angka', pecahan: 1 },
            { l: 'Premi (Rp)', k: 'premi', jenis: 'uang', total: true },
            { l: '', nilai: (r) => el('span', {}, [
              el('button.tombol-kecil.tombol-utama', { type: 'button', teks: 'Setujui',
                onclick: (ev) => { ev.stopPropagation(); putuskan(r, true); } }),
              ' ',
              el('button.tombol-kecil.tombol-samar', { type: 'button', teks: 'Tolak',
                onclick: (ev) => { ev.stopPropagation(); putuskan(r, false); } }),
            ]) },
          ], menunggu, { kosong: '—' }),
        ]),
      ]));
    }

    // sudah disetujui — bisa dibatalkan oleh yang punya hak
    const sudah = D.daftarStatus('work_logs', 'disetujui')
      .map((id) => D.cari('work_logs', id))
      .filter((r) => r && !r.deleted_at)
      .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))
      .slice(0, 30);
    if (sudah.length) {
      tempat.append(el('div.lembar', { style: 'margin-top:1.4rem' }, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Sudah disetujui' })]),
        el('div.lembar-isi', {}, [
          el('p.bantuan', { teks: bolehBatal()
            ? 'Yang telanjur di-acc bisa dibatalkan — kembali menunggu dan keluar dari hitungan laporan.'
            : 'Hanya pengguna dengan hak "Batalkan persetujuan" yang bisa membatalkan.' }),
          tabel([
            { l: 'Tanggal', nilai: (r) => ftanggal(r.tanggal) },
            { l: 'Unit', nilai: (r) => D.labelRef('units', r.unit_id) },
            { l: 'Operator', nilai: (r) => D.labelRef('operators', r.operator_id) },
            { l: 'Premi (Rp)', k: 'premi', jenis: 'uang' },
            { l: 'Di-acc oleh', nilai: (r) => D.catatanPersetujuan('work_logs', r.id)?.oleh || '–' },
            ...(bolehBatal() && bisaEdit() ? [{
              l: '', nilai: (r) => el('button.tombol-samar.tombol-kecil', {
                type: 'button', teks: 'Batalkan',
                onclick: async (ev) => {
                  ev.stopPropagation();
                  if (!await tanya('Batalkan persetujuan log ini?',
                    'Kembali jadi menunggu dan tidak dihitung di laporan sampai di-acc lagi.',
                    { ya: 'Batalkan', bahaya: true })) return;
                  D.batalkan('work_logs', r.id, D.namaPengisi() || 'Web');
                  pesan('Dibatalkan — kembali menunggu. Jangan lupa Simpan.', 'sukses', 6);
                  gambarIsi(); gambar();
                },
              }),
            }] : []),
          ], sudah, { kosong: '—' }),
        ]),
      ]));
    }
  };

  gambarIsi();
  wadah.append(el('div.petunjuk', {}, [
    'Log harian yang baru diinput atau direvisi menunggu acc kepala divisi. Selama menunggu, '
    + 'HM/KM dan preminya TIDAK dihitung di ringkasan unit, payroll operator, maupun biaya lokasi.',
  ]), tempat);
  return wadah;
}

// =====================================================================
// HALAMAN: Monitor kepala divisi Infra — gabungan HK payroll + alat berat
// =====================================================================
let pilihanMonitor = { jenis: 'paruh1', solar: 'bulan' };

export function halamanMonitorAlat({ periode, gambar, bisaEdit }) {
  const wadah = el('section');
  const tempatBiaya = el('div');
  const tempatSolar = el('div');

  const kunciBulan = () => `${periode.tahun}-${String(periode.bulan).padStart(2, '0')}`;
  const targetKini = () => {
    const t = D.web().targetAlat?.[kunciBulan()];
    if (!t) return null;
    const j = pilihanMonitor.jenis;
    return Number(j === 'paruh1' ? t.paruh1 : j === 'paruh2' ? t.paruh2 : t.bulan) || null;
  };

  // ------------------------------------------------ biaya vs target periode
  const gambarBiaya = async () => {
    kosongkan(tempatBiaya).append(el('p.bantuan', { teks: 'Menghitung…' }));
    const r = rentangPeriode(periode.tahun, periode.bulan, pilihanMonitor.jenis);
    const dalam = (x) => !x.deleted_at && x.tanggal >= r.dari && x.tanggal <= r.sampai;

    const log = D.baris('work_logs').filter((x) => dalam(x) && D.disetujui('work_logs', x.id));
    let totalHkOp = 0; let totalJam = 0; let upahHkOp = 0; let upahJam = 0; let premiOp = 0;
    for (const x of log) {
      const o = D.cari('operators', x.operator_id);
      const hk = Number(x.hk) || 0;
      totalHkOp += hk;
      totalJam += hmPakai(x);
      upahHkOp += hk * (Number(o?.tarif_harian) || 0);
      upahJam += hmPakai(x) * (Number(o?.tarif_jam) || 0);
      premiOp += Number(x.premi) || 0;
    }
    const biayaSolar = D.baris('fuel_logs').filter(dalam)
      .reduce((n, x) => n + (Number(x.liter) || 0) * (Number(x.harga_liter) || 0), 0);
    const servis = D.baris('service_logs').filter(dalam);
    const biayaServis = servis.reduce((n, x) => n + (Number(x.biaya) || 0), 0);

    // ---- HK divisi Infrastruktur, dibaca dari bagian Payroll (hanya baca)
    let infra = null;
    const lain = await D.muatBagianLain('data/payroll.json');
    if (lain?.tabel) {
      const t = lain.tabel;
      const div = (t.divisions || []).find((d) => /infra/i.test(String(d.nama_divisi || '')));
      if (div) {
        const hidup = (n) => (t[n] || []).filter((x) => !x.deleted_at);
        const pas = (x) => x.tanggal >= r.dari && x.tanggal <= r.sampai
          && Number(x.division_id) === Number(div.id);
        const acc = (tab, id) => {
          const c = lain.web?.persetujuan?.[tab]?.[String(id)];
          return !c || c.status === 'disetujui';
        };
        const hk = hidup('daily_payroll').filter(pas);
        const borongan = hidup('borongan_transactions').filter(pas);
        const lembur = hidup('lembur_transactions').filter((x) => pas(x) && acc('lembur_transactions', x.id));
        const premiP = hidup('premi_transactions').filter((x) => pas(x) && acc('premi_transactions', x.id));
        const jml = (a) => a.reduce((n, x) => n + (Number(x.nominal) || 0), 0);
        infra = {
          hk: hk.reduce((n, x) => n + (Number(x.hk) || 0), 0),
          upahHk: jml(hk),
          lain: jml(borongan) + jml(lembur) + jml(premiP),
        };
      }
    }

    const total = (infra ? infra.upahHk + infra.lain : 0)
      + upahHkOp + upahJam + premiOp + biayaSolar + biayaServis;
    const totalHk = (infra?.hk || 0) + totalHkOp;
    const upahHkGabungan = (infra?.upahHk || 0) + upahHkOp;
    const target = targetKini();
    const persen = target ? Math.round((total / target) * 1000) / 10 : null;

    kosongkan(tempatBiaya).append(el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [el('h2', { teks: `Biaya divisi Infrastruktur — ${r.label}` })]),
      el('div.lembar-isi', {}, [
        tabel([
          { l: 'Jenis biaya', k: 'jenis' },
          { l: 'Jumlah', k: 'jumlah' },
          { l: 'Nilai (Rp)', k: 'rp', jenis: 'uang', total: true },
        ], [
          ...(infra ? [
            { jenis: 'HK Infrastruktur (bagian Payroll)', jumlah: `${fhk(infra.hk)} HK`, rp: infra.upahHk },
            { jenis: 'Borongan, lembur & premi Infra (Payroll, disetujui)', jumlah: '', rp: infra.lain },
          ] : []),
          { jenis: 'Upah HK operator', jumlah: `${fhk(totalHkOp)} HK`, rp: upahHkOp },
          { jenis: 'Upah jam / lembur operator (HM × tarif jam)', jumlah: `${angka(totalJam, 1)} jam`, rp: upahJam },
          { jenis: 'Premi operator (disetujui)', jumlah: `${log.length} log`, rp: premiOp },
          { jenis: 'Solar', jumlah: '', rp: biayaSolar },
          { jenis: 'Servis', jumlah: `${servis.length} kali`, rp: biayaServis },
        ], { kosong: 'Belum ada biaya.' }),
        infra ? null : el('p.bantuan', {
          teks: 'Bagian Payroll tidak terbaca (berkas belum ada, atau passwordnya berbeda) — '
            + 'biaya HK Infrastruktur belum ikut dihitung di sini.',
        }),
        target == null
          ? el('p.bantuan', { teks: 'Target periode ini belum diisi — klik "Atur target" '
            + 'untuk mengisi manual, mis. 15.000.000 per 2 minggu.' })
          : el('div', {}, [
            el('div.meter', {}, [el('div.meter-isi' + (total > target ? '.lewat' : ''), {
              style: `width:${Math.min(100, persen)}%`,
            })]),
            el('p', { teks: `Terpakai ${rupiahPenuh(total)} dari target ${rupiahPenuh(target)} (${angka(persen, 1)}%).` }),
            kotakRekomendasi(rekomendasiAnggaran(
              { total, totalHk, upahHk: upahHkGabungan }, target, r.dari, r.sampai), target),
          ]),
      ]),
    ]));
  };

  // ------------------------- pemakaian solar: terpisah dari periode biaya.
  // Isi solar sifatnya terputus-putus (sekali isi untuk beberapa hari), jadi
  // dihitung per BULAN atau KESELURUHAN — bukan per 2 minggu.
  const gambarSolar = () => {
    kosongkan(tempatSolar);
    const perBulan = pilihanMonitor.solar === 'bulan';
    const kb = kunciBulan();
    const pas = (x) => !x.deleted_at && (!perBulan || String(x.tanggal).startsWith(kb));

    const kelompok = new Map();   // unit -> angka (per unit, bukan per tipe)
    const ambil = (unitId) => {
      const u = D.cari('units', unitId);
      const k = u ? u.id : 'lainnya';
      if (!kelompok.has(k)) {
        kelompok.set(k, {
          unit: u ? TABEL.units.label(u) : 'Unit terhapus',
          kategori: (u?.kategori || 'Lainnya').toUpperCase(),
          pakaiHm: pakaiHm(u), liter: 0, rp: 0, hm: 0, km: 0,
        });
      }
      return kelompok.get(k);
    };
    for (const x of D.baris('fuel_logs')) {
      if (!pas(x)) continue;
      const b = ambil(x.unit_id);
      b.liter += Number(x.liter) || 0;
      b.rp += (Number(x.liter) || 0) * (Number(x.harga_liter) || 0);
    }
    for (const x of D.baris('work_logs')) {
      if (!pas(x) || !D.disetujui('work_logs', x.id)) continue;
      const b = ambil(x.unit_id);
      b.hm += hmPakai(x);
      b.km += kmPakai(x);
    }

    const baris = [...kelompok.values()]
      .sort((a, b) => a.kategori.localeCompare(b.kategori, 'id')
        || a.unit.localeCompare(b.unit, 'id'))
      .map((b) => ({
        unit: b.unit,
        kategori: b.kategori,
        liter: b.liter,
        rp: b.rp,
        terpakai: b.pakaiHm ? `${angka(b.hm, 1)} HM` : `${angka(b.km, 1)} KM`,
        // alat berat dinilai dari liter/HM, kendaraan dari KM/liter
        rasio: b.pakaiHm
          ? (b.liter && b.hm
            ? `${angka(b.liter / b.hm, 2)} liter/HM (${angka(b.hm / b.liter, 2)} HM/liter)`
            : '–')
          : (b.km && b.liter
            ? `${angka(b.km / b.liter, 2)} KM/liter (${angka(b.liter / b.km, 2)} liter/KM)`
            : '–'),
        perSatuan: b.pakaiHm
          ? (b.hm ? `${rupiahPenuh(b.rp / b.hm)} per HM` : '–')
          : (b.km ? `${rupiahPenuh(b.rp / b.km)} per KM` : '–'),
      }));

    const pilihSolar = pilihan([
      { nilai: 'bulan', label: `Bulan terpilih (${kb})` },
      { nilai: 'semua', label: 'Keseluruhan data' },
    ], pilihanMonitor.solar, {
      saatUbah: () => { pilihanMonitor.solar = pilihSolar.value || 'bulan'; gambarSolar(); },
    });
    pilihSolar.querySelector('option[value=""]')?.remove();
    pilihSolar.value = pilihanMonitor.solar;

    tempatSolar.append(el('div.lembar', { style: 'margin-top:1.4rem' }, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: 'Pemakaian solar per unit' }),
        pilihSolar,
      ]),
      el('div.lembar-isi', {}, [
        tabel([
          { l: 'Unit', k: 'unit' },
          { l: 'Tipe', k: 'kategori' },
          { l: 'Terpakai', k: 'terpakai' },
          { l: 'Solar (liter)', k: 'liter', jenis: 'angka', pecahan: 1, total: true },
          { l: 'Biaya solar (Rp)', k: 'rp', jenis: 'uang', total: true },
          { l: 'Pemakaian', k: 'rasio' },
          { l: 'Biaya per satuan', k: 'perSatuan' },
        ], baris, { kosong: 'Belum ada pengisian solar.' }),
        el('p.bantuan', {
          teks: 'Pengisian solar sifatnya terputus-putus (sekali isi dipakai beberapa hari), jadi '
            + 'pemakaian dihitung per bulan atau keseluruhan — bukan per 2 minggu. '
            + 'Hanya HM/KM dari log yang sudah di-acc yang dihitung.',
        }),
      ]),
    ]));
  };

  // ------------------------------------------------------------ kerangka
  const pilihJenis = pilihan([
    { nilai: 'paruh1', label: 'Paruh 1 (1–15)' },
    { nilai: 'paruh2', label: 'Paruh 2 (16–akhir)' },
    { nilai: 'bulan', label: 'Sebulan penuh' },
  ], pilihanMonitor.jenis, {
    saatUbah: () => { pilihanMonitor.jenis = pilihJenis.value || 'paruh1'; gambarBiaya(); },
  });
  pilihJenis.querySelector('option[value=""]')?.remove();
  pilihJenis.value = pilihanMonitor.jenis;

  const tombolTarget = el('button.tombol-samar.tombol-kecil', {
    type: 'button', teks: 'Atur target',
    onclick: async () => {
      if (adminPinTerpasang()
        && !await mintaPin('PIN admin', 'Target hanya bisa diubah admin.', periksaPinAdmin)) return;
      const t = D.web().targetAlat?.[kunciBulan()] || {};
      const inP1 = el('input', { type: 'number', step: '100000', min: '0', nilai: t.paruh1 || '' });
      const inP2 = el('input', { type: 'number', step: '100000', min: '0', nilai: t.paruh2 || '' });
      const inB = el('input', { type: 'number', step: '100000', min: '0', nilai: t.bulan || '' });
      const pn = panel(`Target biaya Infrastruktur — ${kunciBulan()}`, el('div', {}, [
        el('p.bantuan', { teks: 'Target gabungan: HK Infrastruktur (Payroll) + seluruh biaya alat '
          + 'berat & kendaraan. Contoh: 15.000.000 per paruh (2 minggu).' }),
        el('div.baris-isian', {}, [isian('Paruh 1 (Rp)', inP1), isian('Paruh 2 (Rp)', inP2)]),
        isian('Sebulan penuh (Rp)', inB),
      ]), [
        el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => pn.tutup() }),
        el('button.tombol-utama', {
          type: 'button', teks: 'Simpan',
          onclick: () => {
            D.setWeb((w) => {
              w.targetAlat ||= {};
              w.targetAlat[kunciBulan()] = {
                paruh1: Number(inP1.value) || 0, paruh2: Number(inP2.value) || 0, bulan: Number(inB.value) || 0,
              };
            });
            pn.tutup(); pesan('Target disimpan. Jangan lupa Simpan ke GitHub.', 'sukses');
            gambarBiaya(); gambar();
          },
        }),
      ]);
    },
  });

  wadah.append(el('div.lembar', { style: 'margin-bottom:1.2rem' }, [
    el('div.lembar-kepala', {}, [
      el('h2', { teks: 'Periode biaya' }), pilihJenis,
      ...(bisaEdit() ? [tombolTarget] : []),
    ]),
  ]), tempatBiaya, tempatSolar);
  gambarBiaya();
  gambarSolar();
  return wadah;
}

export { hmPakai, kmPakai, dalamPeriode, sebarHk, totalHkGrup, meterTerakhir };
