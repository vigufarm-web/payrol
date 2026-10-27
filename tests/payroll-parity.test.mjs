import test from 'node:test';import assert from 'node:assert/strict';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
const D=await import('../js/data.js');const {dataRekap,susunRekap}=await import('../js/rekap-gaji.js');const {payrollWorkers,operatorPayroll}=await import('../js/payroll-model.js');const {compareMandorHK,cropDivision}=await import('../js/mandor-hk.js');
import {fixture,alat} from './payroll-fixture.mjs';
test('download and app agree on HK, group piecework, approval status and operator pay',async()=>{
 D.state.data=fixture();D.state.aplikasi='PayrollHK';const ui=payrollWorkers(D.state.data,'2026-10-26','2026-10-26'),op=operatorPayroll(alat,'2026-10-26','2026-10-26'),x=await dataRekap('2026-10-26','2026-10-26',{alatData:alat});
 const sum=(rows,f)=>rows.reduce((s,r)=>s+Number(r[f]||0),0),p=x.baris.filter(r=>r.identity.startsWith('p')),a=x.baris.filter(r=>r.identity.startsWith('a'));
 assert.equal(sum(ui,'total'),250000);assert.equal(sum(ui,'hk'),1.5);assert.equal(sum(p,'gaji')+sum(p,'tambahan'),sum(ui,'total'));assert.equal(sum(p,'hk'),1.5);assert.equal(sum(op,'total'),315000);assert.equal(sum(a,'gaji')+sum(a,'tambahan'),sum(op,'total'));assert.equal(sum(a,'hk'),3);assert.equal(sum(a,'gaji'),300000);assert.equal(sum(a,'tambahan'),15000);
 const sheets=await susunRekap('2026-10-26','2026-10-26',{alatData:alat}),total=sheets[0].baris.find(r=>r[1]?.v==='Grand Total');assert.equal(total[3].v,4.5);assert.equal(total[6].v,565000);assert.equal(op[0].upah_jam,0,'HM must not also become overtime');
 await assert.rejects(()=>dataRekap('2026-10-26','2026-10-26',{alatData:null}),/belum terbaca/);
});
test('HK declaration 64 vs admin 60 shows shortage 4; missing declaration is unknown, not zero',()=>{
 const d={tabel:{divisions:[{id:1,nama_divisi:'Padi'}],daily_payroll:[{tanggal:'2026-10-26',division_id:1,hk:60}]}};let r=compareMandorHK(d,[{tanggal:'2026-10-26',divisi:'Padi',declaredHK:64,activityHK:64}], '2026-10-26')[0];assert.equal(r.difference,-4);r=compareMandorHK(d,[],'2026-10-26')[0];assert.equal(r.difference,null);assert.equal(cropDivision('Padi + Infra'),null);assert.equal(compareMandorHK(d,[{tanggal:'2026-10-26',divisi:'Pisang',declaredHK:10}],'2026-10-26').length,1);
});

test('approved EX01 October 16, 19 and 20 pay HM premium once, preserving approvals and logs', async()=>{
 const d={aplikasi:'AlatBerat',web:{persetujuan:{work_logs:{}}},tabel:{operators:[{id:1,nama:'EX01 UJI',tarif_harian:100000,tarif_jam:15000}],work_logs:[]}};
 for(const [id,day,hm,premi] of [[1,'16',5.4,81000],[2,'19',6.7,100500],[3,'20',6.8,102000]]){
  d.tabel.work_logs.push({id,tanggal:`2026-10-${day}`,operator_id:1,hk:1,hm_awal:0,hm_akhir:hm,premi});
  d.web.persetujuan.work_logs[id]={status:'disetujui',oleh:'KEPALA UJI'};
 }
 const before=JSON.stringify(d);
 for(const r of d.tabel.work_logs){const p=operatorPayroll(d,r.tanggal,r.tanggal)[0];assert.equal(p.upah_jam,0);assert.equal(p.premi,r.premi);assert.equal(p.total,100000+r.premi);}
 D.state.data=fixture();const rows=(await dataRekap('2026-10-16','2026-10-20',{alatData:d})).baris.filter(r=>r.identity.startsWith('a'));
 assert.equal(rows.reduce((n,r)=>n+r.tambahan,0),283500);
 assert.equal(JSON.stringify(d),before,'calculation never mutates source data or approvals');
});
