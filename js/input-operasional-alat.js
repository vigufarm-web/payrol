import {approvalDateNotice} from './approval-dates.js';
import {approvalSelection,approvalDateOptions} from './approval-date-selection.js';
import {explainApproval} from './approval-editor.js';
// input-operasional-alat.js — halaman input bagian Alat Berat & Kendaraan:
// Log Harian (HM/KM/ritase), Isi Solar, dan Servis Unit.
//
// Aturan HK mengikuti aplikasi desktop: operator mengisi "Total HK hari ini"
// (maksimal 1), lalu total itu DIBAGI OTOMATIS ke semua baris log operator
// tersebut pada tanggal yang sama, proporsional terhadap HM (atau KM) yang
// dijalankan tiap baris. Baris tanpa HM/KM dibagi rata.

import * as D from './data.js';
import { TABEL, JENIS_SERVIS, pakaiHm, pakaiKm } from './skema-alat.js';
import {
  el, tabel, isian, pilihan, pilihanCari, pasangPilihanCepat, kesalahan, panel, tanya, mintaTeks, pesan, kosongkan, taruh,
  rupiah, rupiahPenuh, angka, hk as fhk, tanggal as ftanggal, hariIni,
} from './ui.js';
import {
  mintaPin, periksaPinAdmin, adminPinTerpasang, rentangPeriode,
  rekomendasiAnggaran, kotakRekomendasi, jedaInput,
} from './kebun.js';
import { pasangSaranRiwayat, pastikanSaran } from './saran-input.js';
import { masalahMeterBerurutan } from './kualitas-data.js';

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
const daftarLokasi = () => [...new Set([...D.aktif('blocks').map(r=>r.nama_blok),...D.baris('work_logs').map(r=>r.lokasi).filter(name=>!D.baris('blocks').some(b=>b.gis_active===false&&b.nama_blok===name))].filter(Boolean))].sort();

/** Pilihan unit/operator yang paling baru dan paling sering dipakai. */
function referensiSering(tabelNama, kolom, opsi, batas = 7) {
  const statistik = new Map();
  for (const nama of (Array.isArray(tabelNama) ? tabelNama : [tabelNama])) {
    for (const r of D.baris(nama).filter((x) => !x.deleted_at)) {
      const id = String(r[kolom] ?? '');
      if (!id) continue;
      const s = statistik.get(id) || { jumlah: 0, terakhir: '' };
      s.jumlah += 1;
      if (String(r.tanggal || '') > s.terakhir) s.terakhir = String(r.tanggal || '');
      statistik.set(id, s);
    }
  }
  return opsi.map((o) => ({ ...o, statistik: statistik.get(String(o.nilai)) }))
    .filter((o) => o.statistik)
    .sort((a, b) => b.statistik.terakhir.localeCompare(a.statistik.terakhir)
      || b.statistik.jumlah - a.statistik.jumlah
      || a.label.localeCompare(b.label, 'id'))
    .slice(0, batas)
    .map((o) => ({ nilai: o.nilai, label: o.label, keterangan: `${o.statistik.jumlah}× dipakai` }));
}

/** Tarif premi per unit: Rp per HM, per KM, dan per ritase (diatur admin).
 *  Dasar hitungan mengikuti mana yang diisi — mis. dump truck bisa pakai
 *  Rp/ritase saja dan mengosongkan Rp/KM. */
export const tarifPremiUnit = (unitId) => {
  const t = D.web().unitPremi?.[String(unitId)] || {};
  return { hm: Number(t.hm) || 0, km: Number(t.km) || 0, rit: Number(t.rit) || 0 };
};

/** Premi otomatis satu log = HM×tarif/HM + KM×tarif/KM + ritase×tarif/ritase. */
export function premiOtomatis(unitId, log) {
  const t = tarifPremiUnit(unitId);
  return Math.round(hmPakai(log) * t.hm + kmPakai(log) * t.km
    + (Number(log.ritase) || 0) * t.rit);
}

/** Unit yang wajar punya ritase: kendaraan (pakai KM), kategori dump truck,
 *  atau unit yang tarif premi ritasenya diisi. */
const pakaiRitase = (unit) => !!unit && (pakaiKm(unit)
  || unit.kategori === 'DUMP TRUCK' || tarifPremiUnit(unit.id).rit > 0);

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
  const semua = D.baris('work_logs').filter((r) => !r.deleted_at
    && Number(r.unit_id) === Number(unitId)
    && Number(r.id) !== Number(kecualiId)
    && String(r.tanggal) <= String(tanggal))
    .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || Number(a.id) - Number(b.id));
  const batas = semua.findLastIndex((r) => r.meter_reset);
  const log = batas >= 0 ? semua.slice(batas) : semua;
  const maks = (k) => log.reduce((n, r) => Math.max(n, Number(r[k]) || 0), 0);
  return { hm: maks('hm_akhir'), km: maks('km_akhir'), ada: log.length > 0 };
}

/**
 * Cari pasangan log berurutan yang meternya MUNDUR — tanggal lebih baru
 * tapi angkanya lebih kecil. Itu selalu salah ketik (entah tanggalnya,
 * entah meternya), jadi ditampilkan sebagai peringatan di halaman log.
 */
