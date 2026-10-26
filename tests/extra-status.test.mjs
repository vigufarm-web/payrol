import test from 'node:test';import assert from 'node:assert/strict';import {extraStatusRows} from '../js/extra-status.js';import {payrollLedger} from '../js/payroll-model.js';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};const D=await import('../js/data.js');
test('rejected overtime remains visible to input staff after soft deletion, without becoming payable or restoring data',()=>{
 D.state.data={aplikasi:'PayrollHK',web:{persetujuan:{lembur_transactions:{1:{status:'disetujui'},2:{status:'menunggu'},3:{status:'menunggu'},5:{status:'disetujui'}}}},tabel:{employees:[{id:1,nama:'Pekerja Uji'}],divisions:[{id:1,nama_divisi:'Pisang'},{id:2,nama_divisi:'Keamanan'}],daily_payroll:[],lembur_transactions:[{id:1,employee_id:1,division_id:1,tanggal:'2026-10-23',nominal:20000},{id:2,employee_id:1,division_id:1,tanggal:'2026-10-23',nominal:15000},{id:3,employee_id:1,division_id:1,tanggal:'2026-10-23',nominal:10000},{id:4,employee_id:1,division_id:2,tanggal:'2026-10-23',nominal:99999},{id:5,employee_id:1,division_id:1,tanggal:'2026-10-23',nominal:5000,deleted_at:'2026-10-24'}],premi_transactions:[],borongan_transactions:[],payroll_lock:[]}};
 D.tolak('lembur_transactions',3,'Kepala Pisang','Durasi perlu dikoreksi');const data=D.state.data,before=JSON.stringify(data),rows=extraStatusRows(data,{date:'2026-10-23',allowed:[1]});
 assert.equal(rows.length,3);const rejected=rows.find(r=>r.state==='ditolak');assert.equal(rejected.archived,true);assert.equal(rejected.actor,'Kepala Pisang');assert.equal(rejected.reason,'Durasi perlu dikoreksi');assert.ok(rejected.decidedAt);
 assert.equal(rows.some(r=>r.id==='lembur_transactions:5'),false);assert.equal(rows.some(r=>r.division==='Keamanan'),false);
 assert.equal(extraStatusRows(data,{date:'2026-10-24',allowed:[1]}).length,0);assert.equal(extraStatusRows(data,{date:'2026-10-23',allowed:[]}).length,0);
 assert.equal(payrollLedger(data,'2026-10-23','2026-10-23').filter(r=>r.type==='lembur'&&r.employee_id===1).reduce((s,r)=>s+r.amount,0),119999);
 assert.equal(JSON.stringify(data),before);
});
