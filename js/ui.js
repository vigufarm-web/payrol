// ui.js — perkakas kecil untuk membuat elemen, tabel, form, dan pesan.
// Tidak ada pustaka luar: semua elemen dibuat langsung dengan DOM.

/** Buat elemen: el('div.kelas#id', { attr }, [anak...]) */
export function el(penanda, sifat = {}, anak = []) {
  const [tag, ...sisa] = penanda.split(/(?=[.#])/);
  const n = document.createElement(tag || 'div');
  for (const s of sisa) {
    // nama kelas/id kosong (mis. "td." saat jenis kolomnya teks) diabaikan
    if (s.length < 2) continue;
    if (s[0] === '.') n.classList.add(s.slice(1));
    else if (s[0] === '#') n.id = s.slice(1);
  }
  for (const [k, v] of Object.entries(sifat)) {
    if (v == null || v === false) continue;
    if (k === 'teks') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'nilai') n.value = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const a of [].concat(anak)) {
    if (a == null || a === false) continue;
    n.append(a instanceof Node ? a : document.createTextNode(String(a)));
  }
  return n;
}

export const kosongkan = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

/** Seperti append(), tapi anak bernilai null/false dilewati (bukan dicetak "null"). */
export function taruh(induk, ...anak) {
  for (const a of anak.flat(2)) {
    if (a == null || a === false) continue;
    induk.append(a instanceof Node ? a : document.createTextNode(String(a)));
  }
  return induk;
}

// ------------------------------------------------------------- format
const nf = (pecahan = 0) => new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: pecahan, maximumFractionDigits: pecahan,
});

export const angka = (v, pecahan = 0) => (v == null || v === '' || Number.isNaN(Number(v))
  ? '–' : nf(pecahan).format(Number(v)));

/** Rupiah tanpa "Rp" (dipakai di kolom tabel; satuan ditulis di judul kolom). */
export const rupiah = (v) => (v == null || v === '' ? '–' : nf(0).format(Math.round(Number(v))));
export const rupiahPenuh = (v) => (v == null || v === '' ? '–' : 'Rp ' + nf(0).format(Math.round(Number(v))));

/** HK ditulis apa adanya: 1 → "1", 0,5 → "0,5" */
export const hk = (v) => {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? nf(0).format(n) : nf(2).format(n).replace(/,?0+$/, '');
};

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const namaBulan = (b) => BULAN[b - 1] || '';

export function tanggal(iso) {
  if (!iso) return '–';
  const [t, b, h] = String(iso).slice(0, 10).split('-');
  if (!h) return iso;
  return `${Number(h)} ${BULAN[Number(b) - 1]?.slice(0, 3) || b} ${t}`;
}

export function waktu(iso) {
  if (!iso) return '–';
  const s = String(iso).replace('T', ' ');
  return `${tanggal(s.slice(0, 10))} ${s.slice(11, 16)}`;
}

