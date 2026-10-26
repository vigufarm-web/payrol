// app.js — kerangka satu situs untuk dua bagian:
//   • Payroll HK                 (pekerja, HK, borongan, lembur, premi)
//   • Alat Berat & Kendaraan     (Divisi Infrastruktur: unit, HM/KM, solar, servis)
//
// Keduanya berbagi repo, login, dan token yang sama; yang berbeda hanya file
// datanya dan menunya. Bagian mana yang aktif ditentukan oleh isi file data
// (kolom `aplikasi`), bukan oleh tebakan.

import * as D from './data.js';
import * as gh from './github.js';
import { el, kosongkan, taruh, pesan, tanya, panel, isian, waktu, angka, namaBulan } from './ui.js';

import * as skemaPayroll from './skema-payroll.js';
import * as skemaAlat from './skema-alat.js';
import { halamanMaster } from './master.js';
import { halamanHK, halamanBorongan, halamanLemburPremi, halamanTerhapus } from './transaksi.js';
import { halamanRingkasan, halamanPayroll, halamanRekap } from './laporan.js';
import {
  halamanLogHarian, halamanSolar, halamanServis,
  halamanTarifPremi, halamanPersetujuanAlat, halamanMonitorAlat, jumlahMenungguAlat,
} from './input-alat.js';
import {
  halamanRingkasanUnit, halamanPayrollOperator, halamanBiayaLokasi, halamanLaporanHarian,
} from './laporan-alat.js';
import { halamanSistem, halamanRiwayat } from './sistem.js';
import { halamanImpor } from './impor.js';
import { halamanLaporanKebun, halamanPengaturanKebun, halamanPersetujuan, jumlahMenunggu } from './kebun.js';
import { halamanMonitorSemua } from './monitor-semua.js';
import { halamanPemeriksaan } from './pemeriksaan-v2.js';
import * as P from './pengguna.js';
import { halamanPengguna } from './pengguna.js';

P.pasangPenjaga();

const akar = document.getElementById('akar');

export const periode = {
  bulan: Number(sessionStorage.getItem('app.bulan')) || new Date().getMonth() + 1,
  tahun: Number(sessionStorage.getItem('app.tahun')) || new Date().getFullYear(),
  set(b, t) {
    this.bulan = b; this.tahun = t;
    sessionStorage.setItem('app.bulan', b);
    sessionStorage.setItem('app.tahun', t);
  },
  rentang() {
    const p = (n) => String(n).padStart(2, '0');
    const akhir = new Date(this.tahun, this.bulan, 0).getDate();
    return [`${this.tahun}-${p(this.bulan)}-01`, `${this.tahun}-${p(this.bulan)}-${p(akhir)}`];
  },
  judul() { return `${namaBulan(this.bulan)} ${this.tahun}`; },
};

// Boleh mengubah data kalau ada token, ATAU kalau halaman ini dibuka tanpa repo
// (ujicoba di komputer sendiri — hasil simpanannya diunduh sebagai berkas).
export const bisaEdit = () => !!gh.ambilToken() || D.modeLokal();

// ---------------------------------------------------------------------
// Simpan otomatis: beberapa detik setelah perubahan terakhir, data dikirim
// sendiri ke GitHub — admin tidak harus ingat menekan tombol Simpan.
// Bisa dimatikan di Pengaturan. Saat ujicoba lokal tetap manual (karena
// "menyimpan" di sana berarti mengunduh berkas).
// ---------------------------------------------------------------------
const KUNCI_AUTOSIMPAN = 'app.autosimpan';
export const autoSimpanAktif = () => localStorage.getItem(KUNCI_AUTOSIMPAN) !== '0';
export const setAutoSimpan = (aktif) => localStorage.setItem(KUNCI_AUTOSIMPAN, aktif ? '1' : '0');
let timerAutoSimpan = null;
let sedangAutoSimpan = false;
D.saatBerubah(() => {
  if (!autoSimpanAktif() || D.modeLokal() || !bisaEdit()) return;
  clearTimeout(timerAutoSimpan);
  timerAutoSimpan = setTimeout(async () => {
    if (sedangAutoSimpan || !D.state.belumDisimpan) return;
    sedangAutoSimpan = true;
    try { await simpanSekarang('Web: simpan otomatis'); }
    finally { sedangAutoSimpan = false; }
  }, 8000);
});

