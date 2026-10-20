// kunci.js — membuka & mengunci amplop data yang dibuat aplikasi desktop.
// Semuanya memakai Web Crypto bawaan browser (tanpa pustaka tambahan):
// PBKDF2-SHA256 → kunci, AES-256-CTR → isi, HMAC-SHA256 → pemeriksa keaslian.
// Harus sama persis dengan services/sync_kunci.py di aplikasi desktop.

const VERSI = 1;
const ITERASI_BAWAAN = 200000;

const b64ke = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const keB64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};

// PBKDF2 → 64 byte → 32 byte kunci AES + 32 byte kunci HMAC
async function turunkanKunci(password, salt, iterasi) {
  const dasar = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bit = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iterasi, hash: 'SHA-256' }, dasar, 512);
  const raw = new Uint8Array(bit);
  return {
    aes: await crypto.subtle.importKey('raw', raw.slice(0, 32), { name: 'AES-CTR' }, false, ['encrypt', 'decrypt']),
    mac: await crypto.subtle.importKey('raw', raw.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
  };
}

// nonce 8 byte + penghitung 64-bit → blok counter 16 byte (sama dengan sisi Python)
const blokCounter = (nonce) => {
  const c = new Uint8Array(16);
  c.set(nonce, 0);
  return c;
};

const gabung = (...bagian) => {
  const total = bagian.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const b of bagian) { out.set(b, i); i += b.length; }
  return out;
};

async function gunzip(u8) {
  // DecompressionStream ada di Chrome/Edge/Firefox/Safari modern.
  const aliran = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(aliran).arrayBuffer());
}

async function gzip(u8) {
  const aliran = new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(aliran).arrayBuffer());
}

/** Buka amplop terenkripsi → objek data. Password salah → Error. */
export async function bukaAmplop(amplop, password) {
  if (Number(amplop.v) !== VERSI) throw new Error('Versi data tidak dikenal (perbarui aplikasi).');
  const salt = b64ke(amplop.salt);
  const nonce = b64ke(amplop.nonce);
  const sandi = b64ke(amplop.data);
  const iterasi = Number(amplop.iter) || ITERASI_BAWAAN;
  const { aes, mac } = await turunkanKunci(password, salt, iterasi);

  const sah = await crypto.subtle.verify('HMAC', mac, b64ke(amplop.mac), gabung(salt, nonce, sandi));
  if (!sah) throw new Error('Password salah, atau file data sudah berubah/rusak.');

  const padat = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: blokCounter(nonce), length: 64 }, aes, sandi));
  return JSON.parse(new TextDecoder().decode(await gunzip(padat)));
}

/** Kunci objek data → amplop siap dikirim ke GitHub. */
export async function kunciAmplop(data, password, meta = {}, iterasi = ITERASI_BAWAAN) {
  const mentah = new TextEncoder().encode(JSON.stringify(data));
  const padat = await gzip(mentah);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(8));
  const { aes, mac } = await turunkanKunci(password, salt, iterasi);
  const sandi = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: blokCounter(nonce), length: 64 }, aes, padat));
  const tag = new Uint8Array(await crypto.subtle.sign('HMAC', mac, gabung(salt, nonce, sandi)));
  return {
    v: VERSI,
    alg: 'AES-256-CTR+HMAC-SHA256',
    kdf: 'PBKDF2-SHA256',
    iter: iterasi,
    salt: keB64(salt),
    nonce: keB64(nonce),
    mac: keB64(tag),
    data: keB64(sandi),
    meta,
  };
}