export const hariIni = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Unduh teks sebagai berkas (dipakai ekspor CSV & simpan mode lokal). */
export function unduhTeks(namaBerkas, isi, tipe = 'text/plain;charset=utf-8') {
  const berkas = new Blob([isi], { type: tipe });
  const url = URL.createObjectURL(berkas);
  const a = el('a', { href: url, download: namaBerkas });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// -------------------------------------------------------------- pesan
let wadahPesan = null;
export function pesan(teks, jenis = 'info', detik = 4) {
  wadahPesan ||= document.body.appendChild(el('div.pesan-wadah'));
  const p = el(`div.pesan.pesan-${jenis}`, { role: 'status' }, [teks]);
  wadahPesan.append(p);
  setTimeout(() => {
    p.style.opacity = '0';
    setTimeout(() => p.remove(), 300);
  }, detik * 1000);
  return p;
}

/** Dialog tanya/jawab. Mengembalikan Promise<boolean>. */
export function tanya(judul, isi, { ya = 'Lanjutkan', tidak = 'Batal', bahaya = false } = {}) {
  return new Promise((selesai) => {
    const tutup = (jawab) => { latar.remove(); document.removeEventListener('keydown', tombol); selesai(jawab); };
    const tombol = (e) => { if (e.key === 'Escape') tutup(false); };
    const kotak = el('div.dialog', { role: 'dialog', 'aria-modal': 'true' }, [
      el('h2', { teks: judul }),
      typeof isi === 'string' ? el('p', { teks: isi }) : isi,
      el('div.dialog-aksi', {}, [
        el('button.tombol-samar', { type: 'button', onclick: () => tutup(false), teks: tidak }),
        el(`button.${bahaya ? 'tombol-bahaya' : 'tombol-utama'}`,
          { type: 'button', onclick: () => tutup(true), teks: ya }),
      ]),
    ]);
    const latar = el('div.latar-dialog', { onclick: (e) => { if (e.target === latar) tutup(false); } }, [kotak]);
    document.body.append(latar);
    document.addEventListener('keydown', tombol);
    kotak.querySelector('button:last-child').focus();
  });
}

/** Dialog isian singkat. Mengembalikan teks yang sudah dirapikan, atau null bila batal. */
export function mintaTeks(judul, keterangan, {
  label = 'Keterangan', ya = 'Simpan', tidak = 'Batal', wajib = false, panjang = 300,
} = {}) {
  return new Promise((selesai) => {
    const inp = el('textarea', { rows: 3, maxlength: panjang, placeholder: label });
    const galat = el('small.bantuan', { style: 'color:var(--merah);display:none',
      teks: `${label} wajib diisi.` });
    const tutup = (nilai) => {
      latar.remove();
      document.removeEventListener('keydown', tombol);
      selesai(nilai);
    };
    const kirim = () => {
      const nilai = inp.value.trim().replace(/\s+/g, ' ');
      if (wajib && !nilai) {
        galat.style.display = '';
        inp.focus();
        return;
      }
      tutup(nilai);
    };
    const tombol = (e) => {
      if (e.key === 'Escape') tutup(null);
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) kirim();
    };
    const kotak = el('div.dialog', { role: 'dialog', 'aria-modal': 'true' }, [
      el('h2', { teks: judul }),
      typeof keterangan === 'string' ? el('p', { teks: keterangan }) : keterangan,
      el('div.isian', {}, [el('label', { teks: label }), inp, galat]),
      el('div.dialog-aksi', {}, [
        el('button.tombol-samar', { type: 'button', onclick: () => tutup(null), teks: tidak }),
        el('button.tombol-bahaya', { type: 'button', onclick: kirim, teks: ya }),
      ]),
    ]);
    const latar = el('div.latar-dialog', {
      onclick: (e) => { if (e.target === latar) tutup(null); },
    }, [kotak]);
    document.body.append(latar);
    document.addEventListener('keydown', tombol);
    inp.focus();
  });
}

/** Panel geser dari kanan untuk form tambah/ubah. */
export function panel(judul, isi, aksi = []) {
  const tutup = () => { latar.remove(); document.removeEventListener('keydown', tombol); };
  const tombol = (e) => { if (e.key === 'Escape') tutup(); };
  const badan = el('div.panel-isi', {}, [isi]);
  const kotak = el('aside.panel', { role: 'dialog', 'aria-modal': 'true' }, [
    el('header.panel-kepala', {}, [
      el('h2', { teks: judul }),
      el('button.tombol-tutup', { type: 'button', 'aria-label': 'Tutup', onclick: tutup, teks: '✕' }),
    ]),
    badan,
    aksi.length ? el('footer.panel-kaki', {}, aksi) : null,
  ]);
  const latar = el('div.latar-panel', { onclick: (e) => { if (e.target === latar) tutup(); } }, [kotak]);
  document.body.append(latar);
  document.addEventListener('keydown', tombol);
  const fokus = badan.querySelector('input, select, textarea');
  if (fokus) fokus.focus();
  return { tutup, badan };
}

// -------------------------------------------------------------- tabel
/**
 * Tabel data. kolom: [{ l, k?, nilai?, jenis?, lebar?, total? }]
 *   jenis: 'teks' | 'angka' | 'uang' | 'hk' | 'tanggal'  (menentukan perataan)
 *   total: true → kolom ini dijumlahkan di baris Total
 */
