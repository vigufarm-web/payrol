import {groupPiecework} from './payroll-model.js?v=operasional-audit-1';
import {budgetMix} from './budget-mix.js';
import {approvalDateNotice} from './approval-dates.js';
import {approvalSelection} from './approval-date-selection.js';
// kebun.js — pengaturan kebun (kepala, PIN, target biaya), laporan biaya
// operasional per kebun, dan persetujuan lembur/premi oleh kepala divisi.
//
// Semua pengaturan di sini disimpan di bagian `web` pada berkas data
// terenkripsi, bukan di tabel database — supaya aplikasi desktop tidak perlu
// diubah skemanya dan datanya tetap ikut terkunci.

import * as D from './data.js';
import {
  el, tabel, kosongkan, taruh, isian, pilihan, panel, tanya, mintaTeks, pesan, kesalahan,
  rupiah, rupiahPenuh, angka, hk as fhk, tanggal as ftanggal, namaBulan, waktu,
} from './ui.js';

// =====================================================================
// PIN — disimpan sebagai hash, bukan angka aslinya
// =====================================================================
const enc = new TextEncoder();

export async function hashPin(pin, saltB64) {
  const salt = saltB64
    ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));
  const dasar = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bit = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 50000, hash: 'SHA-256' }, dasar, 256);
  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  return { hash: b64(new Uint8Array(bit)), salt: b64(salt) };
}

const samaPin = (a, b) => a.length === b.length && a === b;

/** Minta PIN lewat dialog. Mengembalikan true kalau cocok. */
export function mintaPin(judul, keterangan, cek) {
  return new Promise((selesai) => {
    const inp = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });
    const tempatGalat = el('div');
    const coba = async () => {
      const ok = await cek(inp.value);
      if (ok) { p.tutup(); selesai(true); return; }
      kosongkan(tempatGalat).append(el('div.kesalahan', { role: 'alert' }, ['PIN salah.']));
      inp.select();
    };
    const p = panel(judul, el('div', {}, [
      el('p', { teks: keterangan }),
      tempatGalat,
      isian('PIN', inp),
    ]), [
      el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => { p.tutup(); selesai(false); } }),
      el('button.tombol-utama', { type: 'button', teks: 'Lanjutkan', onclick: coba }),
    ]);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') coba(); });
  });
}

export async function periksaPinAdmin(pin) {
  const w = D.web();
  if (!w.adminPin) return true;              // belum pernah dipasang
  const { hash } = await hashPin(pin, w.adminPin.salt);
  return samaPin(hash, w.adminPin.hash);
}

export const adminPinTerpasang = () => !!D.web().adminPin;

async function periksaPinKebun(divisionId, pin) {
  const k = D.web().kebun?.[divisionId];
  if (!k?.pin) return true;                  // kebun ini belum punya PIN
  const { hash } = await hashPin(pin, k.pin.salt);
  return samaPin(hash, k.pin.hash);
}

// =====================================================================
// Periode: paruh bulan 1–15 dan 16–akhir
// =====================================================================
const duaDigit = (n) => String(n).padStart(2, '0');
const akhirBulan = (th, bl) => new Date(th, bl, 0).getDate();

export function rentangPeriode(tahun, bulan, jenis) {
  const p = (h) => `${tahun}-${duaDigit(bulan)}-${duaDigit(h)}`;
  const akhir = akhirBulan(tahun, bulan);
  if (jenis === 'paruh1') return { dari: p(1), sampai: p(15), label: `1–15 ${namaBulan(bulan)} ${tahun}` };
  if (jenis === 'paruh2') return { dari: p(16), sampai: p(akhir), label: `16–${akhir} ${namaBulan(bulan)} ${tahun}` };
  if (jenis === 'sampaiKini') {
    const kini = new Date();
    const hariIni = (kini.getFullYear() === tahun && kini.getMonth() + 1 === bulan)
      ? kini.getDate() : akhir;
    return { dari: p(1), sampai: p(hariIni), label: `1–${hariIni} ${namaBulan(bulan)} ${tahun}` };
  }
  return { dari: p(1), sampai: p(akhir), label: `${namaBulan(bulan)} ${tahun}` };
}

const JENIS_PERIODE = [
  { nilai: 'paruh1', label: 'Paruh 1 (1–15)' },
  { nilai: 'paruh2', label: 'Paruh 2 (16–akhir)' },
  { nilai: 'bulan', label: 'Sebulan penuh' },
  { nilai: 'sampaiKini', label: 'Sampai hari ini' },
];

// =====================================================================
// Perhitungan biaya satu kebun (divisi) pada satu rentang tanggal
// =====================================================================
const hidup = (t) => D.baris(t).filter((r) => !r.deleted_at);

export function biayaKebun(divisionId, dari, sampai) {
  const dalam = (r) => r.tanggal >= dari && r.tanggal <= sampai;
  const diDivisi = (r) => Number(r.division_id) === Number(divisionId);

  const hk = hidup('daily_payroll').filter((r) => dalam(r) && diDivisi(r));
  const borongan = [...hidup('borongan_transactions').filter((r) => dalam(r) && diDivisi(r)),...groupPiecework(D.state.data,dari,sampai).filter(diDivisi)];
  // lembur & premi hanya dihitung kalau sudah disetujui kepala divisi
  const lembur = hidup('lembur_transactions').filter((r) => dalam(r) && diDivisi(r) && D.disetujui('lembur_transactions', r.id));
  const premi = hidup('premi_transactions').filter((r) => dalam(r) && diDivisi(r) && D.disetujui('premi_transactions', r.id));

  const jml = (a, k = 'nominal') => a.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const totalHk = hk.reduce((n, r) => n + (Number(r.hk) || 0), 0);

  const menunggu = {
    lembur: hidup('lembur_transactions').filter((r) => dalam(r) && diDivisi(r) && D.menungguPersetujuan('lembur_transactions', r.id)),
    premi: hidup('premi_transactions').filter((r) => dalam(r) && diDivisi(r) && D.menungguPersetujuan('premi_transactions', r.id)),
  };

  return {
    hk, borongan, lembur, premi, menunggu,
    totalHk,
    upahHk: jml(hk),
    upahBorongan: jml(borongan),
    upahLembur: jml(lembur),
    upahPremi: jml(premi),
    nilaiMenunggu: jml(menunggu.lembur) + jml(menunggu.premi),
    get total() { return this.upahHk + this.upahBorongan + this.upahLembur + this.upahPremi; },
    pekerja: new Set([...hk, ...borongan, ...lembur, ...premi].map((r) => r.employee_id)),
    hari: new Set(hk.map((r) => r.tanggal)),
    // Tanggal kegiatan TERAKHIR yang sudah tercatat. Penting buat kepala
    // divisi: hari ini tanggal 14 tapi input terakhir tanggal 12 berarti
    // ada dua hari yang belum masuk — angkanya belum lengkap.
    inputTerakhir: [...hk, ...borongan, ...lembur, ...premi]
      .map((r) => r.tanggal).sort().at(-1) || null,
  };
}

/** "Input terakhir" + berapa hari tertinggal dari hari ini. */
export function jedaInput(tanggalTerakhir) {
  if (!tanggalTerakhir) return { teks: 'Belum ada', satuan: '', tertinggal: null };
  const hariIniIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
  const selisih = Math.round(
    (Date.parse(`${hariIniIso}T00:00:00Z`) - Date.parse(`${tanggalTerakhir}T00:00:00Z`)) / 86400000);
  return {
    teks: tanggalTerakhir,
    tertinggal: selisih,
    satuan: selisih <= 0 ? 'hari ini' : selisih === 1 ? '1 hari lalu' : `${selisih} hari lalu`,
  };
}

