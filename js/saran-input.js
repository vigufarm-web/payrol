// saran-input.js — pilihan keterangan lama yang bisa diklik.

import { el, kosongkan, tanya } from './ui.js';
import { rapikanKeterangan, kunciKeterangan, cariKeteranganSerupa } from './teks.js';

/**
 * Pasang riwayat pada input teks. `sumber` berisi { nilai, tanggal }.
 * Datalist tetap menyediakan seluruh riwayat, sedangkan tombol menampilkan
 * beberapa input terakhir/frekuen agar pengguna tidak perlu mengetik ulang.
 */
export function pasangSaranRiwayat(kendali, sumber) {
  const peta = new Map();
  for (const x of sumber || []) {
    const nilai = rapikanKeterangan(typeof x === 'string' ? x : x?.nilai);
    if (!nilai) continue;
    const lama = peta.get(nilai) || { nilai, jumlah: 0, terakhir: '' };
    lama.jumlah++;
    lama.terakhir = [lama.terakhir, String(x?.tanggal || '')].sort().at(-1);
    peta.set(nilai, lama);
  }
  const semua = [...peta.values()]
    .sort((a, b) => b.jumlah - a.jumlah || b.terakhir.localeCompare(a.terakhir) || a.nilai.localeCompare(b.nilai, 'id'))
    .slice(0, 300);
  if (!semua.length) {
    kendali._rapikanEjaan = () => { kendali.value = rapikanKeterangan(kendali.value); };
    return kendali;
  }

  const id = `saran${Math.random().toString(36).slice(2, 9)}`;
  kendali.setAttribute('list', id);
  kendali._datalist = el('datalist', { id }, semua.map((x) => el('option', { value: x.nilai })));

  const pilihan = el('div.saran-riwayat');
  const gambarPilihan = () => {
    const cari = kunciKeterangan(kendali.value);
    const cocok = [...semua]
      .filter((x) => !cari || kunciKeterangan(x.nilai).includes(cari))
      .sort((a, b) => b.terakhir.localeCompare(a.terakhir) || b.jumlah - a.jumlah)
      .slice(0, 8);
    kosongkan(pilihan);
    if (!cocok.length) return;
    pilihan.append(el('span.saran-riwayat-label', { teks: cari ? 'Pilih yang sudah pernah dipakai:' : 'Input terakhir:' }));
    for (const x of cocok) {
      pilihan.append(el('button.saran-riwayat-tombol', {
        type: 'button', teks: x.nilai,
        title: `Dipakai ${x.jumlah} kali${x.terakhir ? ` · terakhir ${x.terakhir}` : ''}`,
        onclick: () => {
          kendali.value = x.nilai;
          kendali.dispatchEvent(new Event('input', { bubbles: true }));
          kendali.focus();
          gambarPilihan();
        },
      }));
    }
  };
  kendali._pilihanSaran = pilihan;
  kendali.addEventListener('focus', gambarPilihan);
  kendali.addEventListener('input', gambarPilihan);
  gambarPilihan();

  const catatan = el('div.saran-ejaan', { hidden: true });
  kendali._catatanEjaan = catatan;
  const periksa = () => {
    kendali.value = rapikanKeterangan(kendali.value);
    kosongkan(catatan);
    catatan.hidden = true;
    const serupa = cariKeteranganSerupa(kendali.value, semua);
    if (!serupa || serupa.nilai === kendali.value) return serupa;
    if (serupa.jenis === 'sama') {
      kendali.value = serupa.nilai;
      catatan.hidden = false;
      catatan.textContent = `Spasi/ejaan dirapikan menjadi "${serupa.nilai}".`;
      return serupa;
    }
    catatan.hidden = false;
    catatan.append('Kemungkinan typo. Gunakan ejaan lama: ', el('button.tombol-tautan', {
      type: 'button', teks: serupa.nilai,
      onclick: () => {
        kendali.value = serupa.nilai;
        catatan.textContent = `Dipakai: "${serupa.nilai}".`;
        gambarPilihan();
      },
    }));
    return serupa;
  };
  kendali._rapikanEjaan = periksa;
  kendali.addEventListener('blur', periksa);
  return kendali;
}

/** Pastikan typo dekat dikonfirmasi sebelum penyimpanan. */
export async function pastikanSaran(kendali) {
  const cocok = kendali?._rapikanEjaan?.();
  if (!cocok || cocok.jenis !== 'mirip' || cocok.nilai === kendali.value) return;
  const gunakan = await tanya('Keterangan hampir sama', el('div', {}, [
    el('p', { teks: `Anda mengetik "${kendali.value}".` }),
    el('p', { teks: `Data lama memakai "${cocok.nilai}". Gunakan ejaan lama agar laporan tidak membuat pekerjaan kembar?` }),
  ]), { ya: 'Gunakan ejaan lama', tidak: 'Tetap tulisan baru' });
  if (gunakan) kendali.value = cocok.nilai;
}
