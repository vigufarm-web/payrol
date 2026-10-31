import {mountGISPanel} from './gis-panel.js';
// sistem.js — halaman Pengaturan (mode edit, token, dataset) dan
// Riwayat perubahan (diambil dari daftar commit repo).

import * as D from './data.js';
import * as gh from './github.js';
import * as P from './pengguna.js';
import {
  el, tabel, isian, kosongkan, pesan, tanya, waktu, angka, panel,
} from './ui.js';

// =====================================================================
// PENGATURAN
// =====================================================================
export function halamanSistem({ gambar, bisaEdit, muatUlangData, pengaturanAplikasi: A0 }) {
  const wadah = el('section');
  const lokasi = gh.lokasiRepo();

  // ---------------------------------------------------------- mode edit
  const inToken = el('input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  const statusToken = el('div');

  const aktifkan = async () => {
    const t = inToken.value.trim();
    if (!t) { inToken.focus(); return; }
    kosongkan(statusToken).append(el('p.bantuan', { teks: 'Memeriksa token…' }));
    try {
      const nama = await gh.periksaToken(t);
      gh.simpanToken(t);
      inToken.value = '';
      kosongkan(statusToken);
      pesan(`Mode edit aktif untuk ${nama}.`, 'sukses');
      gambar();
    } catch (e) {
      kosongkan(statusToken).append(el('div.kesalahan', { role: 'alert' }, [e.message]));
    }
  };

  const kotakEdit = el('div.lembar', {}, [
    el('div.lembar-kepala', {}, [
      el('h2', { teks: 'Mode edit' }),
      el('span.lencana-mode' + (bisaEdit() ? '.edit' : ''), {
        teks: bisaEdit() ? 'Aktif' : 'Tidak aktif',
      }),
    ]),
    el('div.lembar-isi', {}, D.modeLokal()
      ? [
        el('p', {
          teks: 'Halaman ini sedang dibuka tanpa repo GitHub (ujicoba di komputer). '
            + 'Data boleh diubah, tapi tombol Simpan akan mengunduh berkas hasilnya — '
            + 'tidak ada yang dikirim ke internet.',
        }),
        el('div.baris-isian', {}, [
          isian('Nama pengisi', el('input', {
            type: 'text', nilai: D.namaPengisi(), placeholder: 'mis. Budi (kantor kebun)',
            onchange: (e) => { D.setNamaPengisi(e.target.value); pesan('Nama disimpan.', 'sukses'); gambar(); },
          })),
        ]),
        el('p.bantuan', {
          teks: 'Setelah repo diupload dan halaman dibuka lewat alamat GitHub Pages, '
            + 'kotak ini berubah jadi tempat memasukkan token.',
        }),
      ]
      : bisaEdit()
      ? (() => {
        const dibagikan = !!D.web().token;
        const bolehAtur = !P.adaPengguna() || P.siapa()?.admin === true;
        return [
          el('p', { teks: gh.adaTokenLokal()
            ? 'Peramban ini boleh mengubah data dan menyimpannya kembali ke GitHub.'
            : 'Mode edit aktif otomatis — admin sudah membagikan token lewat berkas data terenkripsi.' }),
          el('div.baris-isian', {}, [
            isian('Nama pengisi', el('input', {
              type: 'text', nilai: D.namaPengisi(), placeholder: 'mis. Budi (kantor kebun)',
              onchange: (e) => { D.setNamaPengisi(e.target.value); pesan('Nama disimpan.', 'sukses'); gambar(); },
            }), { bantuan: 'Dicatat pada setiap penyimpanan.' }),
          ]),
          el('label', { style: 'display:flex;gap:.45rem;align-items:center;margin:.4rem 0 .8rem' }, [
            (() => {
              const c = el('input', { type: 'checkbox' });
              c.checked = A0.autoSimpanAktif();
              c.onchange = () => {
                A0.setAutoSimpan(c.checked);
                pesan(c.checked
                  ? 'Simpan otomatis AKTIF — perubahan terkirim sendiri beberapa detik setelah input.'
                  : 'Simpan otomatis mati — jangan lupa tekan tombol Simpan ke GitHub.', 'sukses', 6);
              };
              return c;
            })(),
            el('span', {}, [el('strong', { teks: 'Simpan otomatis' }),
              el('span.bantuan', { teks: ' — kirim sendiri ke GitHub beberapa detik setelah input terakhir.' })]),
          ]),
          el('label', { style: 'display:flex;gap:.45rem;align-items:center;margin:0 0 .8rem' }, [
            (() => {
              const c = el('input', { type: 'checkbox' });
              c.checked = A0.autoMuatAktif();
              c.onchange = () => {
                A0.setAutoMuat(c.checked);
                pesan(c.checked
                  ? 'Muat otomatis AKTIF — layar ini ikut tersegar saat admin lain menyimpan.'
                  : 'Muat otomatis mati — tekan "Muat ulang" untuk melihat perubahan admin lain.', 'sukses', 6);
              };
              return c;
            })(),
            el('span', {}, [el('strong', { teks: 'Muat otomatis' }),
              el('span.bantuan', { teks: ' — ambil data terbaru tiap ~45 detik, supaya tidak perlu tekan Muat ulang.' })]),
          ]),
          // berbagi token: cukup admin yang mengisi, yang lain otomatis
          bolehAtur && gh.adaTokenLokal() && !dibagikan ? el('div', { style: 'margin:.6rem 0' }, [
            el('button.tombol-samar', {
              type: 'button', teks: 'Bagikan token ke semua admin',
              onclick: () => {
                D.setWeb((w) => { w.token = gh.ambilToken(); });
                gh.setTokenBersama(gh.ambilToken());
                pesan('Token ikut tersimpan terenkripsi di berkas data. Klik Simpan ke GitHub '
                  + 'supaya berlaku — setelah itu semua admin otomatis mode edit.', 'sukses', 8);
                gambar();
              },
            }),
            el('p.bantuan', { teks: 'Token ikut dienkripsi bersama data, jadi hanya terbaca oleh '
              + 'yang tahu password data. Admin lain tidak perlu menempel token lagi.' }),
          ]) : null,
          dibagikan ? el('p.bantuan', {
            teks: 'Token sedang dibagikan ke semua admin lewat berkas data terenkripsi.',
          }) : null,
          bolehAtur && dibagikan ? el('button.tombol-samar', {
            type: 'button', teks: 'Berhenti membagikan token',
            onclick: async () => {
              if (!await tanya('Berhenti membagikan token?',
                'Admin lain kembali harus menempel token sendiri. Jangan lupa Simpan ke GitHub.',
                { ya: 'Berhenti', bahaya: true })) return;
              D.setWeb((w) => { delete w.token; });
              gh.setTokenBersama('');
              pesan('Token tidak lagi dibagikan. Klik Simpan ke GitHub supaya berlaku.', 'sukses', 7);
              gambar();
            },
          }) : null,
          gh.adaTokenLokal() ? el('button.tombol-bahaya', {
            type: 'button', teks: 'Keluar dari mode edit',
            onclick: async () => {
              if (!await tanya('Keluar dari mode edit?',
                'Token dihapus dari peramban ini. Data tetap bisa dilihat.',
                { ya: 'Keluar', bahaya: true })) return;
              gh.simpanToken('');
              pesan('Mode edit dimatikan.', 'sukses');
              gambar();
            },
          }) : null,
        ];
      })()
      : [
        el('p', { teks: 'Tanpa token, halaman ini hanya bisa menampilkan data. Untuk menambah atau mengubah data, masukkan token GitHub milik Anda. Token disimpan di peramban ini saja.' }),
        isian('Token GitHub', inToken),
        statusToken,
        el('button.tombol-utama', { type: 'button', teks: 'Periksa & aktifkan', onclick: aktifkan }),
        el('details', { style: 'margin-top:1rem' }, [
          el('summary', { teks: 'Cara membuat token' }),
          el('ol', { style: 'font-size:.9rem;padding-left:1.2rem' }, [
            el('li', { teks: 'Buka github.com → foto profil → Settings.' }),
            el('li', { teks: 'Developer settings → Personal access tokens → Fine-grained tokens.' }),
            el('li', { teks: 'Generate new token. Repository access: pilih repo ini saja.' }),
            el('li', { teks: 'Permissions → Repository permissions → Contents: Read and write.' }),
            el('li', { teks: 'Generate, lalu salin token dan tempel di kotak di atas.' }),
          ]),
          el('p.bantuan', { teks: 'Beri masa berlaku secukupnya (mis. 1 tahun) dan buat token terpisah untuk tiap orang, supaya bisa dicabut sendiri-sendiri.' }),
        ]),
      ]),
  ]);

  // ------------------------------------------------------------- status
  const m = D.state.meta || {};
  const j = m.jumlah || {};
  const kotakStatus = el('div.lembar', { style: 'margin-top:1.6rem' }, [
    el('div.lembar-kepala', {}, [
      el('h2', { teks: 'Status data' }),
      el('button.tombol-samar.tombol-kecil', { type: 'button', teks: 'Muat ulang', onclick: () => muatUlangData() }),
    ]),
    el('div.lembar-isi', {}, [
      tabel([{ l: 'Keterangan', k: 'k' }, { l: 'Isi', k: 'v' }], [
        { k: 'Dataset', v: m.label || '–' },
        { k: 'File di repo', v: D.state.path },
        { k: 'Repo', v: lokasi ? `${lokasi.owner}/${lokasi.repo} (${lokasi.branch || 'main'})` : 'tidak dikenali' },
        { k: 'Nomor revisi', v: String(D.state.data?.rev ?? '–') },
        { k: 'Terakhir disimpan', v: waktu(m.diperbarui) },
        { k: 'Oleh', v: m.dari || '–' },
        { k: 'Pekerja', v: angka(j.karyawan) },
        { k: 'Baris HK', v: angka(j.hk) },
        { k: 'Borongan / lembur / premi', v: `${angka(j.borongan)} / ${angka(j.lembur)} / ${angka(j.premi)}` },
        { k: 'Perubahan belum disimpan', v: D.state.belumDisimpan ? 'Ya' : 'Tidak' },
      ]),
    ]),
  ]);

  // ------------------------------------------------------------ dataset
  const daftar = D.state.daftar?.dataset || {};
  const pilihanDataset = Object.entries(daftar);
  const kotakDataset = el('div.lembar', { style: 'margin-top:1.6rem' }, [
    el('div.lembar-kepala', {}, [el('h2', { teks: 'Dataset' })]),
    el('div.lembar-isi', {}, [
      pilihanDataset.length
        ? tabel([
          { l: 'Nama', nilai: (r) => r[1].label || r[0] },
          { l: 'File', k: '0', nilai: (r) => r[0] },
          { l: 'Rev', nilai: (r) => r[1].rev, jenis: 'angka' },
          { l: 'Diperbarui', nilai: (r) => waktu(r[1].diperbarui) },
          {
            l: '',
            nilai: (r) => (r[0] === D.state.path
              ? el('span.lencana-mode.edit', { teks: 'Sedang dibuka' })
              : el('button.tombol-kecil', {
                type: 'button', teks: 'Buka',
                onclick: async () => {
                  if (D.state.belumDisimpan && !await tanya('Pindah dataset?',
                    'Perubahan yang belum disimpan akan hilang.', { ya: 'Pindah', bahaya: true })) return;
                  D.setPath(r[0]);
                  location.reload();
                },
              })),
          },
        ], pilihanDataset)
        : el('p.bantuan', { teks: 'Daftar dataset belum ada. File daftar.json dibuat otomatis setelah aplikasi desktop mengirim data.' }),
    ]),
  ]);

  wadah.append(kotakEdit, kotakStatus, kotakDataset);

  // -------------------------------------------- pengaturan repo manual
  if (!lokasi || lokasi.sumber === 'manual') {
    const inOwner = el('input', { type: 'text', nilai: lokasi?.owner || '', placeholder: 'mzbay10-sudo' });
    const inRepo = el('input', { type: 'text', nilai: lokasi?.repo || '', placeholder: 'payroll-kebun' });
    wadah.append(el('div.lembar', { style: 'margin-top:1.6rem' }, [
      el('div.lembar-kepala', {}, [el('h2', { teks: 'Alamat repo' })]),
      el('div.lembar-isi', {}, [
        el('p', { teks: 'Biasanya terdeteksi sendiri dari alamat GitHub Pages. Isi di sini kalau halaman dibuka dari tempat lain (mis. folder di komputer).' }),
        el('div.baris-isian', {}, [isian('Pemilik (owner)', inOwner), isian('Nama repo', inRepo)]),
        el('button.tombol-utama', {
          type: 'button', teks: 'Simpan alamat repo',
          onclick: () => {
            if (!inOwner.value.trim() || !inRepo.value.trim()) return;
            gh.setLokasiRepo(inOwner.value.trim(), inRepo.value.trim());
            pesan('Alamat repo disimpan.', 'sukses');
            location.reload();
          },
        }),
      ]),
    ]));
  }

  mountGISPanel(wadah,{D,app:'payrol',isAdmin:P.adalahAdmin,canEdit:bisaEdit,markChanged:()=>D.setWeb(()=>{})});
  return wadah;
}

// =====================================================================
// RIWAYAT PERUBAHAN
// =====================================================================
export function halamanRiwayat({ bisaEdit = () => false, gambar = () => {} } = {}) {
  const tempat = el('div', {}, [el('p.bantuan', { teks: 'Mengambil riwayat dari GitHub…' })]);
  const cadangan = D.daftarCadanganLokal();
  const kotakCadangan = el('div.lembar', { style: 'margin-top:1.4rem' }, [
    el('div.lembar-kepala', {}, [el('h2', { teks: 'Cadangan lokal otomatis' })]),
    el('div.lembar-isi', {}, [
      el('p.bantuan', {
        teks: 'Sebelum setiap penyimpanan, aplikasi menyimpan dua versi sebelumnya secara terenkripsi di peramban ini.',
      }),
      tabel([
        { l: 'Waktu cadangan', nilai: (r) => waktu(r.waktu) },
        { l: 'Revisi', k: 'rev', jenis: 'angka' },
        {
          l: '', nilai: (r) => bisaEdit() ? el('button.tombol-samar.tombol-kecil', {
            type: 'button', teks: 'Pulihkan',
            onclick: async () => {
              const lanjut = await tanya('Pulihkan cadangan lokal?', el('div', {}, [
                el('p', { teks: `Data aktif akan diganti sementara dengan cadangan rev ${r.rev}.` }),
                el('p.bantuan', { teks: 'GitHub belum berubah. Periksa hasilnya, lalu klik Simpan ke GitHub jika benar.' }),
              ]), { ya: 'Pulihkan', tidak: 'Batal' });
              if (!lanjut) return;
              try {
                await D.pulihkanCadanganLokal(r.id);
                pesan('Cadangan dimuat. Periksa data lalu Simpan ke GitHub.', 'sukses', 8);
                gambar();
              } catch (e) { pesan(`Gagal memulihkan: ${e.message}`, 'galat', 8); }
            },
          }) : null,
        },
      ], cadangan, { kosong: 'Cadangan lokal akan muncul setelah penyimpanan berikutnya.' }),
    ]),
  ]);

  if (D.modeLokal()) {
    kosongkan(tempat).append(el('p.kosong', {
      teks: 'Riwayat diambil dari daftar commit repo. Belum ada repo yang terhubung '
        + '(halaman ini sedang diuji di komputer), jadi riwayatnya belum ada.',
    }));
    return el('section', {}, [
      el('div.lembar', {}, [
        el('div.lembar-kepala', {}, [el('h2', { teks: 'Riwayat perubahan' })]),
        el('div.lembar-isi', {}, [tempat]),
      ]),
      kotakCadangan,
    ]);
  }

  gh.daftarCommit(D.state.path).then((daftar) => {
    kosongkan(tempat).append(tabel([
      { l: 'Waktu', nilai: (r) => waktu(r.waktu) },
      { l: 'Perubahan', k: 'pesan' },
      { l: 'Akun GitHub', k: 'oleh' },
      { l: 'Kode', k: 'sha' },
      {
        l: '', nilai: (r) => bisaEdit() ? el('button.tombol-samar.tombol-kecil', {
          type: 'button', teks: 'Pulihkan',
          onclick: async () => {
            const lanjut = await tanya('Pulihkan versi GitHub?', el('div', {}, [
              el('p', { teks: `Versi ${r.sha} (${waktu(r.waktu)}) akan dimuat sebagai perubahan baru.` }),
              el('p.bantuan', { teks: 'Riwayat lama tidak dihapus. GitHub baru berubah setelah tombol Simpan ke GitHub ditekan.' }),
            ]), { ya: 'Pulihkan', tidak: 'Batal' });
            if (!lanjut) return;
            try {
              await D.pulihkanVersiGitHub(r.fullSha);
              pesan('Versi lama dimuat. Periksa data lalu Simpan ke GitHub.', 'sukses', 8);
              gambar();
            } catch (e) { pesan(`Gagal memulihkan: ${e.message}`, 'galat', 8); }
          },
        }) : null,
      },
    ], daftar, { kosong: 'Belum ada riwayat penyimpanan.' }));
  }).catch((e) => {
    kosongkan(tempat).append(el('div.kesalahan', { role: 'alert' }, [e.message]));
  });

  return el('section', {}, [
    el('div.lembar', {}, [
      el('div.lembar-kepala', {}, [el('h2', { teks: 'Riwayat perubahan' })]),
      el('div.lembar-isi', {}, [
        el('p.bantuan', {
          teks: 'Setiap penyimpanan — dari aplikasi desktop maupun dari halaman ini — tercatat sebagai satu titik pemulihan di GitHub. '
            + 'Versi lama tidak hilang, jadi data bisa dikembalikan ke keadaan hari sebelumnya bila perlu.',
        }),
        tempat,
      ]),
    ]),
    kotakCadangan,
  ]);
}