/** Target rupiah untuk satu divisi pada satu periode. */
export function targetPeriode(divisionId, tahun, bulan, jenis) {
  const t = D.web().target?.[divisionId]?.[`${tahun}-${duaDigit(bulan)}`];
  if (!t) return null;
  if (jenis === 'paruh1') return Number(t.paruh1) || null;
  if (jenis === 'paruh2') return Number(t.paruh2) || null;
  return Number(t.bulan) || null;
}

/**
 * Rekomendasi laju pemakaian anggaran.
 *
 * Hitungannya sederhana dan sengaja begitu: rata-rata lurus, bukan ramalan.
 * - laju sekarang  = yang sudah terpakai dibagi hari yang sudah jalan
 * - proyeksi       = laju itu diteruskan sampai akhir periode
 * - jatah sisa     = (target - terpakai) dibagi hari yang tersisa
 * - jatah HK/hari  = jatah rupiah dibagi biaya rata-rata per HK
 *
 * Yang dipakai untuk mengubah rupiah jadi HK adalah biaya HK harian saja,
 * karena itu yang bisa diatur kepala kebun. Borongan, solar, dan servis ikut
 * mengurangi sisa anggaran tapi tidak ikut jadi angka HK.
 */
export function rekomendasiAnggaran(b, target, dari, sampai, tanggalAcuan = null) {
  if (!(target > 0)) return null;

  const hari = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const SEHARI = 86400000;
  const hariTotal = Math.round((hari(sampai) - hari(dari)) / SEHARI) + 1;
  if (hariTotal <= 0) return null;

  // Wajib memakai tanggal input terakhir. Memakai tanggal hari ini saat
  // input tertinggal akan mengecilkan rata-rata dan membuat proyeksi tampak
  // lebih aman daripada kondisi data yang benar-benar sudah masuk.
  const kini = tanggalAcuan;
  let hariJalan;
  if (!kini || kini < dari) hariJalan = 0;
  else if (kini > sampai) hariJalan = hariTotal;
  else hariJalan = Math.round((hari(kini) - hari(dari)) / SEHARI) + 1;
  const hariSisa = hariTotal - hariJalan;

  const sisaRp = target - b.total;
  const biayaPerHk = b.totalHk > 0 ? b.upahHk / b.totalHk : null;

  const rpPerHari = hariJalan > 0 ? b.total / hariJalan : null;
  const hkPerHari = hariJalan > 0 ? b.totalHk / hariJalan : null;
  const proyeksi = rpPerHari == null ? null : rpPerHari * hariTotal;

  const jatahRp = hariSisa > 0 && sisaRp > 0 ? sisaRp / hariSisa : null;
  const jatahHk = jatahRp != null && biayaPerHk ? jatahRp / biayaPerHk : null;

  return {
    hariTotal, hariJalan, hariSisa,
    tanggalAcuan: kini,
    sisaRp, biayaPerHk, rpPerHari, hkPerHari, proyeksi, jatahRp, jatahHk,
    mix: Array.isArray(b.hk) ? budgetMix(b, sisaRp, hariSisa) : null,
    selesai: hariSisa <= 0,
    belumMulai: hariJalan === 0,
    lewat: sisaRp < 0,
    akanLewat: proyeksi != null && proyeksi > target,
  };
}

/** Tampilan rekomendasi. Mengembalikan null kalau targetnya belum diisi. */
export function kotakRekomendasi(k, target) {
  if (!k) return null;
  const baris = [];

  if (k.belumMulai) {
    baris.push(el('p', { teks: `Periode belum berjalan. Anggaran ${rupiahPenuh(target)} `
      + `untuk ${k.hariTotal} hari — sekitar ${rupiahPenuh(target / k.hariTotal)} per hari.` }));
  } else {
    baris.push(el('p', {
      teks: `Laju sekarang: ${fhk(k.hkPerHari)} HK dan ${rupiahPenuh(k.rpPerHari)} per hari `
        + `(${k.hariJalan} hari data dari ${k.hariTotal}`
        + `${k.tanggalAcuan ? `, sampai ${ftanggal(k.tanggalAcuan)}` : ''}).`,
    }));
  }

  if (k.selesai) {
    baris.push(el('p', {
      teks: k.lewat
        ? `Periode sudah selesai dan pemakaian lewat ${rupiahPenuh(-k.sisaRp)} dari target.`
        : `Periode sudah selesai dengan sisa ${rupiahPenuh(k.sisaRp)} dari target.`,
    }));
  } else if (k.lewat) {
    baris.push(el('p.rekomendasi-awas', {
      teks: `Anggaran sudah lewat ${rupiahPenuh(-k.sisaRp)} padahal masih ada ${k.hariSisa} hari. `
        + 'Tambahan apa pun akan menambah selisihnya.',
    }));
  } else {
    if (k.proyeksi != null) {
      baris.push(el('p' + (k.akanLewat ? '.rekomendasi-awas' : ''), {
        teks: k.akanLewat
          ? `Kalau laju ini diteruskan, sampai akhir periode jadi ${rupiahPenuh(k.proyeksi)} — `
            + `lewat ${rupiahPenuh(k.proyeksi - target)} dari target.`
          : `Kalau laju ini diteruskan, sampai akhir periode sekitar ${rupiahPenuh(k.proyeksi)} — `
            + `masih di bawah target.`,
      }));
    }
    if (k.jatahRp != null) {
      const hk = !k.mix && k.jatahHk != null
        ? ` — kira-kira ${fhk(k.jatahHk)} HK per hari`
        : '';
      baris.push(el('p.rekomendasi-utama', {
        teks: `Supaya tidak lewat target: sisa ${k.hariSisa} hari × maksimal `
          + `${rupiahPenuh(k.jatahRp)} per hari${hk}.`,
      }));
      if (!k.mix && k.jatahHk != null && k.hkPerHari > 0) {
        const beda = k.jatahHk - k.hkPerHari;
        baris.push(el('p.bantuan', {
          teks: beda < 0
            ? `Artinya perlu dikurangi sekitar ${fhk(-beda)} HK per hari dari kebiasaan sekarang.`
            : `Masih ada ruang sekitar ${fhk(beda)} HK per hari di atas kebiasaan sekarang.`,
        }));
      }
    }
  }

  if (k.mix) {
    const m = k.mix;
    if (!k.selesai) {
      baris.push(el('p', { teks: `Cadangan tambahan menunggu persetujuan ${rupiahPenuh(m.pending)}. `
        + `Sisa untuk kegiatan berikutnya ${rupiahPenuh(m.available)}.` }));
      if (m.shortage > 0) baris.push(el('p.rekomendasi-awas', {
        teks: `Jika seluruh tambahan menunggu disetujui, anggaran kurang ${rupiahPenuh(m.shortage)}.` }));
      if (m.valid && m.feasible) {
        baris.push(el('p.rekomendasi-utama', { teks: `Simulasi sisa ${k.hariSisa} hari: `
          + `${fhk(m.hk)} HK total, sekitar ${fhk(m.hkPerDay)} HK per hari, `
          + `setelah menyediakan bagian premi, lembur, dan borongan.` }));
        baris.push(el('p.bantuan', { teks: 'Kelompok tarif lebih tinggi: 1 HK per orang per hari terlebih dahulu. Kelompok tarif terendah: mengikuti sisa anggaran.' }));
        baris.push(tabel([
          { l: 'Alokasi kegiatan berikutnya', k: 'label' },
          { l: 'Sisa periode (Rp)', k: 'amount', jenis: 'uang', total: true },
          { l: 'Per hari (Rp)', k: 'perDay', jenis: 'uang', total: true },
        ], m.allocations));
        if (m.unallocated > 0.01) baris.push(el('p.bantuan', { teks: `Ruang anggaran belum dialokasikan ${rupiahPenuh(m.unallocated)} karena batas 1 HK per pekerja aktif per hari. Tidak otomatis dialihkan ke premi/lembur.` }));
        baris.push(tabel([
          { l: 'Tarif aktual / HK (Rp)', k: 'rate', jenis: 'uang' },
          { l: 'Pekerja tercatat', k: 'employees', jenis: 'angka' },
          { l: 'Dasar alokasi', k: 'rule' },
          { l: 'Estimasi HK sisa', k: 'hk', jenis: 'hk', total: true },
          { l: 'HK per hari', k: 'hkPerDay', jenis: 'hk', total: true },
        ], m.groups));
        baris.push(el('details', {}, [el('summary', { teks: 'Dasar perhitungan simulasi' }), el('p.bantuan', { teks: `Tarif diambil dari upah/HK tanggal terakhir tiap pekerja yang tercatat `
          + `pada divisi dan periode ini, rata-rata ${rupiahPenuh(m.rate)} / HK. `
          + 'Pekerja tanpa transaksi periode ini tidak diikutkan; tarif mandor mengikuti transaksi, tanpa disamaratakan. '
          + 'Setiap pekerja dengan tarif di atas tarif terendah dialokasikan 1 HK/hari terlebih dahulu. Pekerja bertarif terendah mendapat sisa, maksimum 1 HK/orang/hari. Premi, lembur dan borongan dicadangkan per HK mengikuti pola periode termasuk tambahan menunggu. '
          + 'Ini simulasi batas anggaran, bukan kewajiban menghabiskan premi/lembur atau penetapan jadwal pekerja. '
          + 'Maksimal 1 HK per orang per hari; sesuaikan komposisi tim dan pekerjaan nyata. '
          + 'Biaya baru di luar pola ini mengurangi ruang anggaran.' })]));
      } else if (m.valid && !m.feasible) baris.push(el('p.rekomendasi-awas', { teks: `Anggaran belum cukup untuk prioritas ${fhk(m.priorityHK / k.hariSisa)} HK/hari pada kelompok tarif lebih tinggi. Kebutuhan sisa periode beserta cadangan tambahan ${rupiahPenuh(m.required)}; kurang ${rupiahPenuh(m.priorityShortage)}. Belum ada ruang untuk kelompok tarif terendah. Sesuaikan anggaran atau rencana hari kerja; alokasi 1 HK tidak dipotong otomatis.` }));
      else if (m.invalid) baris.push(el('p.bantuan', { teks: 'Estimasi HK belum dapat dihitung: ada transaksi HK atau nominal upah yang tidak valid. Perbaiki input dahulu; tarif tidak ditebak.' }));
      else baris.push(el('p.bantuan', { teks: 'Belum ada dasar transaksi HK yang cukup pada periode ini untuk memperkirakan komposisi tarif dan tambahan. Tarif tidak ditebak.' }));
    }
  } else baris.push(el('p.bantuan', {
    teks: 'Proyeksi mengikuti laju biaya tercatat. Estimasi HK memakai rata-rata upah HK; '
      + 'rencana tambahan premi, lembur, borongan atau biaya lain akan mengurangi jatah HK.'
      + (k.biayaPerHk ? ` Biaya rata-rata ${rupiahPenuh(k.biayaPerHk)} per HK.` : ''),
  }));

  return el('div.rekomendasi', {}, [
    el('h3', { teks: 'Rekomendasi' }),
    ...baris,
  ]);
}