function meterMundur() {
  return masalahMeterBerurutan(D.state.data);
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
  if (!barisAda) {
    pasangPilihanCepat(inUnit, referensiSering('work_logs', 'unit_id', opsiUnit()), {
      judul: 'Unit terakhir & sering dipakai',
    });
  }

  const inHmAwal = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.hm_awal ?? '' });
  const inHmAkhir = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.hm_akhir ?? '' });
  const inKmAwal = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.km_awal ?? '' });
  const inKmAkhir = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.km_akhir ?? '' });
  const inRitase = el('input', { type: 'number', step: '1', min: '0', nilai: barisAda?.ritase ?? 0 });
  const inTotalHk = el('input', { type: 'number', step: '0.05', min: '0', max: '1', nilai: 1 });
  const riwayatLog = D.baris('work_logs').filter((r) => !r.deleted_at);
  const inKegiatan = pasangSaranRiwayat(
    el('input', { type: 'text', nilai: barisAda?.kegiatan ?? '', autocomplete: 'off' }),
    riwayatLog.map((r) => ({ nilai: r.kegiatan, tanggal: r.tanggal })),
  );
  const inLokasi = pilihanCari(daftarLokasi().map((l) => ({ nilai: l, label: l })), null,
    { tempat: 'mis. Blok A01' });
  const inPremi = el('input', { type: 'number', step: '1000', min: '0', nilai: barisAda?.premi ?? 0 });
  const inResetMeter = el('input', { type: 'checkbox' });
  inResetMeter.checked = Boolean(barisAda?.meter_reset);
  const inAlasanReset = el('input', {
    type: 'text', nilai: barisAda?.meter_reset_alasan || '',
    placeholder: 'mis. hour meter diganti setelah servis', autocomplete: 'off',
  });
  const bungkusAlasanReset = isian('Alasan penggantian/reset *', inAlasanReset);
  const aturReset = () => {
    bungkusAlasanReset.style.display = inResetMeter.checked ? '' : 'none';
    if (!inResetMeter.checked) isiAwalOtomatis();
    perbaruiCatatan();
  };
  let premiManual = barisAda != null;   // baris lama: angka tersimpan jangan ditimpa
  inPremi.addEventListener('input', () => { premiManual = true; });
  const catatanPremi = el('p.bantuan', { teks: ' ' });
  const hitungPremi = () => {
    const unit = D.cari('units', inUnit.value);
    if (!unit) { catatanPremi.textContent = ' '; return; }
    const t = tarifPremiUnit(unit.id);
    if (!t.hm && !t.km && !t.rit) {
      catatanPremi.textContent = 'Tarif premi unit ini belum diatur (menu Tarif Premi Unit) — premi diisi manual.';
      return;
    }
    const log = { hm_awal: inHmAwal.value, hm_akhir: inHmAkhir.value,
      km_awal: inKmAwal.value, km_akhir: inKmAkhir.value, ritase: inRitase.value };
    const nilai = premiOtomatis(unit.id, log);
    const rinci = [];
    if (t.hm && hmPakai(log)) rinci.push(`${angka(hmPakai(log), 1)} HM × ${rupiahPenuh(t.hm)}`);
    if (t.km && kmPakai(log)) rinci.push(`${angka(kmPakai(log), 1)} KM × ${rupiahPenuh(t.km)}`);
    if (t.rit && Number(log.ritase)) rinci.push(`${angka(Number(log.ritase), 1)} rit × ${rupiahPenuh(t.rit)}`);
    catatanPremi.textContent = rinci.length
      ? `Premi otomatis: ${rinci.join(' + ')} = ${rupiahPenuh(nilai)}` + (premiManual ? ' (diubah manual)' : '')
      : 'Isi meter/ritasenya dulu — premi dihitung dari situ.';
    if (!premiManual) inPremi.value = nilai;
  };
  const inCatatan = pasangSaranRiwayat(
    el('input', { type: 'text', nilai: barisAda?.catatan ?? '', autocomplete: 'off' }),
    riwayatLog.map((r) => ({ nilai: r.catatan, tanggal: r.tanggal })),
  );
  if (barisAda?.lokasi) inLokasi.setNilai(barisAda.lokasi);

  const barisHm = el('div.baris-isian', {}, [isian('HM awal', inHmAwal), isian('HM akhir', inHmAkhir)]);
  const barisKm = el('div.baris-isian', {}, [isian('KM awal', inKmAwal), isian('KM akhir', inKmAkhir)]);
  const bungkusRitase = isian('Ritase', inRitase, { bantuan: 'Jumlah rit angkut (dump truck).' });
  inRitase.addEventListener('input', () => hitungPremi());

  const tombolMeterHm = el('button.tombol-kecil', { type: 'button', teks: 'HM terakhir' });
  const tombolMeterKm = el('button.tombol-kecil', { type: 'button', teks: 'KM terakhir' });

  // HM/KM awal otomatis: pembacaan tertinggi sebelum tanggal ini.
  // Admin tinggal mengisi angka meter SAAT INI (kolom akhir); angka itu
  // otomatis jadi "awal" untuk log hari berikutnya.
  const isiAwalOtomatis = () => {
    if (barisAda || inResetMeter.checked) return;   // reset memulai rangkaian baru
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
    // ritase dipakai kendaraan angkut secara umum (DT, Triton, Carry, dll)
    bungkusRitase.style.display = pakaiRitase(unit) ? '' : 'none';
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
    if (inResetMeter.checked && !inAlasanReset.value.trim()) {
      salah.push('Alasan penggantian/reset meter harus diisi.');
    }

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

    await pastikanSaran(inKegiatan);
    await pastikanSaran(inCatatan);
    const premiRendah = Math.round(Number(inPremi.value) || 0);
    if (premiRendah > 0 && premiRendah < 1000) {
      const lanjut = await tanya('Premi di bawah Rp1.000',
        `Premi yang dimasukkan ${rupiahPenuh(premiRendah)}. Periksa apakah ada angka atau nol yang kurang.`,
        { ya: 'Tetap simpan', tidak: 'Periksa lagi' });
      if (!lanjut) return;
    }

    // Peringatan (bukan penolakan): meter tidak nyambung atau mundur.
    // Selisih MAJU pada awal = unit dipakai di luar kebun (mis. Triton dibawa
    // keluar semalam) — selisihnya memang tidak dihitung premi, cukup dicatat.
    const acuan = meterSebelum(unit.id, inTanggal.value, barisAda?.id);
    const rincian = [];
    const luar = [];   // keterangan pemakaian luar kebun -> masuk catatan
    if (acuan.ada && !inResetMeter.checked) {
      if (pakaiHm(unit) && inHmAwal.value !== '' && Math.abs(hmA - acuan.hm) > 0.05) {
        if (hmA > acuan.hm) {
          rincian.push(`HM awal ${angka(hmA, 1)} melompat ${angka(hmA - acuan.hm, 1)} jam dari pembacaan `
            + `terakhir (${angka(acuan.hm, 1)}) — kemungkinan unit dipakai di luar kebun. `
            + 'Selisih itu TIDAK dihitung premi');
          luar.push(`HM luar kebun ${angka(hmA - acuan.hm, 1)} (${angka(acuan.hm, 1)}→${angka(hmA, 1)})`);
        } else {
          rincian.push(`HM awal ${angka(hmA, 1)} LEBIH KECIL dari pembacaan tertinggi sebelumnya, ${angka(acuan.hm, 1)}`);
        }
      }
      if (pakaiKm(unit) && inKmAwal.value !== '' && Math.abs(kmA - acuan.km) > 0.05) {
        if (kmA > acuan.km) {
          rincian.push(`KM awal ${angka(kmA, 1)} melompat ${angka(kmA - acuan.km, 1)} km dari pembacaan `
            + `terakhir (${angka(acuan.km, 1)}) — kemungkinan unit dipakai keluar kebun. `
            + 'Selisih itu TIDAK dihitung premi');
          luar.push(`KM luar kebun ${angka(kmA - acuan.km, 1)} (${angka(acuan.km, 1)}→${angka(kmA, 1)})`);
        } else {
          rincian.push(`KM awal ${angka(kmA, 1)} LEBIH KECIL dari pembacaan tertinggi sebelumnya, ${angka(acuan.km, 1)}`);
        }
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
        el('p', { teks: luar.length
          ? 'Kalau memang unitnya dipakai keluar, lanjutkan — selisihnya dicatat otomatis dan tidak masuk premi. Tetap simpan?'
          : 'Bisa jadi tanggalnya keliru, meternya salah ketik, atau ada log yang kelewat. Tetap simpan?' }),
      ]), { ya: 'Tetap simpan', tidak: 'Perbaiki dulu' });
      if (!lanjut) return;
    }
    // ---- Anti upah dobel LINTAS BAGIAN.
    // Beberapa orang terdaftar sebagai operator SEKALIGUS pekerja kebun.
    // Tanpa pemeriksaan ini, satu orang bisa dibayar HK kebun dan HK operator
    // pada hari yang sama tanpa ada yang menegur — dan itu pernah terjadi.
    const op = D.cari('operators', opId);
    if (op && totalHk > 0) {
      const peta = await D.petaHkBagianLain().catch(() => []);
      const lintas = D.hkLintas(peta, { nama: op.nama, rekening: op.no_rekening },
        inTanggal.value);
      if (lintas) {
        const batas = D.maksHkPerHari();
        const jumlah = lintas.hk + totalHk;
        const lanjut = await tanya(
          jumlah > batas + 1e-9 ? `${op.nama} jadi lebih dari ${fhk(batas)} HK hari itu`
            : `${op.nama} sudah punya HK di bagian lain hari itu`,
          el('div', {}, [
            el('p', { teks: `Pada ${ftanggal(inTanggal.value)} ${op.nama} sudah tercatat `
              + `${fhk(lintas.hk)} HK di bagian ${lintas.bagian}`
              + `${lintas.lemah ? ' (dicocokkan dari nama — rekening kosong)' : ''}. `
              + `Ditambah ${fhk(totalHk)} HK dari log ini, totalnya jadi ${fhk(jumlah)}.` }),
            el('p', { teks: jumlah > batas + 1e-9
              ? 'Kalau memang hari itu dia membantu di alat berat, pastikan HK kebunnya '
                + 'sudah dikurangi atau dihapus — kalau tidak, upahnya terhitung dobel.'
              : 'Pastikan memang begitu pembagian harinya.' }),
          ]),
          { ya: 'Sudah benar — simpan', tidak: 'Perbaiki dulu', bahaya: jumlah > batas + 1e-9 });
        if (!lanjut) return;
      }
    }

    // keterangan pemakaian luar kebun ikut tersimpan di catatan (sekali saja)
    for (const ket of luar) {
      if (!inCatatan.value.includes(ket)) {
        inCatatan.value = inCatatan.value ? `${inCatatan.value}; ${ket}` : ket;
      }
    }

    const isi = {
      tanggal: inTanggal.value,
      unit_id: unit.id,
      operator_id: opId,
      hm_awal: pakaiHm(unit) ? hmA : 0,
      hm_akhir: pakaiHm(unit) ? hmB : 0,
      km_awal: pakaiKm(unit) ? kmA : 0,
      km_akhir: pakaiKm(unit) ? kmB : 0,
      ritase: pakaiRitase(unit) ? (Number(inRitase.value) || 0) : 0,
      kegiatan: inKegiatan.value.trim(),
      lokasi: (inLokasi.querySelector('input').value || '').trim(),
      premi: Number(inPremi.value) || 0,
      premi_manual: premiManual,
      catatan: inCatatan.value.trim(),
      hk: 0,
      meter_reset: inResetMeter.checked,
      meter_reset_alasan: inResetMeter.checked ? inAlasanReset.value.trim() : '',
    };
    let idLog;
    if (barisAda) { D.ubah('work_logs', barisAda.id, isi); idLog = barisAda.id; }
    else idLog = D.tambah('work_logs', isi).id;

    // HK dan catatan operasi langsung berlaku. Hanya premi tercatat yang perlu persetujuan kepala divisi.
    const adaTambahan = (Number(isi.premi) || 0) > 0;
    if (adaTambahan) D.tandaiMenunggu('work_logs', idLog);
    else D.tanpaPersetujuan('work_logs', idLog);

    sebarHk(opId, inTanggal.value, totalHk);

    p.tutup();
    pesan((barisAda ? 'Log harian diperbarui' : 'Log harian ditambahkan')
      + (adaTambahan ? ' — premi menunggu persetujuan.' : ' — HK langsung masuk laporan.'), 'sukses', 6);
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
    el('label', { style: 'display:flex;gap:.5rem;align-items:flex-start;margin:.7rem 0;font-weight:650' }, [
      inResetMeter,
      el('span', { teks: 'Meter baru/diganti/reset pada log ini' }),
    ]),
    bungkusAlasanReset,
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
  if(barisAda)aksi.unshift(el('button.tombol-bahaya.tombol-kecil',{type:'button',teks:'Hapus tambahan saja',onclick:async()=>{if(!await tanya('Hapus lembur/premi tambahan?', 'HK dan log operasi tetap disimpan. Tambahan tidak ikut dibayar.',{ya:'Hapus tambahan',tidak:'Batal'}))return;try{D.hapusTambahanAlat(barisAda.id);p.tutup();saatSelesai();pesan('Tambahan dihapus; HK dan operasi tetap tersimpan.','sukses');}catch(e){pesan(e.message,'galat');}}}));
  const p = panel(barisAda ? 'Ubah log harian' : 'Tambah log harian', badan, aksi);
  explainApproval(p,'work_logs',barisAda);
  inResetMeter.addEventListener('change', aturReset);
  aturReset();
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
      el('details', {}, [
        el('summary', { teks: `Tampilkan semua ${takUrut.length} masalah` }),
        el('ul', {}, takUrut.map((m) => el('li', {}, [
          `${D.labelRef('units', m.unitId)}: ${m.label} ${angka(m.nilai, 1)} pada ${ftanggal(m.tanggal)} `
            + `lebih kecil dari ${angka(m.nilaiSebelum, 1)} pada ${ftanggal(m.tanggalSebelum)} — `,
          el('button.tombol-tautan', {
            type: 'button', teks: 'buka tanggal ini',
            onclick: () => { tglLog = m.tanggal; gambar(); },
          }),
        ]))),
      ]),
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
      { l: 'Status tambahan', nilai: (r) => {
        const status = D.catatanPersetujuan('work_logs', r.id)?.status;
        if (status === 'menunggu') return el('span.chip.chip-tunggu', { teks: 'Premi/lembur menunggu' });
        if(status==='dihapus')return el('span.chip',{teks:'Tambahan dihapus; HK tetap'});
        if (status === 'ditolak') return el('span.chip', { teks: 'Premi/lembur ditolak' });
        return el('span.chip.chip-ok', { teks: status === 'disetujui' ? 'Tambahan disetujui' : 'Tanpa tambahan' });
      } },
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
  if (!barisAda) {
    pasangPilihanCepat(inUnit, referensiSering(['fuel_logs', 'work_logs'], 'unit_id', opsiUnit()), {
      judul: 'Unit terakhir & sering dipakai',
    });
  }
  const inLiter = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.liter ?? '' });
  const inHarga = el('input', { type: 'number', step: '100', min: '0', nilai: barisAda?.harga_liter ?? '' });
  const inHm = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.hm ?? '' });
  const inKm = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.km ?? '' });
  const riwayatSolar = D.baris('fuel_logs').filter((r) => !r.deleted_at);
  const inLokasi = pasangSaranRiwayat(
    el('input', { type: 'text', nilai: barisAda?.lokasi ?? '', autocomplete: 'off' }),
    [...D.aktif('blocks').map(r=>({nilai:r.nama_blok})),...riwayatSolar.map((r) => ({ nilai: r.lokasi, tanggal: r.tanggal }))],
  );
  const inCatatan = pasangSaranRiwayat(
    el('input', { type: 'text', nilai: barisAda?.catatan ?? '', autocomplete: 'off' }),
    riwayatSolar.map((r) => ({ nilai: r.catatan, tanggal: r.tanggal })),
  );

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
  if (!barisAda) pasangPilihanCepat(inUnit,
    referensiSering(['service_logs', 'work_logs'], 'unit_id', opsiUnit()),
    { judul: 'Unit terakhir & sering dipakai' });
  const inJenis = pilihan(JENIS_SERVIS.map((j) => ({ nilai: j, label: j })),
    barisAda?.jenis || 'Servis Berkala', { kosongLabel: '— pilih —' });
  const riwayatServis = D.baris('service_logs').filter((r) => !r.deleted_at);
  const inDeskripsi = pasangSaranRiwayat(
    el('input', { type: 'text', nilai: barisAda?.deskripsi ?? '', autocomplete: 'off' }),
    riwayatServis.map((r) => ({ nilai: r.deskripsi, tanggal: r.tanggal })),
  );
  const inBiaya = el('input', { type: 'number', step: '1000', min: '0', nilai: barisAda?.biaya ?? '' });
  const inHm = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.hm ?? '' });
  const inKm = el('input', { type: 'number', step: '0.1', min: '0', nilai: barisAda?.km ?? '' });
  const inBengkel = pasangSaranRiwayat(
    el('input', { type: 'text', nilai: barisAda?.bengkel ?? '', autocomplete: 'off' }),
    riwayatServis.map((r) => ({ nilai: r.bengkel, tanggal: r.tanggal })),
  );
  const inCatatan = pasangSaranRiwayat(
    el('input', { type: 'text', nilai: barisAda?.catatan ?? '', autocomplete: 'off' }),
    riwayatServis.map((r) => ({ nilai: r.catatan, tanggal: r.tanggal })),
  );

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
      return { id: u.id, unit: TABEL.units.label(u), kategori: u.kategori || '', hm: t.hm, km: t.km, rit: t.rit };
    });
    wadah.append(el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [el('h2', { teks: 'Tarif premi per unit' })]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', { teks: 'Klik satu baris untuk mengisi tarifnya. Premi di form log harian '
          + 'dihitung otomatis dari yang diisi: HM × Rp/HM + KM × Rp/KM + ritase × Rp/rit. '
          + 'Mis. dump truck bisa pakai Rp per ritase saja — kosongkan Rp per KM-nya.' }),
        tabel([
          { l: 'Unit', k: 'unit' },
          { l: 'Kategori', k: 'kategori' },
          { l: 'Rp per HM', k: 'hm', jenis: 'uang' },
          { l: 'Rp per KM', k: 'km', jenis: 'uang' },
          { l: 'Rp per ritase', k: 'rit', jenis: 'uang' },
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
    const inRit = el('input', { type: 'number', step: '100', min: '0', nilai: r.rit || '' });
    const pn = panel(`Tarif premi — ${r.unit}`, el('div', {}, [
      el('div.baris-isian', {}, [
        isian('Rp per HM', inHm, { bantuan: 'Untuk alat berat (dihitung dari HM terpakai).' }),
        isian('Rp per KM', inKm, { bantuan: 'Untuk kendaraan (dihitung dari KM terpakai).' }),
        isian('Rp per ritase', inRit, { bantuan: 'Untuk dump truck (dihitung dari jumlah rit). Kalau pakai ini, Rp per KM biasanya dikosongkan.' }),
      ]),
      el('p.bantuan', { teks: 'Isi yang jadi dasar hitungan saja, sisanya kosongkan. Kosongkan semuanya kalau premi unit ini diisi manual.' }),
    ]), [
      el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => pn.tutup() }),
      el('button.tombol-utama', {
        type: 'button', teks: 'Simpan',
        onclick: () => {
          D.setWeb((w) => {
            w.unitPremi ||= {};
            w.unitPremi[String(r.id)] = { hm: Number(inHm.value) || 0, km: Number(inKm.value) || 0,
              rit: Number(inRit.value) || 0 };
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
// HALAMAN: Persetujuan premi & upah jam/lembur alat (kepala divisi Infra)
// =====================================================================
export function jumlahMenungguAlat() {
  return D.baris('work_logs').filter((r) => !r.deleted_at
    && D.menungguPersetujuan('work_logs', r.id)
    && nilaiPersetujuanAlat(r).total > 0).length;
}

export const upahHkPersetujuanAlat = (r) => (Number(r.hk) || 0) * (Number(D.cari('operators', r.operator_id)?.tarif_harian) || 0);

export const nilaiPersetujuanAlat = (r) => {
  const upahJam = 0; // HM dibayar satu kali melalui premi tercatat.
  const premi = Number(r.premi) || 0;
  return { upahJam, premi, total: upahJam + premi };
};

export function rincianPersetujuanAlat(r) {
  const premi=Number(r.premi)||0,t=tarifPremiUnit(r.unit_id);
  const parts=[{key:'hm',unit:'HM',qty:hmPakai(r)},{key:'km',unit:'KM',qty:kmPakai(r)},{key:'rit',unit:'rit',qty:Number(r.ritase)||0}];
  const configured=parts.filter(p=>p.qty>0 && t[p.key]>0).map(p=>({...p,rate:t[p.key],value:p.qty*t[p.key]}));
  const formula=ps=>ps.map(p=>`${angka(p.qty,2)} ${p.unit} × ${rupiahPenuh(p.rate)}/${p.unit}`).join(' + ');
  const candidates=[];
  for(let mask=1;mask<(1<<configured.length);mask++){
    const selected=configured.filter((p,i)=>mask&(1<<i));
    const value=Math.round(selected.reduce((n,p)=>n+p.value,0));
    if(premi>0 && Math.abs(value-premi)<0.5)candidates.push({selected,value});
  }
  let dasar='';
  if(candidates.length===1){const c=candidates[0];dasar=`Cocok dengan tarif unit saat ini: ${formula(c.selected)} = ${rupiahPenuh(c.value)}. Data lama tidak menyimpan tarif historis; kecocokan ini bukan bukti dasar input awal.`;}
  else if(candidates.length>1)dasar=`Lebih dari satu dasar cocok: ${candidates.map(c=>formula(c.selected)).join(' atau ')}. Dasar historis belum bisa dipastikan.`;
  else if(r.premi_manual===true || (Number(r.ritase)||0)>0) {
    const rit=Number(r.ritase)||0;
    dasar=rit>0?`Mengikuti isian ritase manual: ${angka(rit,2)} rit × Rp ${angka(premi/rit,2)}/rit = ${rupiahPenuh(premi)}. Tarif efektif berasal dari nominal manual tercatat.`:'Mengikuti nominal premi manual yang diisi. Rincian dasar manual tidak tersimpan.';
    const km=configured.find(p=>p.key==='km');
    if(km)dasar+=` Pembanding tarif KM: ${formula([km])} = ${rupiahPenuh(Math.round(km.value))}. Nominal manual tetap dipakai.`;
  }
  else {
    dasar=configured.length?`Peringatan: belum cocok dengan tarif unit saat ini: ${configured.map(p=>`${formula([p])} = ${rupiahPenuh(Math.round(p.value))}`).join('; ')}. Perlu diperiksa, nominal tidak diubah.`:'Peringatan: tarif unit belum tersedia dan tidak ada isian manual.';
    // Kesetaraan saja tidak membuktikan dasar premi. Jangan memilih ritase
    // hanya karena log memuat ritase; KM tetap diperiksa terhadap tarif admin.
    const indicative=parts.filter(p=>p.qty>0 && premi>0).map(p=>`${angka(p.qty,2)} ${p.unit} × Rp ${angka(premi/p.qty,2)}/${p.unit}`);
    if(indicative.length)dasar+=` Kemungkinan dari nominal tercatat: ${indicative.join(' atau ')} (tarif efektif hasil pembagian, belum terkonfirmasi).`;
  }
  const km=configured.find(p=>p.key==='km');
  if(km && candidates.length)dasar+=` Pembanding KM: ${formula([km])} = ${rupiahPenuh(Math.round(km.value))}; selisih nominal tercatat ${rupiahPenuh(premi-Math.round(km.value))}.`;
  return `Premi tercatat ${rupiahPenuh(premi)}. ${dasar}${r.catatan||r.keterangan?' Catatan: '+(r.catatan||r.keterangan):''}`;
}

export function halamanPersetujuanAlat({ gambar, bisaEdit, hak }) {
  const bolehSetuju = hak?.setuju || (() => true);
  const bolehBatal = hak?.batal || (() => false);
  const wadah = el('section');
  const tempat = el('div');
  const dateState=approvalSelection(D.state.data,'alb');
  let tanggalAcc = dateState.selected||'';

  const gambarIsi = () => {
    kosongkan(tempat);
    const menunggu = D.baris('work_logs')
      .filter((r) => !r.deleted_at && D.menungguPersetujuan('work_logs', r.id)
        && nilaiPersetujuanAlat(r).total > 0)
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    const pendingTanggal = [...new Set(menunggu.map((r) => r.tanggal))].sort();
    if (!tanggalAcc)tanggalAcc=pendingTanggal[0]||'';dateState.selected=tanggalAcc;
    const daftarTanggal=approvalDateOptions(pendingTanggal,tanggalAcc);
    const menungguTanggal = menunggu.filter((r) => r.tanggal === tanggalAcc);
    tempat.append(approvalDateNotice(menunggu,date=>{tanggalAcc=date;dateState.selected=date;gambarIsi();},{selected:tanggalAcc}));
    if(tanggalAcc)tempat.append(el('p',{teks:'Tanggal dipilih: '+ftanggal(tanggalAcc)}));

    const putuskan = async (baris, setuju) => {
      if (!bisaEdit()) { pesan('Aktifkan mode edit dulu.', 'awas', 6); return; }
      if (!bolehSetuju()) { pesan('Anda tidak diberi hak menyetujui.', 'awas', 6); return; }
      const daftarPutus = baris ? [baris] : menungguTanggal;if(!daftarPutus.length)return;
      dateState.selected=tanggalAcc;
      let alasan = '';
      if (!setuju) {
        alasan = await mintaTeks(
          baris ? 'Tolak tambahan ini?' : `Tolak ${menungguTanggal.length} tambahan pada ${ftanggal(tanggalAcc)}?`,
          'Alasan penolakan akan tersimpan di riwayat agar koreksinya jelas.',
          { label: 'Alasan penolakan', ya: 'Tolak', wajib: true });
        if (alasan == null) return;
      } else if (!baris) {
        const lanjut = await tanya(
          `Setujui ${menungguTanggal.length} tambahan pada ${ftanggal(tanggalAcc)}?`,
          'Premi langsung dihitung di laporan. HK sudah masuk tanpa menunggu persetujuan.',
          { ya: 'Setujui tanggal ini' });
        if (!lanjut) return;
      }
      for (const r of daftarPutus) {
        if (setuju) D.setujui('work_logs', r.id, D.namaPengisi() || 'Kepala divisi');
        else D.tolak('work_logs', r.id, D.namaPengisi() || 'Kepala divisi', alasan);
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
      const nilai = menungguTanggal.reduce((n, r) => n + nilaiPersetujuanAlat(r).total, 0);
      tempat.append(el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [
          el('h2', { teks: `Tambahan menunggu — ${menunggu.length} total` }),
          pilihan(daftarTanggal.map((x) => ({ nilai: x, label: ftanggal(x) })), tanggalAcc, {
            kosongLabel: null,
            saatUbah: (ev) => { tanggalAcc = ev.target.value;dateState.selected=tanggalAcc; gambarIsi(); },
          }),
          el('span.status-sinkron', { teks: `${menungguTanggal.length} tanggal ini · tambahan ${rupiahPenuh(nilai)}` }),
          el('button.tombol-samar.tombol-kecil', { type: 'button', teks: 'Tolak tanggal ini', disabled:!menungguTanggal.length, onclick: () => putuskan(null, false) }),
          el('button.tombol-utama.tombol-kecil', { type: 'button', teks: 'Setujui tanggal ini', disabled:!menungguTanggal.length, onclick: () => putuskan(null, true) }),
        ]),
        el('div.lembar-isi', {}, [
          tabel([
            { l: 'Tanggal', nilai: (r) => ftanggal(r.tanggal) },
            { l: 'Unit', nilai: (r) => D.labelRef('units', r.unit_id) },
            { l: 'Operator', nilai: (r) => D.labelRef('operators', r.operator_id) },
            { l: 'Kegiatan / lokasi', nilai: (r) => [r.kegiatan,r.lokasi].filter(Boolean).join(' · ') || '—' },
            { l: 'Ritase', k: 'ritase', jenis: 'angka' },
            { l: 'Dasar premi', nilai:r=>el('details',{},[el('summary',{teks:'Lihat perhitungan'}),el('p',{style:'min-width:18rem;white-space:normal',teks:rincianPersetujuanAlat(r)})]) },
            { l: 'HK (langsung)', k: 'hk', jenis: 'hk', total: true },
            { l: 'Upah HK (Rp)', nilai: upahHkPersetujuanAlat, jenis: 'uang', total: true },
            { l: 'HM', nilai: hmPakai, jenis: 'angka', pecahan: 1 },
            { l: 'KM', nilai: kmPakai, jenis: 'angka', pecahan: 1 },
            { l: 'Premi (Rp)', nilai: (r) => nilaiPersetujuanAlat(r).premi, jenis: 'uang', total: true },
            { l: 'Total setelah ACC (Rp)', nilai: (r) => upahHkPersetujuanAlat(r) + nilaiPersetujuanAlat(r).total, jenis: 'uang', total: true },
            { l: '', nilai: (r) => el('span', {}, [
              el('button.tombol-kecil.tombol-utama', { type: 'button', teks: 'Setujui',
                onclick: (ev) => { ev.stopPropagation(); putuskan(r, true); } }),
              ' ',
              el('button.tombol-kecil.tombol-samar', { type: 'button', teks: 'Tolak',
                onclick: (ev) => { ev.stopPropagation(); putuskan(r, false); } }),
            ]) },
          ], menungguTanggal, { kosong: 'Tidak ada tambahan menunggu pada tanggal ini. Pilih tanggal lain jika ingin melanjutkan.' }),
        ]),
      ]));
    }

    // sudah disetujui — SEMUA acc pada periode yang belum tutup buku tetap
    // tampil (bukan hanya 30 terbaru), urut tanggal transaksi terbaru,
    // bisa dicari & difilter. Bisa dibatalkan oleh yang punya hak.
    const semuaAcc = D.daftarStatus('work_logs', 'disetujui')
      .map((id) => D.cari('work_logs', id))
      .filter((r) => r && !r.deleted_at && nilaiPersetujuanAlat(r).total > 0)
      .map((r) => ({ ...r,
        _oleh: D.catatanPersetujuan('work_logs', r.id)?.oleh || '',
        _waktu: D.catatanPersetujuan('work_logs', r.id)?.waktu || '',
        _terkunci: D.periodeTerkunci(r.tanggal) }))
      .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal))
        || String(b._waktu).localeCompare(String(a._waktu)));
    if (semuaAcc.length) {
      let kataAcc = '';
      let unitAcc = '';
      let ikutTerkunciAcc = false;
      let batasAcc = 100;
      const unitAda = [...new Set(semuaAcc.map((r) => Number(r.unit_id) || 0))]
        .map((id) => ({ id, nama: id ? D.labelRef('units', id) : '(tanpa unit)' }))
        .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
      const nKunci = semuaAcc.filter((r) => r._terkunci).length;

      const cariAcc = el('input', {
        type: 'search', placeholder: 'Cari operator / unit / kegiatan / lokasi…',
        style: 'min-width:14rem;flex:1',
        oninput: (e) => { kataAcc = e.target.value; batasAcc = 100; gambarAcc(); },
      });
      const pilihUnitAcc = el('select', {
        'aria-label': 'Unit',
        onchange: (e) => { unitAcc = e.target.value; gambarAcc(); },
      }, [
        el('option', { value: '', teks: 'Semua unit' }),
        ...unitAda.map((u) => el('option', { value: String(u.id), teks: u.nama })),
      ]);
      const cekKunciAcc = el('input', { type: 'checkbox' });
      cekKunciAcc.addEventListener('change', () => { ikutTerkunciAcc = cekKunciAcc.checked; gambarAcc(); });
      const tempatTabelAcc = el('div');
      const tempatInfoAcc = el('p.bantuan', { style: 'margin-top:.5rem' });

      const saringAcc = () => {
        const k = kataAcc.trim().toLowerCase();
        return semuaAcc.filter((r) => {
          if (!ikutTerkunciAcc && r._terkunci) return false;
          if (unitAcc !== '' && String(Number(r.unit_id) || 0) !== unitAcc) return false;
          if (!k) return true;
          return [D.labelRef('units', r.unit_id), D.labelRef('operators', r.operator_id),
            r.kegiatan, r.lokasi, r._oleh, r.tanggal].join(' ').toLowerCase().includes(k);
        });
      };
      const gambarAcc = () => {
        const data = saringAcc();
        const tampil = data.slice(0, batasAcc);
        kosongkan(tempatTabelAcc).append(tabel([
          { l: 'Tanggal', nilai: (r) => ftanggal(r.tanggal) },
          { l: 'Unit', nilai: (r) => D.labelRef('units', r.unit_id) },
          { l: 'Operator', nilai: (r) => D.labelRef('operators', r.operator_id) },
          { l: 'Kegiatan / lokasi', nilai: (r) => [r.kegiatan,r.lokasi].filter(Boolean).join(' · ') || '—' },
          { l: 'Ritase', k: 'ritase', jenis: 'angka' },
          { l: 'Dasar premi', nilai:r=>el('details',{},[el('summary',{teks:'Lihat perhitungan'}),el('p',{style:'min-width:18rem;white-space:normal',teks:rincianPersetujuanAlat(r)})]) },
          { l: 'HK (langsung)', k: 'hk', jenis: 'hk' },
          { l: 'Upah HK (Rp)', nilai: upahHkPersetujuanAlat, jenis: 'uang' },
          { l: 'Premi (Rp)', nilai: (r) => nilaiPersetujuanAlat(r).premi, jenis: 'uang', total: true },
          { l: 'Total HK + premi (Rp)', nilai: (r) => upahHkPersetujuanAlat(r) + nilaiPersetujuanAlat(r).total, jenis: 'uang', total: true },
          { l: 'Di-acc oleh', nilai: (r) => el('span', {}, [r._oleh || '–',
            r._waktu ? el('div.bantuan', { style: 'font-size:.74rem', teks: String(r._waktu).slice(0, 16) }) : null]) },
          ...(bolehBatal() && bisaEdit() ? [{
            l: '', nilai: (r) => (r._terkunci
              ? el('span.bantuan', { teks: 'terkunci' })
              : el('button.tombol-samar.tombol-kecil', {
                type: 'button', teks: 'Batalkan',
                onclick: async (ev) => {
                  ev.stopPropagation();
                  if (!await tanya('Batalkan persetujuan log ini?',
                    'Premi kembali menunggu. HK serta catatan operasi tetap masuk laporan.',
                    { ya: 'Batalkan', bahaya: true })) return;
                  D.batalkan('work_logs', r.id, D.namaPengisi() || 'Web');
                  pesan('Dibatalkan — kembali menunggu. Jangan lupa Simpan.', 'sukses', 6);
                  gambarIsi(); gambar();
                },
              })),
          }] : []),
        ], tampil, { kosong: 'Tidak ada acc yang cocok dengan filter/pencarian ini.' }));
        kosongkan(tempatInfoAcc);
        taruh(tempatInfoAcc,
          `${data.length} acc${ikutTerkunciAcc ? '' : ' (periode berjalan — belum tutup buku)'}`
          + (data.length > batasAcc ? ` · menampilkan ${batasAcc} teratas ` : ''),
          data.length > batasAcc ? el('button.tombol-teks', {
            type: 'button', teks: 'tampilkan semua', style: 'font-size:.82rem',
            onclick: () => { batasAcc = Infinity; gambarAcc(); },
          }) : null,
          !ikutTerkunciAcc && nKunci ? ` · ${nKunci} acc di periode yang sudah tutup buku disembunyikan` : null,
        );
      };

      tempat.append(el('div.lembar', { style: 'margin-top:1.4rem' }, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Sudah disetujui' })]),
        el('div.lembar-isi', {}, [
          el('p.bantuan', { teks: (bolehBatal()
            ? 'Tambahan yang telanjur di-acc bisa dibatalkan — premi kembali menunggu. HK tetap masuk. '
            : 'Hanya pengguna dengan hak "Batalkan persetujuan" yang bisa membatalkan. ')
            + 'Semua acc pada periode yang belum tutup buku tampil di sini, urut tanggal terbaru.' }),
          el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.4rem 0 .7rem' }, [
            cariAcc, pilihUnitAcc,
            nKunci ? el('label', { style: 'display:flex;gap:.35rem;align-items:center;font-size:.85rem' }, [
              cekKunciAcc, 'ikut periode terkunci',
            ]) : null,
          ]),
          tempatTabelAcc,
          tempatInfoAcc,
        ]),
      ]));
      gambarAcc();
    }
  };

  gambarIsi();
  wadah.append(el('div.petunjuk', {}, [
    'HK operator dan catatan operasi langsung masuk laporan. Yang menunggu persetujuan kepala divisi '
    + 'hanya premi tercatat. HM dibayar sekali sebagai premi, bukan tambahan lembur. Selama menunggu, premi belum dihitung. Total setelah ACC adalah upah HK + premi pada baris tersebut; upah HK sudah masuk laporan tanpa menunggu ACC.',
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

    const log = D.baris('work_logs').filter((x) => dalam(x));
    let totalHkOp = 0; let upahHkOp = 0; let premiOp = 0;
    for (const x of log) {
      const o = D.cari('operators', x.operator_id);
      const hk = Number(x.hk) || 0;
      totalHkOp += hk;
      upahHkOp += hk * (Number(o?.tarif_harian) || 0);
      if (D.disetujui('work_logs', x.id)) {
        premiOp += Number(x.premi) || 0;
      }
    }
    const biayaSolar = D.baris('fuel_logs').filter(dalam)
      .reduce((n, x) => n + (Number(x.liter) || 0) * (Number(x.harga_liter) || 0), 0);
    const servis = D.baris('service_logs').filter(dalam);
    const biayaServis = servis.reduce((n, x) => n + (Number(x.biaya) || 0), 0);

    // Laporan ini KHUSUS alat berat & kendaraan. Upah pekerja divisi
    // Infrastruktur sengaja TIDAK ikut dihitung di sini — tempatnya di
    // Laporan Kebun, dengan targetnya sendiri. Kalau ikut dihitung di sini,
    // upah yang sama dinilai terhadap DUA target sekaligus.
    // Target di halaman ini dipakai memantau TENAGA KERJA: upah HK operator,
    // upah jam, dan premi. Solar & servis tetap ditampilkan sebagai biaya
    // unit, tapi TIDAK diadu ke target itu — kalau ikut, angka targetnya
    // jadi tidak nyambung dengan upah yang sebenarnya mau dipantau.
    const upahTk = upahHkOp + premiOp;
    const biayaUnit = biayaSolar + biayaServis;
    const total = upahTk + biayaUnit;      // dipakai di tabel rincian saja
    const totalHk = totalHkOp;
    const upahHkGabungan = upahHkOp;
    const target = targetKini();
    const persen = target ? Math.round((upahTk / target) * 1000) / 10 : null;

    // Tanggal kegiatan TERAKHIR — HK dan operasi tidak menunggu acc.
    // angka di atas sudah sampai tanggal berapa (hari ini tgl 14 tapi input
    // terakhir tgl 12 berarti dua hari belum masuk).
    const tglTerakhir = [...log, ...D.baris('fuel_logs').filter(dalam),
      ...D.baris('service_logs').filter(dalam)]
      .map((x) => x.tanggal).sort().at(-1) || null;
    const j = jedaInput(tglTerakhir);
    const telat = j.tertinggal != null && j.tertinggal >= 2;
    const kotak = (l, v, sat = '') => el('div', {}, [
      el('dt', { teks: l }),
      el('dd', {}, [v, sat ? el('span.satuan', { teks: ' ' + sat }) : null]),
    ]);

    kosongkan(tempatBiaya).append(el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [el('h2', { teks: `Biaya alat berat & kendaraan — ${r.label}` })]),
      el('dl.angka-utama', {}, [
        kotak('Total HK operator', fhk(totalHkOp), 'HK'),
        kotak('Upah tenaga kerja', rupiah(upahTk), 'Rp'),
        kotak('Solar + servis', rupiah(biayaUnit), 'Rp'),
        kotak('Unit beroperasi', angka(new Set(log.map((x) => Number(x.unit_id))).size), 'unit'),
        kotak('Hari ada kegiatan', angka(new Set(log.map((x) => x.tanggal)).size), 'hari'),
        el('div', { title: telat
          ? `Belum ada input ${j.tertinggal} hari terakhir — angka di atas mungkin belum lengkap.`
          : null }, [
          el('dt', { teks: 'Input terakhir' }),
          el('dd', { style: telat ? 'color:var(--merah)' : null }, [
            j.teks === 'Belum ada' ? 'Belum ada' : ftanggal(j.teks),
            el('span.satuan', { teks: ' ' + j.satuan }),
          ]),
        ]),
      ]),
      el('div.lembar-isi', {}, [
        tabel([
          { l: 'Jenis biaya', k: 'jenis' },
          { l: 'Jumlah', k: 'jumlah' },
          { l: 'Nilai (Rp)', k: 'rp', jenis: 'uang', total: true },
        ], [
          { jenis: 'Upah HK operator', jumlah: `${fhk(totalHkOp)} HK`, rp: upahHkOp },
          { jenis: 'Premi operator (disetujui)', jumlah: '', rp: premiOp },
          { jenis: 'Solar', jumlah: '', rp: biayaSolar },
          { jenis: 'Servis', jumlah: `${servis.length} kali`, rp: biayaServis },
        ], { kosong: 'Belum ada biaya.' }),
        el('p.bantuan', {
          teks: 'Khusus alat berat & kendaraan. Upah pekerja divisi Infrastruktur TIDAK ikut '
            + 'dihitung di sini — itu ada di Laporan Kebun dengan targetnya sendiri, supaya '
            + 'upah yang sama tidak dinilai terhadap dua target sekaligus.',
        }),
        el('h3', { style: 'margin:1.1rem 0 .3rem;font-size:1rem',
          teks: 'Tenaga kerja terhadap target' }),
        target == null
          ? el('p.bantuan', { teks: 'Target periode ini belum diisi — klik "Atur target" '
            + 'untuk mengisi manual, mis. 15.000.000 per 2 minggu.' })
          : el('div', {}, [
            el('div.meter', {}, [el('div.meter-isi' + (upahTk > target ? '.lewat' : ''), {
              style: `width:${Math.min(100, persen)}%`,
            })]),
            el('p', { teks: `Upah tenaga kerja ${rupiahPenuh(upahTk)} dari target `
              + `${rupiahPenuh(target)} (${angka(persen, 1)}%).` }),
            el('p.bantuan', { teks: `Yang diadu ke target hanya upah operator dan `
              + `premi. Solar & servis ${rupiahPenuh(biayaUnit)} tidak ikut dihitung di sini.` }),
            kotakRekomendasi(rekomendasiAnggaran(
              { total: upahTk, totalHk, upahHk: upahHkGabungan }, target,
              r.dari, r.sampai, tglTerakhir), target),
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
      if (!pas(x)) continue;
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
            + 'HM/KM langsung dihitung karena tidak memerlukan persetujuan.',
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
      const pn = panel(`Target biaya ALB & Kendaraan — ${kunciBulan()}`, el('div', {}, [
        el('p.bantuan', { teks: 'Target KHUSUS alat berat & kendaraan: upah operator, premi, '
          + 'solar, dan servis. Upah pekerja divisi Infrastruktur punya targetnya sendiri di '
          + 'Pengaturan Kebun. Contoh: 15.000.000 per paruh (2 minggu).' }),
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
