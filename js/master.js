// master.js — halaman master data yang dipakai BERSAMA oleh bagian Payroll
// maupun Alat Berat. Bentuk tabel dan formnya dibaca dari skema bagian yang
// sedang dibuka, jadi satu kode ini melayani semua tabel master.

import * as D from './data.js';
import { mst, siklusBlok, dasarNamaBlok, SIKLUS } from './siklus.js';
import {
  el, tabel, isian, pilihan, kesalahan, panel, tanya, pesan, kosongkan, taruh, angka,
  rupiahPenuh,
} from './ui.js';

const TERSEMBUNYI = '••••••';

// Skema bagian yang sedang dibuka. Diisi halamanMaster() sebelum menggambar;
// hanya satu halaman yang aktif pada satu waktu, jadi aman dipegang di sini.
let TABEL = {};
let REF_TRANSAKSI = {};

/** Kolom mana yang merujuk ke tabel ini (untuk cek sebelum menghapus). */
function dipakaiOleh(tabelInduk, id) {
  const pemakai = [];
  const semua = { ...TABEL, ...REF_TRANSAKSI };
  for (const [nama, def] of Object.entries(semua)) {
    for (const f of def.f || []) {
      if (f.t === 'ref' && f.ref === tabelInduk) {
        const n = D.baris(nama).filter((r) => Number(r[f.k]) === Number(id) && !r.deleted_at).length;
        if (n) pemakai.push({ tabel: def.judul, n });
      }
    }
  }
  return pemakai;
}

