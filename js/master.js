// master.js — halaman master data yang dipakai BERSAMA oleh bagian Payroll
// maupun Alat Berat. Bentuk tabel dan formnya dibaca dari skema bagian yang
// sedang dibuka, jadi satu kode ini melayani semua tabel master.

import * as D from './data.js';
import {
  el, tabel, isian, pilihan, kesalahan, panel, tanya, pesan, kosongkan, taruh, angka,
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

function formPanel(namaTabel, baris, saatSelesai) {
  const def = TABEL[namaTabel];
  const { isiForm, kendali } = bangunForm(namaTabel, baris);
  const tempatGalat = el('div');
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
    if (baris) D.ubah(namaTabel, baris.id, isi);
    else D.tambah(namaTabel, isi);
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
  const peta = KOLOM_PAKAI[namaTabel];
  if (!peta) return data;
  const ok = new Set(divisiBoleh.map(Number));
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
    const kolomDivisi = pakaiDivisi ? {
      l: 'Divisi',
      k: '_divisi',
      jenis: 'teks',
      nilai: (r) => {
        const s = jejakDivisi.get(Number(r.id));
        if (!s || !s.size) return '— belum terpakai —';
        return [...s].map((d) => D.labelRef('divisions', d))
          .sort((a, b) => String(a).localeCompare(String(b), 'id')).join(', ');
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

    taruh(kosongkan(tempatTabel),
      el('p.samar', { style: 'margin:0 0 .5rem', teks: `${data.length} dari ${D.baris(namaTabel).length} ${def.tunggal}` }),
      catatanSaring,
      tabel(kolom, data, {
        kosong: `Belum ada ${def.tunggal}.`,
        saatKlik: bisaEdit() ? (r) => formPanel(namaTabel, r, () => { gambarTabel(); gambar(); }) : null,
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
    bisaEdit()
      ? el('button.tombol-utama', {
        type: 'button', teks: `Tambah ${def.tunggal}`,
        onclick: () => formPanel(namaTabel, null, () => { gambarTabel(); gambar(); }),
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