// =====================================================================
// HALAMAN: Laporan operasional per kebun
// =====================================================================
let pilihanLaporan = { divisi: null, jenis: 'paruh1' };

export function halamanLaporanKebun({ periode, gambar, hak }) {
  // kepala kebun hanya melihat kebunnya sendiri; admin melihat semua
  const bolehDiv = hak?.divisi ? hak.divisi() : null;
  const divisiAktif = D.aktif('divisions')
    .filter((d) => bolehDiv === null || bolehDiv.includes(Number(d.id)));
  if (!divisiAktif.length) {
    return el('section', {}, [el('div.petunjuk', {}, [
      bolehDiv && !bolehDiv.length
        ? 'Akun Anda belum diberi kebun mana pun. Hubungi admin.'
        : 'Belum ada divisi di master data.',
    ])]);
  }
  if (!pilihanLaporan.divisi || !divisiAktif.some((d) => String(d.id) === String(pilihanLaporan.divisi))) {
    pilihanLaporan.divisi = divisiAktif[0].id;
  }

  const wadah = el('section');
  const tempat = el('div');

  const gambarIsi = () => {
    const divisi = D.cari('divisions', pilihanLaporan.divisi);
    const r = rentangPeriode(periode.tahun, periode.bulan, pilihanLaporan.jenis);
    const b = biayaKebun(divisi.id, r.dari, r.sampai);
    const target = targetPeriode(divisi.id, periode.tahun, periode.bulan, pilihanLaporan.jenis);
    const kepala = D.web().kebun?.[divisi.id]?.kepala || '';

    const sisa = target == null ? null : target - b.total;
    const persen = target ? Math.round((b.total / target) * 1000) / 10 : null;

    // rincian per blok
    const perBlok = new Map();
    const tambahBlok = (id, hk, rp) => {
      const k = id == null || id === '' ? 0 : Number(id);
      const x = perBlok.get(k) || { hk: 0, rp: 0 };
      x.hk += hk; x.rp += rp; perBlok.set(k, x);
    };
    for (const x of b.hk) tambahBlok(x.block_id, Number(x.hk) || 0, Number(x.nominal) || 0);
    for (const x of [...b.borongan, ...b.lembur, ...b.premi]) tambahBlok(x.block_id, 0, Number(x.nominal) || 0);
    const barisBlok = [...perBlok.entries()]
      // nama blok dihitung pada AKHIR periode yang dilihat, bukan hari ini,
      // supaya laporan bulan lama tidak ikut maju siklusnya
      .map(([id, x]) => ({ blok: id ? D.labelBlokPada(id, r.sampai) : '(tanpa blok)', ...x }))
      .sort((a, z) => z.rp - a.rp);

    // rincian per kegiatan (HK saja — lembur/premi tidak punya kolom kegiatan)
    const perKegiatan = new Map();
    for (const x of b.hk) {
      const k = Number(x.activity_id) || 0;
      const v = perKegiatan.get(k) || { hk: 0, rp: 0 };
      v.hk += Number(x.hk) || 0; v.rp += Number(x.nominal) || 0;
      perKegiatan.set(k, v);
    }
    const barisKegiatan = [...perKegiatan.entries()]
      .map(([id, x]) => ({ kegiatan: id ? D.labelRef('activities', id) : '(tanpa kegiatan)', ...x }))
      .sort((a, z) => z.rp - a.rp);

    // rincian per pekerja
    const perPekerja = new Map();
    const ambil = (id) => {
      const k = Number(id);
      if (!perPekerja.has(k)) {
        const e = D.cari('employees', k);
        perPekerja.set(k, { nama: e?.nama || `#${k}`, nik: e?.nik || '', hk: 0, upah_hk: 0, borongan: 0, lembur: 0, premi: 0 });
      }
      return perPekerja.get(k);
    };
    for (const x of b.hk) { const p = ambil(x.employee_id); p.hk += Number(x.hk) || 0; p.upah_hk += Number(x.nominal) || 0; }
    for (const x of b.borongan) ambil(x.employee_id).borongan += Number(x.nominal) || 0;
    for (const x of b.lembur) ambil(x.employee_id).lembur += Number(x.nominal) || 0;
    for (const x of b.premi) ambil(x.employee_id).premi += Number(x.nominal) || 0;
    const barisPekerja = [...perPekerja.values()]
      .map((p) => ({ ...p, total: p.upah_hk + p.borongan + p.lembur + p.premi }))
      .sort((a, z) => a.nama.localeCompare(z.nama, 'id'));

    const kotak = (l, v, s = '') => el('div', {}, [
      el('dt', { teks: l }),
      el('dd', {}, [v, s ? el('span.satuan', { teks: ' ' + s }) : null]),
    ]);
    // Kartu "Input terakhir": kalau tertinggal 2 hari atau lebih, ditandai
    // supaya kepala divisi tidak mengira angkanya sudah lengkap.
    const kotakInput = (tgl) => {
      const j = jedaInput(tgl);
      const telat = j.tertinggal != null && j.tertinggal >= 2;
      return el('div', { title: telat
        ? `Belum ada input ${j.tertinggal} hari terakhir — angka di atas mungkin belum lengkap.`
        : null }, [
        el('dt', { teks: 'Input terakhir' }),
        el('dd', { style: telat ? 'color:var(--merah)' : null }, [
          j.teks === 'Belum ada' ? 'Belum ada' : ftanggal(j.teks),
          el('span.satuan', { teks: ' ' + j.satuan }),
        ]),
      ]);
    };

    taruh(kosongkan(tempat),
      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [
          el('h2', { teks: `${divisi.nama_divisi} — ${r.label}` }),
          kepala ? el('span.lencana-mode', { teks: `Kepala kebun: ${kepala}` }) : null,
          el('button.tombol-samar.tombol-kecil', { type: 'button', teks: 'Cetak', onclick: () => window.print() }),
        ]),
        el('dl.angka-utama', {}, [
          kotak('Total HK', fhk(b.totalHk), 'HK'),
          kotak('Total biaya', rupiah(b.total), 'Rp'),
          kotak('Pekerja', angka(b.pekerja.size), 'orang'),
          kotak('Hari ada kegiatan', angka(b.hari.size), 'hari'),
          kotakInput(b.inputTerakhir),
        ]),
      ]),

      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Komposisi biaya periode' })]),
        el('dl.angka-utama', {}, [
          ...[['Gapok / upah HK', b.upahHk], ['Premi disetujui', b.upahPremi],
            ['Lembur disetujui', b.upahLembur], ['Borongan', b.upahBorongan]]
            .map(([label, value]) => kotak(label,
              b.total > 0 ? angka(value / b.total * 100, 1) + '%' : '—', rupiahPenuh(value))),
        ]),
        el('div.lembar-isi', {}, [el('p.bantuan', { teks: 'Persentase dari total biaya periode terpilih. Tambahan menunggu persetujuan belum masuk realisasi.' })]),
      ]),

      // --- terhadap target
      el('section', {}, [
        el('div.lembar', {}, [
          el('div.lembar-kepala', {}, [el('h2', { teks: 'Terhadap target' })]),
          el('div.lembar-isi', {}, [
            target == null
              ? el('p.bantuan', {
                teks: 'Target untuk periode ini belum diisi. Admin dapat mengisinya di menu Pengaturan Kebun.',
              })
              : el('div', {}, [
                el('div.meter', {}, [
                  el('div.meter-isi' + (b.total > target ? '.lewat' : ''), {
                    style: `width:${Math.min(100, persen)}%`,
                  }),
                ]),
                el('p', {
                  teks: `Terpakai ${rupiahPenuh(b.total)} dari target ${rupiahPenuh(target)} `
                    + `(${angka(persen, 1)}%). ${sisa >= 0 ? 'Sisa ' + rupiahPenuh(sisa) : 'Lewat ' + rupiahPenuh(-sisa)}.`,
                }),
              ]),
            b.nilaiMenunggu > 0
              ? el('div.petunjuk', {}, [
                `Ada ${b.menunggu.lembur.length} lembur dan ${b.menunggu.premi.length} premi senilai `
                + `${rupiahPenuh(b.nilaiMenunggu)} yang masih menunggu persetujuan — belum dihitung di angka di atas.`,
              ])
              : null,
            kotakRekomendasi(rekomendasiAnggaran(
              b, target, r.dari, r.sampai, b.inputTerakhir), target),
          ]),
        ]),
      ]),

      // --- rincian jenis biaya
      el('section', {}, [
        el('div.lembar', {}, [
          el('div.lembar-kepala', {}, [el('h2', { teks: 'Rincian biaya' })]),
          el('div.lembar-isi', {}, [
            tabel([
              { l: 'Jenis', k: 'jenis' },
              { l: 'Baris', k: 'baris', jenis: 'angka', total: true },
              { l: 'HK', k: 'hk', jenis: 'hk', total: true },
              { l: 'Nilai (Rp)', k: 'rp', jenis: 'uang', total: true },
            ], [
              { jenis: 'HK harian', baris: b.hk.length, hk: b.totalHk, rp: b.upahHk },
              { jenis: 'Borongan', baris: b.borongan.length, hk: 0, rp: b.upahBorongan },
              { jenis: 'Lembur (disetujui)', baris: b.lembur.length, hk: 0, rp: b.upahLembur },
              { jenis: 'Premi (disetujui)', baris: b.premi.length, hk: 0, rp: b.upahPremi },
            ], { kosong: 'Belum ada biaya pada periode ini.' }),
          ]),
        ]),
      ]),

      el('section', {}, [
        el('div.lembar', {}, [
          el('div.lembar-kepala', {}, [el('h2', { teks: 'Per blok' })]),
          el('div.lembar-isi', {}, [
            tabel([
              { l: 'Blok', k: 'blok' },
              { l: 'HK', k: 'hk', jenis: 'hk', total: true },
              { l: 'Biaya (Rp)', k: 'rp', jenis: 'uang', total: true },
            ], barisBlok, { kosong: 'Belum ada data.' }),
          ]),
        ]),
      ]),

      el('section', {}, [
        el('div.lembar', {}, [
          el('div.lembar-kepala', {}, [el('h2', { teks: 'Per kegiatan' })]),
          el('div.lembar-isi', {}, [
            tabel([
              { l: 'Kegiatan', k: 'kegiatan' },
              { l: 'HK', k: 'hk', jenis: 'hk', total: true },
              { l: 'Upah HK (Rp)', k: 'rp', jenis: 'uang', total: true },
            ], barisKegiatan, { kosong: 'Belum ada data.' }),
          ]),
        ]),
      ]),

      el('section', {}, [
        el('div.lembar', {}, [
          el('div.lembar-kepala', {}, [el('h2', { teks: 'Per pekerja' })]),
          el('div.lembar-isi', {}, [
            tabel([
              { l: 'NIK', k: 'nik' },
              { l: 'Nama', k: 'nama' },
              { l: 'HK', k: 'hk', jenis: 'hk', total: true },
              { l: 'Upah HK', k: 'upah_hk', jenis: 'uang', total: true },
              { l: 'Borongan', k: 'borongan', jenis: 'uang', total: true },
              { l: 'Lembur', k: 'lembur', jenis: 'uang', total: true },
              { l: 'Premi', k: 'premi', jenis: 'uang', total: true },
              { l: 'Total (Rp)', k: 'total', jenis: 'uang', total: true },
            ], barisPekerja, { kosong: 'Belum ada data.' }),
          ]),
        ]),
      ]),
    );
  };

  const pilihDivisi = pilihan(
    divisiAktif.map((d) => ({ nilai: d.id, label: d.nama_divisi })),
    pilihanLaporan.divisi,
    { kosongLabel: '— pilih kebun —', saatUbah: (e) => { pilihanLaporan.divisi = Number(e.target.value); gambarIsi(); } },
  );
  const pilihJenis = pilihan(JENIS_PERIODE, pilihanLaporan.jenis, {
    kosongLabel: null,
    saatUbah: (e) => { pilihanLaporan.jenis = e.target.value; gambarIsi(); },
  });


  wadah.append(
    el('div.lembar', { style: 'margin-bottom:1.4rem' }, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: 'Pilih kebun & periode' }),
        pilihDivisi,
        pilihJenis,
      ]),
    ]),
    tempat,
  );
  gambarIsi();
  return wadah;
}

