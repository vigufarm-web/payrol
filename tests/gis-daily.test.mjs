import test from 'node:test';
import assert from 'node:assert/strict';
import {gisSyncDay,gisSyncDue,automaticGISData} from '../js/gis-model.js';
import {synchronizeGIS} from '../js/gis-panel.js';
const access={app:'payrol',token:'fixture-only',origin:'https://laporankebun.vercel.app',expires:null};
const source=()=>({tabel:{divisions:[{id:1,nama_divisi:'Pisang'}],blocks:[{id:7,nama_blok:'A01',division_id:1,luas:1}],hk:[{id:1,block_id:7,jumlah:12,tanggal:'2026-10-01'}]},web:{tanamBlok:{7:'2025-01-01'},gis:{reference_access:access}}});
const catalog=()=>({schema:1,revision:'r1',as_of:'2026-10-31',blocks:[{id:'uuid-A',name:'A01',commodity:'Pisang',active:true,version:2,gis_area_ha:2,aliases:[],plantings:[]},{id:'uuid-M',name:'M01',commodity:'Mangga',active:true,version:1,gis_area_ha:3,aliases:[],plantings:[]}]});
test('daily 06.00 WIB boundary is exact across dates, months and years',()=>{
 assert.equal(gisSyncDay('2026-10-30T22:59:59.999Z'),'2026-10-30');
 assert.equal(gisSyncDay('2026-10-30T23:00:00.000Z'),'2026-10-31');
 assert.equal(gisSyncDay('2026-12-31T23:00:00.000Z'),'2027-01-01');
 const d=source();d.web.gis.last_success_day='2026-10-30';assert.equal(gisSyncDue(d,'2026-10-30T22:59:59Z'),false);assert.equal(gisSyncDue(d,'2026-10-30T23:00:00Z'),true);
});
test('automatic refresh creates GIS commodities and blocks, preserves IDs and transactions, clears obsolete planting date',()=>{
 const original=source(),before=structuredClone(original),r=automaticGISData(original,catalog(),'payrol','2026-10-31T00:00:00Z');
 assert.deepEqual(original,before);assert.deepEqual(r.data.tabel.hk,before.tabel.hk);assert.equal(r.data.tabel.blocks[0].id,7);assert.equal(r.data.tabel.blocks[0].luas,2);assert.equal(r.data.web.tanamBlok[7],undefined);assert.equal(r.data.web.gis.legacy_baseline[7].planted_on,'2025-01-01');
 assert.ok(r.data.tabel.divisions.some(d=>d.nama_divisi==='Mangga'));assert.equal(r.created,1);assert.equal(r.data.web.gis.last_success_day,'2026-10-31');
 const again=automaticGISData(r.data,catalog(),'payrol','2026-10-31T01:00:00Z');assert.equal(again.created,0);assert.equal(again.applied,0);assert.equal(again.data.tabel.blocks.length,2);
});
test('automatic refresh follows permanent identities for renames, inactivation and same-name blocks',()=>{
 let r=automaticGISData(source(),catalog(),'payrol').data;const c=catalog();c.revision='r2';c.blocks[0].name='A01-baru';c.blocks[0].active=false;c.blocks.push({...c.blocks[1],id:'uuid-M2'});
 r=automaticGISData(r,c,'payrol').data;assert.equal(r.tabel.blocks.find(b=>b.id===7).gis_active,false);assert.equal(Object.values(r.web.gis.mappings).filter(id=>id==='uuid-M2').length,1);assert.equal(r.tabel.blocks.filter(b=>b.nama_blok==='M01').length,2);
});
test('a readonly user receives references without requiring an admin or write token',async()=>{
 const D={state:{data:source(),belumDisimpan:false}};let writes=0;const r=await synchronizeGIS({D,app:'payrol',canEdit:()=>false,markChanged:()=>writes++,save:()=>writes++,load:async()=>catalog(),clock:()=>'2026-10-31T00:00:00Z'});assert.equal(r.skipped,undefined);assert.equal(writes,0);assert.equal(D.state.data.tabel.blocks[0].luas,2);assert.equal(D.state.belumDisimpan,false);
});
test('successful checks run once per day and write automatically when available',async()=>{
 const D={state:{data:source(),belumDisimpan:false}};let reads=0,writes=0;const options={D,app:'payrol',canEdit:()=>true,markChanged:()=>D.state.belumDisimpan=true,save:async()=>{writes++;D.state.belumDisimpan=false;},load:async()=>{reads++;return catalog();},clock:()=>'2026-10-31T00:00:00Z'};
 assert.equal((await synchronizeGIS(options)).persisted,true);assert.equal((await synchronizeGIS(options)).skipped,true);assert.equal(reads,1);assert.equal(writes,1);
});
test('failed network or malformed catalog preserves last data and permits retry',async()=>{
 const D={state:{data:source(),belumDisimpan:false}},before=structuredClone(D.state.data);await assert.rejects(synchronizeGIS({D,app:'payrol',load:async()=>{throw Error('offline');}}),/offline/);assert.deepEqual(D.state.data,before);assert.equal(gisSyncDue(D.state.data),true);
 const c=catalog();c.blocks[0].gis_area_ha=-1;await assert.rejects(synchronizeGIS({D,app:'payrol',load:async()=>c}),/tidak valid/);assert.deepEqual(D.state.data,before);
});
test('an input or dataset change during fetch defers update instead of overwriting user work',async()=>{
 for(const reason of ['dirty','dataset','form']){const D={state:{data:source(),belumDisimpan:false}};let form=false;const before=D.state.data;const r=await synchronizeGIS({D,app:'payrol',isBusy:()=>form,load:async()=>{if(reason==='dirty')D.state.belumDisimpan=true;if(reason==='dataset')D.state.data={other:true};if(reason==='form')form=true;return catalog();}});assert.equal(r.deferred,true);assert.equal(before.tabel.blocks[0].luas,1);}
});
test('Gudang copies only GIS masters and preserves stock transaction numbers and original areas',()=>{
 const data={tabel:{master_blok:[{id:5,nama:'A01',divisi:'Pisang',luas_ha:1}],master_divisi:[],material_keluar:[{id:1,blok:'A01',jumlah:15}]},web:{gis:{reference_access:{...access,app:'gudang'}}}};const r=automaticGISData(data,catalog(),'gudang').data;assert.deepEqual(r.tabel.material_keluar,data.tabel.material_keluar);assert.equal(r.web.gis.legacy_baseline[5].area,1);assert.equal(r.tabel.master_blok[0].luas_ha,2);assert.ok(r.tabel.master_divisi.some(d=>d.nama==='Mangga'));
});

