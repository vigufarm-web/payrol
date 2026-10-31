// No credentials or network access. Numeric local identities never become GIS IDs.
const norm=v=>String(v??'').trim().replace(/\s*\((?:PC|R\d+)\)\s*$/i,'').toLowerCase().replace(/^p0*(\d+)$/,'p$1');
export function localBlocks(data,app){return (data.tabel?.[app==='payrol'?'blocks':'master_blok']||[]).map(r=>({id:r.id,name:app==='payrol'?r.nama_blok:r.nama,commodity:app==='payrol'?(r.komoditas||(data.tabel?.divisions||[]).find(d=>String(d.id)===String(r.division_id))?.nama_divisi):r.divisi,area:app==='payrol'?r.luas:r.luas_ha,canonical_local_id:r.gis_canonical_local_id,planted_on:app==='payrol'?data.web?.tanamBlok?.[r.id]||null:null}));}
function plantingDate(b,at='9999-12-31'){const groups=(b.plantings||[]).filter(p=>(!p.closed_on||p.closed_on>at)&&(!p.planted_on||p.planted_on<=at)),dates=[...new Set(groups.map(p=>p.planted_on).filter(Boolean))];return {date:dates.length===1&&groups.every(p=>p.planted_on)?dates[0]:null,multiple:dates.length>1};}
export function buildGISPlan(data,catalog,app,manualMappings={}){
 if(catalog?.schema!==1||!Array.isArray(catalog.blocks)||typeof catalog.revision!=='string')throw Error('Format referensi GIS tidak dikenali.');
 const ids=new Set();for(const b of catalog.blocks){if(!b.id||ids.has(b.id)||!Array.isArray(b.aliases)||!Array.isArray(b.plantings))throw Error('Identitas blok GIS tidak valid atau ganda.');ids.add(b.id);}
 const saved=data.web?.gis?.mappings||{},mappings={...saved,...manualMappings},rows=[];
 for(const l of localBlocks(data,app)){
  let choices=mappings[l.id]?[catalog.blocks.find(b=>b.id===mappings[l.id])].filter(Boolean):catalog.blocks.filter(b=>b.active&&[b.name,...b.aliases].some(n=>norm(n)===norm(l.name))&&(!l.commodity||norm(b.commodity)===norm(l.commodity)));
  if(choices.length!==1){rows.push({local:l,status:choices.length?'ambiguous':'unmatched',candidates:choices.map(b=>b.id)});continue;}
  const b=choices[0],plant=plantingDate(b,catalog.as_of),area=b.gis_area_ha,division=app==='payrol'?(data.tabel.divisions||[]).find(d=>norm(d.nama_divisi)===norm(b.commodity)):null,commodityConflict=!!l.commodity&&norm(l.commodity)!==norm(b.commodity);
  const dateConflict=!!(l.planted_on&&plant.date&&l.planted_on!==plant.date),dateMissing=!!(l.planted_on&&!plant.date&&!plant.multiple),areaUnknown=area==null||!Number.isFinite(Number(area))||Number(area)<0;
  rows.push({local:l,gis:b,status:!b.active?'inactive':app==='payrol'&&!division?'division-missing':areaUnknown?'area-missing':dateMissing?'date-missing':commodityConflict?'commodity-conflict':dateConflict?'date-conflict':'ready',newLink:saved[l.id]!==b.id,next:{division_id:division?.id,name:b.name,area:areaUnknown?null:Number(area),basis:'luas GIS',planted_on:plant.date,multiplePlantings:plant.multiple},changes:{commodity:commodityConflict,name:l.name!==b.name,area:Number(l.area)!==Number(area),planted_on:!!plant.date&&l.planted_on!==plant.date}});
 }
 return {revision:catalog.revision,rows,newGIS:catalog.blocks.filter(b=>b.active&&!rows.some(r=>r.gis?.id===b.id)).map(b=>({id:b.id,name:b.name,commodity:b.commodity}))};
}
export function applyGISPlan(data,catalog,app,{allowDateConflicts=false,automatic=false,manualMappings={},now=new Date().toISOString()}={}){
 const plan=buildGISPlan(data,catalog,app,manualMappings);data.web||={};const g=data.web.gis||={mappings:{},master_history:{},snapshots:{}};g.mappings||={};g.master_history||={};g.snapshots||={};
 // Existing quantities remain untouched. Before changing masters preserve the
 // references used by existing transactions; never invent historical versions.
 g.legacy_baseline||={};g.approved_blocks||={};for(const l of localBlocks(data,app))g.legacy_baseline[l.id]||={...structuredClone(l),captured_at:now,historical_revision_unknown:true};
 let applied=0;
 for(const row of plan.rows){if(row.status!=='ready'&&!(allowDateConflicts&&['date-conflict','commodity-conflict','date-missing'].includes(row.status)))continue;if(automatic&&row.newLink)continue;
  const table=app==='payrol'?'blocks':'master_blok',local=data.tabel[table].find(r=>String(r.id)===String(row.local.id));
  const previous=localBlocks(data,app).find(r=>String(r.id)===String(local.id));
  const last=g.master_history[local.id]?.at(-1),changed=row.newLink||Object.values(row.changes).some(Boolean)||last?.gis_version!==row.gis.version||JSON.stringify(g.approved_blocks[row.gis.id])!==JSON.stringify(row.gis);
  if(!changed)continue;
  (g.master_history[local.id]||=[]).push({at:now,gis_id:row.gis.id,gis_version:row.gis.version,before:previous,after:{id:local.id,name:row.next.name,area:row.next.area,commodity:row.gis.commodity,planted_on:row.next.planted_on},multiple_plantings:row.next.multiplePlantings});
  if(app==='payrol'){local.nama_blok=row.next.name;local.luas=row.next.area;local.komoditas=row.gis.commodity;local.division_id=row.next.division_id;data.web.tanamBlok||={};if(row.next.planted_on)data.web.tanamBlok[local.id]=row.next.planted_on;else delete data.web.tanamBlok[local.id];}
  else{local.nama=row.next.name;local.luas_ha=row.next.area;local.divisi=row.gis.commodity;}
  g.approved_blocks[row.gis.id]=structuredClone(row.gis);
  local.gis_block_id=row.gis.id;local.gis_version=row.gis.version;local.gis_area_basis=row.next.basis;
  g.mappings[local.id]=row.gis.id;applied++;
 }
 const canonical={};for(const local of [...(data.tabel[app==='payrol'?'blocks':'master_blok']||[])].sort((a,b)=>Number(a.id)-Number(b.id))){const id=g.mappings[local.id];if(id&&canonical[id]==null)canonical[id]=local.id;}for(const local of data.tabel[app==='payrol'?'blocks':'master_blok']||[]){const id=g.mappings[local.id],b=id&&catalog.blocks.find(b=>b.id===id);if(id){local.gis_active=!!b?.active;local.gis_canonical_local_id=canonical[id];}else if(g.authoritative)local.gis_active=!!g.general_locations?.[local.id];}
 g.catalog=structuredClone(catalog);g.last_checked=now;g.revision=catalog.revision;return {applied,unresolved:plan.rows.filter(r=>r.status!=='ready'),newGIS:plan.newGIS};
}
export function captureGISSnapshot(data,app,table,row,{replace=false,legacy=false,now=new Date().toISOString()}={}){
 const g=data.web?.gis;if(!g)return;g.snapshots||={};const key=table+':'+row.id;if(!replace&&g.snapshots[key])return;
 const locals=localBlocks(data,app),l=app==='payrol'?(locals.find(b=>String(b.id)===String(row.block_id))||locals.find(b=>b.canonical_local_id===b.id&&norm(b.name)===norm(row.lokasi))):locals.find(b=>norm(b.name)===norm(row.blok));if(!l)return;
 const id=g.mappings?.[l.id],b=g.approved_blocks?.[id]||g.catalog?.blocks?.find(b=>b.id===id);g.snapshots[key]={local_block_id:l.id,gis_block_id:id||null,gis_version:b?.version??null,name:l.name,area_ha:l.area??null,planted_on:l.planted_on,cycle:app==='payrol'?gisCycleAt(data,l.id,row.tanggal):null,planting_groups:(b?.plantings||[]).filter(p=>(!p.planted_on||p.planted_on<=(row.tanggal||g.catalog.as_of))&&(!p.closed_on||p.closed_on>(row.tanggal||g.catalog.as_of))).map(p=>({id:p.id,version:p.version,planted_on:p.planted_on,area_ha:p.area_ha})),recorded_at:now,legacy};
}
export function historicalGISMaster(data,localId,at){const history=data.web?.gis?.master_history?.[localId];if(!history?.length||!at)return null;const effective=history.filter(h=>h.at.slice(0,10)<=at).at(-1);return effective?.after||history[0].before;}
export function currentGISDate(data,localId){const g=data.web?.gis,id=g?.mappings?.[localId];if(!id)return undefined;const b=g.approved_blocks?.[id]||g.catalog?.blocks?.find(b=>b.id===id);return b?plantingDate(b,g.catalog.as_of).date:undefined;}
export function assertGISMasterEdit(data,app,table,id,patch){
 if(table!==(app==='payrol'?'blocks':'master_blok'))return;
 if(data.web?.gis?.authoritative)throw Error('Master blok dikelola hanya melalui Peta Kebun.');
 if(!data.web?.gis?.mappings?.[id])return;
 const row=data.tabel[table].find(r=>String(r.id)===String(id));const locked=app==='payrol'?['nama_blok','luas','komoditas','division_id']:['nama','luas_ha','divisi'];
 if(locked.some(k=>k in patch&&String(patch[k]??'')!==String(row[k]??'')))throw Error('Blok terhubung ke GIS. Ubah nama, luas, komoditas atau divisi melalui Peta Kebun lalu perbarui referensi.');
}
export function assertGISMasterStructure(data,app,table){if(table===(app==='payrol'?'blocks':'master_blok')&&data.web?.gis?.authoritative)throw Error('Tambah atau nonaktifkan blok melalui Peta Kebun; riwayat lokal tetap disimpan.');}
export function assertGISBlockActive(data,app,row){const g=data.web?.gis;if(!g)return;const local=app==='payrol'?localBlocks(data,app).find(l=>String(l.id)===String(row.block_id)):localBlocks(data,app).find(l=>norm(l.name)===norm(row.blok));const id=local&&g.mappings?.[local.id],b=id&&g.catalog?.blocks?.find(b=>b.id===id);if(local?.canonical_local_id!=null&&String(local.canonical_local_id)!==String(local.id))throw Error('Master ini duplikat. Pilih master blok GIS utama untuk transaksi baru; riwayat lama tetap tersimpan.');if(local&&g.general_locations?.[local.id])return;if(g.authoritative&&(app==='payrol'?row.block_id!=null&&row.block_id!=='':!!String(row.blok||'').trim())&&(!id||!b))throw Error('Blok ini belum dipetakan ke GIS. Hubungkan referensi melalui admin sebelum transaksi baru.');if(b&&!b.active)throw Error('Blok GIS sudah nonaktif. Pilih blok pengganti untuk transaksi baru.');}
export function createGISLocalBlocks(data,catalog,app){
 const plan=buildGISPlan(data,catalog,app),table=app==='payrol'?'blocks':'master_blok',rows=data.tabel[table]||=[];let created=0;const skipped=[];
 for(const b of plan.newGIS){if(rows.some(r=>norm(app==='payrol'?r.nama_blok:r.nama)===norm(b.name))){skipped.push(b);continue;}const division=app==='payrol'?(data.tabel.divisions||[]).find(d=>norm(d.nama_divisi)===norm(b.commodity)):null;if(app==='payrol'&&!division){skipped.push(b);continue;}const id=rows.reduce((n,r)=>Math.max(n,Number(r.id)||0),0)+1;rows.push(app==='payrol'?{id,kode_blok:b.name,nama_blok:b.name,division_id:division.id,komoditas:b.commodity,status:'Aktif'}:{id,nama:b.name,divisi:b.commodity});created++;}
 return {created,skipped};
}

