import * as D from './data.js';
import {checkHKEntries} from './hk-entry-check.js';
import {tanya,el,hk as fhk,rupiahPenuh} from './ui.js';
export async function confirmHKEntries(rows,options={}){
 const check=checkHKEntries(D.state.data,rows,options);
 const cross=await D.petaHkBagianLain().catch(()=>[]);
 for(const g of check.groups){const other=D.hkLintas(cross,D.cari('employees',g.employee_id),g.tanggal);if(!other)continue;if(g.totalHK+other.hk>1+1e-9)throw Error(`${g.name} pada ${g.tanggal}: total termasuk ${other.bagian} menjadi ${g.totalHK+other.hk} HK. Maksimal 1 HK; penyimpanan ditolak.`);g.crossLabel=other.bagian;g.crossHK=other.hk;g.existingHK+=other.hk;g.totalHK+=other.hk;if(!check.repeats.includes(g))check.repeats.push(g);}
 if(!check.repeats.length)return true;
 const accepted=await tanya('Peringatan: pekerja sudah diinput pada tanggal ini',el('div',{},[
  el('p',{teks:'Periksa apakah input tambahan ini memang pekerjaan yang berbeda, bukan input kedua yang tidak sengaja. Total belum melewati 1 HK tetap wajib dikonfirmasi.'}),
  ...check.repeats.map(g=>el('div',{},[
   el('strong',{teks:`${g.name} · ${g.tanggal}: ${fhk(g.existingHK)} HK tercatat + ${fhk(g.addedHK)} HK baru = ${fhk(g.totalHK)} HK`}),
   g.crossHK?el('p',{teks:`Sudah tercatat ${fhk(g.crossHK)} HK di bagian ${g.crossLabel}.`}):null,
   ...g.existing.map(r=>el('p',{teks:`ID ${r.id} · ${D.labelRef('divisions',r.division_id)} · ${D.labelRef('blocks',r.block_id)} · ${r.job||D.labelRef('job_types',r.job_type_id)} · ${fhk(r.hk)} HK · ${rupiahPenuh(Number(r.nominal)||0)}`})),
   g.rows.length>1?el('p',{teks:g.rows.length+' baris dalam input ini untuk pekerja dan tanggal yang sama.'}):null
  ])),
 ]),{ya:'Sudah diperiksa, lanjutkan',tidak:'Batal — periksa dulu',bahaya:true});
 if(accepted)checkHKEntries(D.state.data,rows,options);
 return accepted;
}
