# Data Kebun — PT VIGU FARM INDONESIA

Situs untuk melihat **dan mengisi** data dua aplikasi desktop sekaligus:

| Bagian | Isi |
|---|---|
| **Payroll HK** | Pekerja, HK harian, borongan, lembur, premi, payroll per pekerja, rekap per divisi/blok/kegiatan |
| **Alat Berat & Kendaraan** *(Divisi Infrastruktur)* | Log harian unit (HM/KM/ritase), isi solar, servis, payroll operator, biaya per lokasi, laporan harian siap tempel ke WhatsApp |
| **Kepala kebun** | Laporan biaya operasional per kebun (HK + rupiah) per bulan / per paruh bulan, target biaya, persetujuan lembur & premi |

Admin penuh memakai satu menu **Pantauan** untuk ringkasan seluruh divisi dan alat
berat. Rincian unit serta status sumber data dapat dibuka bila diperlukan, sehingga
halaman utama tetap ringkas.

Repo ini sekaligus jadi **database**: isi database dikemas jadi satu file JSON
**terenkripsi** di folder `data/`. Tanpa password, isinya tidak bisa dibaca siapa pun —
termasuk orang yang membuka repo ini.

Tidak ada server, tidak ada `npm install`, tidak ada pustaka pihak ketiga.
Enkripsi memakai Web Crypto bawaan peramban.

---

## 0. Coba dulu di komputer (tanpa GitHub)

Disarankan dicoba di komputer sendiri sebelum apa pun diupload.

1. Buka aplikasi desktop → menu **Sinkron GitHub**.
2. Isi **Password data** saja (owner/repo/token boleh dikosongkan dulu).
3. Klik **Ekspor ke File...** lalu simpan ke folder `data` di sebelah berkas ini:
   - dari PayrollHK → `data\payroll.json`
   - dari Manajemen Alat Berat → `data\alat-berat.json`
     (pakai password yang sama kalau ingin satu login untuk dua bagian)
4. Klik dua kali **`Jalankan.bat`** di folder ini. Peramban terbuka di
   `http://localhost:8787`.
5. Masukkan password → semua menu bisa dicoba, termasuk form inputnya.

Saat dicoba begini, pojok kanan atas bertuliskan **"Ujicoba di komputer"**. Tombol
**Simpan** akan **mengunduh** berkas hasilnya (bukan mengirim ke GitHub, karena memang
belum ada repo). Berkas itu bisa:

- ditimpakan ke `data\payroll.json` lalu halaman dimuat ulang — untuk melihat hasil
  input Anda, atau
- dimasukkan ke aplikasi desktop lewat **Sinkron GitHub → Impor dari File...**

> **Kenapa harus lewat `Jalankan.bat`, tidak bisa klik dua kali `index.html`?**
> Halaman ini memuat JavaScript sebagai modul dan membaca berkas data; peramban
> melarang keduanya pada alamat `file://` demi keamanan. `Jalankan.bat` menyalakan
> server kecil bawaan Python (yang sudah terpasang karena dipakai aplikasi desktop),
> jadi alamatnya jadi `http://localhost`.

Kalau sudah cocok, lanjut ke langkah 1. Folder `data` memang **ikut ter-upload** —
isinya justru databasenya, dan sudah terenkripsi.

---

## 1. Menyiapkan (sekali saja)

### a. Buat repo & nyalakan GitHub Pages

1. Buat repo baru di GitHub, mis. `data-kebun`.
2. Upload seluruh isi folder ini (tombol **Add file → Upload files**, atau `git push`).
3. Buka **Settings → Pages**. Bagian *Source* pilih **Deploy from a branch**,
   branch `main`, folder `/ (root)`, lalu **Save**.
4. Tunggu 1–2 menit. Alamatnya muncul di halaman itu, bentuknya
   `https://<akun>.github.io/data-kebun/`.

Owner dan nama repo **terdeteksi otomatis** dari alamat tersebut — tidak ada yang
perlu diatur di dalam kode.

> **Repo ini boleh public.** Isi data terenkripsi, jadi yang terbaca orang lain cuma
> data acak. Yang tidak terenkripsi hanyalah keterangan ringkas (nama bagian, tanggal
> pembaruan, jumlah baris) supaya halaman kunci bisa menampilkannya — tanpa nama
> orang, tanpa nomor rekening. Kalau ingin lebih tertutup, repo private juga bisa,
> tapi GitHub Pages untuk repo private butuh langganan berbayar.