export function gisCycleAt(data,localId,at){const g=data.web?.gis,id=g?.mappings?.[localId],b=g?.approved_blocks?.[id]||g?.catalog?.blocks?.find(b=>b.id===id);if(!b)return undefined;at||=g.catalog.as_of||new Date().toISOString().slice(0,10);const groups=b.plantings.filter(p=>p.commodity==='Pisang'&&p.planted_on<=at&&(!p.closed_on||p.closed_on>at)),rules=g.catalog.cycle_rules||[['PC',0,52],['R1',53,91],['R2',92,130],['R3',131,169],['R4',170,null]],cycles=groups.map(p=>{const override=(p.cycle_overrides||[]).filter(o=>o.from<=at).sort((a,b)=>a.from.localeCompare(b.from)).at(-1),weeks=Math.floor((Date.parse(at)-Date.parse(p.planted_on))/604800000);return override?.cycle||rules.find(([,a,z])=>weeks>=a&&(z==null||weeks<=z))?.[0]||null;}),unique=[...new Set(cycles)];return unique.length===1?unique[0]:null;}

export function assertGISMerge(base,local,remote){const b=JSON.stringify(base.web?.gis),l=JSON.stringify(local.web?.gis),r=JSON.stringify(remote.web?.gis);if(l!==b&&r!==b&&l!==r)throw Error('Referensi GIS atau acuannya telah berubah di perangkat lain. Simpan draf, lalu muat ulang sebelum menggabungkan.');}
export function transactionGISSnapshot(data,app,table,row){const g=data.web?.gis;if(!g)return null;const exact=g.snapshots?.[table+':'+row.id];if(exact)return exact;const l=app==='payrol'?localBlocks(data,app).find(l=>String(l.id)===String(row.block_id)):localBlocks(data,app).find(l=>norm(l.name)===norm(row.blok)||norm(g.legacy_baseline?.[l.id]?.name)===norm(row.blok));const base=l&&g.legacy_baseline?.[l.id];return base?{name:base.name,area_ha:base.area,planted_on:base.planted_on,legacy:true,historical_revision_unknown:true}:null;}