// =====================================================================
// Dua bagian aplikasi
// =====================================================================
const MODUL = {
  PayrollHK: {
    nama: 'Payroll HK',
    keterangan: 'Pekerja kebun',
    bawaanPath: 'data/payroll.json',
    kamus: { TABEL: skemaPayroll.TABEL, REF: skemaPayroll.REF },
    urutMaster: skemaPayroll.URUT_MASTER,
    kelompok: [
      { judul: 'Laporan', item: ['ringkasan', 'kebun', 'payroll', 'rekap'] },
      { judul: 'Input data', item: ['hk', 'borongan', 'lembur', 'impor'] },
      { judul: 'Kepala kebun', item: ['persetujuan', 'target'] },
    ],
    sistem: ['terhapus', 'kualitas', 'riwayat', 'pengguna', 'sistem'],
    halaman: {
      semua: { l: 'Pantauan', sub: 'Satu layar untuk seluruh divisi dan alat berat & kendaraan', buat: halamanMonitorSemua, periode: true },
      ringkasan: { l: 'Ringkasan', sub: 'Angka utama periode berjalan', buat: halamanRingkasan, periode: true },
      payroll: { l: 'Payroll', sub: 'Upah per pekerja untuk satu periode', buat: halamanPayroll, periode: true },
      rekap: { l: 'Rekap', sub: 'Biaya per divisi, blok, dan kegiatan', buat: halamanRekap, periode: true },
      kebun: { l: 'Laporan Kebun', sub: 'Biaya operasional satu kebun terhadap targetnya', buat: halamanLaporanKebun, periode: true },
      persetujuan: { l: 'Persetujuan', sub: 'Lembur & premi menunggu keputusan kepala kebun', buat: halamanPersetujuan },
      target: { l: 'Pengaturan Kebun', sub: 'Kepala kebun, PIN, dan target biaya', buat: halamanPengaturanKebun, periode: true },
      hk: { l: 'HK harian', sub: 'Catat hari kerja pekerja per blok', buat: halamanHK, periode: true },
      borongan: { l: 'Borongan', sub: 'Upah berdasarkan hasil kerja', buat: halamanBorongan, periode: true },
      lembur: { l: 'Lembur & premi', sub: 'Tambahan di luar HK harian', buat: halamanLemburPremi, periode: true },
      impor: { l: 'Impor Excel', sub: 'Isi di Excel pakai template, lalu upload di sini', buat: halamanImpor },
      terhapus: { l: 'Data terhapus', sub: 'Transaksi yang dihapus, bisa dipulihkan', buat: halamanTerhapus },
      kualitas: { l: 'Pemeriksaan data', sub: 'Temukan typo, data ganda, dan hitungan tidak wajar', buat: halamanPemeriksaan },
      riwayat: { l: 'Riwayat perubahan', sub: 'Setiap penyimpanan tercatat di sini', buat: halamanRiwayat },
      pengguna: { l: 'Pengguna', sub: 'Siapa boleh input & revisi divisi mana', buat: halamanPengguna },
      sistem: { l: 'Pengaturan', sub: 'Mode edit, token, dan status data', buat: halamanSistem },
    },
  },
  AlatBerat: {
    nama: 'Alat Berat & Kendaraan',
    keterangan: 'Divisi Infrastruktur',
    bawaanPath: 'data/alat-berat.json',
    kamus: { TABEL: skemaAlat.TABEL, REF: skemaAlat.REF },
    urutMaster: skemaAlat.URUT_MASTER,
    kelompok: [
      { judul: 'Laporan', item: ['unit', 'operator', 'lokasi', 'harian'] },
      { judul: 'Input operasional', item: ['log', 'solar', 'servis', 'impor'] },
      { judul: 'Kepala divisi', item: ['monitor', 'persetujuan'] },
    ],
    sistem: ['kualitas', 'riwayat', 'tarifpremi', 'pengguna', 'sistem'],
    halaman: {
      semua: { l: 'Pantauan', sub: 'Satu layar untuk seluruh divisi dan alat berat & kendaraan', buat: halamanMonitorSemua, periode: true },
      unit: { l: 'Ringkasan unit', sub: 'Jam kerja, solar, dan efisiensi tiap unit', buat: halamanRingkasanUnit, periode: true },
      operator: { l: 'Payroll operator', sub: 'Upah operator untuk satu periode', buat: halamanPayrollOperator, periode: true },
      lokasi: { l: 'Biaya per lokasi', sub: 'Tenaga kerja, solar, dan servis per lokasi', buat: halamanBiayaLokasi, periode: true },
      harian: { l: 'Laporan harian', sub: 'Teks siap tempel ke WhatsApp', buat: halamanLaporanHarian, periode: true },
      log: { l: 'Log harian', sub: 'HM/KM, ritase, dan HK operator', buat: halamanLogHarian, periode: true },
      solar: { l: 'Isi solar', sub: 'Pengisian BBM per unit', buat: halamanSolar, periode: true },
      servis: { l: 'Servis unit', sub: 'Perawatan dan perbaikan', buat: halamanServis, periode: true },
      impor: { l: 'Impor Excel', sub: 'Isi di Excel pakai template, lalu upload di sini', buat: halamanImpor },
      // Dinamai "Laporan ALB & Kendaraan" supaya sejajar dengan "Laporan
      // Kebun" di bagian payroll — isinya memang padanannya: biaya periode
      // ini dibandingkan targetnya.
      monitor: { l: 'Laporan ALB & Kendaraan', sub: 'Upah, premi, solar, dan servis terhadap target', buat: halamanMonitorAlat, periode: true },
      persetujuan: { l: 'Persetujuan', sub: 'Upah jam/lembur dan premi Infra menunggu acc', buat: halamanPersetujuanAlat },
      tarifpremi: { l: 'Tarif premi unit', sub: 'Rp per HM dan per KM tiap unit', buat: halamanTarifPremi },
      kualitas: { l: 'Pemeriksaan data', sub: 'Temukan data ganda, referensi rusak, dan meter tidak wajar', buat: halamanPemeriksaan },
      riwayat: { l: 'Riwayat perubahan', sub: 'Setiap penyimpanan tercatat di sini', buat: halamanRiwayat },
      pengguna: { l: 'Pengguna', sub: 'Siapa boleh input & revisi divisi mana', buat: halamanPengguna },
      sistem: { l: 'Pengaturan', sub: 'Mode edit, token, dan status data', buat: halamanSistem },
    },
  },
};

