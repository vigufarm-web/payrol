// github.js — membaca & menulis file data di repo GitHub.
//
// Repo ini sekaligus jadi database: file data dibaca lewat GitHub API
// (selalu versi terbaru, tidak kena cache GitHub Pages) dan disimpan
// kembali lewat API memakai token milik pengguna.
//
// Owner & nama repo ditebak otomatis dari alamat GitHub Pages, jadi tidak
// ada yang perlu diatur setelah repo di-upload:
//     mzbay10-sudo.github.io/payroll-kebun  →  mzbay10-sudo / payroll-kebun

const API = 'https://api.github.com';
const lingkup=()=>typeof location==='undefined'?'local':location.hostname+'/'+(location.pathname.split('/').filter(Boolean)[0]||'root');
const kunciToken=()=> 'app.token.'+lingkup();
const kunciRepo=()=> 'app.repo.'+lingkup();

export function lokasiRepo() {
  // 1) Disetel manual (mis. saat dibuka dari komputer lokal untuk ujicoba)
  try {
    const legacy=JSON.parse(localStorage.getItem('app.repo')||'null');
    const pageOwner=location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i)?.[1],pageRepo=location.pathname.split('/').filter(Boolean)[0];
    const compatible=!pageOwner||(legacy?.owner?.toLowerCase()===pageOwner.toLowerCase()&&legacy?.repo===pageRepo);
    const manual=JSON.parse(localStorage.getItem(kunciRepo())||'null')||(compatible?legacy:null);
    if (manual?.owner && manual?.repo) return { ...manual, sumber: 'manual' };
  } catch { /* abaikan */ }

  // 2) Tebak dari alamat GitHub Pages
  const host = location.hostname;
  const cocok = host.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (cocok) {
    const owner = cocok[1];
    const bagian = location.pathname.split('/').filter(Boolean);
    // <owner>.github.io/<repo>/...  atau  <owner>.github.io  (repo = owner.github.io)
    const repo = bagian.length ? bagian[0] : `${owner}.github.io`;
    return { owner, repo, branch: 'main', sumber: 'pages' };
  }
  return null;
}

export function setLokasiRepo(owner, repo, branch = 'main') {
  localStorage.setItem(kunciRepo(), JSON.stringify({ owner, repo, branch }));
}

// Token bersama: admin bisa menyimpan token DI DALAM berkas data terenkripsi,
// sehingga admin lain otomatis masuk mode edit tanpa menempel token sendiri.
// Diisikan oleh data.js setiap kali berkas data berhasil dibuka.
let tokenBersama = '';
export const setTokenBersama = (t) => { tokenBersama = String(t || '').trim(); };

export const adaTokenLokal = () => !!localStorage.getItem(kunciToken())||(!tokenBersama&&!!localStorage.getItem('app.token')); 
export const ambilToken = () => localStorage.getItem(kunciToken()) || tokenBersama || localStorage.getItem('app.token') || ''; // legacy never overrides the dataset's own shared credential
export const simpanToken = (t) => {
  if (t) localStorage.setItem(kunciToken(), t.trim());
  else localStorage.removeItem(kunciToken());
};

function pesanGalat(kode, badan) {
  const pesan = badan?.message || '';
  if (kode === 401) return 'Token GitHub ditolak. Token salah atau sudah kedaluwarsa.';
  if (kode === 403 && /rate limit/i.test(pesan)) {
    return 'Batas permintaan ke GitHub tercapai. Tunggu beberapa menit, atau masuk mode edit (pakai token) agar batasnya jauh lebih besar.';
  }
  if (kode === 403) return 'Akses ditolak. Token perlu izin Contents: Read and write untuk repo ini.';
  if (kode === 404) return 'File data tidak ditemukan di repo.';
  if (kode === 409) return 'Data di repo baru saja berubah.';
  return `GitHub menjawab ${kode}${pesan ? ': ' + pesan : ''}`;
}

async function minta(metode, url, isi, token) {
  const kepala = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) kepala.Authorization = `Bearer ${token}`;
  if (isi) kepala['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(url, { method: metode, headers: kepala, body: isi ? JSON.stringify(isi) : undefined });
  } catch {
    throw new Error('Tidak bisa menghubungi GitHub. Periksa koneksi internet.');
  }
  const teks = await r.text();
  let badan = null;
  try { badan = teks ? JSON.parse(teks) : null; } catch { badan = { message: teks.slice(0, 200) }; }
  if (!r.ok) {
    const e = new Error(pesanGalat(r.status, badan));
    e.kode = r.status;
    throw e;
  }
  if(metode!=='GET'&&token&&token===localStorage.getItem('app.token'))localStorage.setItem(kunciToken(),token);
  return badan;
}

const dariBase64 = (b64) => {
  const bersih = b64.replace(/\n/g, '');
  const bin = atob(bersih);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u8);
};

