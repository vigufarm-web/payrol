import test from 'node:test';import assert from 'node:assert/strict';
import {buildGISPlan,applyGISPlan,transactionGISSnapshot,captureGISSnapshot,historicalGISMaster,currentGISDate,assertGISMasterEdit,assertGISBlockActive,createGISLocalBlocks,assertGISMerge,assertGISMasterStructure,setGISGeneralLocations} from '../js/gis-model.js';
const catalog=()=>({schema:1,revision:'revision-1',blocks:[{id:'permanent-gis-id',name:'A01-new',aliases:['A01'],commodity:'Pisang',active:true,gis_area_ha:2,owned_area_ha:1.5,version:2,plantings:[{planted_on:'2025-05-22'}]}]});
const payroll=()=>({web:{tanamBlok:{17:'2025-05-22'}},tabel:{blocks:[{id:17,nama_blok:'A01',luas:2,komoditas:'Pisang',division_id:3}],divisions:[{id:3,nama_divisi:'Pisang'}],daily_payroll:[{id:10,block_id:17,hk:1,nominal:100000,tanggal:'2026-10-01'}]}});
test('reviewed GIS mapping keeps local numeric IDs, old quantities and original reference snapshots',()=>{
 const d=payroll(),old=structuredClone(d.tabel.daily_payroll);const result=applyGISPlan(d,catalog(),'payrol',{now:'2026-10-31T00:00:00Z'});
 assert.equal(result.applied,1);assert.equal(d.tabel.blocks[0].id,17);assert.equal(d.tabel.blocks[0].nama_blok,'A01-new');assert.equal(d.tabel.blocks[0].luas,2);assert.equal(d.web.gis.mappings[17],'permanent-gis-id');assert.deepEqual(d.tabel.daily_payroll,old);
 assert.equal(transactionGISSnapshot(d,'payrol','daily_payroll',d.tabel.daily_payroll[0]).name,'A01');assert.equal(transactionGISSnapshot(d,'payrol','daily_payroll',d.tabel.daily_payroll[0]).area_ha,2);assert.equal(historicalGISMaster(d,17,'2026-10-01').name,'A01');
 captureGISSnapshot(d,'payrol','daily_payroll',{id:11,block_id:17});assert.equal(d.web.gis.snapshots['daily_payroll:11'].gis_version,2);
 assert.throws(()=>assertGISMasterEdit(d,'payrol','blocks',17,{luas:3}),/Peta Kebun/);assert.doesNotThrow(()=>assertGISMasterEdit(d,'payrol','blocks',17,{luas:2}));
});
test('conflicting planting dates and ambiguous names cannot silently map',()=>{
 const d=payroll(),c=catalog();c.blocks[0].plantings[0].planted_on='2024-01-01';assert.equal(buildGISPlan(d,c,'payrol').rows[0].status,'date-conflict');assert.equal(applyGISPlan(d,c,'payrol').applied,0);assert.equal(d.web.tanamBlok[17],'2025-05-22');
 c.blocks.push({...c.blocks[0],id:'another-id'});assert.equal(buildGISPlan(payroll(),c,'payrol').rows[0].status,'ambiguous');
 assert.equal(applyGISPlan(payroll(),c,'payrol').applied,0);
});
test('multiple planting dates remain separate and inactive blocks reject new transactions',()=>{
 const d=payroll(),c=catalog();c.blocks[0].plantings.push({planted_on:'2025-06-01'});applyGISPlan(d,c,'payrol');assert.equal(currentGISDate(d,17),null);
 c.blocks[0].active=false;applyGISPlan(d,c,'payrol');assert.throws(()=>assertGISBlockActive(d,'payrol',{block_id:17}),/nonaktif/);assert.equal(d.tabel.daily_payroll[0].nominal,100000);
});
test('Gudang keeps material requests, quantities and historical area while updating linked master only',()=>{
 const d={web:{permintaanMaterial:{req:{items:[{alokasi:[{blok_id:9,luas_ha:2,qty:10}]}]}}},tabel:{master_blok:[{id:9,nama:'A01',divisi:'Pisang',luas_ha:2}],material_keluar:[{id:1,blok:'A01',jumlah:10}]}},before=structuredClone(d.web.permintaanMaterial);
 applyGISPlan(d,catalog(),'gudang');assert.equal(d.tabel.master_blok[0].id,9);assert.equal(d.tabel.master_blok[0].luas_ha,2);assert.deepEqual(d.web.permintaanMaterial,before);assert.equal(d.tabel.material_keluar[0].jumlah,10);assert.equal(transactionGISSnapshot(d,'gudang','material_keluar',d.tabel.material_keluar[0]).area_ha,2);
});
test('new local blocks are explicitly created only when division and name are unambiguous',()=>{
 const d=payroll(),c=catalog();c.blocks.push({...c.blocks[0],id:'new-gis',name:'A02',aliases:[]});const result=createGISLocalBlocks(d,c,'payrol');assert.equal(result.created,1);assert.equal(d.tabel.blocks[1].id,18);assert.equal(d.tabel.blocks[1].division_id,3);
 const e=payroll();e.tabel.divisions=[];assert.equal(createGISLocalBlocks(e,c,'payrol').created,0);
});
test('an unapproved date update cannot leak through the cached latest GIS catalog',()=>{
 const d=payroll(),c=catalog();applyGISPlan(d,c,'payrol');c.revision='second';c.blocks[0].plantings[0].planted_on='2024-01-01';assert.equal(applyGISPlan(d,c,'payrol',{automatic:true}).applied,0);assert.equal(currentGISDate(d,17),'2025-05-22');applyGISPlan(d,c,'payrol',{allowDateConflicts:true});assert.equal(currentGISDate(d,17),'2024-01-01');
});
test('large legacy payroll keeps one immutable baseline per block and concurrent GIS histories cannot overwrite',()=>{
 const d=payroll();d.tabel.daily_payroll=Array.from({length:15000},(_,id)=>({id,block_id:17,hk:1,nominal:100000}));const base=structuredClone(d);applyGISPlan(d,catalog(),'payrol');assert.equal(Object.keys(d.web.gis.legacy_baseline).length,1);assert.equal(Object.keys(d.web.gis.snapshots).length,0);assert.equal(d.tabel.daily_payroll.length,15000);const remote=structuredClone(d);remote.web.gis.revision='other';assert.throws(()=>assertGISMerge(base,d,remote),/perangkat lain/);assert.doesNotThrow(()=>assertGISMerge(base,d,base));
});

