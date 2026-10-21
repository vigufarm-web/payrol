// transaksi.js — halaman input: HK harian (satuan & massal), borongan,
// lembur, premi, serta data yang sudah dihapus.
//
// Aturan validasinya sengaja disamakan dengan services/payroll_service.py
// di aplikasi desktop, karena keduanya menulis ke database yang sama.

import * as D from './data.js';
import * as P from './pengguna.js';
import { TABEL } from './skema-payroll.js';
import {
  el, tabel, isian, pilihan, pilihanCari, kesalahan, panel, tanya, pesan, kosongkan, taruh,
  rupiah, rupiahPenuh, hk as fhk, tanggal as ftanggal, hariIni, angka,
} from './ui.js';

// ---------------------------------------------------------------- bantu
// Peta HK dari bagian payroll LAIN (mis. Pisang) — untuk peringatan dobel input
let petaLintasJanji = null;
const petaLintas = () => (petaLintasJanji ||= D.petaHkBagianLain().catch(() => []));

const opsiMaster = (namaTabel, idSekarang = null) => {
  let sumber = D.aktif(namaTabel);
  // daftar divisi dipangkas sesuai hak pengguna yang sedang masuk,
  // supaya divisi orang lain tidak muncul sebagai pilihan sama sekali
  if (namaTabel === 'divisions') {
    const boleh = P.divisiBoleh();
    if (boleh !== null) sumber = sumber.filter((r) => boleh.includes(Number(r.id)));
  }
  const opsi = sumber
    .map((r) => ({ nilai: r.id, label: TABEL[namaTabel].label(r) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'id'));
  if (idSekarang && !opsi.some((o) => String(o.nilai) === String(idSekarang))) {
    opsi.unshift({ nilai: idSekarang, label: D.labelRef(namaTabel, idSekarang) + ' (tidak aktif)' });
  }
  return opsi;
};

const opsiKomponen = (kategori, idSekarang = null) => {
  const opsi = D.aktif('wage_components')
    .filter((r) => r.kategori === kategori)
    .map((r) => ({ nilai: r.id, label: `${r.nama_komponen} — ${rupiahPenuh(r.tarif)}${r.satuan ? '/' + r.satuan : ''}` }));
  if (idSekarang && !opsi.some((o) => String(o.nilai) === String(idSekarang))) {
    opsi.unshift({ nilai: idSekarang, label: D.labelRef('wage_components', idSekarang) + ' (tidak aktif)' });
  }
  return opsi;
};

const blokDiDivisi = (divisionId) => D.aktif('blocks')
  .filter((r) => !divisionId || Number(r.division_id) === Number(divisionId))
  .map((r) => ({ nilai: r.id, label: TABEL.blocks.label(r) }));

const jenisDiKegiatan = (activityId) => D.aktif('job_types')
  .filter((r) => !activityId || Number(r.activity_id) === Number(activityId))
  .map((r) => ({ nilai: r.id, label: TABEL.job_types.label(r) }));

const hidup = (t) => D.baris(t).filter((r) => !r.deleted_at);

const dalamPeriode = (r, periode) => {
  const [a, b] = periode.rentang();
  return r.tanggal >= a && r.tanggal <= b;
};

function penguncianGalat(tgl) {
  if (!tgl) return 'Tanggal harus diisi.';
  if (D.periodeTerkunci(tgl)) {
    return `Periode ${ftanggal(tgl)} sudah dikunci di aplikasi desktop, jadi datanya tidak bisa diubah.`;
  }
  return null;
}

function panelKosong(pesanTeks) {
  return el('div.petunjuk', {}, [pesanTeks]);
}

// =====================================================================
// HK HARIAN
// =====================================================================

// Isian terakhir diingat selama sesi, supaya input berikutnya tinggal pilih
// pekerja saja - divisi/blok/kegiatan biasanya sama sepanjang hari.
const terakhir = { division_id: '', block_id: '', activity_id: '', job_type_id: '' };

/** Komponen upah untuk lembur/premi manual (tarifnya diisi per baris). */
function komponenManual(kategori) {
  const semua = D.aktif('wage_components').filter((r) => r.kategori === kategori);
  return semua.find((r) => /manual/i.test(r.nama_komponen)) || semua[0] || null;
}

/** Bagian opsional di bawah form HK: lembur atau premi. */
function bagianTambahan(kategori, satuanBawaan) {
  const komponen = komponenManual(kategori);
  const inQty = el('input', { type: 'number', step: '0.01', min: '0' });
  const inTarif = el('input', { type: 'number', step: '500', min: '0' });
  const inKet = el('input', { type: 'text' });
  const hitungan = el('p.bantuan', { teks: ' ' });
  const isiDalam = el('div', { style: 'display:none; border-left:3px solid var(--garis); padding-left:.8rem' }, [
    komponen
      ? null
      : el('div.kesalahan', {}, [`Master Komponen Upah belum punya komponen berkategori ${kategori}.`]),
    el('div.baris-isian', {}, [
      isian(`Jumlah (${satuanBawaan})`, inQty),
      isian('Tarif per ' + satuanBawaan + ' (Rp)', inTarif),
    ]),
    isian('Keterangan', inKet, { bantuan: 'mis. Pengawas, Operator sumur bor, Panen' }),
    hitungan,
  ]);

  const tombol = el('button.tombol-samar.tombol-kecil', {
    type: 'button', teks: `+ Tambah ${kategori.toLowerCase()}`,
    onclick: () => {
      const buka = isiDalam.style.display === 'none';
      isiDalam.style.display = buka ? '' : 'none';
      tombol.textContent = buka ? `- Batal ${kategori.toLowerCase()}` : `+ Tambah ${kategori.toLowerCase()}`;
      if (buka) inQty.focus();
    },
  });

  const hitung = () => {
    const n = (Number(inQty.value) || 0) * (Number(inTarif.value) || 0);
    hitungan.textContent = n ? `Nilai ${kategori.toLowerCase()}: ${rupiahPenuh(n)}` : ' ';
  };
  inQty.addEventListener('input', hitung);
  inTarif.addEventListener('input', hitung);

  return {
    elemen: el('div.bagian-tambahan', {
      style: 'margin:.6rem 0', dataset: { kategori },
    }, [tombol, isiDalam]),
    aktif: () => isiDalam.style.display !== 'none' && Number(inQty.value) > 0,
    periksa() {
      if (!this.aktif()) return [];
      const salah = [];
      if (!komponen) salah.push(`Komponen upah ${kategori} belum ada di master.`);
      if (!(Number(inTarif.value) > 0)) salah.push(`Tarif ${kategori.toLowerCase()} harus diisi.`);
      return salah;
    },
    isi(dasar) {
      const qty = Number(inQty.value) || 0;
      const tarif = Number(inTarif.value) || 0;
      return {
        tanggal: dasar.tanggal,
        employee_id: dasar.employee_id,
        wage_component_id: komponen.id,
        division_id: dasar.division_id,
        block_id: dasar.block_id,
        qty,
        satuan: satuanBawaan,
        tarif_snapshot: tarif,
        nominal: Math.round(qty * tarif),
        catatan: '',
        keterangan_manual: inKet.value.trim(),
      };
    },
  };
}

function formHK(barisAda, tgl, saatSelesai) {
  const tempatGalat = el('div');
  const hitungan = el('p.bantuan.hitungan-hk', { teks: ' ' });

  const inTanggal = el('input', { type: 'date', nilai: barisAda?.tanggal || tgl || hariIni() });
  const inKaryawan = pilihanCari(
    D.aktif('employees').map((r) => ({ nilai: r.id, label: `${r.nama} (${r.nik})` })),
    barisAda?.employee_id, { tempat: 'Ketik nama atau NIK…', saatUbah: () => perbarui() });

  const awal = (k) => barisAda?.[k] ?? terakhir[k] ?? '';
  const inDivisi = pilihan(opsiMaster('divisions', awal('division_id')), awal('division_id'),
    { saatUbah: () => { isiBlok(); perbarui(); } });
  const inKegiatan = pilihan(opsiMaster('activities', awal('activity_id')), awal('activity_id'),
    { saatUbah: () => { isiJenis(); } });
  const inJenis = pilihan([], awal('job_type_id'));
  const inHk = el('input', { type: 'number', step: '0.05', min: '0', max: String(D.maksHkPerHari()), nilai: barisAda?.hk ?? 1 });
  const inJob = el('input', { type: 'text', nilai: barisAda?.job ?? '' });
  const inCatatan = el('input', { type: 'text', nilai: barisAda?.catatan ?? '' });

  // ---- blok -----------------------------------------------------------
  // Mengubah baris lama: tetap satu blok (tiap baris berdiri sendiri).
  // Menambah baru: blok bisa dicentang lebih dari satu — HK dibagi sesuai
  // luas / rata / diketik manual, dan pekerjaannya bisa sama atau beda per blok.
  const inBlok = barisAda ? pilihan([], awal('block_id')) : null;
  const centangBlok = new Map();
  const nilaiBaris = new Map();   // blockId -> { hk, activity_id, job_type_id } yang pernah diisi
  const barisInput = new Map();   // blockId -> elemen input yang sedang tampil
  const daftarBlok = barisAda ? null : el('div.daftar-blok-hk', {
    style: 'max-height:9rem;overflow:auto;border:1px solid var(--garis);padding:.4rem',
  });
  const cariBlok = barisAda ? null : el('input', {
    type: 'search', placeholder: 'Saring blok…',
    oninput: (ev) => {
      const q = ev.target.value.toLowerCase();
      for (const [id, c] of centangBlok) {
        const label = D.labelRef('blocks', id).toLowerCase();
        c.parentElement.style.display = !q || label.includes(q) ? '' : 'none';
      }
    },
  });

  const pekerjaanSama = el('input', { type: 'checkbox', onchange: () => gambarTabelBlok() });
  pekerjaanSama.checked = true;
  // selama admin belum mengetik HK sendiri, pembagian selalu mengikuti
  // centangan blok terbaru (blok ditambah/dikurangi -> dibagi ulang otomatis)
  let modeBagi = 'luas';
  let pernahManual = false;
  const tempatTabelBlok = el('div.tabel-blok-hk');

  const blokTerpilih = () => [...centangBlok.entries()]
    .filter(([, c]) => c.checked).map(([id]) => Number(id));

  const isiBlok = () => {
    const opsi = blokDiDivisi(inDivisi.value);
    if (inBlok) {
      const lama = inBlok.value || awal('block_id');
      kosongkan(inBlok).append(el('option', { value: '', teks: '— pilih —' }));
      for (const o of opsi) {
        const op = el('option', { value: o.nilai, teks: o.label });
        if (String(o.nilai) === String(lama)) op.selected = true;
        inBlok.append(op);
      }
      return;
    }
    centangBlok.clear();
    kosongkan(daftarBlok);
    if (!opsi.length) {
      daftarBlok.append(el('p.bantuan', { teks: 'Pilih divisi dulu untuk melihat bloknya.' }));
      gambarTabelBlok();
      return;
    }
    for (const o of opsi) {
      const c = el('input', { type: 'checkbox', onchange: () => gambarTabelBlok() });
      if (String(o.nilai) === String(awal('block_id'))) c.checked = true;
      centangBlok.set(o.nilai, c);
      daftarBlok.append(el('label', {
        style: 'display:flex;gap:.45rem;align-items:center;padding:.12rem 0;font-size:.9rem',
      }, [c, o.label]));
    }
    gambarTabelBlok();
  };

  const isiJenis = () => {
    const opsi = jenisDiKegiatan(inKegiatan.value);
    const lama = inJenis.value;
    kosongkan(inJenis).append(el('option', { value: '', teks: '— pilih —' }));
    for (const o of opsi) {
      const op = el('option', { value: o.nilai, teks: o.label });
      if (String(o.nilai) === String(lama)) op.selected = true;
      inJenis.append(op);
    }
  };

  // pasangan kegiatan+jenis untuk satu blok (mode "pekerjaan beda")
  const buatPasangKegiatan = (awalKeg, awalJenis, simpanNilai) => {
    const keg = pilihan(opsiMaster('activities'), awalKeg, { saatUbah: () => { isi(); simpanNilai(); } });
    const jns = pilihan([], awalJenis);
    const isi = () => {
      const lama = jns.value || awalJenis;
      kosongkan(jns).append(el('option', { value: '', teks: '— pilih —' }));
      for (const o of jenisDiKegiatan(keg.value)) {
        const op = el('option', { value: o.nilai, teks: o.label });
        if (String(o.nilai) === String(lama)) op.selected = true;
        jns.append(op);
      }
    };
    isi();
    jns.addEventListener('change', simpanNilai);
    return { keg, jns };
  };

  const bagiOtomatis = (mode) => {
    const ids = blokTerpilih();
    const total = Number(inHk.value) || 0;
    const { bagian } = D.bagiHkPerBlok(ids, total, mode);
    ids.forEach((id, i) => {
      const b = barisInput.get(id);
      if (!b) return;
      b.inHk.value = bagian[i];
      nilaiBaris.set(id, { ...nilaiBaris.get(id), hk: bagian[i] });
    });
    perbarui();
  };

  function gambarTabelBlok() {
    if (barisAda) return;
    barisInput.clear();
    kosongkan(tempatTabelBlok);
    const ids = blokTerpilih();

    // kegiatan/jenis utama disembunyikan kalau tiap blok pekerjaannya beda
    const banyak = ids.length >= 2;
    barisKegiatan.style.display = banyak && !pekerjaanSama.checked ? 'none' : '';
    wadahSama.style.display = banyak ? '' : 'none';

    if (!banyak) { perbarui(); return; }

    const sama = pekerjaanSama.checked;
    tempatTabelBlok.append(el('div', {
      style: 'display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin:.6rem 0 .35rem',
    }, [
      el('strong', { style: 'font-size:.85rem', teks: 'Pembagian HK per blok' }),
      el('button.tombol-samar.tombol-kecil', {
        type: 'button', teks: 'Bagi sesuai luas',
        onclick: () => { modeBagi = 'luas'; pernahManual = false; bagiOtomatis('luas'); },
      }),
      el('button.tombol-samar.tombol-kecil', {
        type: 'button', teks: 'Bagi rata',
        onclick: () => { modeBagi = 'rata'; pernahManual = false; bagiOtomatis('rata'); },
      }),
    ]));

    const kotak = el('div', { style: 'border:1px solid var(--garis);padding:.45rem .6rem' });
    for (const id of ids) {
      const blok = D.cari('blocks', id);
      const simpanan = nilaiBaris.get(id) || {};
      const simpanNilai = () => {
        const b = barisInput.get(id);
        nilaiBaris.set(id, {
          hk: b.inHk.value,
          activity_id: b.inKegiatan?.value,
          job_type_id: b.inJenis?.value,
        });
      };
      const inHkBlok = el('input', {
        type: 'number', step: '0.05', min: '0', max: String(D.maksHkPerHari()),
        style: 'width:6.2rem', nilai: simpanan.hk ?? '',
        oninput: () => { pernahManual = true; simpanNilai(); perbarui(); },
      });
      let pasang = null;
      if (!sama) {
        pasang = buatPasangKegiatan(
          simpanan.activity_id ?? inKegiatan.value,
          simpanan.job_type_id ?? inJenis.value,
          simpanNilai);
      }
      barisInput.set(id, { inHk: inHkBlok, inKegiatan: pasang?.keg, inJenis: pasang?.jns });

      const luas = Number(blok?.luas) || 0;
      kotak.append(el('div', {
        style: 'display:flex;gap:.55rem;align-items:center;flex-wrap:wrap;padding:.22rem 0',
      }, [
        el('span', {
          style: 'min-width:8.5rem;font-size:.9rem',
          teks: blok?.nama_blok + (luas > 0 ? ` — ${angka(luas, 2)} ha` : ''),
        }),
        ...(pasang ? [pasang.keg, pasang.jns] : []),
        el('span.bantuan', { teks: 'HK' }),
        inHkBlok,
      ]));
    }
    tempatTabelBlok.append(kotak);

    // selama belum ada yang diketik manual, bagi ulang tiap centangannya berubah
    if (!pernahManual) bagiOtomatis(modeBagi); else perbarui();
  }

  const totalHkSekarang = () => {
    if (barisAda) return Number(inHk.value) || 0;
    const ids = blokTerpilih();
    if (ids.length < 2) return Number(inHk.value) || 0;
    return ids.reduce((n, id) => n + (Number(barisInput.get(id)?.inHk.value) || 0), 0);
  };

  const perbarui = () => {
    const emp = D.cari('employees', inKaryawan.nilaiTerpilih());
    const tarif = barisAda?.tarif_hk_snapshot ?? emp?.tarif_hk ?? 0;
    const totalHk = totalHkSekarang();
    const banyak = !barisAda && blokTerpilih().length >= 2;
    const nominal = totalHk * Number(tarif);
    const terpakai = emp ? D.totalHkHari(emp.id, inTanggal.value, barisAda?.id) : 0;
    hitungan.textContent = emp
      ? `${banyak ? `Jumlah semua blok ${fhk(totalHk)} HK · ` : ''}`
        + `Tarif ${rupiahPenuh(tarif)} × ${fhk(totalHk)} HK = ${rupiahPenuh(nominal)}`
        + `  ·  HK terpakai hari itu: ${fhk(terpakai)} dari ${fhk(D.maksHkPerHari())}`
      : 'Pilih pekerja dulu untuk melihat perhitungan upahnya.';
  };
  inHk.addEventListener('input', () => {
    if (!barisAda && blokTerpilih().length >= 2 && !pernahManual) bagiOtomatis(modeBagi);
    else perbarui();
  });
  inTanggal.addEventListener('change', perbarui);

  const simpan = async () => {
    const employeeId = inKaryawan.nilaiTerpilih();
    const emp = D.cari('employees', employeeId);
    const salah = [];
    const tglNilai = inTanggal.value;
    const galatKunci = penguncianGalat(tglNilai);
    if (galatKunci) salah.push(galatKunci);
    if (!emp) salah.push('Pekerja belum dipilih (ketik nama lalu pilih dari daftar).');
    if (!inDivisi.value) salah.push('Divisi harus dipilih.');

    // ---- susun rencana baris: satu baris per blok
    const rencana = [];
    if (barisAda) {
      if (!inBlok.value) salah.push('Blok harus dipilih.');
      if (!inKegiatan.value) salah.push('Kegiatan harus dipilih.');
      if (!inJenis.value) salah.push('Jenis pekerjaan harus dipilih.');
      const nilaiHk = Number(inHk.value) || 0;
      if (!(nilaiHk > 0)) salah.push('HK harus lebih dari 0.');
      rencana.push({
        block_id: inBlok.value, activity_id: inKegiatan.value,
        job_type_id: inJenis.value, hk: nilaiHk,
      });
    } else {
      const ids = blokTerpilih();
      if (!ids.length) salah.push('Pilih minimal satu blok.');
      const sama = pekerjaanSama.checked || ids.length < 2;
      if (sama && ids.length) {
        if (!inKegiatan.value) salah.push('Kegiatan harus dipilih.');
        if (!inJenis.value) salah.push('Jenis pekerjaan harus dipilih.');
      }
      if (ids.length === 1) {
        const nilaiHk = Number(inHk.value) || 0;
        if (!(nilaiHk > 0)) salah.push('HK harus lebih dari 0.');
        rencana.push({
          block_id: ids[0], activity_id: inKegiatan.value,
          job_type_id: inJenis.value, hk: nilaiHk,
        });
      } else if (ids.length >= 2) {
        for (const id of ids) {
          const b = barisInput.get(id);
          const hk = Number(b?.inHk.value) || 0;
          if (!(hk > 0)) continue;              // blok dengan HK 0 dilewati
          const keg = sama ? inKegiatan.value : b.inKegiatan?.value;
          const jns = sama ? inJenis.value : b.inJenis?.value;
          if (!sama && (!keg || !jns)) {
            salah.push(`Blok ${D.labelRef('blocks', id)}: kegiatan & jenis pekerjaannya belum dipilih.`);
            continue;
          }
          rencana.push({ block_id: id, activity_id: keg, job_type_id: jns, hk });
        }
        if (!rencana.length && ids.length) {
          salah.push('Semua blok HK-nya 0 — isi pembagiannya, atau klik "Bagi sesuai luas".');
        }
      }
    }

    // ---- pemeriksaan tiap baris
    for (const r of rencana) {
      const blok = D.cari('blocks', r.block_id);
      if (blok && String(blok.division_id) !== String(inDivisi.value)) {
        salah.push(`Blok ${blok.nama_blok} bukan bagian dari divisi itu.`);
      }
      const jenis = D.cari('job_types', r.job_type_id);
      if (jenis && String(jenis.activity_id) !== String(r.activity_id)) {
        salah.push(`Jenis "${jenis.nama_jenis}" bukan bagian dari kegiatan yang dipilih`
          + (rencana.length > 1 ? ` (blok ${D.labelRef('blocks', r.block_id)})` : '') + '.');
      }
    }

    const totalBaru = rencana.reduce((n, r) => n + r.hk, 0);
    let lintas = null;
    if (emp && totalBaru > 0) {
      const disini = D.totalHkHari(emp.id, tglNilai, barisAda?.id);
      const total = disini + totalBaru;
      if (total > D.maksHkPerHari() + 1e-9) {
        salah.push(`Total HK ${emp.nama} pada ${ftanggal(tglNilai)} jadi ${fhk(total)}, `
          + `melebihi batas ${fhk(D.maksHkPerHari())} per hari.`);
      }
      // anti dobel input ANTAR BAGIAN: orang yang sama (nama + rekening)
      // mungkin sudah dicatat admin bagian lain di tanggal itu
      lintas = D.hkLintas(await petaLintas(), emp, tglNilai);
      if (lintas && lintas.hk + total > D.maksHkPerHari() + 1e-9) {
        salah.push(`${emp.nama} sudah tercatat ${fhk(lintas.hk)} HK pada ${ftanggal(tglNilai)} `
          + `di bagian ${lintas.bagian}${lintas.lemah ? ' (dicocokkan dari nama — rekening kosong)' : ''}. `
          + `Ditambah input ini totalnya jadi ${fhk(lintas.hk + total)} — dobel input antar divisi.`);
      }
    }

    if (bagianLembur) salah.push(...bagianLembur.periksa());
    if (bagianPremi) salah.push(...bagianPremi.periksa());

    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); badan.scrollTop = 0; return; }

    // masih muat di bawah batas, tapi orangnya sudah ada kerjaan di bagian lain:
    // beri tahu dulu, jangan diam-diam
    if (lintas) {
      const lanjut = await tanya(`Sudah ada kerjaan di ${lintas.bagian}`,
        `${emp.nama} sudah tercatat ${fhk(lintas.hk)} HK pada ${ftanggal(tglNilai)} di bagian `
        + `${lintas.bagian}${lintas.lemah ? ' (dicocokkan dari nama — rekening kosong)' : ''}. `
        + 'Yakin memang kerja di dua bagian pada hari itu?',
        { ya: 'Tetap simpan', tidak: 'Batal' });
      if (!lanjut) return;
    }

    const tarif = barisAda?.tarif_hk_snapshot ?? emp.tarif_hk ?? 0;
    const buatIsi = (r) => ({
      tanggal: tglNilai,
      employee_id: emp.id,
      division_id: Number(inDivisi.value),
      block_id: Number(r.block_id),
      activity_id: Number(r.activity_id),
      job_type_id: Number(r.job_type_id),
      job: inJob.value.trim(),
      hk: r.hk,
      tarif_hk_snapshot: Number(tarif),
      nominal: Math.round(r.hk * Number(tarif)),
      catatan: inCatatan.value.trim(),
    });

    let pertama = null;
    if (barisAda) {
      D.ubah('daily_payroll', barisAda.id, buatIsi(rencana[0]));
      pertama = { ...buatIsi(rencana[0]) };
    } else {
      for (const r of rencana) {
        const baru = D.tambah('daily_payroll', {
          ...buatIsi(r),
          nomor_transaksi: D.nomorBaru('daily_payroll', 'HK', tglNilai),
          created_by: D.namaPengisi() || 'Web',
        });
        if (!pertama) pertama = baru;
      }
      Object.assign(terakhir, {
        division_id: Number(inDivisi.value),
        block_id: Number(rencana[0].block_id),
        activity_id: Number(rencana[0].activity_id),
        job_type_id: Number(rencana[0].job_type_id),
      });
    }

    // lembur & premi opsional — menempel SEKALI, di baris blok pertama
    let tambahan = 0;
    for (const [bagian, namaTabel, prefix] of [
      [bagianLembur, 'lembur_transactions', 'LM'],
      [bagianPremi, 'premi_transactions', 'PR'],
    ]) {
      if (!bagian || !bagian.aktif()) continue;
      const baru = D.tambah(namaTabel, {
        ...bagian.isi(pertama),
        nomor_transaksi: D.nomorBaru(namaTabel, prefix, tglNilai),
        created_by: D.namaPengisi() || 'Web',
      });
      D.tandaiMenunggu(namaTabel, baru.id);
      tambahan++;
    }

    p.tutup();
    pesan(barisAda ? 'Baris HK diperbarui.'
      : rencana.length > 1
        ? `${rencana.length} baris HK ditambahkan (${emp.nama} × ${rencana.length} blok, total ${fhk(totalBaru)} HK)`
          + (tambahan ? `, plus ${tambahan} catatan menunggu persetujuan.` : '. Bisa direvisi satu-satu di tabel.')
        : tambahan
          ? `Baris HK ditambahkan, plus ${tambahan} catatan yang menunggu persetujuan kepala kebun.`
          : 'Baris HK ditambahkan.', 'sukses', rencana.length > 1 || tambahan ? 7 : 4);
    saatSelesai();
  };

  // Bagian opsional: lembur & premi untuk pekerja dan tanggal yang sama.
  const bagianLembur = barisAda ? null : bagianTambahan('Lembur', 'jam');
  const bagianPremi = barisAda ? null : bagianTambahan('Premi', 'satuan');

  const barisKegiatan = el('div.baris-isian', {}, [
    isian('Kegiatan *', inKegiatan), isian('Jenis pekerjaan *', inJenis),
  ]);
  const wadahSama = el('label', {
    style: 'display:none;gap:.45rem;align-items:center;margin:.5rem 0;font-size:.9rem',
  }, [pekerjaanSama, el('span', {}, [
    el('strong', { teks: 'Pekerjaan sama untuk semua blok' }),
    ' — lepaskan centang kalau tiap blok kegiatannya beda',
  ])]);
  wadahSama.style.display = 'none';

  const badan = el('div', {}, [
    tempatGalat,
    isian('Tanggal *', inTanggal),
    isian('Pekerja *', inKaryawan),
    barisAda
      ? el('div.baris-isian', {}, [isian('Divisi *', inDivisi), isian('Blok *', inBlok)])
      : isian('Divisi *', inDivisi),
    ...(barisAda ? [] : [
      el('label', {
        style: 'display:block;font-size:.85rem;font-weight:600;margin-bottom:.22rem',
      }, ['Blok * — boleh centang lebih dari satu']),
      el('div', { style: 'margin-bottom:.4rem' }, [cariBlok]),
      daftarBlok,
    ]),
    wadahSama,
    barisKegiatan,
    isian('HK *', inHk, {
      bantuan: `Maksimal ${fhk(D.maksHkPerHari())} per pekerja per hari; setengah hari = 0,5. `
        + 'Kalau bloknya lebih dari satu, angka ini TOTAL sehari — tombol "Bagi sesuai luas" membaginya ke tiap blok.',
    }),
    tempatTabelBlok,
    hitungan,
    isian('Keterangan pekerjaan', inJob),
    isian('Catatan', inCatatan),
    bagianLembur ? bagianLembur.elemen : null,
    bagianPremi ? bagianPremi.elemen : null,
    bagianLembur
      ? el('p.bantuan', { teks: 'Lembur & premi yang ditambahkan di sini menunggu persetujuan kepala kebun dulu '
        + 'sebelum dihitung sebagai biaya; kalau bloknya banyak, catatannya menempel di blok pertama.' })
      : null,
    // saat MENGUBAH baris: lembur/premi orang ini pada tanggal ini ikut
    // ditampilkan — klik untuk revisi/hapus, atau tambah baru tanpa pindah menu
    barisAda ? (() => {
      const daftar = [];
      for (const [tb, kat, pre] of [['lembur_transactions', 'Lembur', 'LM'],
        ['premi_transactions', 'Premi', 'PR']]) {
        for (const r of D.baris(tb)) {
          if (r.deleted_at || Number(r.employee_id) !== Number(barisAda.employee_id)
            || r.tanggal !== barisAda.tanggal) continue;
          const tunggu = D.menungguPersetujuan(tb, r.id);
          daftar.push(el('button.tombol-samar.tombol-kecil', {
            type: 'button',
            teks: `${kat} ${rupiahPenuh(Number(r.nominal) || 0)} ${tunggu ? '⏳ menunggu acc' : '✓ di-acc'} — ubah/hapus`,
            onclick: () => { p.tutup(); formNilai(tb, kat, pre, r, saatSelesai); },
          }));
        }
      }
      const awal = {
        employee_id: barisAda.employee_id, tanggal: barisAda.tanggal,
        division_id: barisAda.division_id, block_id: barisAda.block_id,
      };
      return el('div', { style: 'border-top:1px solid var(--garis-tipis);margin-top:1rem;padding-top:.8rem' }, [
        el('label', { style: 'display:block;font-size:.85rem;font-weight:600;margin-bottom:.4rem',
          teks: 'Lembur & premi pekerja ini pada tanggal ini' }),
        daftar.length ? el('div', { style: 'display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.5rem' }, daftar)
          : el('p.bantuan', { teks: 'Belum ada.' }),
        el('div', { style: 'display:flex;gap:.5rem' }, [
          el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: '+ Lembur',
            onclick: () => { p.tutup(); formNilai('lembur_transactions', 'Lembur', 'LM', null, saatSelesai, { awal }); },
          }),
          el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: '+ Premi',
            onclick: () => { p.tutup(); formNilai('premi_transactions', 'Premi', 'PR', null, saatSelesai, { awal }); },
          }),
        ]),
      ]);
    })() : null,
  ]);

  isiBlok(); isiJenis(); perbarui();

  const aksi = [];
  if (barisAda) {
    aksi.push(el('button.tombol-bahaya.tombol-kecil', {
      type: 'button', teks: 'Hapus', style: 'margin-right:auto',
      onclick: async () => {
        p.tutup();
        if (await tanya('Hapus baris HK?',
          `Baris ${barisAda.nomor_transaksi} masuk ke Data terhapus dan bisa dipulihkan lagi.`,
          { ya: 'Hapus', bahaya: true })) {
          D.hapus('daily_payroll', barisAda.id, { lunak: true });
          // kalau itu HK terakhirnya hari itu, lembur/premi-nya jadi yatim —
          // tawarkan ikut dihapus supaya tidak nyangkut di antrean persetujuan
          const sisaHk = D.baris('daily_payroll').some((x) => !x.deleted_at
            && Number(x.employee_id) === Number(barisAda.employee_id)
            && x.tanggal === barisAda.tanggal);
          if (!sisaHk) {
            const terkait = [];
            for (const [tb, label] of [['lembur_transactions', 'Lembur'], ['premi_transactions', 'Premi']]) {
              for (const r of D.baris(tb)) {
                if (!r.deleted_at && Number(r.employee_id) === Number(barisAda.employee_id)
                  && r.tanggal === barisAda.tanggal) terkait.push({ tb, r, label });
              }
            }
            if (terkait.length && await tanya('Ikut hapus lembur/preminya?', el('div', {}, [
              el('p', { teks: `${D.labelRef('employees', barisAda.employee_id)} tidak punya HK lagi `
                + `pada ${ftanggal(barisAda.tanggal)}, tapi masih tercatat:` }),
              el('ul', {}, terkait.map((t) => el('li', {
                teks: `${t.label} ${rupiahPenuh(Number(t.r.nominal) || 0)}${t.r.keterangan_manual ? ` — ${t.r.keterangan_manual}` : ''}`,
              }))),
              el('p', { teks: 'Hapus juga? (masuk Data terhapus, keluar dari antrean persetujuan)' }),
            ]), { ya: 'Hapus juga', tidak: 'Biarkan' })) {
              for (const t of terkait) D.hapus(t.tb, t.r.id, { lunak: true });
            }
          }
          pesan('Baris HK dihapus.', 'sukses');
          saatSelesai();
        }
      },
    }));
  }
  aksi.push(
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan', onclick: simpan }),
  );
  const p = panel(barisAda ? 'Ubah HK harian' : 'Tambah HK harian', badan, aksi);
}

