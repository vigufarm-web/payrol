// kualitas-data.js — pemeriksaan data murni, tanpa DOM dan tanpa perubahan otomatis.

import { rapikanKeterangan, kunciKeterangan, cariKeteranganSerupa } from './teks.js';

const hidup = (data, tabel) => (data?.tabel?.[tabel] || []).filter((r) => !r.deleted_at);
const angka = (v) => Number(v) || 0;
const kunciBaris = (tabel, r) => [tabel, r.tanggal, r.employee_id, r.operator_id,
  r.unit_id, r.division_id, r.block_id, r.wage_component_id, r.qty, r.hk,
  r.nominal, r.biaya].join('|');

const REF_PAYROLL = {
  daily_payroll: { employee_id: 'employees', division_id: 'divisions', block_id: 'blocks', activity_id: 'activities', job_type_id: 'job_types' },
  borongan_transactions: { employee_id: 'employees', division_id: 'divisions', block_id: 'blocks', wage_component_id: 'wage_components' },
  lembur_transactions: { employee_id: 'employees', division_id: 'divisions', block_id: 'blocks', wage_component_id: 'wage_components' },
  premi_transactions: { employee_id: 'employees', division_id: 'divisions', block_id: 'blocks', wage_component_id: 'wage_components' },
};
const REF_ALAT = {
  work_logs: { unit_id: 'units', operator_id: 'operators' },
  fuel_logs: { unit_id: 'units', operator_id: 'operators' },
  service_logs: { unit_id: 'units' },
};