### b. Kirim data pertama dari aplikasi desktop

Di aplikasi desktop (**PayrollHK** dan **Manajemen Alat Berat**), buka menu
**Sinkron GitHub**, lalu isi:

| Kolom | Isi |
|---|---|
| Pemilih (owner) | akun GitHub Anda |
| Nama repo | `data-kebun` |
| Lokasi file data | `data/payroll.json` · untuk alat berat: `data/alat-berat.json` |
| Nama dataset | mis. `Payroll Padi + Infra` · `Alat Berat & Kendaraan` |
| Token GitHub | lihat bagian 2 di bawah |
| Password data | **pakai password yang sama di kedua aplikasi** |

Klik **Uji Koneksi** → **Kirim Data**. Setelah itu buka alamat GitHub Pages tadi,
masukkan password, dan data sudah tampil.

> Kalau password kedua aplikasi berbeda, situs tetap jalan — hanya saja Anda diminta
> password lagi setiap pindah bagian.

### c. Password data

Password inilah kunci data. **Catat di tempat aman.** Kalau hilang, isi file di
GitHub tidak bisa dibuka lagi oleh siapa pun, termasuk pembuat aplikasi — tidak ada
jalan pintas, itu memang maksud enkripsinya.

---

## 2. Token GitHub

Token diperlukan untuk **menyimpan** (dari aplikasi desktop maupun dari situs).
Untuk sekadar melihat, token tidak perlu.

1. GitHub → foto profil → **Settings**
2. **Developer settings → Personal access tokens → Fine-grained tokens**
3. **Generate new token**
   - *Repository access*: **Only select repositories** → pilih repo ini saja
   - *Permissions → Repository permissions → Contents*: **Read and write**
   - *Expiration*: secukupnya, mis. 1 tahun
4. Salin token, lalu tempel di:
   - aplikasi desktop → menu **Sinkron GitHub**, atau
   - situs → menu **Pengaturan → Mode edit**

Untuk alur kerja saat ini, token dapat dipasang pada perangkat admin yang memang
ditunjuk. Pengguna biasa tetap tidak melihat tombol edit menurut hak akunnya.
Token hanya tersimpan di perangkat dan tidak ikut ter-upload.

---

## 3. Cara pakai sehari-hari

**Melihat** — buka alamatnya, masukkan password. Semua orang yang tahu password bisa
melihat, tanpa token.

**Mengisi dari situs** — masukkan token sekali di **Pengaturan → Mode edit**, isi nama
pengisi, lalu input seperti biasa. Perubahan ditahan dulu di peramban; klik
**Simpan ke GitHub** di kanan atas untuk mengirimnya. Selama belum disimpan, ada
penanda kuning "Belum disimpan".

## 3f-1b. Anti dobel input antar bagian

Tiga admin, tiga bagian — tapi orangnya bisa sama. Kalau admin Pisang sudah mencatat
si A pada 18 November, lalu admin Padi/Infra menginput A di tanggal yang sama:

- bila totalnya **melebihi 1 HK**, input **ditolak** dengan keterangan "sudah tercatat
  sekian HK di bagian Payroll Pisang";
- bila masih muat (mis. 0,5 + 0,5), muncul **peringatan** dulu — "yakin memang kerja
  di dua bagian hari itu?" — baru boleh disimpan.

Pencocokan orangnya memakai **nama + nomor rekening**, karena nama saja banyak yang
kembar; nama sama dengan rekening berbeda dianggap orang lain. Berlaku di form
satuan, form massal, dan impor Excel. Syaratnya: ketiga bagian memakai **password
data yang sama** supaya bisa saling membaca.

## 3f-2. Alat berat: premi otomatis, acc kepala divisi, dan pembatalan

- **Tarif premi unit** (menu Sistem, PIN admin): tiap unit diberi *Rp per HM* dan
  *Rp per KM*. Premi operator di log harian lalu terhitung otomatis — HM/KM terpakai ×
  tarif — dan tetap bisa ditimpa manual.
- **Tambahan operator menunggu acc.** HK dan catatan operasi langsung masuk laporan.
  Yang perlu persetujuan kepala Infra hanya **premi tercatat (HM dibayar sekali sebagai premi)**.
  Selama menunggu, premi belum dihitung; HK, HM/KM, dan kegiatan tetap
  tercatat. Menolak persetujuan tidak menghapus log maupun HK-nya.
