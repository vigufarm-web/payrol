import {el,tabel,tanggal,waktu,angka} from './ui.js';
export function extraStatusRows(data,{date=null,from=null,to=null,allowed=null,tables=['lembur_transactions','premi_transactions']}={}){
 const employees=new Map((data?.tabel?.employees||[]).map(e=>[String(e.id),e.nama])),divisions=new Map((data?.tabel?.divisions||[]).map(d=>[String(d.id),d.nama_divisi])),scope=allowed===null?null:new Set(allowed.map(String)),rows=[];
 for(const table of tables)for(const r of data?.tabel?.[table]||[]){
  if(date&&r.tanggal!==date||(from||to)&&!r.tanggal||from&&r.tanggal<from||to&&r.tanggal>to)continue;
  if(scope&&r.division_id!=null&&!scope.has(String(r.division_id)))continue;
  const approval=data.web?.persetujuan?.[table]?.[String(r.id)],state=approval?.status;
  if(r.deleted_at&&state!=='ditolak')continue;
  rows.push({id:table+':'+r.id,date:r.tanggal,employee:employees.get(String(r.employee_id))||'#'+r.employee_id,division:divisions.get(String(r.division_id))||(r.division_id==null?'Tanpa divisi':'#'+r.division_id),type:table==='lembur_transactions'?'Lembur':'Premi',status:state==='disetujui'?'Sudah ACC':state==='ditolak'?'Ditolak':approval?'Menunggu':'Data lama',state:state||'legacy',amount:Number(r.nominal)||0,actor:approval?.oleh||'—',decidedAt:approval?.waktu||null,reason:approval?.alasan||'',archived:!!r.deleted_at});
 }
 return rows.sort((a,b)=>(a.state==='ditolak'?-1:0)-(b.state==='ditolak'?-1:0)||String(a.date).localeCompare(String(b.date))||a.division.localeCompare(b.division,'id')||a.employee.localeCompare(b.employee,'id'));
}
export function extraStatusDetails(rows){
 const approved=rows.filter(r=>r.state==='disetujui').length,pending=rows.filter(r=>!['disetujui','ditolak','legacy'].includes(r.state)).length,rejected=rows.filter(r=>r.state==='ditolak').length;
 return el('details.status-extra-details',{open:rejected>0},[
  el('summary',{teks:`Status lembur & premi · ${angka(approved)} ACC · ${angka(pending)} menunggu · ${angka(rejected)} ditolak`}),
  el('p.bantuan',{teks:'Ditolak ditampilkan untuk pengecekan, termasuk yang berada di Data terhapus. Arsip penolakan tidak dihitung sebagai upah dan tidak dipulihkan otomatis. Data lama tanpa keputusan dicatat terpisah dari ACC.'}),
  tabel([{l:'Tanggal',nilai:r=>tanggal(r.date)},{l:'Pekerja',k:'employee'},{l:'Divisi',k:'division'},{l:'Jenis',k:'type'},{l:'Status',nilai:r=>el('span.chip.'+(r.state==='ditolak'?'chip-tolak':r.state==='disetujui'?'chip-ok':'chip-tunggu'),{teks:r.status+(r.archived?' · arsip':'')})},{l:'Nominal pengajuan (Rp)',k:'amount',jenis:'uang'},{l:'Keputusan oleh',nilai:r=>r.actor+(r.decidedAt?' · '+waktu(r.decidedAt):'')},{l:'Alasan / catatan keputusan',nilai:r=>r.reason||'—'}],rows,{kosong:'Belum ada lembur atau premi pada pilihan ini.'})
 ]);
}