/**
 * Input massal: satu kegiatan, BANYAK blok, banyak pekerja sekaligus.
 *
 * Contoh pemakaian: "rawat gawangan" dikerjakan satu regu di blok C, D, F, G, H.
 * Pilih kegiatannya sekali, centang blok-bloknya, centang pekerjanya — semua
 * baris dibuat sekaligus. HK tiap pekerja DIBAGI RATA ke blok yang dipilih,
 * supaya total HK orang itu pada hari tersebut tetap sesuai yang diisi.
 * Setelah tersimpan, tiap baris masih bisa diklik dan diperbaiki satu per satu.
 */
function formMassal(tgl, saatSelesai) {
  const tempatGalat = el('div');
  const inTanggal = el('input', { type: 'date', nilai: tgl || hariIni() });
  const inDivisi = pilihan(opsiMaster('divisions'), terakhir.division_id || '',
    { saatUbah: () => isiBlok() });
  const inKegiatan = pilihan(opsiMaster('activities'), terakhir.activity_id || '',
    { saatUbah: () => isiJenis() });
  const inJenis = pilihan([], terakhir.job_type_id || '');
  const inHk = el('input', { type: 'number', step: '0.05', min: '0', max: String(D.maksHkPerHari()), nilai: 1 });
  const inBagi = el('select', { onchange: () => perbaruiHitung() }, [
    el('option', { value: 'luas', teks: 'Sesuai luas blok (ha)' }),
    el('option', { value: 'rata', teks: 'Rata — tiap blok sama besar' }),
  ]);

  // ---------------- daftar blok (boleh lebih dari satu) ----------------
  const centangBlok = new Map();
  const daftarBlok = el('div', {
    style: 'max-height:11rem;overflow:auto;border:1px solid var(--garis);padding:.4rem',
  });
  const ringkasBlok = el('p.bantuan.ringkas-blok', { teks: 'Belum ada blok dipilih' });

  const isiBlok = () => {
    centangBlok.clear();
    kosongkan(daftarBlok);
    const opsi = blokDiDivisi(inDivisi.value);
    if (!opsi.length) {
      daftarBlok.append(el('p.bantuan', { teks: 'Pilih divisi dulu untuk melihat bloknya.' }));
      perbaruiHitung();
      return;
    }
    for (const o of opsi) {
      const c = el('input', { type: 'checkbox', onchange: perbaruiHitung });
      centangBlok.set(o.nilai, c);
      daftarBlok.append(el('label', {
        style: 'display:flex;gap:.45rem;align-items:center;padding:.12rem 0;font-size:.9rem',
      }, [c, o.label]));
    }
    perbaruiHitung();
  };

  const tombolSemuaBlok = el('button.tombol-kecil.tombol-samar', {
    type: 'button', teks: 'Pilih semua blok',
    onclick: () => {
      const semua = [...centangBlok.values()];
      const adaYangKosong = semua.some((c) => !c.checked);
      for (const c of semua) c.checked = adaYangKosong;
      tombolSemuaBlok.textContent = adaYangKosong ? 'Kosongkan pilihan blok' : 'Pilih semua blok';
      perbaruiHitung();
    },
  });
  const cariBlok = el('input', {
    type: 'search', placeholder: 'Saring blok…',
    oninput: (ev) => {
      const q = ev.target.value.toLowerCase();
      for (const [id, c] of centangBlok) {
        const label = D.labelRef('blocks', id).toLowerCase();
        c.parentElement.style.display = !q || label.includes(q) ? '' : 'none';
      }
    },
  });

  const isiJenis = () => {
    const lama = inJenis.value;
    kosongkan(inJenis).append(el('option', { value: '', teks: '— pilih —' }));
    for (const o of jenisDiKegiatan(inKegiatan.value)) {
      const op = el('option', { value: o.nilai, teks: o.label });
      if (String(o.nilai) === String(lama)) op.selected = true;
      inJenis.append(op);
    }
  };

  // ---------------- daftar pekerja ----------------
  const pekerja = D.aktif('employees').sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  const centang = new Map();
  const daftarPekerja = el('div', {
    style: 'max-height:14rem;overflow:auto;border:1px solid var(--garis);padding:.4rem',
  });
  const hitung = el('p.bantuan.ringkas-massal', { teks: '0 pekerja dipilih' });

  const blokTerpilih = () => [...centangBlok.entries()].filter(([, c]) => c.checked).map(([id]) => id);
  const pekerjaTerpilih = () => pekerja.filter((e) => centang.get(e.id)?.checked);

  function perbaruiHitung() {
    const blok = blokTerpilih();
    const org = pekerjaTerpilih();
    const totalHk = Number(inHk.value) || 0;
    ringkasBlok.textContent = blok.length
      ? `${blok.length} blok dipilih: ${blok.map((id) => D.labelRef('blocks', id)).slice(0, 4).join(', ')}`
        + (blok.length > 4 ? `, dan ${blok.length - 4} lagi` : '')
      : 'Belum ada blok dipilih';

    if (!org.length || !blok.length) {
      hitung.textContent = `${org.length} pekerja dipilih`;
      return;
    }
    const { bagian, cara, tanpaLuas } = D.bagiHkPerBlok(blok, totalHk, inBagi.value);
    const nominal = org.reduce((s, e) => s + totalHk * (Number(e.tarif_hk) || 0), 0);

    let caranya;
    if (blok.length === 1) {
      caranya = `Semua ${fhk(totalHk)} HK masuk ke satu blok.`;
    } else if (cara === 'luas') {
      const contoh = blok.slice(0, 3)
        .map((id, i) => `${D.labelRef('blocks', id)} ${fhk(bagian[i])}`).join(' · ');
      caranya = `HK ${fhk(totalHk)} dibagi sesuai luas: ${contoh}`
        + (blok.length > 3 ? ` · …` : '') + '.';
    } else if (tanpaLuas.length && inBagi.value === 'luas') {
      caranya = `HK ${fhk(totalHk)} dibagi rata (${fhk(bagian[0])} per blok) karena luas `
        + `${tanpaLuas.slice(0, 3).join(', ')}`
        + (tanpaLuas.length > 3 ? ` dan ${tanpaLuas.length - 3} blok lain` : '')
        + ' belum diisi di Master Blok.';
    } else {
      caranya = `HK ${fhk(totalHk)} dibagi rata jadi ${fhk(bagian[0])} per blok.`;
    }

    hitung.textContent = `${org.length} pekerja × ${blok.length} blok = ${org.length * blok.length} baris. `
      + `${caranya} Perkiraan upah ${rupiahPenuh(nominal)}.`;
  }
  inHk.addEventListener('input', perbaruiHitung);

  for (const e of pekerja) {
    const c = el('input', { type: 'checkbox', onchange: perbaruiHitung });
    centang.set(e.id, c);
    daftarPekerja.append(el('label', {
      style: 'display:flex;gap:.45rem;align-items:center;padding:.12rem 0;font-size:.9rem',
    }, [c, `${e.nama} — ${rupiahPenuh(e.tarif_hk)}/HK`]));
  }

  const cariPekerja = el('input', {
    type: 'search', placeholder: 'Saring daftar pekerja…',
    oninput: (ev) => {
      const q = ev.target.value.toLowerCase();
      for (const [id, c] of centang) {
        const e = D.cari('employees', id);
        c.parentElement.style.display = !q
          || `${e.nama} ${e.nik}`.toLowerCase().includes(q) ? '' : 'none';
      }
    },
  });
  const tombolSemuaPekerja = el('button.tombol-kecil.tombol-samar', {
    type: 'button', teks: 'Pilih semua pekerja',
    onclick: () => {
      const terlihat = [...centang.values()].filter((c) => c.parentElement.style.display !== 'none');
      const adaYangKosong = terlihat.some((c) => !c.checked);
      for (const c of terlihat) c.checked = adaYangKosong;
      tombolSemuaPekerja.textContent = adaYangKosong ? 'Kosongkan pilihan pekerja' : 'Pilih semua pekerja';
      perbaruiHitung();
    },
  });

  isiBlok(); isiJenis(); perbaruiHitung();

  // ---------------- simpan ----------------
  const simpan = async () => {
    const blok = blokTerpilih();
    const dipilih = pekerjaTerpilih();
    const salah = [];
    const galatKunci = penguncianGalat(inTanggal.value);
    if (galatKunci) salah.push(galatKunci);
    if (!dipilih.length) salah.push('Pilih minimal satu pekerja.');
    if (!inDivisi.value) salah.push('Divisi harus dipilih.');
    if (!blok.length) salah.push('Pilih minimal satu blok.');
    if (!inKegiatan.value) salah.push('Kegiatan harus dipilih.');
    if (!inJenis.value) salah.push('Jenis pekerjaan harus dipilih.');
    const totalHk = Number(inHk.value);
    if (!(totalHk > 0)) salah.push('HK harus lebih dari 0.');

    const lewatBatas = dipilih.filter(
      (e) => D.totalHkHari(e.id, inTanggal.value) + totalHk > D.maksHkPerHari() + 1e-9);
    if (lewatBatas.length) {
      salah.push(`${lewatBatas.length} pekerja akan melebihi batas HK hari itu: `
        + lewatBatas.slice(0, 5).map((e) => e.nama).join(', ')
        + (lewatBatas.length > 5 ? ', dan lainnya' : '') + '.');
    }
    // anti dobel input antar bagian (nama + rekening)
    const peta = await petaLintas();
    const bentrok = [];
    for (const e of dipilih) {
      const l = D.hkLintas(peta, e, inTanggal.value);
      if (l) bentrok.push({ e, l, lewat: l.hk + D.totalHkHari(e.id, inTanggal.value) + totalHk > D.maksHkPerHari() + 1e-9 });
    }
    for (const b of bentrok.filter((x) => x.lewat)) {
      salah.push(`${b.e.nama} sudah tercatat ${fhk(b.l.hk)} HK di bagian ${b.l.bagian} `
        + 'pada tanggal itu — input ini membuatnya dobel.');
    }

    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); badan.scrollTop = 0; return; }

    const sisaBentrok = bentrok.filter((x) => !x.lewat);
    if (sisaBentrok.length) {
      const lanjut = await tanya('Sudah ada kerjaan di bagian lain',
        sisaBentrok.slice(0, 6).map((b) => `${b.e.nama}: ${fhk(b.l.hk)} HK di ${b.l.bagian}`).join('. ')
        + (sisaBentrok.length > 6 ? `, dan ${sisaBentrok.length - 6} lagi.` : '.')
        + ' Yakin memang kerja di dua bagian pada hari itu?',
        { ya: 'Tetap simpan', tidak: 'Batal' });
      if (!lanjut) return;
    }

    const { bagian: porsi } = D.bagiHkPerBlok(blok, totalHk, inBagi.value);
    let jumlahBaris = 0;
    for (const e of dipilih) {
      const tarif = Number(e.tarif_hk || 0);
      blok.forEach((blockId, i) => {
        const bagian = porsi[i];
        if (!(bagian > 0)) return;
        D.tambah('daily_payroll', {
          nomor_transaksi: D.nomorBaru('daily_payroll', 'HK', inTanggal.value),
          tanggal: inTanggal.value,
          employee_id: e.id,
          division_id: Number(inDivisi.value),
          block_id: Number(blockId),
          activity_id: Number(inKegiatan.value),
          job_type_id: Number(inJenis.value),
          job: '',
          hk: bagian,
          tarif_hk_snapshot: tarif,
          nominal: Math.round(bagian * tarif),
          catatan: '',
          created_by: D.namaPengisi() || 'Web',
        });
        jumlahBaris++;
      });
    }
    Object.assign(terakhir, {
      division_id: Number(inDivisi.value),
      block_id: Number(blok[0]),
      activity_id: Number(inKegiatan.value),
      job_type_id: Number(inJenis.value),
    });
    p.tutup();
    pesan(`${jumlahBaris} baris HK ditambahkan `
      + `(${dipilih.length} pekerja × ${blok.length} blok). Bisa diperbaiki satu-satu di tabel.`, 'sukses', 8);
    saatSelesai();
  };

  const badan = el('div', {}, [
    tempatGalat,
    el('p', { teks: 'Untuk satu pekerjaan yang dikerjakan banyak orang, bisa di beberapa blok sekaligus.' }),
    isian('Tanggal *', inTanggal),
    isian('Divisi *', inDivisi),
    el('div.baris-isian', {}, [isian('Kegiatan *', inKegiatan), isian('Jenis pekerjaan *', inJenis)]),
    el('div.baris-isian', {}, [
      isian('HK per pekerja *', inHk, {
        bantuan: 'Total HK orang itu untuk hari tersebut, bukan per blok.',
      }),
      isian('Bagi HK ke blok', inBagi, {
        bantuan: 'Sesuai luas: blok yang lebih luas dapat HK lebih besar. '
          + 'Kalau ada blok yang luasnya belum diisi, otomatis dibagi rata.',
      }),
    ]),
    el('label', { style: 'display:block;font-size:.85rem;font-weight:600;margin-bottom:.22rem' }, ['Blok *']),
    el('div', { style: 'display:flex;gap:.4rem;margin-bottom:.4rem' }, [cariBlok, tombolSemuaBlok]),
    daftarBlok,
    ringkasBlok,
    el('label', { style: 'display:block;font-size:.85rem;font-weight:600;margin:.8rem 0 .22rem' }, ['Pekerja *']),
    el('div', { style: 'display:flex;gap:.4rem;margin-bottom:.4rem' }, [cariPekerja, tombolSemuaPekerja]),
    daftarPekerja,
    hitung,
  ]);

  const p = panel('Input HK untuk banyak pekerja & blok', badan, [
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan semua', onclick: simpan }),
  ]);
}