const keBase64 = (teks) => {
  const u8 = new TextEncoder().encode(teks);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * Baca satu file JSON dari repo.
 * Mengembalikan { isi, sha } — isi null kalau filenya belum ada.
 */
export async function bacaFile(path, { token = ambilToken() } = {}) {
  const repo = lokasiRepo();
  if (repo) {
    const url = `${API}/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${repo.branch || 'main'}`;
    try {
      const badan = await minta('GET', url, null, token);
      let teks;
      if (badan.content && badan.encoding === 'base64') {
        teks = dariBase64(badan.content);
      } else {
        // File lebih dari 1 MB: isinya tidak disertakan → ambil lewat blob
        const blob = await minta(
          'GET', `${API}/repos/${repo.owner}/${repo.repo}/git/blobs/${badan.sha}`, null, token);
        teks = dariBase64(blob.content);
      }
      return { isi: JSON.parse(teks), sha: badan.sha };
    } catch (e) {
      if (e.kode === 404) return { isi: null, sha: '' };
      // Batas permintaan / jaringan → coba cara kedua di bawah
      if (e.kode !== 403) throw e;
    }
  }
  // Cara kedua: ambil file apa adanya dari situs ini (kena cache GitHub Pages
  // beberapa puluh detik, tapi cukup untuk sekadar melihat data).
  const r = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (r.status === 404) return { isi: null, sha: '' };
  if (!r.ok) throw new Error(`Tidak bisa membaca ${path} (${r.status}).`);
  return { isi: await r.json(), sha: '' };
}

/** Baca isi file pada commit tertentu. Dipakai pemulihan versi lama; tidak
 *  mengubah branch atau repo sampai pengguna menyimpan hasil pemulihan. */
export async function bacaFilePadaRef(path, ref, { token = ambilToken() } = {}) {
  const repo = lokasiRepo();
  if (!repo) throw new Error('Alamat repo tidak dikenali.');
  const url = `${API}/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const badan = await minta('GET', url, null, token);
  let teks;
  if (badan.content && badan.encoding === 'base64') {
    teks = dariBase64(badan.content);
  } else {
    const blob = await minta('GET', `${API}/repos/${repo.owner}/${repo.repo}/git/blobs/${badan.sha}`, null, token);
    teks = dariBase64(blob.content);
  }
  return { isi: JSON.parse(teks), sha: badan.sha };
}

/** Simpan file JSON ke repo (satu commit). Mengembalikan sha baru. */
export async function tulisFile(path, objek, sha, pesan, { token = ambilToken() } = {}) {
  if (!token) throw new Error('Belum ada token GitHub. Masuk mode edit dulu.');
  const repo = lokasiRepo();
  if (!repo) throw new Error('Alamat repo tidak dikenali. Buka situs ini lewat alamat GitHub Pages-nya.');
  const badan = {
    message: pesan,
    content: keBase64(JSON.stringify(objek)),
    branch: repo.branch || 'main',
  };
  if (sha) badan.sha = sha;
  const url = `${API}/repos/${repo.owner}/${repo.repo}/contents/${path}`;
  try {
    const jawab = await minta('PUT', url, badan, token);
    return jawab.content.sha;
  } catch (e) {
    if (e.kode === 409 || e.kode === 422) {
      const bentrok = new Error(
        'Data di repo sudah diubah dari tempat lain (komputer atau orang lain). '
        + 'Perubahan Anda belum disimpan — muat ulang data dulu.');
      bentrok.bentrok = true;
      throw bentrok;
    }
    throw e;
  }
}

/**
 * Daftar commit yang menyentuh satu file — dipakai halaman Riwayat.
 * Riwayat perubahan aplikasi ini memang riwayat commit repo-nya sendiri.
 */
export async function daftarCommit(path, { batas = 30, token = ambilToken() } = {}) {
  const repo = lokasiRepo();
  if (!repo) throw new Error('Alamat repo tidak dikenali.');
  const url = `${API}/repos/${repo.owner}/${repo.repo}/commits`
    + `?path=${encodeURIComponent(path)}&sha=${repo.branch || 'main'}&per_page=${batas}`;
  const badan = await minta('GET', url, null, token);
  return (badan || []).map((c) => ({
    sha: c.sha.slice(0, 7),
    fullSha: c.sha,
    pesan: c.commit?.message?.split('\n')[0] || '',
    waktu: c.commit?.author?.date || '',
    oleh: c.commit?.author?.name || c.author?.login || '',
  }));
}

/** Cek token: apakah berlaku dan boleh menulis ke repo ini. */
export async function periksaToken(token) {
  const repo = lokasiRepo();
  if (!repo) throw new Error('Alamat repo tidak dikenali.');
  const badan = await minta('GET', `${API}/repos/${repo.owner}/${repo.repo}`, null, token);
  if (!badan.permissions?.push) {
    throw new Error(`Token berlaku, tapi tidak punya izin menulis ke ${badan.full_name}. `
      + 'Beri izin Contents: Read and write.');
  }
  return badan.full_name;
}