const modulAktif = () => MODUL[D.state.aplikasi] || MODUL.PayrollHK;

function rute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [nama, arg] = h.split('/');
  return { nama, arg };
}

const halamanPertama = (m) => {
  // kepala divisi murni mendarat langsung di monitor / laporan kebun
  if (P.hanyaKepala()) {
    for (const k of ['monitor', 'kebun', 'persetujuan']) {
      if (m.halaman[k] && P.bolehHalaman(k)) return k;
    }
  }
  const semua = [...m.kelompok.flatMap((g) => g.item), ...m.sistem];
  return semua.find((k) => P.bolehHalaman(k)) || 'sistem';
};

// =====================================================================
// Layar kunci
// =====================================================================
async function layarKunci() {
  const kotak = el('div.kunci-kotak');
  kosongkan(akar).append(el('div.kunci', {}, [kotak]));

  const daftar = D.state.daftar?.dataset || {};
  const pilihanPath = Object.keys(daftar);
  const sandi = el('input', { type: 'password', autocomplete: 'current-password', required: true });
  const tempatGalat = el('div');
  const tempatMeta = el('div.kunci-meta', {}, [el('p', { teks: 'Mengambil keterangan data…' })]);

  // Pemilih bagian hanya muncul kalau memang ada lebih dari satu dataset
  let pilihBagian = null;
  if (pilihanPath.length > 1) {
    pilihBagian = el('select', {
      onchange: (e) => { D.setPath(e.target.value); muatKeterangan(); },
    }, pilihanPath.map((p) => {
      const o = el('option', { value: p, teks: daftar[p].label || p });
      if (p === D.state.path) o.selected = true;
      return o;
    }));
    if (!pilihanPath.includes(D.state.path)) D.setPath(pilihanPath[0]);
  }

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      kosongkan(tempatGalat);
      const tombol = form.querySelector('button[type=submit]');
      tombol.disabled = true;
      tombol.textContent = 'Membuka…';
      let terbuka = false;
      try {
        await D.muat(sandi.value);
        terbuka = true;
      } catch (err) {
        tempatGalat.append(el('div.kesalahan', { role: 'alert' }, [err.message]));
        tombol.disabled = false;
        tombol.textContent = 'Buka data';
        sandi.select();
      }
      if (terbuka) {
        sessionStorage.setItem('app.sandi', sandi.value);
        await bangunKerangka();
      }
    },
  }, [
    pilihBagian ? (() => {
      // bagian tidak perlu dipilih manual: admin masuk pakai nama, lalu
      // otomatis diantar ke bagiannya. Tautan kecil ini untuk keperluan khusus.
      const bungkus = el('div', { style: 'display:none' }, [isian('Bagian', pilihBagian)]);
      const tautan = el('button.tombol-teks', {
        type: 'button', teks: 'Buka bagian lain…',
        style: 'margin-bottom:.7rem;font-size:.82rem',
        onclick: () => { bungkus.style.display = ''; tautan.remove(); },
      });
      return el('div', {}, [tautan, bungkus]);
    })() : null,
    isian('Password data', sandi, { bantuan: 'Password yang diisi di aplikasi desktop, menu Sinkron GitHub.' }),
    el('button.tombol-utama', { type: 'submit', teks: 'Buka data' }),
  ]);

  const logo = el('div.kunci-logo');
  logo.innerHTML = `
    <svg width="52" height="52" viewBox="0 0 52 52" role="img" aria-label="Lambang kebun">
      <circle cx="26" cy="26" r="25" fill="#eaf2ec" stroke="#bcd6c3"/>
      <path d="M26 40 V22" stroke="#2f6b3f" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M26 28 C 26 20, 19 17, 13 17 C 13 25, 19 28, 26 28 Z" fill="#2f6b3f"/>
      <path d="M26 24 C 26 16, 33 13, 39 13 C 39 21, 33 24, 26 24 Z" fill="#4b9b61"/>
      <path d="M14 40 H38 M17 44 H35" stroke="#bcd6c3" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  taruh(kotak,
    logo,
    el('h1', { teks: 'Data Kebun' }),
    el('p.kunci-merek', { teks: 'PT VIGU FARM INDONESIA' }),
    tempatGalat,
    form,
    tempatMeta,
  );
  sandi.focus();

  async function muatKeterangan() {
    kosongkan(tempatMeta).append(el('p', { teks: 'Mengambil keterangan data…' }));
    try {
      const meta = await D.intipMeta();
      kosongkan(tempatMeta);
      if (!meta) {
        tempatMeta.append(el('p', {
          teks: 'Belum ada data di repo ini. Kirim data dulu dari aplikasi desktop lewat menu Sinkron GitHub.',
        }));
        return;
      }
      const j = meta.jumlah || {};
      const isi = meta.aplikasi === 'AlatBerat'
        ? `${angka(j.unit)} unit · ${angka(j.log_kerja)} log harian`
        : `${angka(j.karyawan)} pekerja · ${angka(j.hk)} baris HK`;
      tempatMeta.append(el('dl', {}, [
        el('dt', { teks: 'Bagian' }), el('dd', { teks: meta.label || '–' }),
        el('dt', { teks: 'Diperbarui' }), el('dd', { teks: waktu(meta.diperbarui) }),
        el('dt', { teks: 'Oleh' }), el('dd', { teks: meta.dari || '–' }),
        el('dt', { teks: 'Isi' }), el('dd', { teks: isi }),
      ]));
    } catch (e) {
      kosongkan(tempatMeta).append(el('p', { teks: e.message }));
    }
  }
  if (!gh.lokasiRepo()) {
    kosongkan(tempatMeta).append(el('p', {
      teks: 'Halaman ini dibuka di luar GitHub Pages, jadi alamat repo belum diketahui. '
        + 'Data dibaca dari folder data/ di sebelah halaman ini.',
    }));
    D.intipMeta().then(() => muatKeterangan()).catch(() => {});
  } else {
    muatKeterangan();
  }
}

// =====================================================================
// Kerangka
// =====================================================================
let elIsi, elKepala, elSisi;

/**
 * Kalau bulan yang sedang dilihat berada di luar rentang data (mis. baru buka
 * bagian yang datanya bulan lalu), lompat ke bulan terakhir yang ada datanya —
 * supaya tidak disambut halaman kosong tanpa penjelasan. Hanya dilakukan bila
 * pengguna belum memilih bulan sendiri di sesi ini.
 */
function sesuaikanPeriode() {
  if (sessionStorage.getItem('app.bulan')) return;
  const p = D.state.meta?.periode;
  if (!p?.sampai) return;
  const [thSampai, blSampai] = p.sampai.split('-').map(Number);
  const [thDari, blDari] = (p.dari || p.sampai).split('-').map(Number);
  const kini = periode.tahun * 12 + periode.bulan;
  if (kini > thSampai * 12 + blSampai || kini < thDari * 12 + blDari) {
    periode.bulan = blSampai;
    periode.tahun = thSampai;   // sengaja tidak disimpan: ini tebakan, bukan pilihan pengguna
  }
}

async function bangunKerangka() {
  sesuaikanPeriode();
  // ada input yang belum sempat terkirim (mis. listrik padam)? tawarkan pulih
  const draf = await D.drafTersimpan();
  if (draf) {
    const pulih = await tanya('Ada input yang belum tersimpan', el('div', {}, [
      el('p', { teks: `Perubahan terakhir ${waktu(draf.waktu)} belum sempat terkirim ke GitHub `
        + '(mis. listrik padam atau tab tertutup). Pulihkan dan lanjutkan dari situ?' }),
      el('p.bantuan', { teks: 'Kalau dibuang, data kembali persis seperti simpanan terakhir di GitHub.' }),
    ]), { ya: 'Pulihkan', tidak: 'Buang' });
    if (pulih) D.pakaiDraf(draf);
    else D.hapusDraf();
  }
  // daftar pengguna terpusat di bagian induk — baca dulu
  await P.muatPusat();
  pasangAutoMuat();   // layar ikut tersegar sendiri saat admin lain menyimpan
  // kalau daftar pengguna sudah diisi, tanyakan dulu siapa yang mengisi
  if (P.adaPengguna() && !P.siapa()) await P.pilihPengguna({ wajib: true });
  // orang ini tidak diberi akses ke bagian yang sedang terbuka?
  // antar ke bagian pertama yang dia boleh
  if (P.adaPengguna() && P.siapa() && !P.bolehBagian(D.state.path)) {
    const tujuan = P.bagianBoleh()[0];
    if (tujuan) {
      D.setPath(tujuan);
      location.hash = '';
      location.reload();
      return;
    }
  }
  elSisi = el('nav.sisi', { 'aria-label': 'Menu utama' });
  elKepala = el('header.kepala');
  elIsi = el('div.isi', { id: 'isi' });
  kosongkan(akar).append(el('div.kerangka', {}, [
    elSisi,
    el('main.utama', {}, [elKepala, elIsi]),
  ]));
  window.addEventListener('hashchange', gambar);
  window.addEventListener('beforeunload', (e) => {
    if (D.state.belumDisimpan) { e.preventDefault(); e.returnValue = ''; }
  });
  gambar();
}

function bangunMenu() {
  const m = modulAktif();
  kosongkan(elSisi);
  D.pakaiSkema(m.kamus.TABEL);

  const daftar = D.state.daftar?.dataset || {};
  const lain = Object.entries(daftar)
    .filter(([p]) => p !== D.state.path && P.bolehBagian(p));

  const tautan = (kunci, label) => {
    const a = el('a', { href: `#/${kunci}`, teks: label });
    if (kunci === 'persetujuan') {
      // angkanya harus ikut hak divisi, sama seperti isi halamannya
      const n = D.state.aplikasi === 'AlatBerat'
        ? jumlahMenungguAlat() : jumlahMenunggu(P.divisiBoleh());
      if (n) a.append(el('span.lencana', { teks: String(n) }));
    }
    return a;
  };

  const kelompok = [];
  for (const g of m.kelompok) {
    const item = g.item.filter((k) => P.bolehHalaman(k));
    if (!item.length) continue;
    kelompok.push(el('div.sisi-kelompok', { teks: g.judul }));
    for (const k of item) kelompok.push(tautan(k, m.halaman[k].l));
  }
  if (P.bolehMaster()) {
    const tabelBoleh = m.urutMaster.filter((t) => P.bolehMasterTabel(t));
    if (tabelBoleh.length) {
      kelompok.push(el('div.sisi-kelompok', { teks: 'Master data' }));
      for (const t of tabelBoleh) {
        kelompok.push(el('a', { href: `#/master/${t}`, teks: m.kamus.TABEL[t].judul }));
      }
    }
  }
  const sistem = m.sistem.filter((k) => P.bolehHalaman(k));
  if (sistem.length) {
    kelompok.push(el('div.sisi-kelompok', { teks: 'Sistem' }));
    for (const k of sistem) kelompok.push(tautan(k, m.halaman[k].l));
  }

  taruh(elSisi,
    el('div.sisi-merek', {}, [
      el('strong', { teks: D.state.daftar?.dataset?.[D.state.path]?.label || m.nama }),
      el('span', { teks: m.keterangan }),
    ]),
    // Satu pintu pantauan — khusus admin penuh. Detail tetap tersedia di
    // laporan tiap bagian, tetapi tidak lagi disebut sebagai monitor lain.
    P.bolehMonitorSemua()
      ? el('div', { style: 'padding:.6rem 1.1rem .2rem' }, [
        el('button.tombol-kecil', {
          type: 'button', style: 'width:100%',
          teks: 'Pantauan',
          'aria-current': rute().nama === 'semua' ? 'page' : null,
          onclick: () => { location.hash = '#/semua'; },
        }),
      ])
      : null,
    // Pindah bagian — hanya tampil kalau memang ada bagian lain di repo ini
    lain.length
      ? el('div', { style: 'padding:.6rem 1.1rem .2rem' }, lain.map(([p, d]) => el('button.tombol-kecil', {
        type: 'button', style: 'width:100%', teks: `Pindah ke ${d.label || p}`,
        onclick: async () => {
          if (D.state.belumDisimpan && !await tanya('Pindah bagian?',
            'Perubahan yang belum disimpan akan hilang.', { ya: 'Pindah', bahaya: true })) return;
          D.setPath(p);
          location.hash = '';
          location.reload();
        },
      })))
      : null,
    el('div.sisi-menu', {}, kelompok),
    el('div.sisi-kaki', {}, [
      el('div', {
        teks: D.modeLokal() ? 'Ujicoba di komputer'
          : bisaEdit() ? `Mode edit — ${D.namaPengisi() || 'tanpa nama'}` : 'Mode lihat',
      }),
      P.adaPengguna() ? el('button.tombol-samar.tombol-kecil', {
        type: 'button',
        teks: P.siapa() ? `${P.namaSiapa()} — ganti` : 'Belum masuk — pilih nama',
        onclick: async () => {
          // wajib: tidak ada lagi mode "lihat saja", jadi tombol Batal yang
          // meninggalkan layar tanpa siapa-siapa cuma membingungkan
          P.keluar();
          await P.pilihPengguna({ wajib: true });
          gambar();
        },
      }) : null,
      // tiap orang mengurus PIN-nya sendiri, tidak perlu lewat admin
      P.adaPengguna() && P.siapa() ? el('button.tombol-samar.tombol-kecil', {
        type: 'button', teks: 'Ganti PIN saya',
        onclick: async () => { if (await P.gantiPinSendiri()) gambar(); },
      }) : null,
      el('button.tombol-samar.tombol-kecil', {
        type: 'button', teks: 'Keluar',
        onclick: async () => {
          if (D.state.belumDisimpan && !await tanya('Keluar tanpa menyimpan?',
            'Ada perubahan yang belum disimpan ke GitHub. Perubahan itu akan hilang.',
            { ya: 'Keluar', bahaya: true })) return;
          sessionStorage.removeItem('app.sandi');
          location.reload();
        },
      }),
    ]),
  );
}