// =====================================================================
// HALAMAN: Pengaturan kebun (target, kepala, PIN) — dikunci PIN admin
// =====================================================================
export function halamanPengaturanKebun({ periode, gambar, bisaEdit }) {
  const wadah = el('section');
  // sekali dibuka, tetap terbuka selama tab hidup — supaya gambar ulang penuh
  // (yang memunculkan tombol Simpan di kepala halaman) tidak minta PIN lagi
  let terbuka = sessionStorage.getItem('app.target.buka') === '1';

  const gambarIsi = () => {
    kosongkan(wadah);
    const w = D.web();
    const bulanKunci = `${periode.tahun}-${duaDigit(periode.bulan)}`;

    if (!bisaEdit()) {
      wadah.append(el('div.petunjuk', {}, [
        'Mode lihat. Untuk mengubah target, aktifkan mode edit dulu di menu Pengaturan.',
      ]));
    }

    if (!terbuka) {
      wadah.append(el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Pengaturan Kebun' })]),
        el('div.lembar-isi', {}, [
          el('p', {
            teks: adminPinTerpasang()
              ? 'Halaman ini berisi target biaya tiap kebun. Masukkan PIN admin untuk membukanya.'
              : 'PIN admin belum dipasang. Buka halaman ini untuk memasangnya — setelah itu target hanya bisa diubah dengan PIN tersebut.',
          }),
          el('button.tombol-utama', {
            type: 'button',
            teks: adminPinTerpasang() ? 'Masukkan PIN admin' : 'Buka & pasang PIN admin',
            onclick: async () => {
              if (!adminPinTerpasang()) { terbuka = true; sessionStorage.setItem('app.target.buka', '1'); gambarIsi(); return; }
              const ok = await mintaPin('PIN admin',
                'PIN ini melindungi angka target biaya tiap kebun.', periksaPinAdmin);
              if (ok) { terbuka = true; sessionStorage.setItem('app.target.buka', '1'); gambarIsi(); }
            },
          }),
        ]),
      ]));
      return;
    }

    // ---- pasang/ganti PIN admin
    wadah.append(el('div.lembar', { style: 'margin-bottom:1.4rem' }, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: 'PIN admin' }),
        el('span.lencana-mode' + (adminPinTerpasang() ? '.edit' : ''), {
          teks: adminPinTerpasang() ? 'Terpasang' : 'Belum dipasang',
        }),
      ]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', {
          teks: 'PIN mencegah orang tidak sengaja menggeser target. Ini bukan pengaman penuh: '
            + 'orang yang sudah tahu password data tetap bisa mengakalinya kalau benar-benar mau.',
        }),
        el('button.tombol-samar', {
          type: 'button',
          teks: adminPinTerpasang() ? 'Ganti PIN admin' : 'Pasang PIN admin',
          onclick: () => formPin('admin', null, () => gambar()),
        }),
      ]),
    ]));

    // ---- target & kepala per divisi
    const baris = D.aktif('divisions').map((d) => {
      const t = w.target?.[d.id]?.[bulanKunci] || {};
      const k = w.kebun?.[d.id] || {};
      return {
        id: d.id,
        divisi: d.nama_divisi,
        kepala: k.kepala || '—',
        adaPin: k.pin ? 'Ya' : 'Belum',
        bulan: Number(t.bulan) || 0,
        paruh1: Number(t.paruh1) || 0,
        paruh2: Number(t.paruh2) || 0,
      };
    });

    wadah.append(el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [
        el('h2', { teks: `Target biaya — ${namaBulan(periode.bulan)} ${periode.tahun}` }),
        el('button.tombol-samar.tombol-kecil', {
          type: 'button', teks: 'Salin dari bulan lalu', onclick: () => salinTargetBulanLalu(periode, gambarIsi),
        }),
      ]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', {
          teks: 'Klik satu baris untuk mengubah target, nama kepala kebun, dan PIN-nya. '
            + 'Target paruh dipakai untuk laporan 1–15 dan 16–akhir; target bulan untuk laporan sebulan penuh.',
        }),
        tabel([
          { l: 'Kebun', k: 'divisi' },
          { l: 'Kepala kebun', k: 'kepala' },
          { l: 'PIN', k: 'adaPin' },
          { l: 'Target paruh 1 (Rp)', k: 'paruh1', jenis: 'uang', total: true },
          { l: 'Target paruh 2 (Rp)', k: 'paruh2', jenis: 'uang', total: true },
          { l: 'Target bulan (Rp)', k: 'bulan', jenis: 'uang', total: true },
        ], baris, {
          kosong: 'Belum ada divisi aktif.',
          saatKlik: bisaEdit() ? (r) => formKebun(r.id, periode, gambar) : null,
        }),
      ]),
    ]));
  };

  gambarIsi();
  return wadah;
}