// ------------------------------------------------------------- form
function bangunForm(namaTabel, baris) {
  const def = TABEL[namaTabel];
  const kendali = {};
  const isiForm = el('div');

  for (const f of def.f) {
    let k;
    const nilai = baris?.[f.k] ?? f.bawaan ?? '';
    if (f.t === 'ref') {
      const opsi = D.aktif(f.ref)
        .map((r) => ({ nilai: r.id, label: TABEL[f.ref].label(r) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'id'));
      // baris lama boleh menunjuk master non-aktif — jangan sampai hilang dari pilihan
      if (nilai && !opsi.some((o) => String(o.nilai) === String(nilai))) {
        opsi.unshift({ nilai, label: D.labelRef(f.ref, nilai) + ' (tidak aktif)' });
      }
      k = pilihan(opsi, nilai);
    } else if (f.t === 'enum') {
      k = pilihan(f.pilihan.map((p) => ({ nilai: p, label: p })), nilai, { kosongLabel: '— pilih —' });
    } else if (f.t === 'pilih_angka') {
      k = pilihan(f.pilihan, nilai === '' ? f.bawaan : nilai, { kosongLabel: '— pilih —' });
    } else if (f.t === 'area') {
      k = el('textarea', { nilai });
    } else if (f.t === 'money' || f.t === 'num' || f.t === 'int') {
      k = el('input', {
        type: 'number', nilai, step: f.t === 'int' ? '1' : f.t === 'money' ? '1' : '0.01',
        min: f.t === 'money' ? '0' : null,
      });
    } else {
      k = el('input', { type: 'text', nilai });
    }
    if (f.wajib) k.required = true;
    kendali[f.k] = k;
    isiForm.append(isian(f.l + (f.wajib ? ' *' : ''), k, {
      bantuan: f.t === 'money' ? 'Rupiah, tanpa titik.' : f.peka ? 'Data pribadi.' : null,
    }));
  }
  return { isiForm, kendali };
}

function bacaForm(namaTabel, kendali) {
  const def = TABEL[namaTabel];
  const isi = {};
  for (const f of def.f) {
    const v = kendali[f.k].value;
    if (f.t === 'ref' || f.t === 'int' || f.t === 'pilih_angka') isi[f.k] = v === '' ? null : Number(v);
    else if (f.t === 'money' || f.t === 'num') isi[f.k] = v === '' ? 0 : Number(v);
    else isi[f.k] = v.trim();
  }
  return isi;
}


// ---------------------------------------------------------------------
// Penjaga ejaan: mencegah nama master kembar karena salah ketik — beda
// huruf besar/kecil ("Gudang"/"gudang"), spasi nyasar ("gu dang"), atau
// salah satu huruf ("gudng"). Tidak diperbaiki diam-diam: pengguna
// diberi tahu dan boleh memilih memakai yang sudah ada.
// ---------------------------------------------------------------------
const KOLOM_NAMA = {
  activities: 'nama_kegiatan',
  job_types: 'nama_jenis',
  blocks: 'nama_blok',
  wage_components: 'nama_komponen',
  divisions: 'nama_divisi',
};
const rapat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function jarakKetik(a, b) {           // Levenshtein sederhana, cukup untuk nama pendek
  if (Math.abs(a.length - b.length) > 2) return 9;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1,
        m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return m[a.length][b.length];
}
/** Baris master lain yang namanya mirip — beserta alasannya. */
function namaMirip(namaTabel, isi, idSekarang) {
  const kolom = KOLOM_NAMA[namaTabel];
  if (!kolom || !isi[kolom]) return [];
  const baru = String(isi[kolom]).trim();
  const rBaru = rapat(baru);
  if (rBaru.length < 3) return [];
  const hasil = [];
  for (const r of D.baris(namaTabel)) {
    if (Number(r.id) === Number(idSekarang)) continue;
    const lama = String(r[kolom] ?? '').trim();
    if (!lama || lama === baru) continue;
    const rLama = rapat(lama);
    let sebab = null;
    if (rLama === rBaru) {
      sebab = lama.toLowerCase() === baru.toLowerCase()
        ? 'beda huruf besar/kecil' : 'beda spasi atau tanda baca';
    } else if (rBaru.length >= 5 && jarakKetik(rLama, rBaru) <= 1) {
      sebab = 'beda satu huruf';
    }
    if (sebab) hasil.push({ nama: lama, sebab, id: r.id });
  }
  return hasil;
}

function periksa(namaTabel, isi, idSekarang) {
  const def = TABEL[namaTabel];
  const salah = [];
  for (const f of def.f) {
    const v = isi[f.k];
    if (f.wajib && (v === '' || v == null)) salah.push(`${f.l} harus diisi.`);
    if (f.unik && v) {
      const kembar = D.baris(namaTabel).some(
        (r) => Number(r.id) !== Number(idSekarang)
          && String(r[f.k] ?? '').toLowerCase() === String(v).toLowerCase());
      if (kembar) salah.push(`${f.l} "${v}" sudah dipakai baris lain.`);
    }
    if ((f.t === 'money' || f.t === 'num') && v < 0) salah.push(`${f.l} tidak boleh minus.`);
  }
  return salah;
}

/**
 * Blok ini kebun pisang yang ditanam? Siklus PC/R1/R2/R3/R4 hanya untuk
 * komoditas pisang — padi dan divisi lain tetap seperti semula.
 *
 * Di daftar blok bercampur dua macam isi: BLOK TANAM (A01, A02, …) dan
 * TEMPAT (Barak, Packing, Nursery, All Area). Tempat tidak punya tanggal
 * tanam, jadi tidak pernah dapat siklus — isian tanggalnya boleh muncul,
 * tapi dibiarkan kosong saja.
 *
 * Patokannya komoditas blok itu sendiri. Kalau komoditasnya belum diisi
 * (data lama), dipakai nama divisinya sebagai cadangan.
 */
function blokPisang(divisionId, komoditas) {
  const kom = String(komoditas || '').trim();
  if (kom) return /pisang/i.test(kom);
  const d = D.cari('divisions', divisionId);
  return /pisang/i.test(String(d?.nama_divisi || ''));
}

/**
 * Isian "Tanggal tanam" untuk master Blok (khusus kebun pisang).
 *
 * Bukan kolom database — disimpan di bagian `web` (lihat tanamBlok di
 * data.js). Dari tanggal ini situs menghitung sendiri umur tanaman (MST)
 * dan siklusnya, lalu nama blok yang TAMPIL ikut menyesuaikan.
 */
function isianTanamBlok(baris, ambilDivisi, ambilKomoditas) {
  const awal = baris ? D.tanamBlok(baris.id) : null;
  const inTgl = el('input', { type: 'date', nilai: awal || '' });
  const hasil = el('p.bantuan', { style: 'margin-top:.3rem' });
  const bungkus = el('div');

  const perbarui = () => {
    const pisang = blokPisang(ambilDivisi(), ambilKomoditas());
    bungkus.style.display = pisang || inTgl.value ? '' : 'none';
    const m = mst(inTgl.value);
    const sk = siklusBlok(inTgl.value);
    const dasar = dasarNamaBlok(baris?.nama_blok || '');
    hasil.textContent = !inTgl.value
      ? 'Kosongkan untuk tempat seperti Barak, Packing, Nursery, atau All Area — '
        + 'nama bloknya tetap apa adanya, tanpa siklus.'
      : m == null ? 'Tanggal tanam belum lewat, umurnya belum bisa dihitung.'
        : `Umur ${m} MST · siklus ${sk.label}`
          + (dasar ? ` · nama blok tampil sebagai "${dasar} (${sk.kode})"` : '');
  };
  inTgl.addEventListener('input', perbarui);
  perbarui();

  taruh(bungkus, isian('Tanggal tanam', inTgl, {
    bantuan: 'Dipakai menghitung umur (MST) dan siklus: '
      + SIKLUS.map((x) => (x.sampai == null
        ? `${x.kode} minggu ${x.dari} ke atas`
        : `${x.kode} minggu ${x.dari}–${x.sampai}`)).join(', ')
      + '. Umurnya dihitung sama dengan rumus di berkas Monitoring Kebun Pisang.',
  }), hasil);

  return {
    elemen: bungkus,
    perbarui,
    simpan(blockId) { D.setTanamBlok(blockId, inTgl.value || null); },
    // kalau tanggal tanam diisi, akhiran siklus yang dulu diketik manual
    // dibuang dari nama supaya tidak tertulis dua kali
    namaDasar(nama) { return inTgl.value ? dasarNamaBlok(nama) : nama; },
  };
}

/**
 * Isian "Divisi" untuk master Karyawan.
 *
 * Bukan kolom database — penetapannya disimpan di bagian `web` (lihat
 * divisiKaryawan di data.js). Boleh lebih dari satu divisi.
 *
 * Admin divisi hanya boleh mencentang/melepas divisi yang dia pegang;
 * divisi lain tetap ditampilkan tapi terkunci, supaya dia tahu orang itu
 * juga anggota divisi lain dan tidak bisa mencabutnya diam-diam.
 */
function isianDivisiKaryawan(baris, divisiBoleh) {
  const boleh = divisiBoleh == null ? null : new Set(divisiBoleh.map(Number));
  const terpasang = baris ? D.divisiKaryawan(baris.id) : [];
  const dipakai = baris ? (petaDivisi('employees').get(Number(baris.id)) || new Set()) : new Set();
  const semuaDivisi = [...D.baris('divisions')]
    .filter((d) => !d.deleted_at && (D.barisAktif(d) || terpasang.includes(Number(d.id))))
    .sort((a, b) => String(a.nama_divisi).localeCompare(String(b.nama_divisi), 'id'));

  const kotak = new Map();
  const daftar = el('div', { style: 'display:flex;flex-wrap:wrap;gap:.4rem 1rem' },
    semuaDivisi.map((d) => {
      const id = Number(d.id);
      const terkunci = boleh !== null && !boleh.has(id);
      const cb = el('input', { type: 'checkbox' });
      cb.checked = terpasang.includes(id);
      if (terkunci) cb.disabled = true;
      kotak.set(id, { cb, terkunci });
      // nowrap: nama panjang seperti "Kantor & Gudang" tidak dipotong jadi
      // beberapa baris sehingga kotak centangnya ikut melar
      return el('label', {
        style: 'display:inline-flex;gap:.35rem;align-items:center;font-size:.9rem;'
          + `white-space:nowrap${terkunci ? ';opacity:.55' : ''}`,
        title: terkunci ? 'Divisi ini di luar akses Anda — tidak bisa diubah dari sini.' : null,
      }, [cb, d.nama_divisi + (dipakai.has(id) ? ' •' : '')]);
    }));

  const catatan = [];
  if (dipakai.size) {
    catatan.push(`Tanda • = sudah ada HK/lembur/premi orang ini di divisi itu (${
      [...dipakai].map((d) => D.labelRef('divisions', d)).join(', ')}).`);
  }
  if (!terpasang.length) {
    catatan.push('Belum ditetapkan — untuk sementara divisinya dibaca dari transaksi yang sudah ada.');
  }
  if (boleh !== null) catatan.push('Divisi yang redup di luar akses Anda, jadi tidak bisa diubah.');

  return {
    elemen: isian('Divisi karyawan', daftar, {
      bantuan: (catatan.join(' ') || 'Boleh dicentang lebih dari satu kalau memang kerja lintas divisi.'),
    }),
    simpan(employeeId) {
      const pilih = [];
      for (const [id, { cb, terkunci }] of kotak) {
        // yang terkunci dipertahankan apa adanya, jangan ikut terhapus
        if (terkunci ? terpasang.includes(id) : cb.checked) pilih.push(id);
      }
      D.setDivisiKaryawan(employeeId, pilih);
    },
  };
}

function formPanel(namaTabel, baris, saatSelesai, divisiBoleh = null) {
  const def = TABEL[namaTabel];
  const { isiForm, kendali } = bangunForm(namaTabel, baris);
  const tempatGalat = el('div');

  // Karyawan: isian divisi tempelan (disimpan di bagian `web`, bukan kolom
  // database). Boleh lebih dari satu karena ada yang kerja lintas divisi.
  // Ditaruh TEPAT DI BAWAH NAMA, bukan di ujung form — ini isian penting,
  // jangan sampai tidak terlihat tanpa menggulung layar.
  const pilihDivisi = namaTabel === 'employees' ? isianDivisiKaryawan(baris, divisiBoleh) : null;
  // Blok kebun pisang: tanggal tanam -> umur (MST) -> siklus -> nama tampil
  const tanamBlok = namaTabel === 'blocks'
    ? isianTanamBlok(baris, () => kendali.division_id?.value,
      () => kendali.komoditas?.value) : null;
  if (tanamBlok) {
    kendali.division_id?.addEventListener('change', () => tanamBlok.perbarui());
    kendali.komoditas?.addEventListener('input', () => tanamBlok.perbarui());
    isiForm.append(tanamBlok.elemen);
  }
  if (pilihDivisi) {
    const urutNama = def.f.findIndex((f) => f.k === 'nama');
    const sesudah = isiForm.children[urutNama >= 0 ? urutNama : 0];
    if (sesudah?.nextSibling) isiForm.insertBefore(pilihDivisi.elemen, sesudah.nextSibling);
    else isiForm.append(pilihDivisi.elemen);
  }
  const badan = el('div', {}, [tempatGalat, isiForm]);

  const simpan = async () => {
    const isi = bacaForm(namaTabel, kendali);
    const salah = periksa(namaTabel, isi, baris?.id);
    kosongkan(tempatGalat);
    if (salah.length) {
      tempatGalat.append(kesalahan(salah));
      badan.scrollTop = 0;
      return;
    }
    // Nama mirip dengan yang sudah ada? Beri tahu dulu — jangan diam-diam
    // membuat dua master yang sebenarnya sama (bikin rekap terpecah dua).
    const mirip = namaMirip(namaTabel, isi, baris?.id);
    if (mirip.length) {
      const kolom = KOLOM_NAMA[namaTabel];
      const lanjut = await tanya('Nama mirip sudah ada', el('div', {}, [
        el('p', { teks: `"${isi[kolom]}" mirip dengan ${def.tunggal} yang sudah ada:` }),
        el('ul', {}, mirip.slice(0, 5).map((m) => el('li', {
          teks: `${m.nama}  —  ${m.sebab}`,
        }))),
        el('p', { teks: 'Kalau sebenarnya sama, batalkan dan pakai yang sudah ada supaya '
          + 'rekap tidak terpecah dua. Kalau memang beda, lanjutkan.' }),
      ]), { ya: 'Tetap simpan sebagai baru', tidak: 'Batal — pakai yang sudah ada' });
      if (!lanjut) return;
    }
    if (tanamBlok) isi.nama_blok = tanamBlok.namaDasar(isi.nama_blok);
    const simpanan = baris ? (D.ubah(namaTabel, baris.id, isi), baris)
      : D.tambah(namaTabel, isi);
    if (pilihDivisi) pilihDivisi.simpan(simpanan.id);
    if (tanamBlok) tanamBlok.simpan(simpanan.id);
    p.tutup();
    pesan(baris ? `${def.judul} diperbarui. Jangan lupa Simpan ke GitHub.`
      : `${def.judul} ditambahkan. Jangan lupa Simpan ke GitHub.`, 'sukses');
    saatSelesai();
  };

  const aksi = [];
  if (baris) {
    aksi.push(el('button.tombol-bahaya.tombol-kecil', {
      type: 'button', teks: 'Hapus', style: 'margin-right:auto',
      onclick: async () => {
        p.tutup();
        await hapusMaster(namaTabel, baris, saatSelesai);
      },
    }));
  }
  aksi.push(
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan', onclick: simpan }),
  );
  const p = panel(baris ? `Ubah ${def.tunggal}` : `Tambah ${def.tunggal}`, badan, aksi);
  badan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); simpan(); }
  });
}

