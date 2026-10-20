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

  const simpan = () => {
    const isi = bacaForm(namaTabel, kendali);
    const salah = periksa(namaTabel, isi, baris?.id);
    kosongkan(tempatGalat);
    if (salah.length) {
      tempatGalat.append(kesalahan(salah));
      badan.scrollTop = 0;
      return;
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
export function halamanMaster(namaTabel, { gambar, bisaEdit, kamus }) {
  TABEL = kamus.TABEL;
  REF_TRANSAKSI = kamus.REF || {};
  const def = TABEL[namaTabel];
  const wadah = el('section');
  let kataCari = '';
  let tampilkanPeka = false;
  let hanyaAktif = false;

  const tempatTabel = el('div');

  const gambarTabel = () => {
    let data = D.baris(namaTabel);
    if (hanyaAktif) data = data.filter(D.barisAktif);
    if (kataCari) {
      const q = kataCari.toLowerCase();
      data = data.filter((r) => (def.cari || []).some(
        (k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    data = [...data].sort((a, b) => String(def.label(a) ?? '').localeCompare(String(def.label(b) ?? ''), 'id'));

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

    taruh(kosongkan(tempatTabel),
      el('p.samar', { style: 'margin:0 0 .5rem', teks: `${data.length} dari ${D.baris(namaTabel).length} ${def.tunggal}` }),
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
