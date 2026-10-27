const num=v=>Number(v)||0;
const hidup=(d,t)=>(d?.tabel?.[t]||[]).filter(r=>!r.deleted_at);
export const approved=(d,t,id)=>{const c=d?.web?.persetujuan?.[t]?.[String(id)];return !c||c.status==='disetujui';};
export function payrollLedger(data,from,to){
 const period=r=>r.tanggal>=from&&r.tanggal<=to,entries=[];
 const add=(r,type,amount,hk=0)=>entries.push({...r,type,amount:num(amount),hk:num(hk)});
 for(const r of hidup(data,'daily_payroll').filter(period))add(r,'hk',r.nominal,r.hk);
 for(const r of hidup(data,'borongan_transactions').filter(period))add(r,'borongan',r.nominal);
 const groups=new Map(hidup(data,'borongan_group').filter(period).map(r=>[Number(r.id),r]));
 for(const m of hidup(data,'borongan_group_members')){const g=groups.get(Number(m.group_id));if(g)add({...g,employee_id:m.employee_id,id:'group:'+g.id+':'+m.id},'borongan',m.nominal);}
 for(const [t,type] of [['lembur_transactions','lembur'],['premi_transactions','premi']])for(const r of hidup(data,t).filter(r=>period(r)&&approved(data,t,r.id)))add(r,type,r.nominal);
 return entries;
}
export function payrollWorkers(data,from,to){
 const workers=new Map(hidup(data,'employees').map(r=>[Number(r.id),r])),map=new Map();
 for(const r of payrollLedger(data,from,to)){const id=Number(r.employee_id),e=workers.get(id)||{},b=map.get(id)||{employee_id:id,nik:e.nik||'',nama:e.nama||`#${id}`,bank:e.bank||'',rekening:e.rekening||'',hari:new Set(),hk:0,upah_hk:0,borongan:0,lembur:0,premi:0};b.hk+=r.hk;b[r.type==='hk'?'upah_hk':r.type]+=r.amount;if(r.type==='hk')b.hari.add(r.tanggal);map.set(id,b);}
 return [...map.values()].map(b=>({...b,hari_kerja:b.hari.size,total:b.upah_hk+b.borongan+b.lembur+b.premi})).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
}
export function operatorPayroll(data,from,to){
 const operators=new Map(hidup(data,'operators').map(r=>[Number(r.id),r])),map=new Map();
 for(const r of hidup(data,'work_logs').filter(r=>r.tanggal>=from&&r.tanggal<=to)){const id=Number(r.operator_id),o=operators.get(id)||{},b=map.get(id)||{operator_id:id,nama:o.nama||`Operator #${id}`,bank:o.bank||'',rekening:o.no_rekening||'',hari:new Set(),hk:0,jam_hm:0,km:0,premi:0,upah_harian:0,upah_jam:0};b.hari.add(r.tanggal);b.hk+=num(r.hk);b.km+=Math.max(0,num(r.km_akhir)-num(r.km_awal));b.upah_harian+=num(r.hk)*num(o.tarif_harian);if(approved(data,'work_logs',r.id)){const jam=Math.max(0,num(r.hm_akhir)-num(r.hm_awal));b.jam_hm+=jam;b.premi+=num(r.premi);}map.set(id,b);}
 return [...map.values()].map(b=>({...b,hari_kerja:b.hari.size,total:b.upah_harian+b.upah_jam+b.premi})).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
}