// ------------------------------------------------------------ halaman

// ---------------------------------------------------------------------
// Saring daftar master sesuai divisi yang diceklis untuk pengguna ini.
// Dari lima tabel master, hanya BLOK yang punya kolom divisi; sisanya
// (karyawan, kegiatan, jenis pekerjaan, komponen upah) memang dipakai
// bersama — itu bawaan database aplikasi desktop. Supaya admin divisi
// tidak perlu menyaring 260 jenis pekerjaan milik divisi lain, daftarnya
// disaring berdasarkan PEMAKAIAN di divisinya; baris yang belum terpakai
// di mana pun tetap ditampilkan (supaya yang baru dibuat tidak hilang).
// ---------------------------------------------------------------------
const KOLOM_PAKAI = {
  employees: [['daily_payroll', 'employee_id'], ['lembur_transactions', 'employee_id'],
    ['premi_transactions', 'employee_id'], ['borongan_transactions', 'employee_id']],
  activities: [['daily_payroll', 'activity_id']],
  job_types: [['daily_payroll', 'job_type_id']],
  wage_components: [['lembur_transactions', 'wage_component_id'],
    ['premi_transactions', 'wage_component_id'], ['borongan_transactions', 'wage_component_id']],
};
/** Divisi mana saja yang memakai tiap baris master — dibaca dari transaksi.
 *  Dipakai untuk kolom "Divisi" di daftar master supaya terlihat jelas siapa
 *  anggota divisi mana, dan untuk menyaring daftarnya. */