function tandaiMenuAktif() {
  const { nama, arg } = rute();
  const target = arg ? `#/${nama}/${arg}` : `#/${nama || halamanPertama(modulAktif())}`;
  for (const a of elSisi.querySelectorAll('a')) {
    if (a.getAttribute('href') === target) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function gambarKepala(judul, sub, pakaiPeriode) {
  kosongkan(elKepala);
  const tombolMenu = el('button.hamburger.tombol-samar', {
    type: 'button', 'aria-label': 'Buka menu', teks: '☰',
    onclick: () => elSisi.classList.toggle('buka'),
  });
  const aksi = el('div.kepala-aksi');

  if (pakaiPeriode) {
    const pilihBulan = el('select', {
      'aria-label': 'Bulan',
      onchange: (e) => { periode.set(Number(e.target.value), periode.tahun); gambar(); },
    }, Array.from({ length: 12 }, (_, i) => {
      const o = el('option', { value: i + 1, teks: namaBulan(i + 1) });
      if (i + 1 === periode.bulan) o.selected = true;
      return o;
    }));
    const pilihTahun = el('input', {
      type: 'number', min: 2000, max: 2100, nilai: periode.tahun, 'aria-label': 'Tahun',
      style: 'width:5.5rem',
      onchange: (e) => { periode.set(periode.bulan, Number(e.target.value)); gambar(); },
    });
    aksi.append(el('div.periode', {}, [
      el('button.tombol-kecil', {
        type: 'button', 'aria-label': 'Bulan sebelumnya', teks: '‹',
        onclick: () => {
          const b = periode.bulan === 1 ? 12 : periode.bulan - 1;
          periode.set(b, b === 12 ? periode.tahun - 1 : periode.tahun);
          gambar();
        },
      }),
      pilihBulan, pilihTahun,
      el('button.tombol-kecil', {
        type: 'button', 'aria-label': 'Bulan berikutnya', teks: '›',
        onclick: () => {
          const b = periode.bulan === 12 ? 1 : periode.bulan + 1;
          periode.set(b, b === 1 ? periode.tahun + 1 : periode.tahun);
          gambar();
        },
      }),
    ]));
  }

  if (D.state.belumDisimpan) {
    aksi.append(el('button.tombol-utama', {
      type: 'button', teks: 'Simpan ke GitHub', onclick: () => simpanSekarang(),
    }));
  }
  aksi.append(el('button.tombol-samar.tombol-kecil', {
    type: 'button', teks: 'Muat ulang', onclick: () => muatUlangData(),
  }));
  aksi.append(el('span.status-sinkron', {}, [
    el('span.titik' + (D.state.belumDisimpan ? '.perlu-simpan' : '')),
    D.state.belumDisimpan ? 'Belum disimpan' : `Tersimpan · rev ${D.state.data?.rev ?? '–'}`,
  ]));
  aksi.append(el('span.lencana-mode' + (bisaEdit() ? '.edit' : ''), {
    teks: D.modeLokal() ? 'Ujicoba di komputer' : bisaEdit() ? 'Bisa mengubah data' : 'Hanya melihat',
  }));

  elKepala.append(
    tombolMenu,
    el('div.kepala-judul', {}, [el('h1', { teks: judul }), sub ? el('p', { teks: sub }) : null]),
    aksi,
  );
}

function spandukLokal() {
  return el('div.petunjuk', { style: 'margin-bottom:1rem' }, [
    el('p', {
      teks: 'Ujicoba di komputer. Halaman ini belum terhubung ke repo GitHub, jadi data '
        + 'dibaca dari folder data/ di sebelahnya dan tombol Simpan akan MENGUNDUH berkas '
        + 'hasilnya, bukan mengirim ke GitHub.',
    }),
    el('p', {
      teks: 'Silakan coba semua menu dan formnya. Setelah repo diupload dan dibuka lewat '
        + 'alamat GitHub Pages, penyimpanan berjalan otomatis tanpa perlu unduh-unduh lagi.',
    }),
  ]);
}

function gambarTanpaAkses(judulHalaman) {
  // Belum masuk sama sekali bukan soal "hak akun" — isi situs memang tidak
  // ditampilkan sebelum ada yang masuk, jadi layarnya pun harus beda.
  if (!P.siapa()) {
    gambarKepala('Belum masuk', 'Masuk dulu untuk membuka isi situs', false);
    kosongkan(elIsi).append(el('div.lembar', {}, [
      el('div.lembar-isi', {}, [
        el('p', { teks: 'Ketik nama Anda yang sudah didaftarkan admin, beserta PIN-nya. '
          + 'Sebelum masuk, tidak ada data maupun laporan yang ditampilkan.' }),
        el('button.tombol-utama', {
          type: 'button', teks: 'Masuk sekarang',
          onclick: async () => { await P.pilihPengguna({ wajib: true }); gambar(); },
        }),
      ]),
    ]));
    tandaiMenuAktif();
    return;
  }
  gambarKepala(judulHalaman, 'Halaman ini tidak dibuka untuk akun Anda', false);
  kosongkan(elIsi).append(el('div.lembar', {}, [
    el('div.lembar-isi', {}, [
      el('p', { teks: `${P.namaSiapa()} tidak diberi hak membuka halaman ini. `
        + 'Hubungi admin kalau memang perlu.' }),
    ]),
  ]));
  tandaiMenuAktif();
}

const trashChecked=new WeakMap();
export function gambar() {
  if(D.state.data&&bisaEdit()&&(!P.adaPengguna()||P.adalahAdmin())){const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});if(trashChecked.get(D.state.data)!==day){trashChecked.set(D.state.data,day);const n=D.bersihkanSampah();if(n)pesan(n+' transaksi sampah lebih dari 30 hari dibersihkan. Klik Simpan untuk menyinkronkan ke GitHub.','sukses',10);}}
  const m = modulAktif();
  bangunMenu();
  elSisi.classList.remove('buka');
  const { nama, arg } = rute();
  // bisaEdit = ada token (atau ujicoba lokal). Di atasnya masih ada hak
  // pengguna: master data hanya admin, transaksi ikut hak input/revisi.
  const bisaUbahTransaksi = () => bisaEdit() && (P.bolehInput() || P.bolehRevisi());
  const konteks = {
    periode, gambar, bisaEdit: bisaUbahTransaksi, simpanSekarang, muatUlangData, kamus: m.kamus,
    hak: {
      setuju: P.bolehSetuju, divisi: P.divisiBoleh, master: P.bolehMaster, batal: P.bolehBatal,
      // admin penuh — dipakai alat yang menyentuh data semua divisi sekaligus
      admin: P.bolehMonitorSemua,
      // "Kelola blok & lahan" = admin blok untuk SELURUH kebun, bukan hanya
      // divisinya sendiri; master Blok karena itu tidak disaring divisi.
      kelolaBlok: () => P.bolehMasterTabel('blocks'),
    },
  };

  if (nama === 'master') {
    const t = m.kamus.TABEL[arg] ? arg : m.urutMaster[0];
    if (!P.bolehMasterTabel(t)) return gambarTanpaAkses('Master data');
    const def = m.kamus.TABEL[t];
    gambarKepala(def.judul, `Daftar ${def.tunggal}`, false);
    kosongkan(elIsi).append(halamanMaster(t, {
      ...konteks, bisaEdit: () => bisaEdit() && P.bolehMasterTabel(t),
    }));
    tandaiMenuAktif();
    return;
  }

  const kunci = m.halaman[nama] ? nama : halamanPertama(m);
  // menyembunyikan menunya saja tidak cukup — alamat #/… bisa diketik sendiri
  if (!P.bolehHalaman(kunci)) return gambarTanpaAkses(m.halaman[kunci]?.l || kunci);
  const h = m.halaman[kunci];
  gambarKepala(h.l, h.periode ? `${h.sub} — ${periode.judul()}` : h.sub, !!h.periode);
  kosongkan(elIsi);
  if (D.modeLokal()) elIsi.append(spandukLokal());
  // halaman bergembok PIN admin: hak ubahnya mengikuti gembok itu,
  // bukan hak input/revisi transaksi
  const FLAG_PIN = { pengguna: 'app.pengguna.buka', target: 'app.target.buka', tarifpremi: 'app.tarif.buka' };
  // Halaman Persetujuan: yang dipakai BUKAN hak input/revisi, melainkan hak
  // menyetujui/membatalkan. Kepala divisi memang tidak menginput apa pun —
  // kalau dipukul rata dengan hak input, dia tidak bisa meng-acc sama sekali.
  const konteksHal = FLAG_PIN[kunci]
    ? { ...konteks, bisaEdit: () => bisaEdit() && P.bolehKelolaTerkunci(FLAG_PIN[kunci]) }
    : kunci === 'persetujuan'
      ? { ...konteks, bisaEdit: () => bisaEdit() && (P.bolehSetuju() || P.bolehBatal()) }
      : konteks;
  elIsi.append(h.buat(konteksHal));
  tandaiMenuAktif();
  window.scrollTo(0, 0);
}