let tglHK = null;

/**
 * Salin seluruh baris HK dari satu tanggal ke tanggal lain.
 * Berguna karena regu dan bloknya biasanya sama tiap hari - tinggal hapus
 * yang tidak masuk, daripada mengisi puluhan baris dari nol.
 */
function formSalinHari(tglTujuan, saatSelesai) {
  const tanggalAda = [...new Set(hidup('daily_payroll').map((r) => r.tanggal))]
    .filter((t) => t !== tglTujuan).sort().reverse();
  const inSumber = el('input', {
    type: 'date', nilai: tanggalAda[0] || '', list: 'tgl-ada',
  });
  const dl = el('datalist', { id: 'tgl-ada' }, tanggalAda.slice(0, 60).map((t) => el('option', { value: t })));
  const ringkas = el('p.bantuan', { teks: ' ' });
  const tempatGalat = el('div');

  const hitung = () => {
    const sumber = hidup('daily_payroll').filter((r) => r.tanggal === inSumber.value);
    const org = new Set(sumber.map((r) => r.employee_id)).size;
    ringkas.textContent = sumber.length
      ? `${sumber.length} baris (${org} pekerja) akan disalin ke ${ftanggal(tglTujuan)}.`
      : 'Tidak ada baris HK pada tanggal itu.';
  };
  inSumber.addEventListener('change', hitung);
  hitung();

  const simpan = () => {
    const sumber = hidup('daily_payroll').filter((r) => r.tanggal === inSumber.value);
    const salah = [];
    const galatKunci = penguncianGalat(tglTujuan);
    if (galatKunci) salah.push(galatKunci);
    if (!sumber.length) salah.push('Pilih tanggal yang ada isinya dulu.');
    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); return; }

    let masuk = 0;
    const lewat = [];
    for (const r of sumber) {
      const nilaiHk = Number(r.hk) || 0;
      const total = D.totalHkHari(r.employee_id, tglTujuan) + nilaiHk;
      if (total > D.maksHkPerHari() + 1e-9) {
        lewat.push(D.labelRef('employees', r.employee_id));
        continue;
      }
      const emp = D.cari('employees', r.employee_id);
      const tarif = Number(emp?.tarif_hk ?? r.tarif_hk_snapshot) || 0;
      D.tambah('daily_payroll', {
        nomor_transaksi: D.nomorBaru('daily_payroll', 'HK', tglTujuan),
        tanggal: tglTujuan,
        employee_id: r.employee_id,
        division_id: r.division_id,
        block_id: r.block_id,
        activity_id: r.activity_id,
        job_type_id: r.job_type_id,
        job: r.job || '',
        hk: nilaiHk,
        tarif_hk_snapshot: tarif,
        nominal: Math.round(nilaiHk * tarif),
        catatan: '',
        created_by: D.namaPengisi() || 'Web',
      });
      masuk++;
    }
    p.tutup();
    pesan(lewat.length
      ? `${masuk} baris disalin. ${lewat.length} dilewati karena HK-nya sudah penuh hari itu.`
      : `${masuk} baris disalin ke ${ftanggal(tglTujuan)}.`, 'sukses', 8);
    saatSelesai();
  };

  const p = panel(`Salin HK ke ${ftanggal(tglTujuan)}`, el('div', {}, [
    tempatGalat,
    el('p', { teks: 'Ambil semua baris HK dari tanggal lain, lalu tinggal hapus yang tidak masuk. '
      + 'Tarif upah diambil dari master terbaru, bukan dari baris lama.' }),
    isian('Salin dari tanggal', inSumber),
    dl,
    ringkas,
  ]), [
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Salin sekarang', onclick: simpan }),
  ]);
}