function pemeriksa(data, sekarang) {
  const masalah = [];
  let urut = 0;
  const tambah = (isi) => masalah.push({ idMasalah: ++urut, ...isi });
  const patchAman = new Map();
  const gabungPatch = (tabel, id, tambalan, alasan) => {
    const k = `${tabel}|${id}`;
    const lama = patchAman.get(k) || { tabel, id, tambalan: {}, alasan: [] };
    Object.assign(lama.tambalan, tambalan);
    if (!lama.alasan.includes(alasan)) lama.alasan.push(alasan);
    patchAman.set(k, lama);
  };

  const ref = data?.aplikasi === 'AlatBerat' ? REF_ALAT : REF_PAYROLL;
  for (const [tabel, kolom] of Object.entries(ref)) {
    for (const r of hidup(data, tabel)) {
      for (const [k, master] of Object.entries(kolom)) {
        if (r[k] == null || r[k] === '') {
          tambah({ tingkat: 'galat', jenis: 'Referensi kosong', tabel, id: r.id,
            detail: `${k} belum diisi pada baris ${r.nomor_transaksi || r.id}.` });
          continue;
        }
        if (!hidup(data, master).some((m) => Number(m.id) === Number(r[k]))) {
          tambah({ tingkat: 'galat', jenis: 'Referensi tidak ditemukan', tabel, id: r.id,
            detail: `${k} menunjuk ${master} #${r[k]} yang tidak ada/aktif.` });
        }
      }
    }
  }

  const kelompokTeks = data?.aplikasi === 'AlatBerat'
    ? [{ nama: 'Keterangan alat', sumber: [
      ['work_logs', 'keterangan'], ['work_logs', 'catatan'],
      ['fuel_logs', 'catatan'], ['service_logs', 'keterangan'], ['service_logs', 'catatan'],
    ] }]
    : [
      { nama: 'Pekerjaan HK', sumber: [['daily_payroll', 'job']] },
      { nama: 'Keterangan hasil', sumber: [
        ['daily_payroll', 'catatan'], ['borongan_transactions', 'catatan'],
        ['lembur_transactions', 'catatan'], ['lembur_transactions', 'keterangan_manual'],
        ['premi_transactions', 'catatan'], ['premi_transactions', 'keterangan_manual'],
      ] },
    ];

  for (const kelompok of kelompokTeks) {
    const catatan = [];
    for (const [tabel, kolom] of kelompok.sumber) {
      for (const r of hidup(data, tabel)) {
        const asli = String(r[kolom] ?? '');
        const bersih = rapikanKeterangan(asli);
        if (!bersih) continue;
        catatan.push({ tabel, kolom, id: r.id, asli, bersih });
      }
    }
    const frekuensi = new Map();
    for (const x of catatan) frekuensi.set(x.bersih, (frekuensi.get(x.bersih) || 0) + 1);
    const perKunci = new Map();
    for (const [nilai, jumlah] of frekuensi) {
      const k = kunciKeterangan(nilai);
      if (!perKunci.has(k)) perKunci.set(k, []);
      perKunci.get(k).push({ nilai, jumlah });
    }
    const kanon = new Map();
    for (const [k, daftar] of perKunci) {
      daftar.sort((a, b) => b.jumlah - a.jumlah || a.nilai.localeCompare(b.nilai, 'id'));
      kanon.set(k, daftar[0].nilai);
    }
    for (const x of catatan) {
      const benar = kanon.get(kunciKeterangan(x.bersih)) || x.bersih;
      if (x.asli !== benar) {
        gabungPatch(x.tabel, x.id, { [x.kolom]: benar }, `${kelompok.nama}: rapikan "${x.asli}"`);
      }
    }

    const unik = [...frekuensi].map(([nilai, jumlah]) => ({ nilai, jumlah }));
    for (const rendah of unik) {
      const cocok = cariKeteranganSerupa(rendah.nilai,
        unik.filter((x) => x.nilai !== rendah.nilai && x.jumlah >= rendah.jumlah));
      if (!cocok || cocok.jenis !== 'mirip') continue;
      const target = catatan.filter((x) => x.bersih === rendah.nilai);
      tambah({
        tingkat: 'peringatan', jenis: 'Kemungkinan pekerjaan kembar',
        tabel: target[0]?.tabel || '', id: target[0]?.id,
        detail: `"${rendah.nilai}" mirip dengan "${cocok.nilai}" (${target.length} baris).`,
        perbaikan: target.map((x) => ({ tabel: x.tabel, id: x.id, tambalan: { [x.kolom]: cocok.nilai } })),
        labelPerbaikan: `Samakan menjadi "${cocok.nilai}"`,
      });
    }
  }

  if (data?.aplikasi !== 'AlatBerat') {
    const komponen = new Map(hidup(data, 'wage_components').map((r) => [Number(r.id), r]));
    for (const [tabel, bawaan] of [['borongan_transactions', 'satuan'], ['lembur_transactions', 'jam'], ['premi_transactions', 'satuan']]) {
      for (const r of hidup(data, tabel)) {
        if (!rapikanKeterangan(r.satuan)) {
          const satuan = rapikanKeterangan(komponen.get(Number(r.wage_component_id))?.satuan) || bawaan;
          gabungPatch(tabel, r.id, { satuan }, `Isi satuan ${satuan}`);
        }
        const seharusnya = Math.round(angka(r.qty) * angka(r.tarif_snapshot));
        if (!(angka(r.tarif_snapshot) > 0)) tambah({ tingkat: 'galat', jenis: 'Tarif nol', tabel, id: r.id,
          detail: `${r.nomor_transaksi || r.id}: tarif per satuan belum diisi.` });
        if (angka(r.nominal) !== seharusnya) tambah({ tingkat: 'peringatan', jenis: 'Nilai tidak cocok', tabel, id: r.id,
          detail: `${r.nomor_transaksi || r.id}: tersimpan Rp ${angka(r.nominal)}, hitungan seharusnya Rp ${seharusnya}.` });
      }
    }
    const hkHari = new Map();
    const batasHk = Number(hidup(data, 'app_settings')[0]?.max_hk_per_hari) || 1;
    for (const r of hidup(data, 'daily_payroll')) {
      const k = `${r.employee_id}|${r.tanggal}`;
      hkHari.set(k, (hkHari.get(k) || 0) + angka(r.hk));
      const seharusnya = Math.round(angka(r.hk) * angka(r.tarif_hk_snapshot));
      if (!(angka(r.tarif_hk_snapshot) > 0)) tambah({ tingkat: 'galat', jenis: 'Tarif HK nol', tabel: 'daily_payroll', id: r.id,
        detail: `${r.nomor_transaksi || r.id}: tarif HK belum diisi.` });
      if (angka(r.nominal) !== seharusnya) tambah({ tingkat: 'peringatan', jenis: 'Upah HK tidak cocok', tabel: 'daily_payroll', id: r.id,
        detail: `${r.nomor_transaksi || r.id}: tersimpan Rp ${angka(r.nominal)}, hitungan seharusnya Rp ${seharusnya}.` });
    }
    for (const [k, total] of hkHari) if (total > batasHk + 1e-9) {
      const [employeeId, tanggal] = k.split('|');
      tambah({ tingkat: 'galat', jenis: 'HK melebihi batas', tabel: 'daily_payroll',
        detail: `Pekerja #${employeeId} mencapai ${total} HK pada ${tanggal}; batas ${batasHk}.` });
    }

    const tujuhHari = 7 * 86400000;
    for (const tabel of ['lembur_transactions', 'premi_transactions']) {
      for (const r of hidup(data, tabel)) {
        const status = data?.web?.persetujuan?.[tabel]?.[String(r.id)];
        if (status?.status !== 'menunggu') continue;
        const waktu = Date.parse(status.waktu || r.created_at || '');
        if (Number.isFinite(waktu) && sekarang.getTime() - waktu > tujuhHari) {
          tambah({ tingkat: 'peringatan', jenis: 'Persetujuan terlambat', tabel, id: r.id,
            detail: `${r.nomor_transaksi || r.id} menunggu persetujuan lebih dari 7 hari.` });
        }
      }
    }
  } else {
    for (const r of hidup(data, 'work_logs')) {
      if (!(angka(r.hk) >= 0)) tambah({ tingkat: 'galat', jenis: 'HK operator tidak valid', tabel: 'work_logs', id: r.id,
        detail: `Log #${r.id} memiliki HK tidak valid.` });
      if (angka(r.hm_akhir) < angka(r.hm_awal) || angka(r.km_akhir) < angka(r.km_awal)) {
        tambah({ tingkat: 'galat', jenis: 'Meter mundur', tabel: 'work_logs', id: r.id,
          detail: `Log #${r.id} pada ${r.tanggal}: meter akhir lebih kecil dari meter awal.` });
      }
    }
    for (const r of hidup(data, 'fuel_logs')) {
      if (!(angka(r.liter) > 0) || !(angka(r.harga_liter) > 0)) tambah({ tingkat: 'galat', jenis: 'Data solar tidak lengkap', tabel: 'fuel_logs', id: r.id,
        detail: `Pengisian solar #${r.id} harus memiliki liter dan harga per liter.` });
    }
  }

  for (const tabel of Object.keys(ref)) {
    const grup = new Map();
    for (const r of hidup(data, tabel)) {
      const k = kunciBaris(tabel, r);
      if (!grup.has(k)) grup.set(k, []);
      grup.get(k).push(r);
    }
    for (const daftar of grup.values()) if (daftar.length > 1) {
      tambah({ tingkat: 'peringatan', jenis: 'Kemungkinan transaksi ganda', tabel, id: daftar[0].id,
        detail: `${daftar.length} baris memiliki tanggal, orang/unit, lokasi, jumlah, dan nilai yang sama.` });
    }
  }

  for (const p of patchAman.values()) {
    tambah({ tingkat: 'info', jenis: 'Perbaikan aman tersedia', tabel: p.tabel, id: p.id,
      detail: p.alasan.join('; '), otomatis: true, perbaikan: [{ tabel: p.tabel, id: p.id, tambalan: p.tambalan }] });
  }
  return {
    masalah,
    perbaikanAman: [...patchAman.values()].map((p) => ({ tabel: p.tabel, id: p.id, tambalan: p.tambalan })),
    ringkasan: {
      galat: masalah.filter((x) => x.tingkat === 'galat').length,
      peringatan: masalah.filter((x) => x.tingkat === 'peringatan').length,
      otomatis: patchAman.size,
    },
  };
}

export function periksaData(data, { sekarang = new Date() } = {}) {
  return pemeriksa(data, sekarang);
}