// =====================================================================
// Simpan & muat ulang
// =====================================================================
export async function simpanSekarang(pesanCommit = null) {
  if (!bisaEdit()) {
    pesan('Mode edit belum aktif. Buka Pengaturan untuk memasukkan token GitHub.', 'awas', 6);
    return false;
  }
  // Nama pengisi hanya perlu kalau perubahan benar-benar dikirim ke GitHub;
  // untuk ujicoba di komputer, jangan dipersulit.
  if (!D.modeLokal() && !D.namaPengisi() && !await mintaNama()) return false;

  const judul = pesanCommit
    || `Web: ubah data ${D.state.aplikasi === 'AlatBerat' ? 'alat berat' : 'payroll'}`;
  const sedang = pesan('Menyimpan ke GitHub…', 'info', 30);
  try {
    const rev = await D.simpan(judul);
    sedang.remove();
    if (D.state.gabungTerakhir) {
      pesan('Ada admin lain yang menyimpan duluan — perubahan kedua-duanya '
        + 'sudah digabung otomatis, tidak ada yang hilang.', 'info', 7);
    }
    if (D.modeLokal()) {
      const nama = D.state.path.split('/').pop();
      pesan(`Berkas ${nama} (rev ${rev}) terunduh. Timpa berkas lama di folder data/ `
        + 'lalu muat ulang halaman untuk melihat hasilnya.', 'sukses', 10);
    } else {
      pesan(`Tersimpan sebagai rev ${rev}.`, 'sukses');
    }
    gambar();
    return true;
  } catch (e) {
    sedang.remove();
    if (e.bentrok) {
      const muat = await tanya('Data sudah berubah di tempat lain', el('div', {}, [
        el('p', { teks: e.message }),
        el('p', { teks: 'Muat ulang data terbaru sekarang? Perubahan yang belum tersimpan akan hilang.' }),
      ]), { ya: 'Muat ulang', tidak: 'Nanti saja', bahaya: true });
      if (muat) await muatUlangData();
    } else {
      pesan(e.message, 'galat', 8);
    }
    return false;
  }
}

