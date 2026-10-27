// skema-alat.js — definisi tabel bagian Alat Berat & Kendaraan
// (Divisi Infrastruktur). Harus cocok dengan models/schema.py di aplikasi
// desktop Manajemen Alat Berat.

export const KATEGORI_UNIT = ['ALAT BERAT', 'DUMP TRUCK', 'KENDARAAN'];
export const TIPE_METER = ['HM', 'KM', 'HM+KM'];
export const JENIS_SERVIS = [
  'Servis Berkala', 'Ganti Oli', 'Ganti Sparepart',
  'Perbaikan / Kerusakan', 'Ganti Ban', 'Lainnya',
];
export const DAFTAR_BANK = [
  'BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'BTN', 'CIMB Niaga',
  'Danamon', 'Permata', 'OCBC NISP', 'Bank Jateng', 'Bank Jatim',
  'Bank Jabar (BJB)', 'Lainnya',
];

const AKTIF = [{ nilai: 1, label: 'Aktif' }, { nilai: 0, label: 'Tidak aktif' }];

export const TABEL = {
  units: {
    judul: 'Unit',
    tunggal: 'unit',
    label: (r) => `${r.kode} — ${r.nama}`,
    cari: ['kode', 'nama', 'kategori', 'no_polisi'],
    f: [
      { k: 'kode', l: 'Kode', t: 'text', wajib: true, unik: true },
      { k: 'nama', l: 'Nama unit', t: 'text', wajib: true },
      { k: 'kategori', l: 'Kategori', t: 'enum', pilihan: KATEGORI_UNIT, wajib: true, bawaan: 'ALAT BERAT' },
      { k: 'tipe_meter', l: 'Tipe meter', t: 'enum', pilihan: TIPE_METER, wajib: true, bawaan: 'HM' },
      { k: 'no_polisi', l: 'No. polisi', t: 'text' },
      { k: 'tahun', l: 'Tahun', t: 'text' },
      { k: 'aktif', l: 'Status', t: 'pilih_angka', pilihan: AKTIF, bawaan: 1 },
    ],
  },
  operators: {
    judul: 'Operator',
    tunggal: 'operator',
    label: (r) => r.nama,
    cari: ['nama', 'no_rekening', 'bank', 'no_hp'],
    f: [
      { k: 'nama', l: 'Nama', t: 'text', wajib: true },
      { k: 'tarif_harian', l: 'Tarif per hari kerja', t: 'money', wajib: true },
      { k: 'tarif_jam', l: 'Tarif HM lama (arsip, tidak menambah upah)', t: 'money' },
      { k: 'bank', l: 'Bank', t: 'enum', pilihan: DAFTAR_BANK },
      { k: 'no_rekening', l: 'No. rekening', t: 'text', peka: true },
      { k: 'no_hp', l: 'No. HP', t: 'text', peka: true },
      { k: 'aktif', l: 'Status', t: 'pilih_angka', pilihan: AKTIF, bawaan: 1 },
    ],
  },
};

export const URUT_MASTER = ['units', 'operators'];

export const REF = {
  work_logs: {
    judul: 'Log harian',
    f: [
      { k: 'unit_id', t: 'ref', ref: 'units' },
      { k: 'operator_id', t: 'ref', ref: 'operators' },
    ],
  },
  fuel_logs: {
    judul: 'Isi solar',
    f: [
      { k: 'unit_id', t: 'ref', ref: 'units' },
      { k: 'operator_id', t: 'ref', ref: 'operators' },
    ],
  },
  service_logs: {
    judul: 'Servis',
    f: [{ k: 'unit_id', t: 'ref', ref: 'units' }],
  },
};

/** Apakah unit memakai meter HM, KM, atau keduanya. */
export const pakaiHm = (unit) => !!unit && (unit.tipe_meter === 'HM' || unit.tipe_meter === 'HM+KM');
export const pakaiKm = (unit) => !!unit && (unit.tipe_meter === 'KM' || unit.tipe_meter === 'HM+KM');