test('GIS authority prevents local master creation, deletion, edits and unmapped transactions',()=>{
 const d=payroll();applyGISPlan(d,catalog(),'payrol');d.web.gis.authoritative=true;
 assert.throws(()=>assertGISMasterStructure(d,'payrol','blocks'),/Peta Kebun/);
 assert.throws(()=>assertGISMasterEdit(d,'payrol','blocks',17,{luas:2}),/Peta Kebun/);
 assert.throws(()=>assertGISBlockActive(d,'payrol',{block_id:999}),/belum dipetakan/);
 assert.doesNotThrow(()=>assertGISBlockActive(d,'payrol',{}));
 assert.doesNotThrow(()=>assertGISBlockActive(d,'payrol',{block_id:17}));
 assert.equal(d.tabel.daily_payroll[0].nominal,100000);
});

test('reviewed general locations stay usable without inventing GIS geometry or area',()=>{const d=payroll();d.tabel.blocks.push({id:99,nama_blok:'Nursery',luas:0,division_id:3});applyGISPlan(d,catalog(),'payrol');setGISGeneralLocations(d,'payrol',[99]);d.web.gis.authoritative=true;assert.doesNotThrow(()=>assertGISBlockActive(d,'payrol',{block_id:99}));assert.throws(()=>setGISGeneralLocations(d,'payrol',[17]),/Lokasi umum/);});

test('Padi zero padding is normalized without changing IDs or merging ambiguous codes',()=>{const d=payroll(),c=catalog();d.tabel.blocks[0].nama_blok='P1';d.tabel.blocks[0].komoditas='Padi';d.tabel.divisions[0].nama_divisi='Padi';c.blocks[0].name='P01';c.blocks[0].aliases=[];c.blocks[0].commodity='Padi';c.blocks[0].plantings=[];assert.equal(buildGISPlan(d,c,'payrol').rows[0].gis.id,'permanent-gis-id');c.blocks.push({...c.blocks[0],id:'other',name:'P1'});assert.equal(buildGISPlan(d,c,'payrol').rows[0].status,'ambiguous');});

test('duplicate local masters share one GIS identity but retain history and one operational choice',()=>{const d=payroll();d.tabel.blocks.push({...d.tabel.blocks[0],id:18});applyGISPlan(d,catalog(),'payrol');assert.equal(d.tabel.blocks[1].gis_canonical_local_id,17);assert.throws(()=>assertGISBlockActive(d,'payrol',{block_id:18}),/duplikat/);assert.doesNotThrow(()=>assertGISBlockActive(d,'payrol',{block_id:17}));assert.equal(d.tabel.daily_payroll[0].block_id,17);});
