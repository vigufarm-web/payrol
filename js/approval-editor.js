import * as D from './data.js';import * as P from './pengguna.js';import {el,tanya,pesan,kosongkan} from './ui.js';
export function explainApproval(panel,table,row){
 if(!row||!['work_logs','lembur_transactions','premi_transactions'].includes(table))return;
 const notice=el('div.petunjuk'),fields=[...panel.badan.querySelectorAll('input,select,textarea,button')].map(x=>[x,x.disabled]),buttons=[...panel.badan.parentElement.querySelectorAll('.panel-kaki button')].filter(x=>/^(Simpan|Hapus)/.test(x.textContent));panel.badan.prepend(notice);
 const draw=()=>{const locked=D.tambahanTerkunci(table,row.id),closed=D.periodeTerkunci(row.tanggal);for(const [x,initial] of fields)x.disabled=closed||locked||initial;for(const b of buttons)b.disabled=closed||locked;kosongkan(notice);
  if(closed){notice.append(el('strong',{teks:'Periode sudah dikunci. Gunakan koreksi pada periode berikutnya.'}));return;}
  if(!locked){notice.append(el('strong',{teks:'Belum disetujui: boleh langsung direvisi atau dihapus.'}),el('p',{teks:'Setelah revisi, tambahan kembali menunggu persetujuan. Tidak perlu menghapus untuk memperbaiki salah input.'}));return;}
  notice.append(el('strong',{teks:'Transaksi ini sudah disetujui. Minta kepala divisi membatalkan persetujuan terlebih dahulu sebelum merevisi atau menghapus.'}),el('p',{teks:'Setelah dibatalkan, tambahan sementara keluar dari total pembayaran sampai disetujui ulang. HK dan operasi alat tetap tersimpan.'}));
  if(P.bolehBatal()&&(row.division_id==null||P.bolehDivisi(row.division_id)))notice.append(el('button.tombol-samar',{type:'button',teks:'Batalkan persetujuan untuk revisi',onclick:async()=>{if(!await tanya('Batalkan persetujuan?', 'Tambahan keluar dari total pembayaran sampai diajukan dan disetujui ulang. Jangan gunakan untuk mengubah pembayaran yang sudah dibayar.',{ya:'Batalkan persetujuan',tidak:'Kembali'}))return;try{D.batalkan(table,row.id,D.namaPengisi()||'Kepala divisi');pesan('Persetujuan dibatalkan. Silakan revisi, lalu simpan.','sukses');draw();}catch(e){pesan(e.message,'galat');}}}));
 };draw();
}
