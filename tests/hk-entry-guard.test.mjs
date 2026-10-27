import test from 'node:test';import assert from 'node:assert/strict';
import {checkHKEntries,singleSave} from '../js/hk-entry-check.js';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};const D=await import('../js/data.js');
const row=(hk,id=1,division_id=1)=>({id,employee_id:1,tanggal:'2026-10-20',division_id,hk,nominal:hk*80000});
const data=()=>({aplikasi:'PayrollHK',web:{},tabel:{employees:[{id:1,nama:'PEKERJA UJI'}],daily_payroll:[row(.5)],app_settings:[]}});
test('second half-day requires confirmation even when total is exactly 1; deleted and other people do not collide',()=>{
 const d=data(),before=JSON.stringify(d),r=checkHKEntries(d,[row(.5,2)]);assert.equal(r.repeats.length,1);assert.equal(r.repeats[0].totalHK,1);assert.equal(JSON.stringify(d),before);
 assert.equal(checkHKEntries(d,[{...row(.5,2),employee_id:2}]).repeats.length,0);
 d.tabel.daily_payroll[0].deleted_at='x';assert.equal(checkHKEntries(d,[row(.5,2)]).repeats.length,0);
});
test('over 1 HK is rejected across divisions, inside one batch, and when editing/restoring',()=>{
 const d=data();assert.throws(()=>checkHKEntries(d,[row(.51,2,2)]),/Maksimal 1 HK/);
 assert.throws(()=>checkHKEntries({...d,tabel:{...d.tabel,daily_payroll:[]}},[row(.6),row(.6,2)]),/Maksimal 1 HK/);
 assert.equal(checkHKEntries(d,[row(.5)],{excludeIds:[1]}).repeats.length,0);
 D.state.data=d;D.state.aplikasi='PayrollHK';assert.throws(()=>D.tambah('daily_payroll',row(.6,2)),/Maksimal 1 HK/);assert.equal(d.tabel.daily_payroll.length,1);
 D.tambah('daily_payroll',row(.5,2));assert.throws(()=>D.ubah('daily_payroll',2,{hk:.6}),/Maksimal 1 HK/);assert.equal(D.cari('daily_payroll',2).hk,.5);
});
test('multi-block split is one planned entry; repeated import rows are explicitly reviewed',()=>{
 const d=data();d.tabel.daily_payroll=[];const rs=[row(.5),row(.5,2)];assert.equal(checkHKEntries(d,rs).repeats.length,0);assert.equal(checkHKEntries(d,rs,{warnWithin:true}).repeats.length,1);assert.equal(checkHKEntries(d,rs.map(r=>({...r,_input_group:2})),{warnWithin:true}).repeats.length,0);assert.equal(checkHKEntries(d,rs.map((r,i)=>({...r,_input_group:i+2})),{warnWithin:true}).repeats.length,1);
});
test('double clicking while confirmation is pending cannot run save twice',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r),save=singleSave(async()=>{calls++;await gate;});const first=save();await save();assert.equal(calls,1);release();await first;await save();assert.equal(calls,2);
});
