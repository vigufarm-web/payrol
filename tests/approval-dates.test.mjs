import test from 'node:test';import assert from 'node:assert/strict';import {pendingDates} from '../js/approval-dates.js';import {approvalSelection,approvalDateOptions} from '../js/approval-date-selection.js';
test('date notice only lists waiting dates and counts split work as one approval request',()=>{const rows=[{id:1,tanggal:'2026-10-23',group:'A'},{id:2,tanggal:'2026-10-23',group:'A'},{id:3,tanggal:'2026-10-24',group:'B'}];assert.deepEqual(pendingDates(rows,r=>r.group),[{date:'2026-10-23',count:1},{date:'2026-10-24',count:1}]);assert.deepEqual(pendingDates([]),[]);});

test('selected approval date survives empty queue, component recreation and dataset/scope separation',()=>{
 const data={},state=approvalSelection(data,'payroll:[1]');state.selected='2026-10-24';state.perDivision.set(1,'2026-10-24');
 assert.equal(approvalSelection(data,'payroll:[1]').selected,'2026-10-24');
 assert.deepEqual(approvalDateOptions(['2026-10-23'],state.selected),['2026-10-23','2026-10-24']);
 assert.deepEqual(approvalDateOptions([],state.selected),['2026-10-24']);
 assert.equal(approvalSelection(data,'payroll:[2]').selected,'');assert.equal(approvalSelection({},'payroll:[1]').selected,'');
});
