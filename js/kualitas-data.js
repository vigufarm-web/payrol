// kualitas-data.js — pemeriksaan data murni, tanpa DOM dan tanpa perubahan otomatis.

import {
  rapikanKeterangan, kunciKeterangan, cariKeteranganSerupa, jarakKeterangan, angkaKeterangan,
} from './teks.js';

const hidup = (data, tabel) => (data?.tabel?.[tabel] || []).filter((r) => !r.deleted_at);
const angka = (v) => Number(v) || 0;
const kunciBaris = (tabel, r) => [tabel, r.tanggal, r.employee_id, r.operator_id,
  r.unit_id, r.division_id, r.block_id, r.wage_component_id, r.qty, r.hk,
  r.nominal, r.biaya,r.activity_id,r.job_type_id,kunciKeterangan(r.job||''),kunciKeterangan(r.keterangan_manual||r.catatan||r.keterangan||'')].join('|');

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

const labelMaster = (data, tabel, id) => {
  const r = hidup(data, tabel).find((x) => Number(x.id) === Number(id));
  return r?.nama_blok || r?.nama_divisi || r?.nama || `#${id}`;
};

/** Saran referensi lama berdasarkan HK orang pada tanggal yang sama.
 * Hanya mengusulkan bila hasilnya tunggal; keputusan tetap di pengguna. */
function saranReferensiPayroll(data, tabel, r, kolom) {
  if (!['lembur_transactions', 'premi_transactions', 'borongan_transactions'].includes(tabel)) return null;
  if (!['division_id', 'block_id'].includes(kolom)) return null;
  let acuan = hidup(data, 'daily_payroll').filter((x) => x.tanggal === r.tanggal
    && Number(x.employee_id) === Number(r.employee_id));
  if (kolom === 'block_id' && r.division_id != null) {
    acuan = acuan.filter((x) => Number(x.division_id) === Number(r.division_id));
  }
  const nilai = [...new Set(acuan.map((x) => Number(x[kolom])).filter(Boolean))];
  if (nilai.length !== 1) return null;
  const master = kolom === 'block_id' ? 'blocks' : 'divisions';
  return { nilai: nilai[0], master, label: labelMaster(data, master, nilai[0]) };
}