export function setGISGeneralLocations(data,app,ids){data.web||={};data.web.gis||={};const valid=localBlocks(data,app);data.web.gis.general_locations=Object.fromEntries(ids.map(id=>{const l=valid.find(b=>String(b.id)===String(id));if(!l||Number(l.area)!==0||data.web.gis.mappings?.[id])throw Error('Lokasi umum harus tanpa luas dan belum dipetakan ke batas GIS.');return [id,true];}));}


// Daily boundary is 06:00 Asia/Jakarta, independent of the device timezone.
export function gisSyncDay(now=new Date().toISOString()) {
 const ms=Date.parse(now);if(!Number.isFinite(ms))throw Error('Waktu sinkronisasi tidak valid.');
 return new Date(ms+3600000).toISOString().slice(0,10);
}
export function gisSyncDue(data,now=new Date().toISOString()) {
 return !!data?.web?.gis?.reference_access && data.web.gis.last_success_day!==gisSyncDay(now);
}
// Work on a copy. Invalid catalogs can never partially change live masters.
export function automaticGISData(source,catalog,app,now=new Date().toISOString()) {
 const data=structuredClone(source);buildGISPlan(data,catalog,app);for(const b of catalog.blocks)if(b.active&&(b.gis_area_ha==null||!Number.isFinite(Number(b.gis_area_ha))||Number(b.gis_area_ha)<0))throw Error('Luas GIS blok '+b.name+' tidak valid; referensi terakhir dipertahankan.');
 data.tabel||={};data.web||={};const g=data.web.gis||={};g.mappings||={};
 const table=app==='payrol'?'blocks':'master_blok',rows=data.tabel[table]||=[];
 const divisions=data.tabel[app==='payrol'?'divisions':'master_divisi']||=[];
 for(const name of new Set(catalog.blocks.filter(b=>b.active).map(b=>b.commodity).filter(Boolean))) {
  const key=app==='payrol'?'nama_divisi':'nama';
  if(!divisions.some(d=>norm(d[key])===norm(name))) {const id=divisions.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;divisions.push(app==='payrol'?{id,kode_divisi:'GIS-'+id,nama_divisi:name,status:'Aktif',sumber:'GIS'}:{id,nama:name,sumber:'GIS'});}
 }
 // Retain reviewed general locations. Recognize only explicit facility names;
 // legacy coded plots without a GIS match remain historical, never guessed.
 g.general_locations||={};
 for(const l of localBlocks(data,app))if(!g.mappings[l.id]&&Number(l.area||0)===0&&/^(?:ph(?:\s|$)|packing(?:\s|$)|nurser[yi]$|barak(?:\s|$)|jalan kebun$|kantor$|gudang$|workshop$|pos security$|all area(?:\s|$)|semua area$)/i.test(l.name))g.general_locations[l.id]=true;
 g.authoritative=true;
 // Reuse only unambiguous existing names first, preserving numeric identities.
 const first=applyGISPlan(data,catalog,app,{allowDateConflicts:true,now});
 let created=0;
 for(const b of catalog.blocks.filter(b=>b.active)) {
  if(rows.some(r=>g.mappings[r.id]===b.id))continue;
  const id=rows.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)+1;
  const division=divisions.find(d=>norm(d.nama_divisi)===norm(b.commodity));
  rows.push(app==='payrol'?{id,kode_blok:b.name,nama_blok:b.name,division_id:division?.id,komoditas:b.commodity,status:'Aktif'}:{id,nama:b.name,divisi:b.commodity});
  g.mappings[id]=b.id;created++;
 }
 const result=applyGISPlan(data,catalog,app,{allowDateConflicts:true,now});
 g.auto=true;g.schedule='daily-0600-Asia-Jakarta-on-open';g.last_success_day=gisSyncDay(now);g.last_checked=now;
 g.sync_error=null;return {data,applied:first.applied+result.applied,created,unmatched:result.unresolved.filter(r=>!g.general_locations[r.local.id]).length};
}

// A GIS-only save may be safely rebased on a concurrent staff transaction.
// Any human input in the meantime disables this path; never discard it.
export function gisOnlyChanges(base,local,app){
 if(!local.web?.gis?.catalog)return false;
 const expected=automaticGISData(base,local.web.gis.catalog,app,local.web.gis.last_checked).data;
 const strip=value=>{const d=structuredClone(value);for(const k of ['rev','dibuat','dari'])delete d[k];d.web||={};delete d.web.gis;return JSON.stringify(d);};return strip(expected)===strip(local);
}
export function rebaseGISOnly(base,local,remote,app){
 if(!gisOnlyChanges(base,local,app))throw Error('Input pengguna berubah selama sinkronisasi; simpan input terlebih dahulu.');
 const l=local.web.gis,r=remote.web?.gis,chosen=r?.catalog&&r.last_checked>l.last_checked?r:l;
 const result=automaticGISData(remote,chosen.catalog,app,chosen.last_checked).data;
 result.web.gis.reference_access=structuredClone(l.reference_access||r?.reference_access);return result;
}