function petaDivisi(namaTabel) {
  const peta = KOLOM_PAKAI[namaTabel];
  const hasil = new Map();
  if (!peta) return hasil;
  for (const [tabel, kolom] of peta) {
    for (const r of D.baris(tabel)) {
      if (r.deleted_at) continue;
      const v = r[kolom];
      if (v == null || r.division_id == null) continue;
      const id = Number(v);
      if (!hasil.has(id)) hasil.set(id, new Set());
      hasil.get(id).add(Number(r.division_id));
    }
  }
  return hasil;
}

function saringMaster(namaTabel, data, divisiBoleh) {
  if (divisiBoleh == null) return data;                 // admin: semua
  if (namaTabel === 'blocks') {
    const ok = new Set(divisiBoleh.map(Number));
    return data.filter((r) => r.division_id == null || ok.has(Number(r.division_id)));
  }
  // Karyawan: kalau divisinya sudah DITETAPKAN admin, itu yang dipakai —
  // bukan tebakan dari transaksi. Yang belum ditetapkan jatuh ke cara lama.
  if (namaTabel === 'employees') {
    const ok = new Set(divisiBoleh.map(Number));
    const tetap = D.petaDivisiKaryawan();
    const sisa = data.filter((r) => !tetap.has(Number(r.id)));
    const hasilTetap = data.filter((r) => {
      const d = tetap.get(Number(r.id));
      return d && d.some((x) => ok.has(x));
    });
    return [...hasilTetap, ...saringPakai('employees', sisa, ok)];
  }
  return saringPakai(namaTabel, data, new Set(divisiBoleh.map(Number)));
}