- Persetujuan massal dibatasi **satu tanggal sekali jalan**. Penolakan wajib disertai
  alasan supaya koreksinya dapat ditelusuri dan tidak ada salah klik lintas hari.
- **Monitor biaya** (menu Kepala divisi): solar + servis + premi terhadap target per
  paruh/bulan, lengkap dengan meter dan kotak rekomendasi. Targetnya diatur lewat
  tombol *Atur target* (PIN admin).
- **Pembatalan**: yang telanjur di-acc — lembur/premi payroll maupun tambahan alat berat —
  bisa dibatalkan dari bagian *Sudah disetujui* di halaman Persetujuan oleh pengguna
  yang diberi hak **Batalkan persetujuan**. Statusnya kembali menunggu, tercatat siapa
  yang membatalkan, dan angkanya langsung keluar dari laporan.
- **Dashboard kepala divisi**: pengguna yang haknya hanya monitor/acc (tanpa input)
  mendarat langsung di Monitor/Laporan Kebun, dan menu input tidak muncul sama sekali.

## 3g. Meter alat berat: tinggal isi angka hari ini

Di **Log harian** (bagian Alat Berat & Kendaraan), kolom **HM/KM awal terisi
otomatis** dari pembacaan tertinggi sebelum tanggal itu. Admin tinggal mengisi angka
meter **saat ini** — dan angka itu otomatis jadi "awal" untuk log hari berikutnya.

Karena meter tidak mungkin mundur, aplikasi mengawasinya:

- saat menyimpan: kalau angkanya lebih kecil dari pembacaan yang sudah tercatat
  sebelumnya, atau lebih besar dari log tanggal sesudahnya, muncul **peringatan**
  (tanggal keliru? salah ketik? ada log kelewat?) — boleh tetap disimpan kalau
  memang benar;
- di atas halaman Log harian ada **spanduk "Meter tidak urut"** yang mendaftar log
  lama yang angkanya tidak urut, supaya salah ketik tidak mengendap diam-diam.
- bila hour meter/odometer benar-benar diganti atau di-reset, centang **Meter baru /
  diganti / reset** dan isi alasannya. Log itu menjadi awal rangkaian meter baru.

**Mengisi dari aplikasi desktop** — seperti biasa, lalu **Sinkron GitHub → Kirim Data**.

**Mengambil perubahan orang lain ke komputer** — **Sinkron GitHub → Tarik Data**.
Database lokal otomatis di-backup dulu sebelum ditimpa.

### Supaya data tidak saling menimpa

Setiap penyimpanan menaikkan nomor **rev**. Kalau orang lain menyimpan lebih dulu,
simpanan Anda **ditolak** dan Anda diminta memuat ulang. Jadi tidak ada perubahan
yang hilang diam-diam — tapi biasakan **Tarik Data dulu** sebelum mulai mengisi
banyak di komputer, dan jangan mengisi dari dua tempat sekaligus pada hari yang sama.

---

## 3b. Input HK: empat cara, pilih yang paling cepat

Semua ada di menu **HK harian**. Hasilnya sama, bedanya cuma cara mengisinya.

| Cara | Kapan dipakai |
|---|---|
| **Satu baris** | Mengisi seorang pekerja. Blok boleh dicentang **lebih dari satu**: HK total (maks 1) otomatis terbagi sesuai luas blok (tombol *Bagi rata* juga ada), dan tiap angka tetap bisa diketik sendiri. Centangan *Pekerjaan sama untuk semua blok* bisa dilepas kalau kegiatan tiap blok beda — tiap blok lalu dapat pilihan kegiatannya sendiri. Lembur dan premi bisa langsung diisi di form yang sama (menempel di blok pertama). |
| **Banyak blok sekaligus** | Satu kegiatan dikerjakan di beberapa blok, mis. *Rawat gawangan* di blok C, D, F, G, H. Pilih pekerja, kegiatan, lalu centang blok-bloknya; HK dibagi **sesuai luas tiap blok** (lihat bagian 3e) atau rata, sesuka Anda. Setelah masuk, tiap baris tetap bisa diubah satu-satu. |
| **Salin hari** | Hari ini sama dengan hari sebelumnya. Pilih tanggal sumber → semua barisnya disalin ke tanggal baru, lalu tinggal direvisi yang berubah. |
| **Impor Excel** | Mengisi sekaligus satu hari penuh atau beberapa hari. Lihat bagian 3c. |

