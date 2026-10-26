import {el,tanggal,angka} from './ui.js';
export function pendingDates(rows,keyOf=r=>String(r.id)){
 const map=new Map();for(const r of rows){if(!r.tanggal)continue;const g=map.get(r.tanggal)||new Set();g.add(keyOf(r));map.set(r.tanggal,g);}return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([date,ids])=>({date,count:ids.size}));
}
export function approvalDateNotice(rows,onPick,{keyOf,selected}={}){
 const dates=pendingDates(rows,keyOf);return el('div.petunjuk.approval-date-notice',{},[el('strong',{teks:dates.length?'Tanggal yang perlu persetujuan':'Tidak ada tanggal yang menunggu persetujuan'}),el('div.approval-date-buttons',{},dates.map(d=>el('button.tombol-samar'+(d.date===selected?'.aktif':''),{type:'button',teks:`${tanggal(d.date)} · ${angka(d.count)} menunggu`,onclick:()=>onPick(d.date)})))]);
}