function formPin(jenis, divisionId, saatSelesai) {
  const inp1 = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });
  const inp2 = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off' });
  const tempatGalat = el('div');
  const simpan = async () => {
    const salah = [];
    if (String(inp1.value).length < 4) salah.push('PIN minimal 4 angka.');
    if (inp1.value !== inp2.value) salah.push('Ulangan PIN tidak sama.');
    kosongkan(tempatGalat);
    if (salah.length) { tempatGalat.append(kesalahan(salah)); return; }
    const h = await hashPin(inp1.value);
    if (jenis === 'admin') D.setWeb((w) => { w.adminPin = h; });
    else D.setWeb((w) => { w.kebun[divisionId] = { ...(w.kebun[divisionId] || {}), pin: h }; });
    p.tutup();
    pesan('PIN disimpan. Jangan lupa Simpan ke GitHub.', 'sukses');
    saatSelesai();
  };
  const p = panel(jenis === 'admin' ? 'PIN admin' : 'PIN kepala kebun', el('div', {}, [
    tempatGalat,
    el('p', { teks: 'Pakai 4–8 angka yang mudah diingat.' }),
    isian('PIN baru', inp1),
    isian('Ulangi PIN', inp2),
  ]), [
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan PIN', onclick: simpan }),
  ]);
}

function formKebun(divisionId, periode, saatSelesai) {
  const d = D.cari('divisions', divisionId);
  const w = D.web();
  const bulanKunci = `${periode.tahun}-${duaDigit(periode.bulan)}`;
  const t = w.target?.[divisionId]?.[bulanKunci] || {};
  const k = w.kebun?.[divisionId] || {};

  const inKepala = el('input', { type: 'text', nilai: k.kepala || '' });
  const inP1 = el('input', { type: 'number', min: '0', step: '100000', nilai: t.paruh1 ?? '' });
  const inP2 = el('input', { type: 'number', min: '0', step: '100000', nilai: t.paruh2 ?? '' });
  const inBulan = el('input', { type: 'number', min: '0', step: '100000', nilai: t.bulan ?? '' });
  const catatan = el('p.bantuan', { teks: ' ' });

  const hitung = () => {
    const a = Number(inP1.value) || 0;
    const b = Number(inP2.value) || 0;
    const bl = Number(inBulan.value) || 0;
    const bagian = [];
    if (a || b) bagian.push(`Dua paruh = ${rupiahPenuh(a + b)}`);
    if (bl && (a || b) && Math.abs(a + b - bl) > 1) {
      bagian.push(`⚠ tidak sama dengan target bulan ${rupiahPenuh(bl)}`);
    }
    catatan.textContent = bagian.join(' · ');
  };
  for (const i of [inP1, inP2, inBulan]) i.addEventListener('input', hitung);
  hitung();

  const simpan = () => {
    D.setWeb((web) => {
      web.kebun[divisionId] = { ...(web.kebun[divisionId] || {}), kepala: inKepala.value.trim() };
      web.target[divisionId] = web.target[divisionId] || {};
      web.target[divisionId][bulanKunci] = {
        paruh1: Number(inP1.value) || 0,
        paruh2: Number(inP2.value) || 0,
        bulan: Number(inBulan.value) || 0,
      };
    });
    p.tutup();
    pesan(`Target ${d.nama_divisi} disimpan. Jangan lupa Simpan ke GitHub.`, 'sukses');
    saatSelesai();
  };

  const p = panel(`${d.nama_divisi} — ${namaBulan(periode.bulan)} ${periode.tahun}`, el('div', {}, [
    isian('Nama kepala kebun', inKepala, { bantuan: 'Muncul di judul laporan kebun ini.' }),
    el('div.baris-isian', {}, [
      isian('Target paruh 1 (1–15)', inP1),
      isian('Target paruh 2 (16–akhir)', inP2),
    ]),
    isian('Target sebulan penuh', inBulan),
    catatan,
    el('hr', { style: 'margin:1rem 0; border:0; border-top:1px solid var(--garis-tipis)' }),
    el('p.bantuan', {
      teks: k.pin
        ? 'PIN kepala kebun sudah dipasang. Dipakai saat menyetujui lembur & premi divisi ini.'
        : 'PIN kepala kebun belum dipasang. Tanpa PIN, siapa pun yang bisa mengubah data bisa menyetujui lembur & premi divisi ini.',
    }),
    el('button.tombol-samar', {
      type: 'button', teks: k.pin ? 'Ganti PIN kepala kebun' : 'Pasang PIN kepala kebun',
      onclick: () => { p.tutup(); formPin('kebun', divisionId, saatSelesai); },
    }),
  ]), [
    el('button.tombol-samar', { type: 'button', teks: 'Batal', onclick: () => p.tutup() }),
    el('button.tombol-utama', { type: 'button', teks: 'Simpan', onclick: simpan }),
  ]);
}

