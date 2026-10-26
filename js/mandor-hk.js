import * as D from './data.js';
import * as P from './pengguna.js';
import {el,kosongkan,angka} from './ui.js';
export function cropDivision(name){const s=String(name||'').toLowerCase(),found=[/pisang/.test(s)&&'Pisang',/padi/.test(s)&&'Padi',/infra|alat berat|kendaraan/.test(s)&&'Infra'].filter(Boolean);return found.length===1?found[0]:null;}
export function compareMandorHK(data,reports,date){
 const names=new Map((data?.tabel?.divisions||[]).map(d=>[Number(d.id),cropDivision(d.nama_divisi)])),map=new Map();
 for(const r of data?.tabel?.daily_payroll||[]){if(r.deleted_at||r.tanggal!==date)continue;const division=names.get(Number(r.division_id));if(!division)continue;const g=map.get(division)||{adminHK:0,rows:0};g.adminHK+=Number(r.hk)||0;g.rows++;map.set(division,g);}
 const allowed=new Set([...names.values()].filter(Boolean)),divisions=new Set([...map.keys(),...reports.filter(r=>r.tanggal===date&&allowed.has(r.divisi)).map(r=>r.divisi)]);
 return [...divisions].map(division=>{const rs=reports.filter(r=>r.tanggal===date&&r.divisi===division),g=map.get(division)||{adminHK:0,rows:0},report=rs.length===1?rs[0]:null,declared=report?.declaredHK??null;return {division,...g,declaredHK:declared,activityHK:report?.activityHK??null,partial:report?.partial??false,difference:declared===null?null:g.adminHK-declared,duplicateReports:rs.length>1};});
}
let cache=new Map();
export async function fetchMandorHK(date,{force=false}={}){
 const old=cache.get(date);if(!force&&old&&Date.now()-old.at<60000)return old.value;
 const r=await fetch('https://laporankebun.vercel.app/api/daily/hk-summary?'+new URLSearchParams({from:date,to:date}),{credentials:'omit',signal:AbortSignal.timeout(12000),cache:'no-store'});if(!r.ok)throw new Error('Laporan mandor belum dapat dibaca');const value=await r.json();cache.set(date,{at:Date.now(),value});return value;
}
export function mandorHKPanel(getDate,{getDivision=null,load=fetchMandorHK}={}){
 const box=el('div.mandor-hk-box');let ticket=0;
 const refresh=async(force=false)=>{
  if(P.adaPengguna()&&!P.adalahAdmin()){kosongkan(box);return;}
  const n=++ticket,date=getDate();if(!date)return;box.textContent='Memeriksa total HK pernyataan mandor…';
  try{const d=await load(date,{force});if(n!==ticket)return;const division=getDivision?.(),rows=compareMandorHK(D.state.data,d.reports,date).filter(r=>!division||r.division===division);kosongkan(box).append(el('strong',{teks:`Kontrol HK mandor · ${date}`}),el('button.tombol-samar.tombol-kecil',{type:'button',teks:'Perbarui',onclick:()=>refresh(true)}));
   if(!rows.length)box.append(el('p',{teks:'Belum ada laporan mandor selesai untuk tanggal/divisi ini. Tidak dianggap 0 HK.'}));
   for(const r of rows){const f=v=>v==null?'Belum diisi':angka(v,2),status=r.duplicateReports?'Laporan ganda: periksa sumber.':r.difference===null?'Pernyataan mandor belum tersedia.':Math.abs(r.difference)<.0001?'Sesuai':`${r.difference<0?'Kurang':'Lebih'} ${angka(Math.abs(r.difference),2)} HK`;box.append(el('p',{teks:`${r.division}: Mandor ${f(r.declaredHK)} HK · Kegiatan ${f(r.activityHK)}${r.partial?' (belum lengkap)':''} · Input admin ${f(r.adminHK)} HK → ${status}`}));}
   box.append(el('small',{teks:'Input admin dihitung per tanggal dan divisi dari HK pekerja, termasuk perubahan lokal yang belum disimpan ke GitHub. HK operator alat terpisah dan tidak ditambahkan otomatis. Perbandingan ini bukan perintah mengubah angka.'}));
  }catch(e){if(n!==ticket)return;kosongkan(box).append(el('strong',{teks:'Total HK mandor belum tersedia'}),el('p',{teks:'Koneksi laporan kebun belum terbaca; jangan dianggap 0 HK.'}),el('button.tombol-samar',{type:'button',teks:'Coba lagi',onclick:()=>refresh(true)}));}
 };
 return {box,refresh};
}