Divisi, blok, dan kegiatan terakhir **diingat** supaya tidak perlu dipilih ulang
setiap baris. Borongan tetap di menunya sendiri karena satuannya beda (per hasil
kerja, bukan per HK).

Pada form **Lembur, Premi, dan Borongan**, kolom **Satuan** wajib diisi. Nilainya
terisi otomatis dari Komponen Upah, tetapi dapat disesuaikan per transaksi
(mis. jam, kg, batang, lubang, atau rit). Kolom **Hasil kerja / keterangan** ikut
ditampilkan di daftar dan halaman persetujuan agar pekerjaan mudah diaudit.

Kolom pekerjaan dan keterangan menampilkan **input terakhir sebagai tombol yang
bisa langsung diklik**, sekaligus tetap dapat dicari dengan mengetik. Kolom ini juga
merapikan spasi otomatis. Jika ejaan hanya
berbeda kapital/tanda baca, aplikasi memakai ejaan lama yang paling sering dipakai.
Jika terdeteksi kemungkinan typo 1–2 karakter, aplikasi menawarkan ejaan lama saat
isian ditinggalkan dan meminta konfirmasi lagi sebelum menyimpan.

Keterangan lembur dan premi **wajib diisi**. Pada daftar HK, admin dapat langsung
melihat keterangan, nominal, dan status persetujuannya. Tombol pencarian tersedia di
daftar HK, lembur, dan premi untuk mencari nama/NIK, nomor transaksi, blok, kegiatan,
atau isi keterangan. Setiap revisi lembur/premi otomatis menggugurkan persetujuan lama
dan mengembalikannya ke antrean kepala kebun.

Nominal positif di bawah **Rp1.000** pada HK, borongan, lembur, atau premi juga
memunculkan konfirmasi. Nilainya tetap boleh disimpan jika benar; peringatan ini
mencegah kekurangan angka atau nol lolos tanpa disadari.

Kotak rekomendasi target selalu menghitung laju sampai **tanggal input terakhir**,
bukan tanggal hari ini. Dengan begitu data yang belum sempat dimasukkan tidak
membuat proyeksi terlihat lebih hemat secara keliru.

Pengaman: total HK satu pekerja dalam satu hari **tidak boleh lebih dari 1**. Kalau
terlampaui, barisnya ditolak dengan keterangan jelas — berlaku untuk keempat cara di
atas. Dan kalau ada data lama yang telanjur melebihi batas (misalnya kiriman dari
aplikasi desktop), di atas halaman **HK harian** muncul spanduk peringatan yang
menyebut nama, tanggal, dan totalnya — tidak ada yang mengendap diam-diam.

Menu **Pemeriksaan data** juga menandai nama master kegiatan/jenis pekerjaan yang
hampir kembar (misalnya akibat salah satu huruf). Aplikasi tidak menggabungkannya
otomatis karena transaksi lama perlu diperiksa oleh admin terlebih dahulu.

## 3c. Impor dari Excel

Untuk yang lebih enak mengisi di Excel dulu, lalu upload sekali sehari.

1. Menu **Impor Excel** → klik tautan templatenya (`Template_HK_Harian.xlsx`,
   `Template_Log_Harian_Alat.xlsx`, `Template_Isi_Solar.xlsx`,
   `Template_Servis_Unit.xlsx`).
2. Isi sheet **Isi Data**. Kolomnya sudah ada daftar pilihan (dropdown); sheet
   **Daftar Pilihan** memuat NIK pekerja, blok, kegiatan, dan unit yang berlaku.
3. Kembali ke menu **Impor Excel** → pilih berkasnya.
4. Situs **memeriksa dulu, belum memasukkan apa pun**: muncul ringkasan "x siap
   dimasukkan, y bermasalah", daftar alasan tiap baris bermasalah (NIK tidak ada,
   blok bukan milik divisi itu, tanggal ngawur, tarif lembur kosong, HK melebihi
   1/hari), dan pratinjau baris yang akan masuk beserta nilai rupiahnya.
5. Kalau sudah cocok, klik **Masukkan x baris** → lalu **Simpan** seperti biasa.