async function salinTargetBulanLalu(periode, saatSelesai) {
  const bl = periode.bulan === 1 ? 12 : periode.bulan - 1;
  const th = periode.bulan === 1 ? periode.tahun - 1 : periode.tahun;
  const dari = `${th}-${duaDigit(bl)}`;
  const ke = `${periode.tahun}-${duaDigit(periode.bulan)}`;
  const w = D.web();
  const adaDariBulanLalu = D.aktif('divisions').filter((d) => w.target?.[d.id]?.[dari]);
  if (!adaDariBulanLalu.length) {
    await tanya('Tidak ada yang bisa disalin',
      `Belum ada target tersimpan untuk ${namaBulan(bl)} ${th}.`, { ya: 'Mengerti', tidak: 'Tutup' });
    return;
  }
  const lanjut = await tanya('Salin target bulan lalu?',
    `Target ${adaDariBulanLalu.length} kebun dari ${namaBulan(bl)} ${th} akan disalin ke `
    + `${namaBulan(periode.bulan)} ${periode.tahun}. Target bulan ini yang sudah ada akan ditimpa.`,
    { ya: 'Salin' });
  if (!lanjut) return;
  D.setWeb((web) => {
    for (const d of adaDariBulanLalu) {
      web.target[d.id] = web.target[d.id] || {};
      web.target[d.id][ke] = { ...web.target[d.id][dari] };
    }
  });
  pesan(`Target ${adaDariBulanLalu.length} kebun disalin.`, 'sukses');
  saatSelesai();
}

// =====================================================================
// HALAMAN: Persetujuan lembur & premi
// =====================================================================
const satuanPersetujuan = (r) => String(
  r.satuan || D.cari('wage_components', r.wage_component_id)?.satuan
    || (r._label === 'Lembur' ? 'jam' : 'satuan'),
).trim();
const jumlahPersetujuan = (r) => `${angka(r.qty, 2)} ${satuanPersetujuan(r)}`.trim();

/**
 * Daftar lembur/premi yang SUDAH disetujui — untuk dipantau dan dibatalkan
 * kalau ternyata keliru. Yang ditampilkan: semua acc yang PERIODENYA BELUM
 * TUTUP BUKU (bulan belum dikunci di Pengaturan Kebun), jadi selama paruh /
 * bulan berjalan masih kelihatan semua. Bisa dicari & difilter, dan urutannya
 * TANGGAL TRANSAKSI terbaru paling atas (bukan urutan waktu acc).
 */
function bagianDiputuskan({ bisaEdit, hak, muatUlang }) {
  const bolehBatal = hak?.batal ? hak.batal() : false;
  const boleh = hak?.divisi ? hak.divisi() : null;
  const semuaAcc = [];
  for (const [namaTabel, label] of [['lembur_transactions', 'Lembur'], ['premi_transactions', 'Premi']]) {
    for (const id of D.daftarStatus(namaTabel, 'disetujui')) {
      const r = D.cari(namaTabel, id);
      if (!r || r.deleted_at) continue;
      if (boleh !== null && r.division_id != null && !boleh.includes(Number(r.division_id))) continue;
      const c = D.catatanPersetujuan(namaTabel, id);
      semuaAcc.push({
        ...r, _tabel: namaTabel, _label: label,
        _oleh: c?.oleh || '', _waktu: c?.waktu || '',
        _terkunci: D.periodeTerkunci(r.tanggal),
      });
    }
  }
  // tanggal transaksi terbaru di atas; tanggal sama → acc terbaru dulu
  semuaAcc.sort((x, y) => String(y.tanggal).localeCompare(String(x.tanggal))
    || String(y._waktu).localeCompare(String(x._waktu)));
  if (!semuaAcc.length) return null;

  // ----- kendali filter & cari
  let kata = '';
  let jenis = '';
  let divisi = '';
  let ikutTerkunci = false;
  let batasTampil = 100;
  const divisiAda = [...new Set(semuaAcc.map((r) => Number(r.division_id) || 0))]
    .map((id) => ({ id, nama: id ? D.labelRef('divisions', id) : '(tanpa divisi)' }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const cari = el('input', {
    type: 'search', placeholder: 'Cari pekerja / keterangan / no transaksi…',
    style: 'min-width:14rem;flex:1',
    oninput: (e) => { kata = e.target.value; batasTampil = 100; gambarTabel(); },
  });
  const pilihJenis = el('select', {
    'aria-label': 'Jenis',
    onchange: (e) => { jenis = e.target.value; gambarTabel(); },
  }, [
    el('option', { value: '', teks: 'Lembur & premi' }),
    el('option', { value: 'Lembur', teks: 'Lembur saja' }),
    el('option', { value: 'Premi', teks: 'Premi saja' }),
  ]);
  const pilihDivisi = el('select', {
    'aria-label': 'Divisi',
    onchange: (e) => { divisi = e.target.value; gambarTabel(); },
  }, [
    el('option', { value: '', teks: 'Semua divisi' }),
    ...divisiAda.map((d) => el('option', { value: String(d.id), teks: d.nama })),
  ]);
  const cekTerkunci = el('input', { type: 'checkbox' });
  cekTerkunci.addEventListener('change', () => { ikutTerkunci = cekTerkunci.checked; gambarTabel(); });

  const tempatTabel = el('div');
  const tempatInfo = el('p.bantuan', { style: 'margin-top:.5rem' });

  const saring = () => {
    const k = kata.trim().toLowerCase();
    return semuaAcc.filter((r) => {
      if (!ikutTerkunci && r._terkunci) return false;
      if (jenis && r._label !== jenis) return false;
      if (divisi !== '' && String(Number(r.division_id) || 0) !== divisi) return false;
      if (!k) return true;
      const teks = [
        D.labelRef('employees', r.employee_id), D.labelRef('divisions', r.division_id),
        r.keterangan_manual, r.catatan, r.nomor_transaksi, r._label, r._oleh, r.tanggal,
      ].join(' ').toLowerCase();
      return teks.includes(k);
    });
  };

  const gambarTabel = () => {
    const data = saring();
    const tampil = data.slice(0, batasTampil);
    const nKunci = semuaAcc.filter((r) => r._terkunci).length;
    kosongkan(tempatTabel).append(tabel([
      { l: 'Jenis', k: '_label' },
      { l: 'Tanggal', nilai: (r) => ftanggal(r.tanggal) },
      { l: 'Pekerja', nilai: (r) => D.labelRef('employees', r.employee_id) },
      { l: 'Divisi', nilai: (r) => D.labelRef('divisions', r.division_id) },
      { l: 'Jumlah', nilai: jumlahPersetujuan },
      { l: 'Hasil kerja / keterangan', nilai: (r) => r.keterangan_manual || r.catatan || '–' },
      { l: 'Nilai (Rp)', k: 'nominal', jenis: 'uang', total: true },
      { l: 'Di-acc oleh', nilai: (r) => el('span', {}, [r._oleh || '–',
        r._waktu ? el('div.bantuan', { style: 'font-size:.74rem', teks: String(r._waktu).slice(0, 16) }) : null]) },
      ...(bolehBatal && bisaEdit() ? [{
        l: '', nilai: (r) => (r._terkunci
          ? el('span.bantuan', { teks: 'terkunci' })
          : el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: 'Batalkan',
            onclick: async (ev) => {
              ev.stopPropagation();
              const lanjut = await tanya('Batalkan persetujuan?',
                `${r._label} ${rupiahPenuh(r.nominal)} atas nama ${D.labelRef('employees', r.employee_id)} `
                + 'kembali jadi menunggu dan tidak dihitung di laporan sampai di-acc lagi.',
                { ya: 'Batalkan', bahaya: true });
              if (!lanjut) return;
              D.batalkan(r._tabel, r.id, D.namaPengisi() || 'Web');
              pesan('Persetujuan dibatalkan — kembali menunggu. Jangan lupa Simpan.', 'sukses', 6);
              muatUlang();
            },
          })),
      }] : []),
    ], tampil, { kosong: 'Tidak ada acc yang cocok dengan filter/pencarian ini.' }));
    kosongkan(tempatInfo);
    taruh(tempatInfo,
      `${data.length} acc${ikutTerkunci ? '' : ' (periode berjalan — belum tutup buku)'}`
      + (data.length > batasTampil ? ` · menampilkan ${batasTampil} teratas ` : ''),
      data.length > batasTampil ? el('button.tombol-teks', {
        type: 'button', teks: 'tampilkan semua', style: 'font-size:.82rem',
        onclick: () => { batasTampil = Infinity; gambarTabel(); },
      }) : null,
      !ikutTerkunci && nKunci ? ` · ${nKunci} acc di periode yang sudah tutup buku disembunyikan` : null,
    );
  };

  const hasil = el('div.lembar', { style: 'margin-top:1.4rem' }, [
    el('div.lembar-kepala', {}, [el('h2', { teks: 'Sudah disetujui' })]),
    el('div.lembar-isi', {}, [
      el('p.bantuan', {
        teks: (bolehBatal
          ? 'Kalau ada yang telanjur di-acc padahal keliru, klik Batalkan — statusnya kembali '
            + 'menunggu dan langsung keluar dari hitungan laporan. Tercatat siapa yang membatalkan. '
          : 'Hanya pengguna dengan hak "Batalkan persetujuan" yang bisa membatalkan dari sini. ')
          + 'Daftar ini menampilkan SEMUA acc pada periode yang belum tutup buku, '
          + 'urut tanggal transaksi terbaru.',
      }),
      el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.4rem 0 .7rem' }, [
        cari, pilihJenis, pilihDivisi,
        el('label', { style: 'display:flex;gap:.35rem;align-items:center;font-size:.85rem' }, [
          cekTerkunci, 'ikut periode terkunci',
        ]),
      ]),
      tempatTabel,
      tempatInfo,
    ]),
  ]);
  gambarTabel();
  return hasil;
}

