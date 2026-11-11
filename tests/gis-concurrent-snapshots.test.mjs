import test from 'node:test';
import assert from 'node:assert/strict';
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const {gabungTiga,drafTersimpan,state}=await import('../js/data.js');

const base=()=>({web:{gis:{mappings:{1:'g1'},snapshots:{},catalog:{revision:1}}},tabel:{daily_payroll:[],premi_transactions:[],blocks:[{id:1,nama_blok:'A01'}]}});
test('dua perangkat menambah transaksi dengan ID sama tanpa kehilangan snapshot',()=>{
 const b=base(),l=structuredClone(b),r=structuredClone(b);
 l.tabel.daily_payroll.push({id:1,block_id:1,hk:0.5});r.tabel.daily_payroll.push({id:1,block_id:1,hk:0.25});
 l.web.gis.snapshots['daily_payroll:1']={name:'lokal'};r.web.gis.snapshots['daily_payroll:1']={name:'remote'};
 const out=gabungTiga(b,l,r);assert.deepEqual(out.tabel.daily_payroll.map(x=>x.hk),[0.25,0.5]);assert.equal(out.web.gis.snapshots['daily_payroll:1'].name,'remote');assert.equal(out.web.gis.snapshots['daily_payroll:2'].name,'lokal');
});
test('perubahan GIS asli yang berbeda tetap ditolak',()=>{
 const b=base(),l=structuredClone(b),r=structuredClone(b);l.web.gis.mappings[1]='g2';r.web.gis.mappings[1]='g3';assert.throws(()=>gabungTiga(b,l,r),/Referensi GIS/);
});
test('input lokal mempertahankan snapshot saat referensi GIS remote diperbarui',()=>{
 const b=base(),l=structuredClone(b),r=structuredClone(b);l.tabel.daily_payroll.push({id:1,block_id:1,hk:0.5});l.web.gis.snapshots['daily_payroll:1']={gis_version:1};r.web.gis.catalog.revision=2;
 const out=gabungTiga(b,l,r);assert.equal(out.web.gis.catalog.revision,2);assert.equal(out.web.gis.snapshots['daily_payroll:1'].gis_version,1);
});
test('persetujuan yang diubah bersamaan tidak saling menimpa',()=>{
 const b=base();b.web.persetujuan={premi_transactions:{1:{status:'menunggu'}}};const l=structuredClone(b),r=structuredClone(b);l.web.persetujuan.premi_transactions[1]={status:'disetujui'};r.web.persetujuan.premi_transactions[1]={status:'ditolak'};
 assert.throws(()=>gabungTiga(b,l,r),/Persetujuan transaksi/);
});
test('perubahan transaksi yang sama pada dua perangkat tidak menimpa',()=>{
 const b=base();b.tabel.daily_payroll=[{id:1,hk:0.5}];const l=structuredClone(b),r=structuredClone(b);l.tabel.daily_payroll[0].hk=0.6;r.tabel.daily_payroll[0].hk=0.7;assert.throws(()=>gabungTiga(b,l,r),/perangkat lain/);
});
test('penyimpanan bersamaan ditolak bila HK gabungan melebihi satu',()=>{
 const b=base(),l=structuredClone(b),r=structuredClone(b);l.tabel.daily_payroll.push({id:1,employee_id:4,tanggal:'2026-11-11',hk:0.6});r.tabel.daily_payroll.push({id:1,employee_id:4,tanggal:'2026-11-11',hk:0.6,created_at:'lain'});assert.throws(()=>gabungTiga(b,l,r),/Maksimal 1 HK/);
});
test('draf lama diarsip terenkripsi ketika versi GitHub lebih baru',async()=>{
 state.path='data/payroll.json';state.data={rev:9};const original=JSON.stringify({rev:8,waktu:'2026-11-11',amp:{ciphertext:'terenkripsi'}});store.set('app.draf.data/payroll.json',original);
 const d=await drafTersimpan();assert.equal(d.basi,true);assert.equal(store.get(d.arsip),original);assert.equal(store.has('app.draf.data/payroll.json'),false);
});
test('draf lama tidak dihapus jika penyimpanan browser penuh',async()=>{
 state.path='data/payroll.json';state.data={rev:9};const original=JSON.stringify({rev:8,waktu:'2026-11-11',amp:{}});store.set('app.draf.data/payroll.json',original);const save=localStorage.setItem;localStorage.setItem=()=>{throw Error('full');};
 try{await assert.rejects(drafTersimpan(),/penuh/);assert.equal(store.get('app.draf.data/payroll.json'),original);}finally{localStorage.setItem=save;}
});
