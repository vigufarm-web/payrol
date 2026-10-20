// skema.js — definisi tabel & kolom Payroll HK.
// Satu-satunya tempat struktur data dijelaskan: halaman master, form input,
// dan laporan semuanya dibangun dari sini. Menambah kolom cukup di file ini.
//
// Harus cocok dengan models/schema.py di aplikasi desktop.

export const KATEGORI_UPAH = ['HK', 'Borongan', 'Lembur', 'Premi'];
export const STATUS = ['Aktif', 'Tidak Aktif'];

// t: jenis kolom — text | area | int | num | money | date | enum | ref | calc
// w: lebar kolom di tabel (satuan grid, opsional)
export const TABEL = {
  employees: {
    judul: 'Karyawan',
    tunggal: 'karyawan',
    label: (r) => r.nama,
    cari: ['nik', 'nama', 'bank', 'rekening', 'no_hp'],
    f: [
      { k: 'nik', l: 'NIK', t: 'text', wajib: true, unik: true },
      { k: 'nama', l: 'Nama', t: 'text', wajib: true },
      { k: 'tarif_hk', l: 'Tarif per HK', t: 'money', wajib: true },
      { k: 'bank', l: 'Bank', t: 'text' },
      { k: 'rekening', l: 'No. rekening', t: 'text', peka: true },
      { k: 'job_default', l: 'Pekerjaan utama', t: 'text' },
      { k: 'no_hp', l: 'No. HP', t: 'text', peka: true },
      { k: 'alamat', l: 'Alamat', t: 'area', peka: true },
      { k: 'catatan', l: 'Catatan', t: 'area' },
      { k: 'status', l: 'Status', t: 'enum', pilihan: STATUS, bawaan: 'Aktif' },
    ],
  },
  divisions: {
    judul: 'Divisi',
    tunggal: 'divisi',
    label: (r) => r.nama_divisi,
    cari: ['kode_divisi', 'nama_divisi'],
    f: [
      { k: 'kode_divisi', l: 'Kode', t: 'text', wajib: true, unik: true },
      { k: 'nama_divisi', l: 'Nama divisi', t: 'text', wajib: true, unik: true },
      { k: 'deskripsi', l: 'Deskripsi', t: 'text' },
      { k: 'catatan', l: 'Catatan', t: 'area' },
      { k: 'status', l: 'Status', t: 'enum', pilihan: STATUS, bawaan: 'Aktif' },
    ],
  },
  blocks: {
    judul: 'Blok',
    tunggal: 'blok',
    label: (r) => r.nama_blok,
    cari: ['kode_blok', 'nama_blok', 'komoditas'],
    f: [
      { k: 'kode_blok', l: 'Kode', t: 'text', wajib: true, unik: true },
      { k: 'nama_blok', l: 'Nama blok', t: 'text', wajib: true },
      { k: 'division_id', l: 'Divisi', t: 'ref', ref: 'divisions', wajib: true },
      { k: 'luas', l: 'Luas (ha)', t: 'num' },
      { k: 'komoditas', l: 'Komoditas', t: 'text' },
      { k: 'keterangan', l: 'Keterangan', t: 'area' },
      { k: 'status', l: 'Status', t: 'enum', pilihan: STATUS, bawaan: 'Aktif' },
    ],
  },
  activities: {
    judul: 'Kegiatan',
    tunggal: 'kegiatan',
    label: (r) => r.nama_kegiatan,
    cari: ['kode_kegiatan', 'nama_kegiatan'],
    f: [
      { k: 'kode_kegiatan', l: 'Kode', t: 'text', wajib: true, unik: true },
      { k: 'nama_kegiatan', l: 'Nama kegiatan', t: 'text', wajib: true, unik: true },
      { k: 'deskripsi', l: 'Deskripsi', t: 'text' },
      { k: 'catatan', l: 'Catatan', t: 'area' },
      { k: 'status', l: 'Status', t: 'enum', pilihan: STATUS, bawaan: 'Aktif' },
    ],
  },
  job_types: {
    judul: 'Jenis pekerjaan',
    tunggal: 'jenis pekerjaan',
    label: (r) => r.nama_jenis,
    cari: ['kode_jenis', 'nama_jenis'],
    f: [
      { k: 'kode_jenis', l: 'Kode', t: 'text', wajib: true, unik: true },
      { k: 'nama_jenis', l: 'Nama jenis', t: 'text', wajib: true },
      { k: 'activity_id', l: 'Kegiatan', t: 'ref', ref: 'activities', wajib: true },
      { k: 'deskripsi', l: 'Deskripsi', t: 'text' },
      { k: 'catatan', l: 'Catatan', t: 'area' },
      { k: 'status', l: 'Status', t: 'enum', pilihan: STATUS, bawaan: 'Aktif' },
    ],
  },
  wage_components: {
    judul: 'Komponen upah',
    tunggal: 'komponen upah',
    label: (r) => r.nama_komponen,
    cari: ['kode_komponen', 'nama_komponen', 'kategori'],
    f: [
      { k: 'kode_komponen', l: 'Kode', t: 'text', wajib: true, unik: true },
      { k: 'kategori', l: 'Kategori', t: 'enum', pilihan: KATEGORI_UPAH, wajib: true },
      { k: 'nama_komponen', l: 'Nama komponen', t: 'text', wajib: true },
      { k: 'satuan', l: 'Satuan', t: 'text' },
      { k: 'tarif', l: 'Tarif', t: 'money', wajib: true },
      { k: 'status', l: 'Status', t: 'enum', pilihan: STATUS, bawaan: 'Aktif' },
    ],
  },
};

