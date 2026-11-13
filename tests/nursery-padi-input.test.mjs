import test from 'node:test';
import assert from 'node:assert/strict';

test('pengguna Padi dapat menambah HK Nursery Padi tanpa hak divisi lain', async () => {
  const storage = () => { const m = new Map(); return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}; };
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  const D = await import('../js/data.js');
  const P = await import('../js/pengguna.js');
  const { automaticGISData } = await import('../js/gis-model.js');
  const d = {aplikasi:'PayrollHK',tabel:{divisions:[{id:1,nama_divisi:'Padi'},{id:2,nama_divisi:'Pisang'}],blocks:[{id:5,nama_blok:'Nursery',division_id:2,luas:0,status:'Aktif'}],employees:[{id:1,nama:'UJI'}],daily_payroll:[],app_settings:[]},web:{pengguna:{u:{nama:'YUNI UJI',aktif:true,divisi:[1],hak:{input:true}}},gis:{}}};
  const catalog = {schema:1,revision:'u',as_of:'2026-11-13',blocks:[]};
  D.state.data = automaticGISData(d,catalog,'payrol').data; D.state.aplikasi='PayrollHK';
  sessionStorage.setItem('app.siapa','u'); P.pasangPenjaga();
  const n = D.aktif('blocks').find(x=>x.division_id===1 && x.nama_blok==='Nursery Padi');
  assert.ok(n);
  const r = D.tambah('daily_payroll',{employee_id:1,division_id:1,block_id:n.id,tanggal:'2026-11-13',hk:1,nominal:80000});
  assert.equal(r.block_id,n.id); assert.equal(D.baris('daily_payroll').length,1);
  assert.throws(()=>D.tambah('daily_payroll',{employee_id:1,division_id:2,block_id:5,tanggal:'2026-11-14',hk:1}),/tidak boleh/);
});
