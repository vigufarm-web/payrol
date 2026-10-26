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
test('uses recorded 80/100/120k rates, reserves pending, and balances all future components',()=>{
  const m=budgetMix(base(),500000,8);
  assert.equal(m.rate,95000); assert.equal(m.pending,30000);
  assert.equal(m.available,470000); assert.equal(m.hk,4);
  assert.deepEqual(m.groups.map(g=>g.rate),[80000,100000,120000]);
  assert.deepEqual(m.groups.map(g=>g.hk),[2,1,1]);
  assert.equal(m.allocations.reduce((n,r)=>n+r.amount,0),470000);
  assert.equal(m.allocations.find(r=>r.label==='Premi').amount,30000);
  assert.equal(m.allocations.find(r=>r.label==='Lembur').amount,50000);
});
test('no invented 80k fallback, handles zero days, depleted budget and incomplete wages',()=>{
  assert.equal(budgetMix({hk:[]},100000,8).valid,false);
  assert.equal(budgetMix(base(),500000,0).valid,false);
  const m=budgetMix(base(),10000,8);
  assert.equal(m.shortage,20000); assert.equal(m.hk,0);
  const b=base(); b.hk.push({employee_id:5,hk:1,nominal:0});
  assert.equal(budgetMix(b,500000,8).valid,false);
});
test('does not spend extra budget by exceeding active worker daily HK capacity',()=>{
  const m=budgetMix(base(),100000000,2);
  assert.equal(m.hk,4); assert.equal(m.hkPerDay,2);
  assert.ok(m.unallocated>0);
  assert.equal(m.allocations.reduce((n,r)=>n+r.amount,0)+m.unallocated,m.available);
});