export function halamanPersetujuan({ gambar, bisaEdit, hak }) {
  // hak datang dari app.js supaya kebun.js tidak perlu mengimpor pengguna.js
  // (pengguna.js sudah mengimpor kebun.js — kalau dibalik jadi melingkar)
  const bolehSetuju = hak?.setuju || (() => true);
  const divisiBoleh = hak?.divisi || (() => null);
  const wadah = el('section');
  const tempat = el('div');
  const sudahPin = new Set();   // divisi yang PIN-nya sudah dimasukkan di sesi ini
  const dateState=approvalSelection(D.state.data,'payroll:'+JSON.stringify(divisiBoleh()));
  let focusDate=dateState.selected||null;
  const tanggalAcc = dateState.perDivision; // cegah acc massal lintas tanggal

  const gambarIsi = () => {
    const menunggu = [];
    for (const [namaTabel, label] of [['lembur_transactions', 'Lembur'], ['premi_transactions', 'Premi']]) {
      const boleh = divisiBoleh();
      for (const r of D.baris(namaTabel)) {
        if (r.deleted_at) continue;
        if (!D.menungguPersetujuan(namaTabel, r.id)) continue;
        // kepala divisi hanya disuguhi antrean divisinya sendiri
        if (boleh !== null && r.division_id != null && !boleh.includes(Number(r.division_id))) continue;
        menunggu.push({ ...r, _tabel: namaTabel, _label: label });
      }
    }
    menunggu.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));

    const perDivisi = new Map();
    for (const r of menunggu) {
      const k = Number(r.division_id) || 0;
      if (!perDivisi.has(k)) perDivisi.set(k, []);
      perDivisi.get(k).push(r);
    }

    kosongkan(tempat);
    tempat.append(approvalDateNotice(menunggu,date=>{focusDate=date;dateState.selected=date;for(const id of perDivisi.keys())tanggalAcc.set(id,date);gambarIsi();},{keyOf:kunciGrupAcc,selected:focusDate}));
    const diputuskan = () => taruh(tempat,
      bagianDiputuskan({ bisaEdit, hak, muatUlang: () => { gambarIsi(); gambar(); } }));
    if(focusDate&&!menunggu.some(r=>r.tanggal===focusDate)){
      tempat.append(el('div.lembar',{},[el('div.lembar-kepala',{},[el('h2',{teks:'Persetujuan · '+ftanggal(focusDate)})]),el('div.lembar-isi',{},[el('p',{teks:'Tidak ada lembur atau premi yang menunggu pada tanggal ini. Tanggal tetap dipertahankan; pilih tanggal lain melalui tombol di atas.'})])]));
      diputuskan();return;
    }
    if (!menunggu.length) {
      tempat.append(el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Tidak ada yang menunggu' })]),
        el('div.lembar-isi', {}, [
          el('p', { teks: 'Semua lembur dan premi sudah diputuskan. Yang baru diinput akan muncul di sini.' }),
        ]),
      ]));
      diputuskan();
      return;
    }

    // Satu lembur/premi yang dibagi ke banyak blok muncul sebagai beberapa
    // baris. Di antrean ini dijadikan SATU baris (total semua bloknya) supaya
    // kepala kebun tidak dibanjiri; keputusannya berlaku untuk segrupnya.
    const kelompokkan = (daftar) => {
      const peta = new Map();
      for (const r of daftar) {
        const kunci = kunciGrupAcc(r);
        if (!peta.has(kunci)) peta.set(kunci, { ...r, _anggota: [r], _blok: new Set() });
        else {
          const g = peta.get(kunci);
          g._anggota.push(r);
          g.qty = (Number(g.qty) || 0) + (Number(r.qty) || 0);
          g.nominal = (Number(g.nominal) || 0) + (Number(r.nominal) || 0);
        }
        if (r.block_id) peta.get(kunci)._blok.add(Number(r.block_id));
      }
      return [...peta.values()];
    };

    for (const [divId, daftarAsli] of perDivisi) {
      if(focusDate&&!daftarAsli.some(r=>r.tanggal===focusDate))continue;
      const semua = kelompokkan(daftarAsli);
      const daftarTanggal = [...new Set(semua.map((r) => r.tanggal))].sort();
      const tanggalDipilih = focusDate || (daftarTanggal.includes(tanggalAcc.get(divId))
        ? tanggalAcc.get(divId) : daftarTanggal[0]);
      tanggalAcc.set(divId, tanggalDipilih);
      const daftar = semua.filter((r) => r.tanggal === tanggalDipilih);
      const divisi = divId ? D.labelRef('divisions', divId) : '(tanpa divisi)';
      const kepala = D.web().kebun?.[divId]?.kepala || '';
      const nilai = daftar.reduce((n, r) => n + (Number(r.nominal) || 0), 0);
      const nilaiSemua = semua.reduce((n, r) => n + (Number(r.nominal) || 0), 0);

      const putuskan = async (baris, setuju) => {
        if (!bisaEdit()) {
          pesan('Aktifkan mode edit dulu untuk menyetujui.', 'awas', 6);
          return;
        }
        if (!bolehSetuju()) {
          pesan('Anda tidak diberi hak menyetujui lembur & premi.', 'awas', 6);
          return;
        }
        const boleh = divisiBoleh();
        if (boleh !== null && divId != null && !boleh.includes(Number(divId))) {
          pesan(`Anda tidak diberi hak atas divisi ${divisi}.`, 'awas', 6);
          return;
        }
        if (!sudahPin.has(divId) && D.web().kebun?.[divId]?.pin) {
          const ok = await mintaPin(`PIN kepala kebun ${divisi}`,
            'Hanya kepala kebun divisi ini yang boleh memutuskan lembur & premi.',
            (pin) => periksaPinKebun(divId, pin));
          if (!ok) return;
          sudahPin.add(divId);
        }
        const daftarPutus = baris ? (baris._anggota || [baris]) : daftar.flatMap((x) => x._anggota || [x]);
        let alasan = '';
        if (!setuju) {
          alasan = await mintaTeks(
            baris ? `Tolak ${baris._label.toLowerCase()} ini?` : `Tolak ${daftar.length} catatan pada ${ftanggal(tanggalDipilih)}?`,
            'Alasan penolakan akan tersimpan di riwayat agar koreksinya jelas.',
            { label: 'Alasan penolakan', ya: 'Tolak', wajib: true });
          if (alasan == null) return;
        } else if (!baris) {
          const lanjut = await tanya(
            `Setujui ${daftar.length} catatan pada ${ftanggal(tanggalDipilih)}?`,
            `Total ${rupiahPenuh(nilai)} akan masuk hitungan biaya ${divisi}.`,
            { ya: 'Setujui tanggal ini' });
          if (!lanjut) return;
        }
        focusDate=tanggalDipilih;dateState.selected=tanggalDipilih;tanggalAcc.set(divId,tanggalDipilih);
        for (const r of daftarPutus) {
          if (setuju) D.setujui(r._tabel, r.id, kepala || D.namaPengisi() || 'Kepala kebun');
          else D.tolak(r._tabel, r.id, kepala || D.namaPengisi() || 'Kepala kebun', alasan);
        }
        pesan(setuju
          ? `${daftarPutus.length} baris disetujui. Jangan lupa Simpan ke GitHub.`
          : `${daftarPutus.length} baris ditolak dan dihapus. Jangan lupa Simpan.`, 'sukses', 7);
        gambarIsi();
        gambar();
      };

      tempat.append(el('div.lembar', { style: 'margin-bottom:1.4rem' }, [
        el('div.lembar-kepala', {}, [
          el('h2', { teks: divisi }),
          kepala ? el('span.lencana-mode', { teks: `Kepala: ${kepala}` }) : null,
          pilihan(daftarTanggal.map((x) => ({ nilai: x, label: ftanggal(x) })), tanggalDipilih, {
            kosongLabel: null,
            saatUbah: (ev) => { focusDate=ev.target.value;dateState.selected=focusDate;for(const id of perDivisi.keys())tanggalAcc.set(id,focusDate);gambarIsi(); },
          }),
          el('span.status-sinkron', {
            teks: `${daftar.length} tanggal ini · ${rupiahPenuh(nilai)} (total antrean ${semua.length} · ${rupiahPenuh(nilaiSemua)})`,
          }),
          el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: 'Tolak tanggal ini', onclick: () => putuskan(null, false),
          }),
          el('button.tombol-utama.tombol-kecil', {
            type: 'button', teks: 'Setujui tanggal ini', onclick: () => putuskan(null, true),
          }),
        ]),
        el('div.lembar-isi', {}, [
          tabel([
            { l: 'Jenis', k: '_label' },
            { l: 'Tanggal', k: 'tanggal', jenis: 'tanggal' },
            { l: 'Pekerja', nilai: (r) => D.labelRef('employees', r.employee_id) },
            { l: 'Blok', nilai: (r) => (r._blok?.size > 1
              ? `${r._blok.size} blok (dibagi)`
              : (r.block_id ? D.labelBlokPada(r.block_id, r.tanggal) : '–')) },
            { l: 'Jumlah', nilai: jumlahPersetujuan },
            { l: 'Hasil kerja / keterangan', nilai: (r) => r.keterangan_manual || r.catatan || '–' },
            { l: 'Nilai (Rp)', k: 'nominal', jenis: 'uang', total: true },
            {
              l: '',
              nilai: (r) => el('span', { style: 'display:flex;gap:.3rem' }, [
                el('button.tombol-kecil', {
                  type: 'button', teks: 'Setujui',
                  onclick: (ev) => { ev.stopPropagation(); putuskan(r, true); },
                }),
                el('button.tombol-kecil.tombol-bahaya', {
                  type: 'button', teks: 'Tolak',
                  onclick: (ev) => { ev.stopPropagation(); putuskan(r, false); },
                }),
              ]),
            },
          ], daftar, { kosong: '—' }),
        ]),
      ]));
    }
    diputuskan();
  };

  wadah.append(
    el('div.petunjuk', {}, [
      el('p', { teks: 'Lembur dan premi yang baru diinput menunggu persetujuan kepala kebun masing-masing. '
        + 'Selama belum disetujui, nilainya TIDAK dihitung di laporan biaya kebun.' }),
      el('p', { teks: 'Data lembur & premi lama (sebelum fitur ini) dianggap sudah disetujui, '
        + 'jadi laporan bulan-bulan sebelumnya tetap utuh.' }),
    ]),
    tempat,
  );
  gambarIsi();
  return wadah;
}