Baris bermasalah **tidak** ikut masuk. Perbaiki di Excel, lalu impor ulang berkasnya.
Baris HK yang sudah masuk akan otomatis ditolak pada impor kedua — karena totalnya
jadi lebih dari 1 HK/hari — jadi tidak terhitung dua kali. Tapi **lembur dan premi
tidak punya pengaman itu**: kalau mau impor ulang satu berkas penuh, lebih aman
mengosongkan baris yang sudah berhasil masuk dari berkas Excel-nya dulu.

Lembur dan premi yang ikut dari Excel otomatis masuk **antrean persetujuan**
(bagian 3d).

## 3e. Satu pekerjaan di banyak blok — HK dibagi menurut luas

Aturannya tetap: **satu orang maksimal 1 HK per hari**. Tapi pekerjaannya sering
tersebar di beberapa blok. Daripada menghitung sendiri porsi tiap blok, cukup tulis
blok-bloknya dan biarkan aplikasi yang membagi.

**Di Excel** — kolom **Blok** boleh diisi lebih dari satu, dipisah koma (boleh juga
`;` atau `+`):

| Tanggal | NIK | Divisi | Blok | Bagi HK | Kegiatan | HK |
|---|---|---|---|---|---|---|
| 2026-12-01 | 165 | Padi | `P01, P02, P03` | Luas blok | BONGKAR LAHAN | 1 |

HK yang Anda tulis adalah **total orang itu untuk hari tersebut**, bukan per blok.
Satu baris Excel di atas otomatis jadi tiga baris data:

| Blok | Luas (ha) | HK | Upah |
|---|---|---|---|
| P01 | 0,9904 | 0,4516 | 36.128 |
| P02 | 0,6596 | 0,3007 | 24.056 |
| P03 | 0,5432 | 0,2477 | 19.816 |
| **Total** | 2,1932 | **1** | **80.000** |

Blok terakhir menyerap sisa pembulatan, jadi jumlahnya **persis** sama dengan HK yang
Anda ketik — tidak pernah jadi 0,99 atau 1,01.

Kolom **Bagi HK** punya dua pilihan:

- **Luas blok** — sebanding luas hektar tiap blok. Ini yang dipakai kalau kolomnya
  dikosongkan.
- **Rata** — tiap blok dapat bagian sama besar.

**Kalau ada blok yang luasnya belum diisi** di Master Blok, pembagian per luas tidak
dipakai (blok itu akan dapat 0 HK, yang jelas keliru). Aplikasi otomatis beralih ke
bagi rata, dan pratinjau impor menandainya dengan **"rata (luas kosong)"** di kolom
*Bagi* — jadi Anda tahu, bukan diam-diam. Saat ini luas blok Padi terisi 41 dari 44
(yang kosong: Barak, PH, All Area) dan Pisang 7 dari 8; blok Infrastruktur memang
tidak punya luas karena itu lokasi kerja, bukan hamparan tanam. Kalau ingin
pembagian per luas berjalan di suatu divisi, isi dulu kolom *Luas (ha)* di
**Master data → Blok**. Lembar **Daftar Pilihan** di template memuat kolom
*Luas blok (ha)* supaya bisa dicek dari Excel.

Lembur dan premi pada baris multi-blok **ditempel di blok pertama saja**, supaya tidak
terhitung berkali-kali.

**Di situs** — menu *HK harian* → **banyak pekerja & blok**. Setelah blok dicentang,
ada pilihan **Bagi HK ke blok**: *sesuai luas* atau *rata*. Ringkasan di bawahnya
langsung menunjukkan porsi tiap blok sebelum disimpan.

## 3d. Untuk kepala kebun

**Laporan Kebun** — biaya operasional satu kebun: berapa **HK** dan berapa
**rupiah**, dipecah per komponen (HK harian, borongan, lembur, premi, solar, servis).
Periodenya bisa dipilih:

- **Paruh 1** (tanggal 1–15) dan **Paruh 2** (16–akhir bulan) — mengikuti jadwal
  gajian TK 2 minggu sekali
- **Bulan penuh**
- **S.d. sekarang** — bulan berjalan sampai hari ini

Kalau targetnya sudah diisi, muncul batang pemakaian: terpakai berapa persen, sisa
berapa, dan peringatan kalau sudah lewat. Halaman ini bisa langsung di-**print** jadi
PDF untuk lampiran laporan.

Di bawah batang target ada kotak **Rekomendasi**, supaya pagu tidak cuma ketahuan
*setelah* lewat, tapi bisa direm selagi bulannya masih jalan:

- **laju sekarang** — rata-rata HK dan rupiah per hari sejauh ini
- **proyeksi** — kalau laju itu diteruskan, akhir periode jadi berapa; ditandai merah
  kalau bakal melewati target
- **jatah sisa** — misal target Pisang 35 juta dan baru terpakai sebagian: sisa
  anggaran dibagi sisa hari, lalu diubah jadi *maksimal sekian HK per hari* memakai
  biaya rata-rata per HK. Karena 1 orang maksimal 1 HK per hari, angka itu juga
  berarti "kira-kira sekian orang kerja penuh per hari".

Angkanya rata-rata lurus, bukan ramalan — dan dihitung dari upah HK harian, jadi
kalau masih ada rencana borongan/solar/servis, jatah HK sebenarnya lebih kecil.

**Target biaya** — mis. Pisang 35 juta/bulan. Diisi di menu **Target**
(**Pengaturan Kebun**) yang dikunci **PIN admin**, terpisah dari password data. Jadi
kepala kebun bisa melihat laporan dan targetnya, tapi tidak bisa mengubah angkanya.
Tiap kebun punya tiga angka: target paruh 1, paruh 2, dan bulan penuh — dan ada tombol
**Salin dari bulan lalu** supaya tidak perlu mengisi ulang tiap bulan.

> PIN ini pengaman dari kekeliruan, bukan pengaman penuh: orang yang sudah tahu
> password data pada dasarnya tetap bisa mengakalinya kalau benar-benar mau. Untuk
> pemisahan yang betul-betul ketat, bagian targetnya perlu password data sendiri.

**Persetujuan lembur & premi** — setiap lembur dan premi yang baru diinput berstatus
**menunggu** dan **belum dihitung** di laporan biaya. Menu **Persetujuan** (ada
penanda jumlah yang menunggu di menu) menampilkannya per divisi:

- **Setujui** → baris masuk hitungan, tercatat siapa yang menyetujui dan kapan
- **Tolak** → barisnya dihapus

Tiap kebun punya **PIN kepala kebun** sendiri, dipasang di **Pengaturan Kebun** (butuh
PIN admin), jadi kepala kebun Padi tidak bisa menyetujui lembur Pisang. Kebun yang
PIN-nya belum dipasang bisa disetujui tanpa PIN. Lembur/premi lama yang diinput
sebelum fitur ini ada tetap terhitung seperti biasa.

## 3f. Siapa boleh input & revisi apa

Menu **Pengguna** (dikunci PIN admin) menentukan siapa boleh mengisi dan merevisi
divisi mana:

| Nama | Divisi | Boleh |
|---|---|---|
| A — Admin Infra | Infrastruktur | Input, Revisi |
| Budi | Padi | Input saja |
| Kepala Pisang | Pisang | Input, Revisi, Setujui lembur, Lihat Laporan Kebun |
| Pak Haji | *(admin)* | Semua |

Setelah daftar ini diisi, tiap orang yang membuka situs memilih namanya lalu
memasukkan PIN. Sesudah itu:

- daftar divisi di setiap form **hanya berisi divisi dia**
- menginput atau merevisi divisi lain **ditolak** — lewat form maupun lewat impor
  Excel, yang menampilkan alasannya per baris
- **Laporan Kebun** hanya muncul untuk yang diberi hak *Lihat Laporan Kebun*
  (dan admin), dan isinya cuma kebun miliknya — kepala Padi tidak disuguhi
  angka Pisang
- menu **Persetujuan** hanya untuk yang punya hak *Setujui lembur & premi*
- **Master data** (karyawan, blok, kegiatan, unit) hanya bisa diubah admin
- namanya otomatis tercatat di tiap baris yang dia buat dan di tiap commit GitHub

Selama daftar Pengguna masih kosong, situs berjalan seperti biasa — siapa pun yang
punya token bisa mengisi apa saja.

> **Sejauh mana ini mengikat.** Yang dibatasi adalah **menulis**, bukan **melihat**.
> Semua data ada dalam satu berkas terkunci, jadi siapa pun yang tahu password data
> tetap bisa membaca seluruh divisi — itu sifat penyimpanannya, bukan sesuatu yang
> bisa ditutupi dari halaman. Pemeriksaan hak juga berjalan di peramban, jadi ini
> mencegah kekeliruan dan meninggalkan jejak siapa mengubah apa, bukan menahan orang
> yang paham teknis dan berniat menembusnya. Kalau suatu saat perlu pemisahan yang
> betul-betul mengikat, caranya adalah **tiap kebun punya berkas dan password data
> sendiri** — dengan konsekuensi laporan gabungan hanya bisa dibuka pemegang semua
> password.