export function tabel(kolom, data, { kosong = 'Belum ada data.', saatKlik = null, kunci = null } = {}) {
  if (!data.length) return el('p.kosong', { teks: kosong });

  const rataJenis = (j) => (j === 'angka' || j === 'uang' || j === 'hk' ? 'angka' : '');
  const rata = (k) => (typeof k === 'object' && k !== null
    ? (k.rata || rataJenis(k.jenis))
    : rataJenis(k));
  const tampil = (k, r) => {
    const v = k.nilai ? k.nilai(r) : r[k.k];
    if (v instanceof Node) return v;
    switch (k.jenis) {
      case 'uang': return rupiah(v);
      case 'angka': return angka(v, k.pecahan ?? 0);
      case 'hk': return hk(v);
      case 'tanggal': return tanggal(v);
      default: return v == null || v === '' ? '–' : String(v);
    }
  };

  const kepala = el('tr', {}, kolom.map((k) => el(`th.${rata(k)}`, { teks: k.l,
    style: k.lebar ? `width:${k.lebar}` : null })));

  const isi = data.map((r) => {
    const tr = el('tr', kunci ? { dataset: { kunci: kunci(r) } } : {},
      kolom.map((k) => el(`td.${rata(k)}`, {}, [tampil(k, r)])));
    if (saatKlik) {
      tr.classList.add('bisa-klik');
      tr.tabIndex = 0;
      tr.addEventListener('click', () => saatKlik(r));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') saatKlik(r); });
    }
    return tr;
  });

  const adaTotal = kolom.some((k) => k.total);
  const kaki = adaTotal ? el('tr.baris-total', {}, kolom.map((k, i) => {
    if (!k.total) return el(`td.${rata(k)}`, { teks: i === 0 ? 'Total' : '' });
    // `nilaiTotal` dipakai kalau sel menampilkan teks (mis. "L 20.000 menunggu")
    // tapi barisan TOTAL-nya tetap harus menjumlah angka.
    const ambilAngka = (r) => (k.nilaiTotal
      ? k.nilaiTotal(r)
      : (k.nilai ? k.nilai(r) : r[k.k]));
    const jml = data.reduce((n, r) => n + (Number(ambilAngka(r)) || 0), 0);
    const jt = k.jenisTotal || k.jenis;   // sel bisa teks, totalnya tetap uang
    return el(`td.${rata(k)}`, {
      teks: jt === 'uang' ? rupiah(jml) : jt === 'hk' ? hk(jml) : angka(jml, k.pecahan ?? 0),
    });
  })) : null;

  return el('div.tabel-bungkus', {}, [
    el('table.tabel', {}, [
      el('thead', {}, [kepala]),
      el('tbody', {}, isi),
      kaki ? el('tfoot', {}, [kaki]) : null,
    ]),
  ]);
}

// --------------------------------------------------------------- form
/** Satu baris isian berlabel. */
export function isian(label, kendali, { bantuan = null, lebar = null } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2, 9);
  kendali.id = id;
  return el(`div.isian${lebar ? '.isian-' + lebar : ''}`, {}, [
    el('label', { for: id, teks: label }),
    kendali,
    kendali._datalist || null,   // daftar saran (kalau kendali punya)
    kendali._pilihanSaran || null, // tombol input lama yang bisa langsung dipilih
    kendali._catatanEjaan || null,   // catatan "ejaan disamakan"

    bantuan ? el('small.bantuan', { teks: bantuan }) : null,
  ]);
}

export function pilihan(opsi, nilai, { kosongLabel = '— pilih —', saatUbah = null } = {}) {
  const s = el('select', saatUbah ? { onchange: saatUbah } : {});
  // kosongLabel null/'' berarti pilihan ini WAJIB — tidak ada baris kosong.
  // Dulu baris kosongnya tetap dibuat dan tertulis "null", jadi pemanggilnya
  // harus membuangnya sendiri sesudahnya.
  if (kosongLabel) s.append(el('option', { value: '', teks: kosongLabel }));
  for (const o of opsi) {
    const op = el('option', { value: o.nilai, teks: o.label });
    if (String(o.nilai) === String(nilai)) op.selected = true;
    s.append(op);
  }
  return s;
}

/** Tambahkan tombol pilihan cepat di bawah select / pilihanCari.
 *  Dipakai untuk entri yang berulang agar pengguna tidak perlu membuka dan
 *  mencari daftar panjang setiap kali. */
export function pasangPilihanCepat(kendali, daftar, {
  judul = 'Terakhir & sering dipakai', saatPilih = null,
} = {}) {
  if (!daftar?.length) return kendali;
  const tombol = daftar.map((item) => el('button.pilihan-cepat-tombol', {
    type: 'button',
    title: item.keterangan || item.label,
    onclick: () => {
      if (saatPilih) saatPilih(item.nilai, item);
      else if (typeof kendali.setNilai === 'function') kendali.setNilai(item.nilai);
      else {
        kendali.value = String(item.nilai ?? '');
        kendali.dispatchEvent(new Event('change', { bubbles: true }));
      }
      for (const b of tombol) b.classList.toggle('aktif', b === tombol.find((x) => x.dataset.nilai === String(item.nilai)));
    },
  }, [
    el('strong', { teks: item.label }),
    item.keterangan ? el('small', { teks: item.keterangan }) : null,
  ]));
  tombol.forEach((b, i) => { b.dataset.nilai = String(daftar[i].nilai); });
  kendali._pilihanSaran = el('div.pilihan-cepat', {}, [
    el('span.pilihan-cepat-label', { teks: judul }),
    el('div.pilihan-cepat-daftar', {}, tombol),
  ]);
  return kendali;
}