/** Saring berdasarkan PEMAKAIAN di transaksi: yang dipakai di divisi saya,
 *  ditambah yang belum dipakai siapa pun (supaya yang baru tidak hilang). */
function saringPakai(namaTabel, data, ok) {
  const peta = KOLOM_PAKAI[namaTabel];
  if (!peta) return data;
  const dipakaiDiSaya = new Set();
  const dipakaiOrangLain = new Set();
  for (const [tabel, kolom] of peta) {
    for (const r of D.baris(tabel)) {
      if (r.deleted_at) continue;
      const v = r[kolom];
      if (v == null) continue;
      const d = r.division_id == null ? null : Number(r.division_id);
      if (d == null || ok.has(d)) dipakaiDiSaya.add(Number(v));
      else dipakaiOrangLain.add(Number(v));
    }
  }
  return data.filter((r) => {
    const id = Number(r.id);
    if (dipakaiDiSaya.has(id)) return true;             // dipakai di divisi saya
    return !dipakaiOrangLain.has(id);                   // belum dipakai siapa pun
  });
}

export function halamanMaster(namaTabel, { gambar, bisaEdit, kamus, hak }) {
  TABEL = kamus.TABEL;
  REF_TRANSAKSI = kamus.REF || {};
  const def = TABEL[namaTabel];
  const wadah = el('section');
  let kataCari = '';
  let tampilkanPeka = false;
  let hanyaAktif = false;

  const tempatTabel = el('div');

  const divisiBoleh = () => (hak?.divisi ? hak.divisi() : null);
  const gambarTabel = () => {
    const semuaBaris = D.baris(namaTabel);
    let data = saringMaster(namaTabel, semuaBaris, divisiBoleh());
    const disaring = data.length !== semuaBaris.length;
    if (hanyaAktif) data = data.filter(D.barisAktif);
    if (kataCari) {
      const q = kataCari.toLowerCase();
      data = data.filter((r) => (def.cari || []).some(
        (k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    data = [...data].sort((a, b) => String(def.label(a) ?? '').localeCompare(String(def.label(b) ?? ''), 'id'));
    const catatanSaring = disaring
      ? el('p.bantuan', { teks: namaTabel === 'blocks'
        ? 'Hanya blok divisi Anda yang ditampilkan.'
        : `Hanya ${def.judul.toLowerCase()} divisi Anda yang ditampilkan — lihat kolom Divisi. `
          + 'Yang belum terpakai di mana pun ikut ditampilkan, dan yang dipakai di '
          + 'beberapa divisi muncul di daftar masing-masing divisi itu.' })
      : null;

    // Kolom "Divisi" tempelan: tabel ini tidak punya kolom divisi di database,
    // jadi divisinya dibaca dari transaksi — supaya tetap kelihatan siapa
    // anggota divisi mana. Blok sudah punya kolom divisi sendiri.
    const pakaiDivisi = KOLOM_PAKAI[namaTabel] && namaTabel !== 'blocks';
    const jejakDivisi = pakaiDivisi ? petaDivisi(namaTabel) : null;
    // Blok: kolom umur & siklus, dihitung dari tanggal tanam (terkunci —
    // tidak bisa diketik, murni hasil hitungan)
    const kolomSiklus = namaTabel === 'blocks' ? [
      { l: 'Tanggal tanam', rata: 'angka',
        nilai: (r) => D.tanamBlok(r.id) || '–' },
      { l: 'Umur (MST)', rata: 'angka',
        nilai: (r) => { const m = mst(D.tanamBlok(r.id)); return m == null ? '–' : `${m}`; } },
      { l: 'Siklus', nilai: (r) => siklusBlok(D.tanamBlok(r.id))?.label || '–' },
    ] : null;
    const tetapDivisi = namaTabel === 'employees' ? D.petaDivisiKaryawan() : null;
    const namaiDivisi = (daftar) => [...daftar].map((d) => D.labelRef('divisions', d))
      .sort((a, b) => String(a).localeCompare(String(b), 'id')).join(', ');
    const kolomDivisi = pakaiDivisi ? {
      l: 'Divisi',
      k: '_divisi',
      jenis: 'teks',
      nilai: (r) => {
        // penetapan admin menang atas tebakan dari transaksi
        const tetap = tetapDivisi?.get(Number(r.id));
        if (tetap?.length) return namaiDivisi(tetap);
        const s = jejakDivisi.get(Number(r.id));
        if (!s || !s.size) return namaTabel === 'employees' ? '— belum ditetapkan —' : '— belum terpakai —';
        return namaiDivisi(s) + (namaTabel === 'employees' ? ' (dari transaksi)' : '');
      },
    } : null;

    const kolom = def.f
      .filter((f) => f.t !== 'area')
      .map((f) => ({
        l: f.l,
        k: f.k,
        jenis: f.t === 'money' ? 'uang' : f.t === 'num' || f.t === 'int' ? 'angka' : 'teks',
        pecahan: f.t === 'num' ? 2 : 0,
        nilai: f.t === 'ref'
          ? (r) => D.labelRef(f.ref, r[f.k])
          : f.t === 'pilih_angka'
            ? (r) => (f.pilihan.find((o) => Number(o.nilai) === Number(r[f.k]))?.label ?? r[f.k])
            : f.peka && !tampilkanPeka
              ? (r) => (r[f.k] ? TERSEMBUNYI : '')
              : null,
      }));
    // Divisi ditaruh setelah kolom nama, sebelum kolom-kolom rinci lainnya.
    if (kolomDivisi) kolom.splice(Math.min(2, kolom.length), 0, kolomDivisi);
    if (kolomSiklus) kolom.push(...kolomSiklus);

    taruh(kosongkan(tempatTabel),
      el('p.samar', { style: 'margin:0 0 .5rem', teks: `${data.length} dari ${D.baris(namaTabel).length} ${def.tunggal}` }),
      catatanSaring,
      tabel(kolom, data, {
        kosong: `Belum ada ${def.tunggal}.`,
        saatKlik: bisaEdit()
          ? (r) => formPanel(namaTabel, r, () => { gambarTabel(); gambar(); }, divisiBoleh())
          : null,
      }),
      bisaEdit() && data.length
        ? el('p.samar', { style: 'margin:.6rem 0 0; font-size:.85rem', teks: 'Klik satu baris untuk mengubah atau menghapusnya.' })
        : null,
    );
  };

  const alat = el('div.lembar-kepala', {}, [
    el('h2', { teks: def.judul }),
    el('input', {
      type: 'search', placeholder: `Cari ${def.tunggal}…`, 'aria-label': `Cari ${def.tunggal}`,
      style: 'max-width:16rem', oninput: (e) => { kataCari = e.target.value.trim(); gambarTabel(); },
    }),
    el('label.samar', { style: 'display:flex;gap:.3rem;align-items:center;font-size:.85rem' }, [
      el('input', { type: 'checkbox', onchange: (e) => { hanyaAktif = e.target.checked; gambarTabel(); } }),
      'Hanya yang aktif',
    ]),
    def.f.some((f) => f.peka)
      ? el('label.samar', { style: 'display:flex;gap:.3rem;align-items:center;font-size:.85rem' }, [
        el('input', { type: 'checkbox', onchange: (e) => { tampilkanPeka = e.target.checked; gambarTabel(); } }),
        'Tampilkan data pribadi',
      ])
      : null,
    // Alat sekali pakai: blok yang terpecah karena siklusnya dulu diketik
    // tangan jadi bagian nama ("A04", "A04 (R1)", "A04 (R2)") disatukan.
    // Hanya muncul kalau memang ada yang kembar, dan hanya untuk admin.
    namaTabel === 'blocks' && bisaEdit() && hak?.admin?.() && blokKembar().length
      ? el('button.tombol-samar', {
        type: 'button', teks: `Gabungkan ${blokKembar().length} blok kembar`,
        title: 'Blok yang namanya dulu diketik pakai akhiran siklus disatukan ke kode dasarnya',
        onclick: () => gabungBlokKembar(() => { gambarTabel(); gambar(); }),
      })
      : null,
    bisaEdit()
      ? el('button.tombol-utama', {
        type: 'button', teks: `Tambah ${def.tunggal}`,
        onclick: () => formPanel(namaTabel, null, () => { gambarTabel(); gambar(); }, divisiBoleh()),
      })
      : null,
  ]);

  wadah.append(el('div.lembar', {}, [alat, el('div.lembar-isi', {}, [tempatTabel])]));
  gambarTabel();

  if (!bisaEdit()) {
    wadah.prepend(el('div.petunjuk', {}, [
      'Mode lihat. Untuk mengubah data, masukkan token GitHub di halaman Pengaturan.',
    ]));
  }
  return wadah;
}

/**
 * Blok yang terpecah karena siklusnya dulu diketik tangan jadi bagian nama.
 *
 * Dulu kebun mengetik sendiri "A04 (R1)" dan "A04 (R2)" sebagai blok
 * TERPISAH, padahal itu satu blok yang sama. Akibatnya biaya satu blok
 * tersebar ke beberapa baris, dan akhirannya pun tidak selalu cocok dengan
 * tanggal transaksinya — orang pilih mana saja yang muncul di daftar.
 *
 * Sekarang siklus dihitung sendiri dari tanggal tanam, jadi baris kembar itu
 * tidak perlu lagi. Yang dikembalikan: daftar { baris, dasar } untuk tiap
 * blok kembar yang blok dasarnya memang ada.
 */
export function blokKembar() {
  const aktif = D.aktif('blocks');
  const olehKode = new Map();
  for (const x of aktif) olehKode.set(String(x.kode_blok).trim().toLowerCase(), x);
  const hasil = [];
  for (const x of aktif) {
    const dasar = dasarNamaBlok(x.kode_blok);
    if (dasar === String(x.kode_blok).trim()) continue;
    const tujuan = olehKode.get(dasar.toLowerCase());
    if (!tujuan || Number(tujuan.id) === Number(x.id)) continue;
    hasil.push({ baris: x, dasar: tujuan });
  }
  return hasil;
}

const TABEL_TRANSAKSI = ['daily_payroll', 'borongan_transactions',
  'lembur_transactions', 'premi_transactions'];

/** Jumlah baris & rupiah yang menempel ke satu blok. */
function pemakaiBlok(blockId) {
  let n = 0; let rp = 0;
  for (const nm of TABEL_TRANSAKSI) {
    for (const r of D.baris(nm)) {
      if (r.deleted_at || Number(r.block_id) !== Number(blockId)) continue;
      n += 1; rp += Number(r.nominal) || 0;
    }
  }
  return { n, rp };
}

/**
 * Satukan blok kembar ke kode dasarnya.
 *
 * Transaksinya dipindah, baris kembarnya dihapus (lunak, jadi masih bisa
 * dilihat di Terhapus). Jumlah baris dan total rupiah TIDAK boleh berubah —
 * kalau berubah, perubahannya dibatalkan dan tidak ada yang disimpan.
 */
export async function gabungBlokKembar(saatSelesai) {
  const kembar = blokKembar();
  if (!kembar.length) {
    pesan('Tidak ada blok kembar.', 'info');
    return;
  }
  const rinci = kembar.map((k) => ({ ...k, ...pemakaiBlok(k.baris.id) }));
  const totalN = rinci.reduce((a, x) => a + x.n, 0);
  const totalRp = rinci.reduce((a, x) => a + x.rp, 0);
  const perDasar = new Map();
  for (const x of rinci) {
    const k = x.dasar.kode_blok;
    const v = perDasar.get(k) || { n: 0, rp: 0, dari: [] };
    v.n += x.n; v.rp += x.rp; v.dari.push(x.baris.kode_blok);
    perDasar.set(k, v);
  }

  const setuju = await tanya(`Gabungkan ${kembar.length} blok kembar`, el('div', {}, [
    el('p', { teks: 'Blok ini dulu dibuat terpisah karena siklusnya diketik jadi bagian nama. '
      + 'Sekarang siklus dihitung sendiri dari tanggal tanam, jadi barisnya disatukan ke '
      + 'kode dasarnya.' }),
    el('table.tabel-rapat', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { teks: 'Jadi' }), el('th', { teks: 'Dari' }),
        el('th', { teks: 'Baris' }), el('th', { teks: 'Nilai' })])]),
      el('tbody', {}, [...perDasar.entries()].map(([k, v]) => el('tr', {}, [
        el('td', { teks: k }),
        el('td', { teks: v.dari.join(', ') }),
        el('td', { teks: String(v.n) }),
        el('td', { teks: rupiahPenuh(v.rp) }),
      ]))),
    ]),
    el('p', { teks: `Seluruhnya ${totalN} baris senilai ${rupiahPenuh(totalRp)} dipindah. `
      + 'Totalnya tidak berubah — hanya menempel ke blok yang benar. Sesudah ini siklus tiap '
      + 'baris dihitung dari tanggal tanam dan tanggal baris itu sendiri.' }),
    el('p.bantuan', { teks: 'Baris blok yang kembar dihapus dari Master Blok sesudah '
      + 'transaksinya kosong — ini TIDAK bisa dibatalkan. Transaksinya sendiri tidak ada '
      + 'yang hilang, hanya berpindah ke blok dasarnya. Kalau jumlah baris atau totalnya '
      + 'sampai berubah, semuanya dibatalkan dan tidak ada yang dihapus.' }),
  ]), { ya: 'Ya, gabungkan', tidak: 'Batal' });
  if (!setuju) return;

  // ---- hitung dulu keadaan sebelum, supaya bisa diperiksa sesudahnya
  const hitungSemua = () => {
    let n = 0; let rp = 0;
    for (const nm of TABEL_TRANSAKSI) {
      for (const r of D.baris(nm)) {
        if (r.deleted_at) continue;
        n += 1; rp += Number(r.nominal) || 0;
      }
    }
    return { n, rp };
  };
  const sebelum = hitungSemua();

  const tujuanDari = new Map(kembar.map((k) => [Number(k.baris.id), Number(k.dasar.id)]));
  const batalkan = [];
  try {
    for (const nm of TABEL_TRANSAKSI) {
      for (const r of D.baris(nm)) {
        if (r.deleted_at || !r.block_id) continue;
        const ke = tujuanDari.get(Number(r.block_id));
        if (ke == null) continue;
        batalkan.push([nm, r.id, { ...r }]);
        D.ubah(nm, r.id, { ...r, block_id: ke });
      }
    }
    const sesudah = hitungSemua();
    if (sesudah.n !== sebelum.n || sesudah.rp !== sebelum.rp) {
      throw new Error(`jumlah berubah: ${sebelum.n}/${sebelum.rp} -> ${sesudah.n}/${sesudah.rp}`);
    }
    // Baru sesudah yakin totalnya utuh, baris kembarnya dihapus. Dihapus
    // KERAS, karena hapus lunak hanya berlaku untuk tabel transaksi —
    // baris master yang cuma ditandai deleted_at tetap ikut muncul di
    // semua daftar pilihan (lihat barisAktif di data.js). Sebelum dihapus,
    // dipastikan satu per satu benar-benar sudah tidak dipakai.
    for (const k of kembar) {
      const sisa = pemakaiBlok(k.baris.id);
      if (sisa.n) {
        throw new Error(`blok ${k.baris.kode_blok} masih dipakai ${sisa.n} baris`);
      }
    }
    for (const k of kembar) {
      D.setTanamBlok(k.baris.id, null);
      D.hapus('blocks', k.baris.id);
    }
  } catch (e) {
    for (const [nm, id, isi] of batalkan.reverse()) D.ubah(nm, id, isi);
    pesan(`Gagal menggabungkan, tidak ada yang diubah — ${e.message}`, 'galat', 12);
    return;
  }

  pesan(`${kembar.length} blok kembar digabungkan. ${totalN} baris senilai `
    + `${rupiahPenuh(totalRp)} sekarang menempel ke blok dasarnya. `
    + 'Jangan lupa Simpan supaya ikut terkirim.', 'sukses', 12);
  saatSelesai?.();
}

/** Dipakai halaman master: hapus satu baris setelah memastikan tidak dipakai. */
export async function hapusMaster(namaTabel, baris, saatSelesai) {
  const def = TABEL[namaTabel];
  const pemakai = dipakaiOleh(namaTabel, baris.id);
  if (pemakai.length) {
    await tanya(`${def.judul} ini masih dipakai`, el('div', {}, [
      el('p', { teks: `"${def.label(baris)}" tidak bisa dihapus karena masih dipakai:` }),
      el('ul', {}, pemakai.map((p) => el('li', { teks: `${p.tabel}: ${angka(p.n)} baris` }))),
      el('p', { teks: 'Ubah status jadi "Tidak Aktif" saja supaya tidak muncul lagi di pilihan, tanpa merusak data lama.' }),
    ]), { ya: 'Mengerti', tidak: 'Tutup' });
    return;
  }
  const yakin = await tanya(`Hapus ${def.tunggal}?`,
    `"${def.label(baris)}" akan dihapus permanen dari data.`, { ya: 'Hapus', bahaya: true });
  if (!yakin) return;
  D.hapus(namaTabel, baris.id);
  pesan(`${def.judul} dihapus. Jangan lupa Simpan ke GitHub.`, 'sukses');
  saatSelesai();
}