test('GIS-only rebase keeps concurrent staff transactions and uses remote numeric identities',async()=>{
 const {gisOnlyChanges,rebaseGISOnly}=await import('../js/gis-model.js');const base=source(),local=automaticGISData(base,catalog(),'payrol','2026-10-31T01:00:00Z').data,remote=structuredClone(base);remote.tabel.hk.push({id:2,block_id:7,jumlah:8});remote.tabel.blocks.push({id:8,nama_blok:'Lokasi staf',division_id:1,luas:0});
 assert.equal(gisOnlyChanges(base,local,'payrol'),true);const merged=rebaseGISOnly(base,local,remote,'payrol');assert.deepEqual(merged.tabel.hk,remote.tabel.hk);const m=merged.tabel.blocks.find(b=>b.gis_block_id==='uuid-M');assert.equal(m.id,9);assert.equal(merged.web.gis.mappings[9],'uuid-M');
 local.tabel.hk.push({id:3,jumlah:4});assert.throws(()=>rebaseGISOnly(base,local,remote,'payrol'),/Input pengguna berubah/);
});

test('failed GIS save retries without re-fetching and will not discard human input',async()=>{
 const D={state:{data:source(),path:'data/payroll.json',belumDisimpan:false}};let attempts=0,reads=0;const opts={D,app:'payrol',canEdit:()=>true,markChanged:()=>D.state.belumDisimpan=true,save:async()=>{attempts++;if(attempts===1)throw Error('offline write');D.state.belumDisimpan=false;},load:async()=>{reads++;return catalog();},clock:()=>'2026-10-31T00:00:00Z'};
 await assert.rejects(synchronizeGIS(opts),/offline write/);assert.ok(D.state.gisPending);assert.equal((await synchronizeGIS(opts)).persisted,true);assert.equal(attempts,2);assert.equal(reads,1);assert.equal(D.state.gisPending,undefined);
 attempts=0;D.state.data=source();await assert.rejects(synchronizeGIS(opts),/offline write/);D.state.data.tabel.hk.push({id:99,jumlah:8});assert.equal((await synchronizeGIS(opts)).deferred,true);assert.equal(attempts,1);assert.ok(D.state.data.tabel.hk.some(r=>r.id===99));
});