/**
 * Cari orang-hari yang total HK-nya melebihi batas (1 per hari).
 * Input lewat situs selalu ditolak sebelum kejadian; yang dicari di sini
 * adalah data yang telanjur masuk dari jalur lain (mis. kiriman lama dari
 * aplikasi desktop) — supaya tidak mengendap diam-diam.
 */
function hkLebihBatas() {
  const total = new Map();
  for (const r of D.baris('daily_payroll')) {
    if (r.deleted_at) continue;
    const kunci = `${r.employee_id}|${r.tanggal}`;
    total.set(kunci, (total.get(kunci) || 0) + (Number(r.hk) || 0));
  }
  const batas = D.maksHkPerHari();
  const masalah = [];
  for (const [kunci, jumlah] of total) {
    if (jumlah <= batas + 1e-9) continue;
    const [empId, tanggal] = kunci.split('|');
    masalah.push({
      tanggal,
      teks: `${D.labelRef('employees', empId)}: total ${fhk(jumlah)} HK pada ${ftanggal(tanggal)} `
        + `(batas ${fhk(batas)}) — periksa barisnya di tanggal itu`,
    });
  }
  return masalah.sort((x, y) => String(x.tanggal).localeCompare(String(y.tanggal)));
}

export function halamanHK({ periode, gambar, bisaEdit }) {
  const wadah = el('section');

  // warning: orang-hari yang HK-nya melebihi batas
  const lebih = hkLebihBatas();
  if (lebih.length) {
    wadah.append(el('div.petunjuk', {}, [
      el('strong', { teks: `HK melebihi batas ${fhk(D.maksHkPerHari())} per orang per hari — periksa:` }),
      el('ul', {}, lebih.slice(0, 6).map((m) => el('li', { teks: m.teks }))),
      lebih.length > 6 ? el('p', { teks: `…dan ${lebih.length - 6} lagi.` }) : null,
    ].filter(Boolean)));
  }

  const [a, b] = periode.rentang();
  let tgl = tglHK && tglHK >= a && tglHK <= b ? tglHK : hariIni();
  if (tgl < a || tgl > b) tgl = a;   // kalau periode yang dilihat bukan bulan ini
  tglHK = tgl;

  const tempat = el('div');
  const inTanggal = el('input', {
    type: 'date', nilai: tgl, min: a, max: b, 'aria-label': 'Tanggal',
    onchange: (e) => { tgl = e.target.value; tglHK = tgl; gambarIsi(); },
  });

  const gambarIsi = () => {
    const data = hidup('daily_payroll')
      .filter((r) => r.tanggal === tgl)
      .sort((x, y) => D.labelRef('employees', x.employee_id)
        .localeCompare(D.labelRef('employees', y.employee_id), 'id'));

    // lembur & premi orang itu pada tanggal yang sama, supaya langsung
    // kelihatan dari daftar HK (ditampilkan di baris pertama tiap pekerja)
    const tambahan = new Map();   // employee_id -> { teks, menunggu }
    for (const [tabelT, kode] of [['lembur_transactions', 'L'], ['premi_transactions', 'P']]) {
      for (const r of hidup(tabelT)) {
        if (r.tanggal !== tgl) continue;
        const k = Number(r.employee_id);
        if (!tambahan.has(k)) tambahan.set(k, { potongan: [], menunggu: false });
        const t = tambahan.get(k);
        t.potongan.push(`${kode} ${rupiah(Number(r.nominal) || 0)}`);
        if (D.menungguPersetujuan(tabelT, r.id)) t.menunggu = true;
      }
    }
    const sudahTampil = new Set();
    const selTambahan = (r) => {
      const k = Number(r.employee_id);
      const t = tambahan.get(k);
      if (!t || sudahTampil.has(k)) return '';
      sudahTampil.add(k);
      return t.potongan.join(' + ') + (t.menunggu ? ' ⏳' : ' ✓');
    };

    const terkunci = D.periodeTerkunci(tgl);
    taruh(kosongkan(tempat),
      terkunci ? el('div.petunjuk', {}, [`Periode ${ftanggal(tgl)} sudah dikunci — data tidak bisa diubah.`]) : null,
      tabel([
        { l: 'Pekerja', nilai: (r) => D.labelRef('employees', r.employee_id) },
        { l: 'Divisi', nilai: (r) => D.labelRef('divisions', r.division_id) },
        { l: 'Blok', nilai: (r) => D.labelRef('blocks', r.block_id) },
        { l: 'Kegiatan', nilai: (r) => D.labelRef('activities', r.activity_id) },
        { l: 'Jenis', nilai: (r) => D.labelRef('job_types', r.job_type_id) },
        { l: 'HK', k: 'hk', jenis: 'hk', total: true },
        { l: 'Upah (Rp)', k: 'nominal', jenis: 'uang', total: true },
        { l: 'Lembur/Premi', nilai: selTambahan },
      ], data, {
        kosong: `Belum ada HK pada ${ftanggal(tgl)}.`,
        saatKlik: bisaEdit() && !terkunci ? (r) => formHK(r, tgl, () => { gambarIsi(); gambar(); }) : null,
      }),
      tambahan.size ? el('p.bantuan', {
        teks: 'Kolom Lembur/Premi: L = lembur, P = premi pada tanggal itu. '
          + '✓ sudah di-acc kepala kebun, ⏳ masih menunggu. Rinciannya di menu Lembur & premi.',
      }) : null,
    );
  };

  const kepala = el('div.lembar-kepala', {}, [
    el('h2', { teks: 'HK per tanggal' }),
    inTanggal,
    bisaEdit()
      ? el('button.tombol-samar', {
        type: 'button', teks: 'Salin dari tanggal lain',
        onclick: () => formSalinHari(tgl, () => { gambarIsi(); gambar(); }),
      })
      : null,
    bisaEdit()
      ? el('button.tombol-samar', {
        type: 'button', teks: 'Banyak pekerja sekaligus',
        onclick: () => formMassal(tgl, () => { gambarIsi(); gambar(); }),
      })
      : null,
    bisaEdit()
      ? el('button.tombol-utama', {
        type: 'button', teks: 'Tambah HK',
        onclick: () => formHK(null, tgl, () => { gambarIsi(); gambar(); }),
      })
      : null,
  ]);

  wadah.append(el('div.lembar', {}, [kepala, el('div.lembar-isi', {}, [tempat])]));
  gambarIsi();
  if (!bisaEdit()) wadah.prepend(panelKosong('Mode lihat. Masukkan token GitHub di Pengaturan untuk bisa input data.'));
  return wadah;
}

