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
export function inputTotalsByDivision(data,date,allowed=null){
 const names=new Map((data?.tabel?.divisions||[]).map(d=>[String(d.id),d.nama_divisi]));
 const rows=new Map(),scope=allowed===null?null:new Set(allowed.map(String));
 for(const [table,field] of [['daily_payroll','wages'],['lembur_transactions','overtime'],['premi_transactions','premium']]){
  for(const r of data?.tabel?.[table]||[]){
   if(r.deleted_at||r.tanggal!==date)continue;
   const id=r.division_id==null?'':String(r.division_id);
   if(scope&&id&&!scope.has(id))continue;
   const g=rows.get(id)||{division:id?(names.get(id)||'Divisi #'+id):'Tanpa divisi',hk:0,wages:0,overtime:0,premium:0,total:0};
   g[field]+=Number(r.nominal)||0;if(table==='daily_payroll')g.hk+=Number(r.hk)||0;
   g.total=g.wages+g.overtime+g.premium;rows.set(id,g);
  }
 }
 return [...rows.values()].sort((a,b)=>a.division.localeCompare(b.division,'id'));
}
export function overtimeCheckPanel(){
 const box=el('div.mandor-hk-box');
 return {box,refresh(date){
  kosongkan(box);if(P.adaPengguna()&&!P.adalahAdmin()&&!P.bolehInput()&&!P.bolehRevisi())return;
  const rows=inputTotalsByDivision(D.state.data,date,P.divisiBoleh());
  box.append(el('h3',{teks:'Simulasi total input per divisi · '+tanggal(date)}),tabel([
   {l:'Divisi',k:'division'},{l:'HK',k:'hk',jenis:'hk',total:true},
   {l:'Upah HK (Rp)',k:'wages',jenis:'uang',total:true},
   {l:'Lembur input (Rp)',k:'overtime',jenis:'uang',total:true},
   {l:'Premi input (Rp)',k:'premium',jenis:'uang',total:true},
   {l:'Total simulasi (Rp)',k:'total',jenis:'uang',total:true},
  ],rows,{kosong:'Belum ada input pada tanggal ini.'}),el('small',{teks:'Simulasi seluruh input HK, lembur dan premi pada tanggal ini, termasuk belum ACC dan ditolak; bukan nilai pembayaran. Tidak mengikuti pencarian nama. Hanya divisi yang dapat Anda akses. Borongan dan HK operator alat terpisah. Aturan ACC dan nominal Excel tetap berlaku; simpan perubahan ke GitHub setelah selesai.'}));
 }};
}