// Tabel transaksi: dipakai halaman input & laporan (bukan CRUD generik master)
export const TRANSAKSI = {
  daily_payroll: { judul: 'HK harian', prefix: 'HK', kategori: 'HK' },
  borongan_transactions: { judul: 'Borongan', prefix: 'BR', kategori: 'Borongan' },
  lembur_transactions: { judul: 'Lembur', prefix: 'LM', kategori: 'Lembur' },
  premi_transactions: { judul: 'Premi', prefix: 'PR', kategori: 'Premi' },
};

export const URUT_MASTER = ['employees', 'divisions', 'blocks', 'activities', 'job_types', 'wage_components'];

// Kolom bertipe ref di tabel transaksi — dipakai untuk mengecek apakah sebuah
// baris master masih terpakai sebelum boleh dihapus.
export const REF = {
  daily_payroll: {
    judul: 'HK harian',
    f: [
      { k: 'employee_id', t: 'ref', ref: 'employees' },
      { k: 'division_id', t: 'ref', ref: 'divisions' },
      { k: 'block_id', t: 'ref', ref: 'blocks' },
      { k: 'activity_id', t: 'ref', ref: 'activities' },
      { k: 'job_type_id', t: 'ref', ref: 'job_types' },
    ],
  },
  borongan_transactions: {
    judul: 'Borongan',
    f: [
      { k: 'employee_id', t: 'ref', ref: 'employees' },
      { k: 'division_id', t: 'ref', ref: 'divisions' },
      { k: 'block_id', t: 'ref', ref: 'blocks' },
      { k: 'activity_id', t: 'ref', ref: 'activities' },
      { k: 'wage_component_id', t: 'ref', ref: 'wage_components' },
    ],
  },
  lembur_transactions: {
    judul: 'Lembur',
    f: [
      { k: 'employee_id', t: 'ref', ref: 'employees' },
      { k: 'wage_component_id', t: 'ref', ref: 'wage_components' },
      { k: 'division_id', t: 'ref', ref: 'divisions' },
      { k: 'block_id', t: 'ref', ref: 'blocks' },
    ],
  },
  premi_transactions: {
    judul: 'Premi',
    f: [
      { k: 'employee_id', t: 'ref', ref: 'employees' },
      { k: 'wage_component_id', t: 'ref', ref: 'wage_components' },
      { k: 'division_id', t: 'ref', ref: 'divisions' },
      { k: 'block_id', t: 'ref', ref: 'blocks' },
    ],
  },
};

/** Nomor transaksi: PREFIX-YYYYMMDD-000001 (sama dengan aplikasi desktop). */
export function nomorTransaksi(baris, prefix, tanggal) {
  const padat = String(tanggal).replaceAll('-', '');
  const awalan = `${prefix}-${padat}-`;
  let maks = 0;
  for (const r of baris) {
    const n = r.nomor_transaksi;
    if (typeof n === 'string' && n.startsWith(awalan)) {
      const urut = parseInt(n.slice(awalan.length), 10);
      if (Number.isFinite(urut) && urut > maks) maks = urut;
    }
  }
  return awalan + String(maks + 1).padStart(6, '0');
}

/** Kolom yang isinya data pribadi — disembunyikan sampai pengguna menampilkannya. */
export const kolomPeka = (tabel) => (TABEL[tabel]?.f || []).filter((f) => f.peka).map((f) => f.k);