// =====================================================================
// BORONGAN / LEMBUR / PREMI — bentuk formnya sama
// =====================================================================
function formNilai(namaTabel, kategori, prefix, barisAda, saatSelesai, { pakaiBlok = true, awal = {} } = {}) {
  const tempatGalat = el('div');
  const hitungan = el('p.bantuan', { teks: ' ' });

  const inTanggal = el('input', { type: 'date', nilai: barisAda?.tanggal || awal.tanggal || hariIni() });
  const inKaryawan = pilihanCari(
    D.aktif('employees').map((r) => ({ nilai: r.id, label: `${r.nama} (${r.nik})` })),
    barisAda?.employee_id ?? awal.employee_id, { tempat: 'Ketik nama atau NIK…' });
  const inKomponen = pilihan(opsiKomponen(kategori, barisAda?.wage_component_id),
    barisAda?.wage_component_id, { saatUbah: () => perbarui() });
  const inQty = el('input', { type: 'number', step: '0.01', min: '0', nilai: barisAda?.qty ?? '' });
  const inDivisi = pilihan(opsiMaster('divisions', barisAda?.division_id ?? awal.division_id),
    barisAda?.division_id ?? awal.division_id, { saatUbah: () => isiBlok() });
  const inBlok = pilihan([], barisAda?.block_id ?? awal.block_id);
  const inCatatan = el('input', { type: 'text', nilai: barisAda?.catatan ?? '' });

  const isiBlok = () => {
    const lama = inBlok.value || String(barisAda?.block_id ?? awal.block_id ?? '');
    kosongkan(inBlok).append(el('option', { value: '', teks: '— pilih —' }));
    for (const o of blokDiDivisi(inDivisi.value)) {
      const op = el('option', { value: o.nilai, teks: o.label });
      if (String(o.nilai) === String(lama)) op.selected = true;
      inBlok.append(op);
    }
  };
  isiBlok();

  const perbarui = () => {
    const kom = D.cari('wage_components', inKomponen.value);
    const tarif = barisAda?.tarif_snapshot ?? kom?.tarif ?? 0;
    const q = Number(inQty.value) || 0;
    hitungan.textContent = kom
      ? `${angka(q, 2)} ${kom.satuan || ''} × ${rupiahPenuh(tarif)} = ${rupiahPenuh(q * tarif)}`
      : 'Pilih komponen upah dulu.';
  };
  inQty.addEventListener('input', perbarui);
  perbarui();

  const simpan = () => {
    const emp = D.cari('employees', inKaryawan.nilaiTerpilih());
    const kom = D.cari('wage_components', inKomponen.value);
    const salah = [];
    const galatKunci = penguncianGalat(inTanggal.value);
    if (galatKunci) salah.push(galatKunci);
    if (!emp) salah.push('Pekerja belum dipilih.');
    if (!kom) salah.push('Komponen upah harus dipilih.');
    const q = Number(inQty.value);
    if (!(q > 0)) salah.push('Jumlah harus lebih dari 0.');
    const blok = D.cari('blocks', inBlok.value);
    if (blok && inDivisi.value && String(blok.division_id) !== String(inDivisi.value)) {
      salah.push('Blok yang dipilih bukan bagian dari divisi itu.');
    }
    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); badan.scrollTop = 0; return; }

    const tarif = Number(barisAda?.tarif_snapshot ?? kom.tarif ?? 0);
    const isi = {
      tanggal: inTanggal.value,
      employee_id: emp.id,
      wage_component_id: kom.id,
      qty: q,
      satuan: kom.satuan || '',
      tarif_snapshot: tarif,
      nominal: Math.round(q * tarif),
      division_id: inDivisi.value ? Number(inDivisi.value) : null,
      block_id: inBlok.value ? Number(inBlok.value) : null,
      catatan: inCatatan.value.trim(),
    };
    if (namaTabel === 'borongan_transactions') isi.activity_id = null;
    const perluAcc = namaTabel === 'lembur_transactions' || namaTabel === 'premi_transactions';
    if (barisAda) {
      D.ubah(namaTabel, barisAda.id, isi);
      // revisi menggugurkan acc yang sudah ada: kepala kebun harus
      // menyetujui ulang angka yang baru
      if (perluAcc) D.tandaiMenunggu(namaTabel, barisAda.id);
    } else {
      const baru = D.tambah(namaTabel, {
        ...isi,
        nomor_transaksi: D.nomorBaru(namaTabel, prefix, inTanggal.value),
        created_by: D.namaPengisi() || 'Web',
      });
      if (perluAcc) D.tandaiMenunggu(namaTabel, baru.id);
    }
    p.tutup();
    pesan(barisAda
      ? `${kategori} diperbarui${perluAcc ? ' — acc lama gugur, menunggu persetujuan ulang kepala kebun' : ''}.`
      : `${kategori} ditambahkan${perluAcc ? ' — menunggu persetujuan kepala kebun' : ''}.`, 'sukses', 6);
    saatSelesai();
  };

  const badan = el('div', {}, [
    tempatGalat,
    isian('Tanggal *', inTanggal),
    isian('Pekerja *', inKaryawan),
    isian('Komponen upah *', inKomponen),
    isian('Jumlah *', inQty, { bantuan: 'Sesuai satuan komponen upah (ha, jam, hari, kg, …).' }),
    hitungan,
    pakaiBlok ? el('div.baris-isian', {}, [isian('Divisi', inDivisi), isian('Blok', inBlok)]) : null,
    isian('Catatan', inCatatan),
  ]);

  const aksi = [];
  if (barisAda) {
    aksi.push(el('button.tombol-bahaya.tombol-kecil', {
      type: 'button', teks: 'Hapus', style: 'margin-right:auto',
      onclick: async () => {
        p.tutup();
        if (await tanya(`Hapus ${kategori.toLowerCase()}?`,
          `Baris ${barisAda.nomor_transaksi} masuk ke Data terhapus dan bisa dipulihkan.`,
          { ya: 'Hapus', bahaya: true })) {
          D.hapus(namaTabel, barisAda.id, { lunak: true });
          pesan(`${kategori} dihapus.`, 'sukses');
          saatSelesai();
        }
      },
    }));
  }
  aksi.push(
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan', onclick: simpan }),
  );
  const p = panel(barisAda ? `Ubah ${kategori.toLowerCase()}` : `Tambah ${kategori.toLowerCase()}`, badan, aksi);
}

