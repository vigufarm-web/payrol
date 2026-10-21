// impor.js — memasukkan data harian dari berkas Excel.
//
// Alur: unduh template → isi di Excel → upload di sini → lihat pratinjau
// (baris mana yang benar, baris mana yang bermasalah beserta alasannya) →
// baru dimasukkan ke data.
//
// Aturan pemeriksaannya sama persis dengan input manual, supaya data yang
// masuk lewat Excel tidak kalah rapi.

import * as D from './data.js';
import { bacaExcel, bisaBacaExcel } from './xlsx.js';
import { JENIS_SERVIS, pakaiHm, pakaiKm } from './skema-alat.js';
import { sebarHk, totalHkGrup } from './input-alat.js';
import {
  el, tabel, kosongkan, taruh, pesan, tanya, rupiah, angka, hk as fhk,
  tanggal as ftanggal,
} from './ui.js';

// ------------------------------------------------------------- bantu baca
/** Angka dari teks Excel: "1,5" dan "1.000,5" ikut dimengerti. */
export function angkaDari(teks) {
  if (teks == null || teks === '') return null;
  if (typeof teks === 'number') return teks;
  let s = String(teks).trim().replace(/\s|Rp/gi, '');
  if (s === '') return null;
  const adaTitik = s.includes('.');
  const adaKoma = s.includes(',');
  if (adaTitik && adaKoma) {
    // "1.234,5" -> titik ribuan, koma desimal
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (adaKoma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const duaDigit = (n) => String(n).padStart(2, '0');

/** Tanggal dari teks Excel: 2026-10-20, 20/10/2026, 20-10-2026, atau angka seri. */
export function tanggalDari(teks) {
  if (teks == null || teks === '') return null;
  const s = String(teks).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${duaDigit(+m[2])}-${duaDigit(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${duaDigit(+m[2])}-${duaDigit(+m[1])}`;
  // angka seri Excel (kalau selnya tidak diberi format tanggal)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const d = new Date(Math.round((n - 25569) * 86400000));
      if (!Number.isNaN(d.getTime())) {
        return `${d.getUTCFullYear()}-${duaDigit(d.getUTCMonth() + 1)}-${duaDigit(d.getUTCDate())}`;
      }
    }
  }
  return null;
}

const rapi = (x) => String(x ?? '').trim();

/** "P05, P06a + P07a" → ['P05','P06a','P07a'] — pemisah: koma, titik koma, plus, garis miring, enter. */
const pecahDaftar = (x) => rapi(x).split(/[,;+/\n]/).map((s) => s.trim()).filter(Boolean);
const samakan = (x) => rapi(x).toLowerCase().replace(/\s+/g, ' ');

/** Cari satu baris master berdasarkan nama/kode. Kembalikan baris atau null. */
function cocokkan(namaTabel, nilai, ambilLabel) {
  const q = samakan(nilai);
  if (!q) return null;
  const semua = D.baris(namaTabel);
  return semua.find((r) => samakan(ambilLabel(r)) === q) || null;
}

/** Saran "mungkin maksud Anda" untuk nilai yang tidak ketemu. */
function saran(namaTabel, nilai, ambilLabel, batas = 2) {
  const q = samakan(nilai);
  if (!q) return [];
  return D.baris(namaTabel)
    .map(ambilLabel)
    .filter((l) => {
      const s = samakan(l);
      return s.includes(q) || q.includes(s);
    })
    .slice(0, batas);
}

const tanpaSaran = (daftar) => (daftar.length ? ` Mungkin maksudnya: ${daftar.join(' / ')}.` : '');

// =====================================================================
// Definisi tiap jenis impor
// =====================================================================
const JENIS = {
  hk: {
    label: 'HK harian',
    aplikasi: 'PayrollHK',
    template: 'templates/Template_HK_Harian.xlsx',
    tabel: 'daily_payroll',
    kolom: ['Tanggal', 'NIK', 'Nama pekerja', 'Divisi', 'Blok', 'Bagi HK', 'Kegiatan',
      'Jenis pekerjaan', 'HK', 'Keterangan pekerjaan', 'Catatan',
      'Lembur jam', 'Lembur tarif', 'Lembur keterangan',
      'Premi jumlah', 'Premi tarif', 'Premi keterangan'],
    wajib: ['Tanggal', 'Divisi', 'Blok', 'Kegiatan', 'Jenis pekerjaan', 'HK'],
    ringkas: (b) => [
      { l: 'Tanggal', nilai: (r) => ftanggal(r.isi.tanggal) },
      { l: 'Pekerja', nilai: (r) => D.labelRef('employees', r.isi.employee_id) },
      { l: 'Blok', nilai: (r) => D.labelRef('blocks', r.isi.block_id) },
      { l: 'Bagi', nilai: (r) => r.bagi || '–' },
      { l: 'Jenis', nilai: (r) => D.labelRef('job_types', r.isi.job_type_id) },
      // nilai mentah — pemformatannya diurus oleh jenis:'hk' di tabel()
      { l: 'HK', nilai: (r) => r.isi.hk, jenis: 'hk', total: true },
      { l: 'Upah (Rp)', nilai: (r) => r.isi.nominal, jenis: 'uang', total: true },
      { l: 'Lembur (Rp)', nilai: (r) => r.lembur?.nominal || 0, jenis: 'uang', total: true },
      { l: 'Premi (Rp)', nilai: (r) => r.premi?.nominal || 0, jenis: 'uang', total: true },
    ],
    periksa(baris, sudahMasuk, petaLintas = []) {
      const salah = [];
      const peringatan = [];      // boleh masuk, tapi perlu dilihat admin
      const tgl = tanggalDari(baris.Tanggal);
      if (!tgl) salah.push(`Tanggal "${rapi(baris.Tanggal)}" tidak dikenali. Pakai bentuk 2026-10-20.`);
      else if (D.periodeTerkunci(tgl)) salah.push(`Periode ${ftanggal(tgl)} sudah dikunci di aplikasi desktop.`);

      let pekerja = null;
      if (rapi(baris.NIK)) {
        pekerja = cocokkan('employees', baris.NIK, (r) => r.nik);
        if (!pekerja) salah.push(`NIK "${rapi(baris.NIK)}" tidak ada di master karyawan.`);
      }
      if (!pekerja && rapi(baris['Nama pekerja'])) {
        pekerja = cocokkan('employees', baris['Nama pekerja'], (r) => r.nama);
        if (!pekerja) {
          salah.push(`Nama "${rapi(baris['Nama pekerja'])}" tidak ada di master karyawan.`
            + tanpaSaran(saran('employees', baris['Nama pekerja'], (r) => r.nama)));
        }
      }
      if (!pekerja && !rapi(baris.NIK) && !rapi(baris['Nama pekerja'])) {
        salah.push('NIK dan Nama pekerja dua-duanya kosong — isi salah satu.');
      }
      if (pekerja && !D.barisAktif(pekerja)) salah.push(`Pekerja "${pekerja.nama}" berstatus Tidak Aktif.`);

      const divisi = cocokkan('divisions', baris.Divisi, (r) => r.nama_divisi);
      if (rapi(baris.Divisi) && !divisi) {
        salah.push(`Divisi "${rapi(baris.Divisi)}" tidak ada.`
          + tanpaSaran(saran('divisions', baris.Divisi, (r) => r.nama_divisi)));
      }
      // kolom wajib yang dikosongkan: ditolak baik-baik, jangan sampai
      // bikin seluruh proses impor berhenti
      for (const k of ['Divisi', 'Blok', 'Kegiatan', 'Jenis pekerjaan']) {
        if (!rapi(baris[k])) salah.push(`Kolom "${k}" masih kosong.`);
      }

      // Kolom Blok boleh berisi beberapa blok sekaligus: "P05, P06a, P07a".
      const namaBlok = pecahDaftar(baris.Blok);
      const blokList = [];
      for (const nama of namaBlok) {
        const b = cocokkan('blocks', nama, (r) => r.nama_blok);
        if (!b) {
          salah.push(`Blok "${nama}" tidak ada.` + tanpaSaran(saran('blocks', nama, (r) => r.nama_blok)));
          continue;
        }
        if (blokList.some((x) => Number(x.id) === Number(b.id))) {
          salah.push(`Blok "${b.nama_blok}" ditulis dua kali di baris yang sama.`);
          continue;
        }
        if (divisi && Number(b.division_id) !== Number(divisi.id)) {
          salah.push(`Blok "${b.nama_blok}" bukan bagian dari divisi "${divisi.nama_divisi}" `
            + `(blok itu ada di "${D.labelRef('divisions', b.division_id)}").`);
          continue;
        }
        blokList.push(b);
      }
      const blok = blokList[0] || null;

      const caraBagi = /rata/i.test(rapi(baris['Bagi HK'])) ? 'rata' : 'luas';
      const kegiatan = cocokkan('activities', baris.Kegiatan, (r) => r.nama_kegiatan);
      if (rapi(baris.Kegiatan) && !kegiatan) {
        salah.push(`Kegiatan "${rapi(baris.Kegiatan)}" tidak ada.`
          + tanpaSaran(saran('activities', baris.Kegiatan, (r) => r.nama_kegiatan)));
      }
      const jenis = cocokkan('job_types', baris['Jenis pekerjaan'], (r) => r.nama_jenis);
      if (rapi(baris['Jenis pekerjaan']) && !jenis) {
        salah.push(`Jenis pekerjaan "${rapi(baris['Jenis pekerjaan'])}" tidak ada.`
          + tanpaSaran(saran('job_types', baris['Jenis pekerjaan'], (r) => r.nama_jenis)));
      }
      if (jenis && kegiatan && Number(jenis.activity_id) !== Number(kegiatan.id)) {
        salah.push(`Jenis "${jenis.nama_jenis}" bukan bagian dari kegiatan "${kegiatan.nama_kegiatan}".`);
      }

      const nilaiHk = angkaDari(baris.HK);
      if (nilaiHk == null) salah.push(`HK "${rapi(baris.HK)}" bukan angka.`);
      else if (!(nilaiHk > 0)) salah.push('HK harus lebih dari 0.');

      if (pekerja && tgl && nilaiHk > 0) {
        const kunci = `${pekerja.id}|${tgl}`;
        const dariBerkas = sudahMasuk.get(kunci) || 0;
        // Pisahkan per divisi: dobel di divisi yang SAMA ditolak, sedangkan
        // orang yang memang kerja di DUA divisi pada hari itu hanya
        // diperingatkan (aturannya sama dengan form HK di layar).
        const perDiv = D.hkHariPerDivisi(pekerja.id, tgl);
        const divIni = divisi ? Number(divisi.id) : 0;
        const diSini = (perDiv.get(divIni) || 0) + dariBerkas;
        const lainDiv = [...perDiv.entries()].filter(([d]) => d !== divIni);
        const hkLain = lainDiv.reduce((n, [, v]) => n + v, 0);
        const total = diSini + hkLain + nilaiHk;
        const lintas = D.hkLintas(petaLintas, pekerja, tgl);
        if (diSini + nilaiHk > D.maksHkPerHari() + 1e-9) {
          salah.push(`Total HK ${pekerja.nama} di divisi ini pada ${ftanggal(tgl)} jadi `
            + `${fhk(diSini + nilaiHk)}, melebihi batas ${fhk(D.maksHkPerHari())} per hari.`);
        } else if (total > D.maksHkPerHari() + 1e-9) {
          peringatan.push(`${pekerja.nama} sudah tercatat `
            + lainDiv.map(([d, v]) => `${fhk(v)} HK di ${d ? D.labelRef('divisions', d) : '(tanpa divisi)'}`).join(', ')
            + ` pada ${ftanggal(tgl)} — dengan baris ini totalnya ${fhk(total)}. `
            + 'Pastikan memang kerja di dua divisi hari itu.');
          sudahMasuk.set(kunci, dariBerkas + nilaiHk);
        } else if (lintas && lintas.hk + total > D.maksHkPerHari() + 1e-9) {
          salah.push(`${pekerja.nama} sudah tercatat ${fhk(lintas.hk)} HK pada ${ftanggal(tgl)} `
            + `di bagian ${lintas.bagian} — baris ini membuatnya dobel antar divisi.`);
        } else {
          sudahMasuk.set(kunci, dariBerkas + nilaiHk);
        }
      }

      // ---- lembur & premi opsional pada baris yang sama
      const tambahan = {};
      for (const [awalan, kategori, satuan] of [
        ['Lembur', 'Lembur', 'jam'], ['Premi', 'Premi', 'satuan'],
      ]) {
        const kolomJumlah = awalan === 'Lembur' ? 'Lembur jam' : 'Premi jumlah';
        const qty = angkaDari(baris[kolomJumlah]);
        const tarifT = angkaDari(baris[`${awalan} tarif`]);
        if (qty == null && tarifT == null) continue;
        if (!(qty > 0)) { salah.push(`${awalan}: jumlahnya harus lebih dari 0.`); continue; }
        if (!(tarifT > 0)) { salah.push(`${awalan}: tarifnya harus diisi.`); continue; }
        const komponen = D.aktif('wage_components')
          .filter((r) => r.kategori === kategori)
          .find((r) => /manual/i.test(r.nama_komponen))
          || D.aktif('wage_components').find((r) => r.kategori === kategori);
        if (!komponen) { salah.push(`Master Komponen Upah belum punya komponen ${kategori}.`); continue; }
        tambahan[kategori.toLowerCase()] = {
          wage_component_id: komponen.id,
          qty,
          satuan,
          tarif_snapshot: tarifT,
          nominal: Math.round(qty * tarifT),
          keterangan_manual: rapi(baris[`${awalan} keterangan`]),
        };
      }

      if (salah.length) return { salah };
      const tarif = Number(pekerja.tarif_hk) || 0;

      // Satu baris Excel bisa jadi beberapa baris data kalau bloknya lebih
      // dari satu. HK dibagi sesuai luas tiap blok (atau rata), dan jumlah
      // seluruh pecahannya tetap persis sama dengan HK yang diketik.
      const { bagian, cara, tanpaLuas } = D.bagiHkPerBlok(
        blokList.map((b) => b.id), nilaiHk, caraBagi);

      const pecah = [];
      blokList.forEach((b, i) => {
        const porsi = bagian[i];
        if (!(porsi > 0)) return;
        pecah.push({
          // lembur & premi hanya ditempelkan sekali, di blok pertama,
          // supaya tidak terhitung berkali-kali
          ...(pecah.length === 0 ? tambahan : {}),
          bagi: blokList.length === 1 ? '–'
            : (cara === 'luas' ? 'luas' : (tanpaLuas.length ? 'rata (luas kosong)' : 'rata')),
          isi: {
            tanggal: tgl,
            employee_id: pekerja.id,
            division_id: divisi.id,
            block_id: b.id,
            activity_id: kegiatan.id,
            job_type_id: jenis.id,
            job: rapi(baris['Keterangan pekerjaan']),
            hk: porsi,
            tarif_hk_snapshot: tarif,
            nominal: Math.round(porsi * tarif),
            catatan: rapi(baris.Catatan),
          },
        });
      });
      return { pecah, peringatan };
    },
    masukkan(daftar) {
      for (const r of daftar) {
        D.tambah('daily_payroll', {
          ...r.isi,
          nomor_transaksi: D.nomorBaru('daily_payroll', 'HK', r.isi.tanggal),
          created_by: D.namaPengisi() || 'Impor Excel',
        });
        for (const [kunci, namaTabel, prefix] of [
          ['lembur', 'lembur_transactions', 'LM'],
          ['premi', 'premi_transactions', 'PR'],
        ]) {
          if (!r[kunci]) continue;
          const baru = D.tambah(namaTabel, {
            ...r[kunci],
            tanggal: r.isi.tanggal,
            employee_id: r.isi.employee_id,
            division_id: r.isi.division_id,
            block_id: r.isi.block_id,
            catatan: '',
            nomor_transaksi: D.nomorBaru(namaTabel, prefix, r.isi.tanggal),
            created_by: D.namaPengisi() || 'Impor Excel',
          });
          D.tandaiMenunggu(namaTabel, baru.id);
        }
      }
    },
  },

  log: {
    label: 'Log harian unit',
    aplikasi: 'AlatBerat',
    template: 'templates/Template_Log_Harian_Alat.xlsx',
    tabel: 'work_logs',
    kolom: ['Tanggal', 'Unit', 'Operator', 'HM awal', 'HM akhir', 'KM awal', 'KM akhir',
      'Ritase', 'Total HK hari ini', 'Kegiatan', 'Lokasi', 'Premi', 'Catatan'],
    wajib: ['Tanggal', 'Unit', 'Operator'],
    ringkas: () => [
      { l: 'Tanggal', nilai: (r) => ftanggal(r.isi.tanggal) },
      { l: 'Unit', nilai: (r) => D.labelRef('units', r.isi.unit_id) },
      { l: 'Operator', nilai: (r) => D.labelRef('operators', r.isi.operator_id) },
      { l: 'HM', nilai: (r) => r.isi.hm_akhir - r.isi.hm_awal, jenis: 'angka', pecahan: 1, total: true },
      { l: 'KM', nilai: (r) => r.isi.km_akhir - r.isi.km_awal, jenis: 'angka', pecahan: 1, total: true },
      { l: 'Lokasi', nilai: (r) => r.isi.lokasi || '–' },
    ],
    periksa(baris) {
      const salah = [];
      const tgl = tanggalDari(baris.Tanggal);
      if (!tgl) salah.push(`Tanggal "${rapi(baris.Tanggal)}" tidak dikenali. Pakai bentuk 2026-10-20.`);

      const unit = cocokkan('units', baris.Unit, (r) => r.kode);
      if (!unit) {
        salah.push(`Unit "${rapi(baris.Unit)}" tidak ada di master unit.`
          + tanpaSaran(saran('units', baris.Unit, (r) => r.kode)));
      } else if (!D.barisAktif(unit)) salah.push(`Unit "${unit.kode}" berstatus tidak aktif.`);

      const operator = cocokkan('operators', baris.Operator, (r) => r.nama);
      if (!operator) {
        salah.push(`Operator "${rapi(baris.Operator)}" tidak ada di master operator.`
          + tanpaSaran(saran('operators', baris.Operator, (r) => r.nama)));
      }

      const hmA = angkaDari(baris['HM awal']) ?? 0;
      const hmB = angkaDari(baris['HM akhir']) ?? 0;
      const kmA = angkaDari(baris['KM awal']) ?? 0;
      const kmB = angkaDari(baris['KM akhir']) ?? 0;
      if (hmB && hmB < hmA) salah.push(`HM akhir (${angka(hmB, 1)}) lebih kecil dari HM awal (${angka(hmA, 1)}).`);
      if (kmB && kmB < kmA) salah.push(`KM akhir (${angka(kmB, 1)}) lebih kecil dari KM awal (${angka(kmA, 1)}).`);
      if (unit && pakaiHm(unit) && !pakaiKm(unit) && (kmA || kmB)) {
        salah.push(`Unit ${unit.kode} memakai meter HM, tapi barisnya diisi KM.`);
      }
      if (unit && pakaiKm(unit) && !pakaiHm(unit) && (hmA || hmB)) {
        salah.push(`Unit ${unit.kode} memakai meter KM, tapi barisnya diisi HM.`);
      }

      const totalHk = angkaDari(baris['Total HK hari ini']);
      if (totalHk != null && (totalHk <= 0 || totalHk > 1)) {
        salah.push('Total HK hari ini harus antara 0 dan 1.');
      }

      if (salah.length) return { salah };
      return {
        isi: {
          tanggal: tgl,
          unit_id: unit.id,
          operator_id: operator.id,
          hm_awal: pakaiHm(unit) ? hmA : 0,
          hm_akhir: pakaiHm(unit) ? hmB : 0,
          km_awal: pakaiKm(unit) ? kmA : 0,
          km_akhir: pakaiKm(unit) ? kmB : 0,
          // ritase berlaku untuk kendaraan angkut umumnya (DT, Triton, Carry)
          ritase: (pakaiKm(unit) || unit.kategori === 'DUMP TRUCK') ? (angkaDari(baris.Ritase) ?? 0) : 0,
          kegiatan: rapi(baris.Kegiatan),
          lokasi: rapi(baris.Lokasi),
          premi: angkaDari(baris.Premi) ?? 0,
          catatan: rapi(baris.Catatan),
          hk: 0,
        },
        totalHk: totalHk == null ? 1 : totalHk,
      };
    },
    masukkan(daftar) {
      for (const r of daftar) {
        const baru = D.tambah('work_logs', r.isi);
        D.tandaiMenunggu('work_logs', baru.id);   // menunggu acc kepala divisi
      }
      // HK dibagi ulang per operator per tanggal, sama seperti input manual
      const grup = new Map();
      for (const r of daftar) grup.set(`${r.isi.operator_id}|${r.isi.tanggal}`, r.totalHk);
      for (const [kunci, total] of grup) {
        const [op, tgl] = kunci.split('|');
        sebarHk(Number(op), tgl, Math.min(1, total || totalHkGrup(Number(op), tgl) || 1));
      }
    },
  },

  solar: {
    label: 'Isi solar',
    aplikasi: 'AlatBerat',
    template: 'templates/Template_Isi_Solar.xlsx',
    tabel: 'fuel_logs',
    kolom: ['Tanggal', 'Unit', 'Operator', 'Liter', 'Harga per liter',
      'Posisi HM', 'Posisi KM', 'Tempat pengisian', 'Catatan'],
    wajib: ['Tanggal', 'Unit', 'Liter'],
    ringkas: () => [
      { l: 'Tanggal', nilai: (r) => ftanggal(r.isi.tanggal) },
      { l: 'Unit', nilai: (r) => D.labelRef('units', r.isi.unit_id) },
      { l: 'Liter', nilai: (r) => r.isi.liter, jenis: 'angka', pecahan: 1, total: true },
      { l: 'Harga/liter', nilai: (r) => r.isi.harga_liter, jenis: 'uang' },
      { l: 'Biaya (Rp)', nilai: (r) => r.isi.liter * r.isi.harga_liter, jenis: 'uang', total: true },
    ],
    periksa(baris) {
      const salah = [];
      const tgl = tanggalDari(baris.Tanggal);
      if (!tgl) salah.push(`Tanggal "${rapi(baris.Tanggal)}" tidak dikenali.`);
      const unit = cocokkan('units', baris.Unit, (r) => r.kode);
      if (!unit) {
        salah.push(`Unit "${rapi(baris.Unit)}" tidak ada.`
          + tanpaSaran(saran('units', baris.Unit, (r) => r.kode)));
      }
      const operator = rapi(baris.Operator)
        ? cocokkan('operators', baris.Operator, (r) => r.nama) : null;
      if (rapi(baris.Operator) && !operator) {
        salah.push(`Operator "${rapi(baris.Operator)}" tidak ada.`);
      }
      const liter = angkaDari(baris.Liter);
      if (liter == null || !(liter > 0)) salah.push(`Liter "${rapi(baris.Liter)}" harus angka lebih dari 0.`);
      const harga = angkaDari(baris['Harga per liter']) ?? 0;
      if (harga < 0) salah.push('Harga per liter tidak boleh minus.');
      if (salah.length) return { salah };
      return {
        isi: {
          tanggal: tgl,
          unit_id: unit.id,
          operator_id: operator ? operator.id : null,
          liter,
          harga_liter: harga,
          hm: angkaDari(baris['Posisi HM']) ?? 0,
          km: angkaDari(baris['Posisi KM']) ?? 0,
          lokasi: rapi(baris['Tempat pengisian']),
          catatan: rapi(baris.Catatan),
        },
      };
    },
    masukkan(daftar) { for (const r of daftar) D.tambah('fuel_logs', r.isi); },
  },

  servis: {
    label: 'Servis unit',
    aplikasi: 'AlatBerat',
    template: 'templates/Template_Servis_Unit.xlsx',
    tabel: 'service_logs',
    kolom: ['Tanggal', 'Unit', 'Jenis servis', 'Deskripsi', 'Biaya',
      'Posisi HM', 'Posisi KM', 'Bengkel', 'Catatan'],
    wajib: ['Tanggal', 'Unit', 'Jenis servis'],
    ringkas: () => [
      { l: 'Tanggal', nilai: (r) => ftanggal(r.isi.tanggal) },
      { l: 'Unit', nilai: (r) => D.labelRef('units', r.isi.unit_id) },
      { l: 'Jenis', nilai: (r) => r.isi.jenis },
      { l: 'Deskripsi', nilai: (r) => r.isi.deskripsi || '–' },
      { l: 'Biaya (Rp)', nilai: (r) => r.isi.biaya, jenis: 'uang', total: true },
    ],
    periksa(baris) {
      const salah = [];
      const tgl = tanggalDari(baris.Tanggal);
      if (!tgl) salah.push(`Tanggal "${rapi(baris.Tanggal)}" tidak dikenali.`);
      const unit = cocokkan('units', baris.Unit, (r) => r.kode);
      if (!unit) {
        salah.push(`Unit "${rapi(baris.Unit)}" tidak ada.`
          + tanpaSaran(saran('units', baris.Unit, (r) => r.kode)));
      }
      const jenis = JENIS_SERVIS.find((j) => samakan(j) === samakan(baris['Jenis servis']));
      if (!jenis) {
        salah.push(`Jenis servis "${rapi(baris['Jenis servis'])}" tidak dikenali. `
          + `Pilihannya: ${JENIS_SERVIS.join(', ')}.`);
      }
      const biaya = angkaDari(baris.Biaya) ?? 0;
      if (biaya < 0) salah.push('Biaya tidak boleh minus.');
      if (salah.length) return { salah };
      return {
        isi: {
          tanggal: tgl,
          unit_id: unit.id,
          jenis,
          deskripsi: rapi(baris.Deskripsi),
          biaya,
          hm: angkaDari(baris['Posisi HM']) ?? 0,
          km: angkaDari(baris['Posisi KM']) ?? 0,
          bengkel: rapi(baris.Bengkel),
          lokasi: '',
          catatan: rapi(baris.Catatan),
        },
      };
    },
    masukkan(daftar) { for (const r of daftar) D.tambah('service_logs', r.isi); },
  },
};

// =====================================================================
// Halaman
// =====================================================================
function kotakJenis(kunci, { gambar, bisaEdit }) {
  const def = JENIS[kunci];
  const tempatHasil = el('div');
  const masukan = el('input', { type: 'file', accept: '.xlsx', style: 'max-width:20rem' });

  const prosesBerkas = async (berkas) => {
    kosongkan(tempatHasil).append(el('p.bantuan', { teks: `Membaca ${berkas.name}…` }));
    let hasil;
    try {
      hasil = await bacaExcel(berkas);
    } catch (e) {
      kosongkan(tempatHasil).append(el('div.kesalahan', { role: 'alert' }, [e.message]));
      return;
    }

    const kurang = def.wajib.filter((k) => !hasil.judul.includes(k));
    if (kurang.length) {
      kosongkan(tempatHasil).append(el('div.kesalahan', { role: 'alert' }, [
        el('strong', { teks: 'Judul kolom tidak cocok dengan template.' }),
        el('p', { teks: `Kolom yang belum ada: ${kurang.join(', ')}.` }),
        el('p', { teks: `Kolom yang terbaca di berkas: ${hasil.judul.join(', ') || '(tidak ada)'}.` }),
        el('p', { teks: 'Pakai berkas template yang diunduh dari tombol di atas, dan jangan mengubah baris judulnya.' }),
      ]));
      return;
    }

    const benar = [];
    const gagal = [];
    const awas = [];                // boleh masuk, tapi perlu dilihat admin
    const sudahMasuk = new Map();   // batas HK per orang per hari dalam satu berkas
    const petaLintas = await D.petaHkBagianLain().catch(() => []);
    for (const baris of hasil.baris) {
      const p = def.periksa(baris, sudahMasuk, petaLintas);
      if (p.salah) { gagal.push({ baris, salah: p.salah }); continue; }
      if (p.peringatan?.length) awas.push({ baris, catatan: p.peringatan });

      // hak pengguna diperiksa di sini juga, supaya baris yang tidak boleh
      // ditulis muncul sebagai "bermasalah" berikut alasannya — bukan
      // menggagalkan proses di tengah jalan saat dimasukkan
      const calon = p.pecah
        ? p.pecah.map((q) => ({ ...q, _baris: baris._baris }))
        : [{ ...p, _baris: baris._baris }];
      const terlarang = calon
        .map((q) => D.alasanTulis('tambah', def.tabel, q.isi))
        .find(Boolean);
      if (terlarang) gagal.push({ baris, salah: [terlarang] });
      else benar.push(...calon);
    }

    kosongkan(tempatHasil);
    const dariPecahan = benar.length - benar.filter((r, i, a) =>
      a.findIndex((x) => x._baris === r._baris) === i).length;
    tempatHasil.append(el('p', {
      teks: `${hasil.jumlahBaris} baris terbaca dari ${berkas.name}: `
        + `${benar.length} siap dimasukkan, ${gagal.length} bermasalah.`
        + (dariPecahan > 0
          ? ` (${dariPecahan} di antaranya hasil pemecahan baris yang bloknya lebih dari satu.)`
          : ''),
    }));

    if (gagal.length) {
      tempatHasil.append(el('div.kesalahan', { role: 'alert' }, [
        el('strong', { teks: `${gagal.length} baris tidak bisa dimasukkan:` }),
        el('ul', {}, gagal.slice(0, 25).map((g) => el('li', {
          teks: `Baris ${g.baris._baris}: ${g.salah.join(' ')}`,
        }))),
        gagal.length > 25 ? el('p', { teks: `…dan ${gagal.length - 25} baris lain.` }) : null,
        el('p', { teks: 'Perbaiki di Excel lalu upload lagi. Baris yang benar tetap bisa dimasukkan duluan.' }),
      ]));
    }

    if (awas.length) {
      tempatHasil.append(el('div.petunjuk', { role: 'status' }, [
        el('strong', { teks: `${awas.length} baris boleh masuk, tapi periksa dulu:` }),
        el('ul', {}, awas.slice(0, 25).map((a) => el('li', {
          teks: `Baris ${a.baris._baris}: ${a.catatan.join(' ')}`,
        }))),
        awas.length > 25 ? el('p', { teks: `…dan ${awas.length - 25} baris lain.` }) : null,
      ]));
    }

    if (benar.length) {
      tempatHasil.append(
        el('h3', { teks: 'Pratinjau baris yang akan dimasukkan', style: 'margin:1rem 0 .4rem' }),
        tabel(def.ringkas(benar), benar.slice(0, 200), { kosong: '—' }),
        benar.length > 200 ? el('p.bantuan', { teks: `Menampilkan 200 baris pertama dari ${benar.length}.` }) : null,
        el('div', { style: 'margin-top:.8rem' }, [
          el('button.tombol-utama', {
            type: 'button',
            teks: `Masukkan ${benar.length} baris`,
            onclick: async (ev) => {
              const tombol = ev.target;
              tombol.disabled = true;
              const lanjut = await tanya(`Masukkan ${benar.length} baris ${def.label}?`,
                'Data ditambahkan ke daftar, tapi belum dikirim. Setelah ini klik "Simpan ke GitHub" '
                + 'di kanan atas supaya tersimpan.', { ya: 'Masukkan' });
              if (!lanjut) { tombol.disabled = false; return; }
              def.masukkan(benar);
              pesan(`${benar.length} baris ${def.label} dimasukkan. Jangan lupa Simpan.`, 'sukses', 7);
              masukan.value = '';
              kosongkan(tempatHasil);
              gambar();
            },
          }),
        ]),
      );
    }
  };

  masukan.addEventListener('change', () => {
    if (masukan.files && masukan.files[0]) prosesBerkas(masukan.files[0]);
  });

  return el('div.lembar', {}, [
    el('div.lembar-kepala', {}, [
      el('h2', { teks: def.label }),
      el('a.tombol.tombol-samar', { href: def.template, download: '', teks: 'Unduh template Excel' }),
    ]),
    el('div.lembar-isi', {}, [
      el('p.bantuan', { teks: `Kolom yang dibaca: ${def.kolom.join(' · ')}` }),
      bisaEdit() ? masukan : el('p.bantuan', { teks: 'Mode lihat — upload hanya bisa setelah mode edit aktif.' }),
      tempatHasil,
    ]),
  ]);
}

export function halamanImpor(konteks) {
  const { bisaEdit } = konteks;
  const alat = D.state.aplikasi === 'AlatBerat';
  const daftar = alat ? ['log', 'solar', 'servis'] : ['hk'];

  const wadah = el('section');
  if (!bisaBacaExcel()) {
    wadah.append(el('div.kesalahan', {}, [
      'Peramban ini terlalu lama untuk membaca berkas Excel. Pakai Chrome, Edge, atau Firefox versi baru.',
    ]));
    return wadah;
  }

  wadah.append(el('div.petunjuk', {}, [
    el('p', { teks: 'Cara pakai: unduh template → isi di Excel seperti biasa → simpan → upload di sini. '
      + 'Sebelum masuk, semua baris diperiksa dulu dan Anda lihat hasilnya.' }),
    el('p', { teks: 'Template sudah berisi daftar nama yang dikenali aplikasi di lembar "Daftar Pilihan", '
      + 'dan beberapa kolom punya dropdown supaya tidak salah ketik.' }),
    el('p', { teks: 'Satu pekerjaan di beberapa blok: tulis bloknya dipisah koma di kolom Blok '
      + '(contoh "P05, P06a, P07a") dan isi HK totalnya saja — maksimal 1 HK per orang per hari. '
      + 'HK itu dipecah sesuai luas hektar tiap blok; kolom "Bagi HK" bisa diubah jadi Rata. '
      + 'Kalau ada blok yang luasnya belum diisi di Master Blok, pembagiannya otomatis rata '
      + 'dan ditandai di pratinjau.' }),
  ]));

  for (const k of daftar) {
    wadah.append(kotakJenis(k, konteks), el('div', { style: 'height:1.4rem' }));
  }
  return wadah;
}