/** Jumlah baris yang menunggu — dipakai menu untuk menampilkan lencana angka. */
/**
 * Kunci pengelompokan antrean persetujuan: satu lembur/premi yang HK-nya
 * dibagi ke beberapa blok tersimpan sebagai beberapa baris, tapi hanya butuh
 * SATU keputusan. Dipakai bersama oleh halaman Persetujuan dan angka
 * lencananya supaya dua-duanya menghitung hal yang sama.
 */
const kunciGrupAcc = (r) => [r._tabel, r.employee_id, r.tanggal,
  r.wage_component_id, r.keterangan_manual || ''].join('|');

/**
 * Angka di lencana menu Persetujuan.
 *
 * HARUS memakai saringan divisi yang sama dengan halamannya — kalau tidak,
 * kepala divisi Infra melihat lencana "1" padahal antreannya kosong karena
 * yang menunggu itu milik divisi Pisang.
 *
 * `divisiBoleh` dikirim app.js (null = admin, lihat semua).
 */
export function jumlahMenunggu(divisiBoleh = null) {
  const boleh = typeof divisiBoleh === 'function' ? divisiBoleh() : divisiBoleh;
  const grup = new Set();
  for (const t of ['lembur_transactions', 'premi_transactions']) {
    for (const r of D.baris(t)) {
      if (r.deleted_at || !D.menungguPersetujuan(t, r.id)) continue;
      if (boleh !== null && r.division_id != null && !boleh.includes(Number(r.division_id))) continue;
      // satu lembur yang dibagi ke 9 blok = 9 baris data, tapi hanya SATU
      // keputusan — hitung grupnya, bukan barisnya
      grup.add(kunciGrupAcc({ ...r, _tabel: t }));
    }
  }
  return grup.size;
}
