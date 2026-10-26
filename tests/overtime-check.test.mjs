import test from 'node:test';import assert from 'node:assert/strict';
globalThis.localStorage={getItem:()=>null};
const {overtimeByDate,inputTotalsByDivision}=await import('../js/overtime-check.js');
test('admin sees per-date approval counts and money including overtime without HK, never trash or other dates',()=>{
 const data={web:{persetujuan:{lembur_transactions:{1:{status:'disetujui'},2:{status:'menunggu'},3:{status:'ditolak'},6:{status:'menunggu'}}}},tabel:{daily_payroll:[],lembur_transactions:[
 {id:1,tanggal:'2026-10-23',nominal:20000},{id:2,tanggal:'2026-10-23',nominal:15000},{id:3,tanggal:'2026-10-23',nominal:10000},{id:4,tanggal:'2026-10-23',nominal:5000},{id:5,tanggal:'2026-10-24',nominal:99999},{id:6,tanggal:'2026-10-23',nominal:99999,deleted_at:'today'}]}};
 const r=overtimeByDate(data,'2026-10-23');assert.deepEqual(r.map(x=>x.count),[1,1,1,1]);assert.deepEqual(r.map(x=>x.amount),[20000,15000,10000,5000]);
 data.web.persetujuan.lembur_transactions[1].status='menunggu';assert.deepEqual(overtimeByDate(data,'2026-10-23').map(x=>x.count),[0,2,1,1]);
 assert.equal(overtimeByDate(data,'2026-10-25').every(x=>x.count===0&&x.amount===0),true);
});

test('input totals group Pisang and Keamanan by transaction division regardless of author or ACC, preserving access scope',()=>{
 const data={web:{persetujuan:{lembur_transactions:{1:{status:'menunggu'},2:{status:'ditolak'}}}},tabel:{divisions:[{id:1,nama_divisi:'Pisang'},{id:2,nama_divisi:'Keamanan'}],daily_payroll:[{id:1,tanggal:'2026-10-23',division_id:1,hk:1,nominal:80000},{id:2,tanggal:'2026-10-23',division_id:2,hk:0.5,nominal:50000}],lembur_transactions:[{id:1,tanggal:'2026-10-23',division_id:1,nominal:20000},{id:2,tanggal:'2026-10-23',division_id:2,nominal:10000},{id:3,tanggal:'2026-10-24',division_id:1,nominal:999},{id:4,tanggal:'2026-10-23',division_id:1,nominal:999,deleted_at:'today'}],premi_transactions:[{id:1,tanggal:'2026-10-23',division_id:2,nominal:5000}]}};
 const before=JSON.stringify(data),rows=inputTotalsByDivision(data,'2026-10-23',[1,2]);
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.division==='Pisang').total,100000);
 assert.equal(rows.find(r=>r.division==='Keamanan').total,65000);
 assert.equal(rows.reduce((n,r)=>n+r.hk,0),1.5);
 assert.deepEqual(inputTotalsByDivision(data,'2026-10-23',[1]).map(r=>r.division),['Pisang']);
 assert.deepEqual(inputTotalsByDivision(data,'2026-10-23',[]),[]);
 assert.equal(JSON.stringify(data),before);
});
