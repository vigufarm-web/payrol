import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetMix} from '../js/budget-mix.js';
const base = () => ({hk:[
 {employee_id:1,hk:2,nominal:160000},
 {employee_id:2,hk:1,nominal:100000},
 {employee_id:3,hk:1,nominal:120000},
 {employee_id:4,hk:20,nominal:1600000,deleted_at:'2026-10-23'},
],upahPremi:20000,upahLembur:30000,upahBorongan:10000,
menunggu:{premi:[{nominal:10000}],lembur:[{nominal:20000}]}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<0.001,`${a} != ${b}`);
test('reserves higher wage workers at one HK each per day before lowest wage remainder',()=>{
 const m=budgetMix(base(),2500000,8);
 assert.equal(m.rate,95000);assert.equal(m.pending,30000);assert.equal(m.available,2470000);
 assert.equal(m.feasible,true);
 assert.deepEqual(m.groups.map(g=>g.rate),[120000,100000,80000]);
 assert.deepEqual(m.groups.slice(0,2).map(g=>g.hkPerDay),[1,1]);
 near(m.groups[2].hk,(2470000-2120000)/102500);
 near(m.allocations.reduce((n,r)=>n+r.amount,0),2470000);
 near(m.allocations[1].amount,m.hk*7500);
 near(m.allocations[2].amount,m.hk*12500);
});
test('two people at 100k are two HK/day; both 85k and 100k groups are protected above 80k',()=>{
 const b={hk:[80000,85000,100000,100000].map((rate,i)=>({employee_id:i+1,hk:1,nominal:rate})),menunggu:{}};
 const m=budgetMix(b,365000,1);
 assert.equal(m.groups.find(g=>g.rate===100000).hkPerDay,2);
 assert.equal(m.groups.find(g=>g.rate===85000).hkPerDay,1);
 assert.equal(m.groups.find(g=>g.rate===80000).hkPerDay,1);
 assert.equal(m.hkPerDay,4);
});
test('insufficient priority budget reports shortage instead of silently reducing protected HK',()=>{
 const m=budgetMix(base(),500000,8);
 assert.equal(m.feasible,false);assert.equal(m.required,2120000);
 assert.equal(m.priorityShortage,1650000);assert.equal(m.hk,0);
});
test('does not count split blocks twice and uses each workers latest dated rate',()=>{
 const b={hk:[
 {employee_id:1,tanggal:'2026-10-20',hk:1,nominal:90000},
 {employee_id:1,tanggal:'2026-10-23',hk:0.5,nominal:50000},
 {employee_id:1,tanggal:'2026-10-23',hk:0.5,nominal:50000},
 {employee_id:2,tanggal:'2026-10-23',hk:1,nominal:80000},
 ]};
 const m=budgetMix(b,180000,1);
 assert.equal(m.groups[0].rate,100000);assert.equal(m.groups[0].employees,1);
 assert.equal(m.hk,2);assert.equal(m.groups.length,2);
});
test('no default rate, invalid input and finished period do not invent a plan',()=>{
 assert.equal(budgetMix({hk:[]},100000,8).valid,false);
 assert.equal(budgetMix(base(),500000,0).valid,false);
 const m=budgetMix(base(),10000,8);assert.equal(m.shortage,20000);assert.equal(m.hk,0);
 const b=base();b.hk.push({employee_id:5,hk:1,nominal:0});
 assert.equal(budgetMix(b,500000,8).valid,false);
});
test('excess budget cannot push any active worker beyond one HK/day or force extra premiums',()=>{
 const m=budgetMix(base(),100000000,2);
 assert.equal(m.hk,6);assert.equal(m.hkPerDay,3);assert.ok(m.unallocated>0);
 near(m.allocations.reduce((n,r)=>n+r.amount,0)+m.unallocated,m.available);
 assert.equal(m.groups.every(g=>g.hkPerDay<=g.employees),true);
});