function mintaNama() {
  return new Promise((selesai) => {
    const inp = el('input', { type: 'text', placeholder: 'mis. Budi (kantor kebun)', required: true });
    const p = panel('Siapa yang mengisi?', el('div', {}, [
      el('p', { teks: 'Nama ini dicatat pada setiap penyimpanan, supaya jelas siapa yang mengubah data.' }),
      isian('Nama', inp),
    ]), [
      el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => { p.tutup(); selesai(''); } }),
      el('button.tombol-utama', {
        type: 'button', teks: 'Simpan nama',
        onclick: () => {
          if (!inp.value.trim()) { inp.focus(); return; }
          D.setNamaPengisi(inp.value);
          p.tutup();
          selesai(inp.value.trim());
        },
      }),
    ]);
  });
}

// ---------------------------------------------------------------------
// MUAT OTOMATIS — layar ikut terbarui sendiri kalau admin lain menyimpan,
// jadi tidak perlu menekan "Muat ulang" tiap kali. Hanya berjalan kalau
// tidak ada perubahan yang belum disimpan di layar ini (supaya input yang
// sedang dikerjakan tidak tertimpa) dan tab-nya sedang dilihat.
// ---------------------------------------------------------------------
const KUNCI_AUTOMUAT = 'app.automuat';
export const autoMuatAktif = () => localStorage.getItem(KUNCI_AUTOMUAT) !== '0';
export const setAutoMuat = (aktif) => {
  localStorage.setItem(KUNCI_AUTOMUAT, aktif ? '1' : '0');
  pasangAutoMuat();
};
let timerAutoMuat = null;
let sedangPeriksa = false;
async function periksaDataBaru() {
  if (sedangPeriksa || D.modeLokal() || !autoMuatAktif()) return;
  if (D.state.belumDisimpan || document.hidden) return;
  if (document.querySelector('.panel, .dialog')) return;   // jangan ganggu form terbuka
  sedangPeriksa = true;
  try {
    const { isi } = await gh.bacaFile('data/daftar.json');
    const revBaru = Number(isi?.dataset?.[D.state.path]?.rev) || 0;
    const revSaya = Number(D.state.data?.rev) || 0;
    if (revBaru > revSaya) {
      await D.muatUlang();
      await P.muatPusat();
      gambar();
      pesan(`Data diperbarui admin lain (rev ${D.state.data.rev}) — layar ini ikut disegarkan.`,
        'info', 6);
    }
  } catch { /* jaringan/batas permintaan: coba lagi di putaran berikutnya */ }
  finally { sedangPeriksa = false; }
}
export function pasangAutoMuat() {
  clearInterval(timerAutoMuat);
  if (!autoMuatAktif() || D.modeLokal()) return;
  timerAutoMuat = setInterval(periksaDataBaru, 45000);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) periksaDataBaru();   // balik ke tab -> langsung cek
});