function lembarTransaksi(namaTabel, kategori, prefix, periode, gambar, bisaEdit) {
  const tempat = el('div');
  const gambarIsi = () => {
    const data = hidup(namaTabel)
      .filter((r) => dalamPeriode(r, periode))
      .sort((x, y) => String(x.tanggal).localeCompare(String(y.tanggal)));
    kosongkan(tempat).append(tabel([
      { l: 'Tanggal', k: 'tanggal', jenis: 'tanggal' },
      { l: 'Pekerja', nilai: (r) => D.labelRef('employees', r.employee_id) },
      { l: 'Komponen', nilai: (r) => D.labelRef('wage_components', r.wage_component_id) },
      { l: 'Jumlah', k: 'qty', jenis: 'angka', pecahan: 2 },
      { l: 'Satuan', k: 'satuan' },
      { l: 'Blok', nilai: (r) => (r.block_id ? D.labelRef('blocks', r.block_id) : '–') },
      { l: 'Upah (Rp)', k: 'nominal', jenis: 'uang', total: true },
    ], data, {
      kosong: `Belum ada ${kategori.toLowerCase()} pada ${periode.judul()}.`,
      saatKlik: bisaEdit() ? (r) => formNilai(namaTabel, kategori, prefix, r, () => { gambarIsi(); gambar(); }) : null,
    }));
  };
  gambarIsi();
  return el('div.lembar', {}, [
    el('div.lembar-kepala', {}, [
      el('h2', { teks: kategori }),
      bisaEdit()
        ? el('button.tombol-utama', {
          type: 'button', teks: `Tambah ${kategori.toLowerCase()}`,
          onclick: () => formNilai(namaTabel, kategori, prefix, null, () => { gambarIsi(); gambar(); }),
        })
        : null,
    ]),
    el('div.lembar-isi', {}, [tempat]),
  ]);
}