/** Meter antartanggal. Baris bertanda meter_reset memulai rangkaian baru. */
export function masalahMeterBerurutan(data) {
  const hasil = [];
  const perUnit = new Map();
  for (const r of hidup(data, 'work_logs')) {
    if (!perUnit.has(Number(r.unit_id))) perUnit.set(Number(r.unit_id), []);
    perUnit.get(Number(r.unit_id)).push(r);
  }
  for (const [unitId, daftar] of perUnit) {
    daftar.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || Number(a.id) - Number(b.id));
    for (const [kolom, label] of [['hm_akhir', 'HM'], ['km_akhir', 'KM']]) {
      const perHari = new Map();
      for (const r of daftar) {
        const nilai = angka(r[kolom]);
        if (!(nilai > 0)) continue;
        const lama = perHari.get(r.tanggal);
        if (r.meter_reset || !lama || nilai >= lama.nilai) perHari.set(r.tanggal, {
          nilai, id: r.id, reset: Boolean(r.meter_reset), alasan: r.meter_reset_alasan || '',
        });
      }
      let acuan = null;
      for (const [tanggal, kini] of [...perHari].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (kini.reset) { acuan = { ...kini, tanggal }; continue; }
        if (acuan && kini.nilai < acuan.nilai - 1e-9) {
          hasil.push({ unitId, label, kolom, id: kini.id, tanggal, nilai: kini.nilai,
            tanggalSebelum: acuan.tanggal, nilaiSebelum: acuan.nilai });
        }
        acuan = { ...kini, tanggal };
      }
    }
  }
  return hasil;
}

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
          const saran = data?.aplikasi === 'AlatBerat' ? null : saranReferensiPayroll(data, tabel, r, k);
          tambah({ tingkat: 'galat', jenis: 'Referensi kosong', tabel, id: r.id,
            detail: `${k} belum diisi pada baris ${r.nomor_transaksi || r.id}.`
              + (saran ? ` HK orang dan tanggal yang sama menunjuk ${saran.label}.` : ''),
            ...(saran ? {
              perbaikan: [{ tabel, id: r.id, tambalan: { [k]: saran.nilai } }],
              labelPerbaikan: `Isi ${saran.label}`,
            } : {}),
          });
          continue;
        }
        if (!hidup(data, master).some((m) => Number(m.id) === Number(r[k]))) {
          tambah({ tingkat: 'galat', jenis: 'Referensi tidak ditemukan', tabel, id: r.id,
            detail: `${k} menunjuk ${master} #${r[k]} yang tidak ada/aktif.` });
        }
      }
    }
  }

  // Nama master yang nyaris sama membuat admin salah memilih dan laporan
  // terpecah. Hanya diperingatkan—penggabungan master harus diputuskan admin.
  if (data?.aplikasi !== 'AlatBerat') {
    for (const [tabel, kolom, label] of [
      ['activities', 'nama_kegiatan', 'Kegiatan'],
      ['job_types', 'nama_jenis', 'Jenis pekerjaan'],
      ['wage_components', 'nama_komponen', 'Komponen upah'],
    ]) {
      const daftar = hidup(data, tabel).map((r) => ({ id: r.id, nilai: rapikanKeterangan(r[kolom]) }))
        .filter((x) => x.nilai);
      for (let i = 0; i < daftar.length; i++) {
        for (let j = i + 1; j < daftar.length; j++) {
          const a = daftar[i]; const b = daftar[j];
          if (kunciKeterangan(a.nilai)[0] !== kunciKeterangan(b.nilai)[0]) continue;
          const aa = angkaKeterangan(a.nilai); const ab = angkaKeterangan(b.nilai);
          if (aa.length !== ab.length || !aa.every((n, k) => n === ab[k])) continue;
          const batas = Math.max(kunciKeterangan(a.nilai).length, kunciKeterangan(b.nilai).length) >= 12 ? 2 : 1;
          if (jarakKeterangan(a.nilai, b.nilai, batas) > batas) continue;
          tambah({ tingkat: 'peringatan', jenis: 'Master hampir kembar', tabel, id: a.id,
            detail: `${label} “${a.nilai}” sangat mirip dengan “${b.nilai}”. Periksa apakah salah satunya typo sebelum menambah data baru.` });
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
    for (const m of masalahMeterBerurutan(data)) {
      tambah({ tingkat: 'galat', jenis: 'Meter tidak urut antartanggal', tabel: 'work_logs', id: m.id,
        tanggal: m.tanggal,
        detail: `${labelMaster(data, 'units', m.unitId)}: ${m.label} ${m.nilai} pada ${m.tanggal} `
          + `lebih kecil dari ${m.nilaiSebelum} pada ${m.tanggalSebelum}. `
          + 'Periksa angka/tanggal atau tandai penggantian meter.' });
    }

    // Satu pengisian bisa dipakai beberapa hari, jadi kelengkapan dinilai
    // per unit per bulan, bukan dipaksa ada solar setiap hari.
    const operasi = new Map();
    const solar = new Map();
    for (const r of hidup(data, 'work_logs')) {
      const dipakai = Math.max(0, angka(r.hm_akhir) - angka(r.hm_awal))
        + Math.max(0, angka(r.km_akhir) - angka(r.km_awal));
      if (!(dipakai > 0)) continue;
      const k = `${r.unit_id}|${String(r.tanggal).slice(0, 7)}`;
      const x = operasi.get(k) || { unitId: r.unit_id, bulan: String(r.tanggal).slice(0, 7), id: r.id, n: 0 };
      x.n++; operasi.set(k, x);
    }
    for (const r of hidup(data, 'fuel_logs')) {
      const k = `${r.unit_id}|${String(r.tanggal).slice(0, 7)}`;
      solar.set(k, (solar.get(k) || 0) + angka(r.liter));
    }
    for (const [k, x] of operasi) if (!(solar.get(k) > 0)) {
      tambah({ tingkat: 'peringatan', jenis: 'Operasi tanpa catatan solar', tabel: 'work_logs', id: x.id,
        detail: `${labelMaster(data, 'units', x.unitId)} memiliki ${x.n} log operasi pada ${x.bulan}, `
          + 'tetapi tidak ada liter solar tercatat pada bulan itu.' });
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
        detail: `${daftar[0].tanggal||'Tanpa tanggal'} · ${hidup(data,'employees').find(e=>Number(e.id)===Number(daftar[0].employee_id))?.nama||'Unit/orang #'+(daftar[0].employee_id||daftar[0].unit_id)} · ID ${daftar.map(r=>r.id).join(', ')} · ${daftar.length} baris sama termasuk kegiatan dan keterangan, nominal per baris Rp ${angka(daftar[0].nominal||daftar[0].biaya).toLocaleString('id-ID')}. Keterangan: ${daftar[0].job||daftar[0].keterangan_manual||daftar[0].catatan||daftar[0].keterangan||'—'}. Periksa bukti sebelum menghapus.` });
    }
  }

  if(data?.aplikasi!=='AlatBerat'){
    const overlapKey=r=>[r.tanggal,r.employee_id,r.division_id,r.block_id,angka(r.qty),angka(r.tarif_snapshot),angka(r.nominal),kunciKeterangan(r.keterangan_manual||r.catatan||'')].join('|');
    const overtime=new Map();
    for(const r of hidup(data,'lembur_transactions'))if(angka(r.nominal)>0&&kunciKeterangan(r.keterangan_manual||r.catatan||'')){const key=overlapKey(r);if(!overtime.has(key))overtime.set(key,[]);overtime.get(key).push(r);}
    for(const r of hidup(data,'premi_transactions')){const hits=overtime.get(overlapKey(r));if(!hits?.length)continue;
      tambah({tingkat:'peringatan',jenis:'Potensi tumpang tindih lembur/premi',tabel:'premi_transactions',id:r.id,detail:`${r.tanggal} · ${hidup(data,'employees').find(e=>Number(e.id)===Number(r.employee_id))?.nama||'#'+r.employee_id}: premi #${r.id} dan lembur #${hits.map(x=>x.id).join(', #')} sama jumlah, tarif, nominal, lokasi dan keterangannya (${r.keterangan_manual||r.catatan}). Periksa apakah dua hak yang berbeda atau input pekerjaan yang sama. Tidak dihapus otomatis.`});
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