/** Kotak isian dengan daftar saran (datalist) — untuk memilih dari ribuan baris. */
export function pilihanCari(opsi, nilai, { tempat = 'Ketik untuk mencari…', saatUbah = null } = {}) {
  const idList = 'l' + Math.random().toString(36).slice(2, 9);
  const dl = el('datalist', { id: idList }, opsi.map((o) => el('option', { value: o.label })));
  const inp = el('input', {
    type: 'text', list: idList, placeholder: tempat, autocomplete: 'off',
    nilai: nilai ? (opsi.find((o) => String(o.nilai) === String(nilai))?.label || '') : '',
  });
  inp.dataset.nilai = nilai ?? '';
  inp.addEventListener('input', () => {
    const cocok = opsi.find((o) => o.label === inp.value);
    inp.dataset.nilai = cocok ? cocok.nilai : '';
    inp.classList.toggle('salah', inp.value !== '' && !cocok);
    if (saatUbah) saatUbah();
  });
  const bungkus = el('div.pilih-cari', {}, [inp, dl]);
  bungkus.nilaiTerpilih = () => (inp.dataset.nilai === '' ? null : Number(inp.dataset.nilai));
  bungkus.fokus = () => inp.focus();
  bungkus.setNilai = (v) => {
    inp.value = v ? (opsi.find((o) => String(o.nilai) === String(v))?.label || '') : '';
    inp.dataset.nilai = v ?? '';
  };
  return bungkus;
}

/** Tampilkan daftar kesalahan validasi di atas form. */
export function kesalahan(daftar) {
  if (!daftar.length) return null;
  return el('div.kesalahan', { role: 'alert' }, [
    el('strong', { teks: daftar.length === 1 ? 'Belum bisa disimpan:' : `${daftar.length} hal perlu diperbaiki:` }),
    el('ul', {}, daftar.map((t) => el('li', { teks: t }))),
  ]);
}

// ---------------------------------------------------- paruh periode gajian
// Gajian jatuh dua kali sebulan: tanggal 1–15 dan 16–akhir bulan. Pemilih
// bulan di kepala halaman tetap menentukan BULANNYA; pemilih ini mempersempit
// ke salah satu paruh. Pilihannya diingat selama sesi supaya tidak perlu
// diklik ulang tiap pindah halaman.
export const PARUH = [
  { k: 'bulan', l: 'Sebulan penuh' },
  { k: 'awal', l: 'Tgl 1–15' },
  { k: 'akhir', l: 'Tgl 16–akhir' },
];
const KUNCI_PARUH = 'app.paruh';
export const paruhPeriode = () => {
  const v = sessionStorage.getItem(KUNCI_PARUH);
  return PARUH.some((x) => x.k === v) ? v : 'bulan';
};
export const setParuhPeriode = (v) => sessionStorage.setItem(KUNCI_PARUH, v);

/** Rentang tanggal [dari, sampai] untuk paruh yang dipilih. */
export function rentangParuh(periode, paruh = paruhPeriode()) {
  const [awal, akhir] = periode.rentang();
  if (paruh === 'awal') return [awal, `${awal.slice(0, 8)}15`];
  if (paruh === 'akhir') return [`${awal.slice(0, 8)}16`, akhir];
  return [awal, akhir];
}

/** Judul periode yang sedang tampil, mis. "1–15 Oktober 2026". */
export function judulParuh(periode, paruh = paruhPeriode()) {
  if (paruh === 'bulan') return periode.judul();
  const [d, s] = rentangParuh(periode, paruh);
  return `${Number(d.slice(8))}–${Number(s.slice(8))} ${periode.judul()}`;
}

/** Salinan `periode` yang rentang & judulnya mengikuti paruh terpilih. */
export const periodeParuh = (periode, paruh = paruhPeriode()) => ({
  ...periode,
  rentang: () => rentangParuh(periode, paruh),
  judul: () => judulParuh(periode, paruh),
});

/** Tombol pemilih paruh. `saatUbah(paruhBaru)` dipanggil setiap ganti. */
export function pilihParuh(saatUbah) {
  const aktif = paruhPeriode();
  return el('div.lembar', { style: 'padding:.55rem .9rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center' }, [
    el('span.samar', { style: 'font-size:.85rem;margin-right:.2rem', teks: 'Periode gajian:' }),
    ...PARUH.map((x) => el(`button.tombol-kecil${x.k === aktif ? '' : '.tombol-samar'}`, {
      type: 'button',
      teks: x.l,
      'aria-pressed': x.k === aktif ? 'true' : 'false',
      onclick: () => { if (x.k !== paruhPeriode()) { setParuhPeriode(x.k); saatUbah(x.k); } },
    })),
  ]);
}