export async function muatUlangData() {
  if (D.state.belumDisimpan) {
    const lanjut = await tanya('Buang perubahan yang belum disimpan?',
      'Data terbaru dari GitHub akan menggantikan perubahan yang belum Anda simpan.',
      { ya: 'Buang & muat ulang', bahaya: true });
    if (!lanjut) return;
  }
  const sedang = pesan('Mengambil data terbaru…', 'info', 30);
  try {
    await D.muatUlang();
    // daftar pengguna & token bersama ikut disegarkan — tanpa ini, menekan
    // "Muat ulang" di bagian Alat Berat menghapus token bersama dari memori
    // (berkas bagian itu memang tidak memuat tokennya) dan mode edit mati
    await P.muatPusat();
    sedang.remove();
    pesan(`Data terbaru dimuat (rev ${D.state.data.rev}).`, 'sukses');
    gambar();
  } catch (e) {
    sedang.remove();
    pesan(e.message, 'galat', 8);
  }
}

// =====================================================================
// Mulai
// =====================================================================
(async function mulai() {
  await D.muatDaftar();
  const tersimpan = sessionStorage.getItem('app.sandi');
  if (tersimpan) {
    try {
      await D.muat(tersimpan);
      await bangunKerangka();
      return;
    } catch {
      sessionStorage.removeItem('app.sandi');
    }
  }
  await layarKunci();
})();