export function halamanBorongan({ periode, gambar, bisaEdit }) {
  const wadah = el('section');
  if (!bisaEdit()) wadah.append(panelKosong('Mode lihat. Masukkan token GitHub di Pengaturan untuk bisa input data.'));
  wadah.append(lembarTransaksi('borongan_transactions', 'Borongan', 'BR', periode, gambar, bisaEdit));

  const kelompok = D.baris('borongan_group').filter((r) => !r.deleted_at && dalamPeriode(r, periode));
  if (kelompok.length) {
    wadah.append(el('div.lembar', { style: 'margin-top:1.6rem' }, [
      el('div.lembar-kepala', {}, [el('h2', { teks: 'Borongan kelompok' })]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', { teks: 'Dibuat di aplikasi desktop. Di sini hanya ditampilkan.' }),
        tabel([
          { l: 'Tanggal', k: 'tanggal', jenis: 'tanggal' },
          { l: 'Nomor', k: 'nomor_transaksi' },
          { l: 'Komponen', nilai: (r) => D.labelRef('wage_components', r.wage_component_id) },
          { l: 'Hasil', k: 'total_hasil', jenis: 'angka', pecahan: 2 },
          { l: 'Anggota', nilai: (r) => D.baris('borongan_group_members').filter((m) => Number(m.group_id) === Number(r.id)).length, jenis: 'angka' },
          { l: 'Nilai (Rp)', k: 'total_nilai', jenis: 'uang', total: true },
        ], kelompok),
      ]),
    ]));
  }
  return wadah;
}

