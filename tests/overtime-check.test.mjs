import test from 'node:test';import assert from 'node:assert/strict';
globalThis.localStorage={getItem:()=>null};
const {overtimeByDate}=await import('../js/overtime-check.js');
test('admin sees per-date approval counts and money including overtime without HK, never trash or other dates',()=>{
 const data={web:{persetujuan:{lembur_transactions:{1:{status:'disetujui'},2:{status:'menunggu'},3:{status:'ditolak'},6:{status:'menunggu'}}}},tabel:{daily_payroll:[],lembur_transactions:[
 {id:1,tanggal:'2026-10-23',nominal:20000},{id:2,tanggal:'2026-10-23',nominal:15000},{id:3,tanggal:'2026-10-23',nominal:10000},{id:4,tanggal:'2026-10-23',nominal:5000},{id:5,tanggal:'2026-10-24',nominal:99999},{id:6,tanggal:'2026-10-23',nominal:99999,deleted_at:'today'}]}};
 const r=overtimeByDate(data,'2026-10-23');assert.deepEqual(r.map(x=>x.count),[1,1,1,1]);assert.deepEqual(r.map(x=>x.amount),[20000,15000,10000,5000]);
 data.web.persetujuan.lembur_transactions[1].status='menunggu';assert.deepEqual(overtimeByDate(data,'2026-10-23').map(x=>x.count),[0,2,1,1]);
 assert.equal(overtimeByDate(data,'2026-10-25').every(x=>x.count===0&&x.amount===0),true);
});