### Riwayat & pemulihan

Setiap penyimpanan jadi satu commit. Menu **Riwayat perubahan** menampilkan siapa
menyimpan apa dan kapan. Versi lama tidak terhapus, jadi data bisa dikembalikan ke
keadaan kemarin lewat riwayat commit GitHub bila perlu — repo ini sekaligus
**cadangan di luar kantor**.

Sebelum setiap penyimpanan, situs juga membuat **cadangan lokal otomatis** di
perangkat yang dipakai (dua versi terakhir untuk tiap dataset). Dari halaman riwayat,
admin dapat memulihkan cadangan lokal atau versi commit GitHub. Pemulihan hanya
memuat versi pilihan sebagai perubahan lokal; klik **Simpan ke GitHub** setelah isinya
dipastikan benar.

### Pemeriksaan kualitas data

Admin mendapat menu **Pemeriksaan data**. Pemeriksaan ini menandai referensi master
yang rusak, satuan kosong, tarif nol, nominal yang tidak cocok, total HK di atas batas,
persetujuan yang terlalu lama, meter mundur, catatan solar tidak lengkap, kemungkinan
transaksi ganda, dan variasi keterangan akibat typo atau spasi.

Tombol **Perbaiki aman** hanya mengisi satuan yang kosong dan merapikan teks tanpa
mengubah angka keuangan atau menghapus transaksi. Kemungkinan transaksi ganda dan
perbedaan nominal tetap harus diputuskan manusia agar data yang sah tidak hilang.

---

## 4. Isi folder

```
index.html            halaman utama
css/style.css         tampilan
js/kunci.js           buka/kunci data (PBKDF2 + AES-256-CTR + HMAC-SHA256)
js/github.js          baca & tulis file lewat GitHub API
js/data.js            isi database di memori, simpan & muat
js/ui.js              perkakas tabel, form, dialog
js/app.js             kerangka, menu, perpindahan halaman
js/teks.js            normalisasi spasi dan saran typo
js/kualitas-data.js   mesin pemeriksaan kualitas data
js/pemeriksaan.js     halaman pemeriksaan dan perbaikan aman
js/skema-payroll.js   definisi tabel bagian Payroll
js/skema-alat.js      definisi tabel bagian Alat Berat & Kendaraan
js/master.js          halaman master data (dipakai kedua bagian)
js/transaksi.js       input HK, borongan, lembur, premi
js/laporan.js         ringkasan, payroll, rekap
js/input-alat.js      input log harian, solar, servis
js/laporan-alat.js    ringkasan unit, payroll operator, biaya lokasi, laporan harian
js/sistem.js          pengaturan & riwayat
js/kebun.js           laporan kebun, target, persetujuan
js/pengguna.js        siapa boleh input & revisi divisi mana
js/impor.js           impor dari Excel
js/xlsx.js            pembaca .xlsx tanpa pustaka luar
templates/            template Excel untuk diisi harian
data/                 file data terenkripsi (dibuat aplikasi desktop)
tests/                tes otomatis normalisasi dan pemeriksaan data
package.json          perintah tes (`npm test`, tanpa instalasi paket)
.nojekyll             matikan pemrosesan Jekyll di GitHub Pages
```

## 5. Catatan teknis

- Data dibaca lewat **GitHub API** supaya selalu versi terbaru; GitHub Pages
  menyimpan cache beberapa puluh detik, jadi tidak dipakai untuk membaca data.
- Tanpa token, batas permintaan GitHub API 60/jam per alamat IP. Dengan token jauh
  lebih longgar. Kalau batas itu kena, situs otomatis membaca file dari Pages.
- Enkripsi: PBKDF2-SHA256 200.000 iterasi → AES-256-CTR, keaslian dijaga
  HMAC-SHA256 (*encrypt-then-MAC*). Data yang diubah orang ketahuan sebelum dibuka.
- Satu file data berisi seluruh isi database, dikompres gzip dulu. 1.000 baris HK
  ≈ 16 KB. Batas aman satu file di GitHub API ±45 MB.
- Akun login, audit log, dan cadangan di aplikasi desktop **tidak** ikut tersinkron —
  itu tetap lokal di tiap komputer.