export function halamanLemburPremi({ periode, gambar, bisaEdit }) {
  const wadah = el('section');
  if (!bisaEdit()) wadah.append(panelKosong('Mode lihat. Masukkan token GitHub di Pengaturan untuk bisa input data.'));
  wadah.append(
    lembarTransaksi('lembur_transactions', 'Lembur', 'LM', periode, gambar, bisaEdit),
    el('div', { style: 'height:1.6rem' }),
    lembarTransaksi('premi_transactions', 'Premi', 'PR', periode, gambar, bisaEdit),
  );
  return wadah;
}

// =====================================================================
// DATA TERHAPUS
// =====================================================================
const TABEL_HAPUS = {
  daily_payroll: 'HK harian',
  borongan_transactions: 'Borongan',
  lembur_transactions: 'Lembur',
  premi_transactions: 'Premi',
};

export function halamanTerhapus({ gambar, bisaEdit }) {
  const wadah = el('section');
  const tempat = el('div');

  const gambarIsi = () => {
    const semua = [];
    for (const [t, judul] of Object.entries(TABEL_HAPUS)) {
      for (const r of D.baris(t)) if (r.deleted_at) semua.push({ ...r, _tabel: t, _judul: judul });
    }
    semua.sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));

    kosongkan(tempat).append(tabel([
      { l: 'Jenis', k: '_judul' },
      { l: 'Nomor', k: 'nomor_transaksi' },
      { l: 'Tanggal', k: 'tanggal', jenis: 'tanggal' },
      { l: 'Pekerja', nilai: (r) => D.labelRef('employees', r.employee_id) },
      { l: 'Upah (Rp)', k: 'nominal', jenis: 'uang', total: true },
      { l: 'Dihapus', nilai: (r) => `${r.deleted_at?.slice(0, 16) || '–'}${r.deleted_by ? ' oleh ' + r.deleted_by : ''}` },
      {
        l: '',
        nilai: (r) => (bisaEdit()
          ? el('button.tombol-kecil', {
            type: 'button', teks: 'Pulihkan',
            onclick: async (ev) => {
              ev.stopPropagation();
              if (r._tabel === 'daily_payroll') {
                const total = D.totalHkHari(r.employee_id, r.tanggal) + (Number(r.hk) || 0);
                if (total > D.maksHkPerHari() + 1e-9) {
                  await tanya('Tidak bisa dipulihkan', `Memulihkan baris ini membuat total HK `
                    + `${D.labelRef('employees', r.employee_id)} pada ${ftanggal(r.tanggal)} jadi `
                    + `${fhk(total)}, melebihi batas ${fhk(D.maksHkPerHari())} per hari.`,
                  { ya: 'Mengerti', tidak: 'Tutup' });
                  return;
                }
              }
              D.pulihkan(r._tabel, r.id);
              pesan('Baris dipulihkan.', 'sukses');
              gambarIsi();
              gambar();
            },
          })
          : '–'),
      },
    ], semua, { kosong: 'Tidak ada data terhapus.' }));
  };

  gambarIsi();
  wadah.append(el('div.lembar', {}, [
    el('div.lembar-kepala', {}, [el('h2', { teks: 'Data terhapus' })]),
    el('div.lembar-isi', {}, [
      el('p.bantuan', { teks: 'Transaksi yang dihapus tidak langsung hilang — tetap tersimpan di sini, sama seperti Recycle Bin di aplikasi desktop.' }),
      tempat,
    ]),
  ]));
  return wadah;
}
