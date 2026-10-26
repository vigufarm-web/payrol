import * as D from './data.js';
import * as P from './pengguna.js';
import {el,kosongkan,tabel,tanggal} from './ui.js';
export function overtimeByDate(data,date){
 const states={disetujui:{label:'Sudah ACC',count:0,amount:0},menunggu:{label:'Belum ACC / menunggu',count:0,amount:0},ditolak:{label:'Ditolak',count:0,amount:0},legacy:{label:'Data lama tanpa catatan ACC',count:0,amount:0}};
 for(const r of data?.tabel?.lembur_transactions||[]){
  if(r.deleted_at||r.tanggal!==date)continue;
  const approval=data.web?.persetujuan?.lembur_transactions?.[String(r.id)];
  const status=!approval?'legacy':approval.status==='disetujui'?'disetujui':approval.status==='ditolak'?'ditolak':'menunggu';
  states[status].count++;states[status].amount+=Number(r.nominal)||0;
 }
 return Object.values(states);
}
export function overtimeCheckPanel(){
 const box=el('div.mandor-hk-box');
 return {box,refresh(date){
  kosongkan(box);if(P.adaPengguna()&&!P.adalahAdmin())return;
  const rows=overtimeByDate(D.state.data,date);
  box.append(el('h3',{teks:'Kontrol lembur admin · '+tanggal(date)}),tabel([
   {l:'Status lembur',k:'label'},{l:'Transaksi',k:'count',jenis:'angka',total:true},
   {l:'Nominal (Rp)',k:'amount',jenis:'uang',total:true},
  ],rows),el('small',{teks:'Total tabel = seluruh nominal input, bukan nilai yang dibayarkan. Seluruh lembur pada tanggal ini, termasuk yang belum memiliki baris HK; tidak mengikuti pencarian nama. Data lama tanpa catatan ACC dipisahkan untuk pengecekan, tetap mengikuti aturan payroll lama. Perubahan lokal ikut dihitung; simpan ke GitHub setelah selesai.'}));
 }};
}
