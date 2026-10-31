import {automaticGISData,gisSyncDue,gisSyncDay,gisOnlyChanges} from './gis-model.js?v=gis-pages-3';
const DISCOVERY='https://laporankebun.vercel.app';let GIS=DISCOVERY,EDITOR=DISCOVERY+'/peta';const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function discover(){try{const r=await fetch(DISCOVERY+'/api/gis-service',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)return;const d=await r.json(),u=new URL(d.url);if(u.origin==='https://vigufarm-web.github.io'&&u.pathname==='/peta-kebun/'&&!u.search&&!u.hash){EDITOR=u.href;}else if(u.origin===DISCOVERY&&!u.search&&!u.hash){EDITOR=DISCOVERY+'/peta';}}catch{/* Keep the last verified service during a network failure. */}}
const access=new Map();let timer;let currentContext;let busy=false;const messages=new Set();
const report=text=>{for(const fn of messages)fn(text);};
function session(app,D){
 const saved=D?.state.data?.web?.gis?.reference_access;
 if(saved?.app===app&&saved?.origin===DISCOVERY&&(!saved.expires||saved.expires>new Date().toISOString()))return saved;
 const cached=access.get(app);if(cached&&(!cached.expires||cached.expires>new Date().toISOString()))return cached;
 access.delete(app);try{const value=JSON.parse(sessionStorage.getItem('vigu-gis-'+app)||'null');if(value&&value.expires>new Date().toISOString()){access.set(app,value);return value;}}catch{}return null;
}
async function fetchCatalog(app,D){const auth=session(app,D);if(!auth||(auth.origin||DISCOVERY)!==GIS)throw Error('Admin perlu mengaktifkan sambungan otomatis GIS satu kali.');const r=await fetch(GIS+'/api/gis-reference',{cache:'no-store',headers:{Authorization:'Bearer '+auth.token,'X-GIS-App':app},signal:AbortSignal.timeout(90000)}),d=await r.json();if(!r.ok)throw Error(d.error||'Referensi GIS belum dapat dimuat');return d;}
async function runSynchronization({D,app,canEdit=()=>false,markChanged=()=>{},save,isBusy=()=>false,load=()=>fetchCatalog(app,D),clock=()=>new Date().toISOString()}, {force=false}={}) {
 const pending=D.state.gisPending;
 if(pending){
  if(D.state.path!==pending.path)delete D.state.gisPending;
  else if(isBusy()||!canEdit()||!save||!gisOnlyChanges(pending.base,D.state.data,app))return {deferred:true};
  else {await save();delete D.state.gisPending;return {...pending.result,persisted:!D.state.belumDisimpan};}
 }
 const source=D.state.data;if(!source||D.state.belumDisimpan||isBusy())return {deferred:true};
 const now=clock();if(!force&&!gisSyncDue(source,now))return {skipped:true};
 const catalog=await load();
 // A form may have opened, an input may have been saved, or datasets switched
 // while the request was in flight. Never replace that user's newer state.
 if(D.state.data!==source||D.state.belumDisimpan||isBusy())return {deferred:true};
 const result=automaticGISData(source,catalog,app,now);D.state.data=result.data;
 const summary={applied:result.applied,created:result.created,unmatched:result.unmatched,day:gisSyncDay(now)};
 if(canEdit()) {markChanged();if(save)try{await save();}catch(e){D.state.gisPending={base:source,path:D.state.path,result:summary};throw e;}}
 return {...summary,persisted:canEdit()&&!D.state.belumDisimpan};
}
const synchronizing=new WeakSet();
export async function synchronizeGIS(options,mode={}){const key=options.D.state;if(synchronizing.has(key))return {deferred:true};synchronizing.add(key);try{return await runSynchronization(options,mode);}finally{synchronizing.delete(key);}}
export function mountGISPanel(host,{D,app,isAdmin,canEdit,markChanged,save}){
 const panel=document.createElement('div');panel.className='lembar';panel.style.margin='1.5rem 0';panel.innerHTML=`<div class="lembar-isi"><h2>Pusat blok · Peta Kebun</h2><p>Blok mengikuti GIS otomatis sekali sehari setelah pukul 06.00 WIB ketika aplikasi dibuka. Riwayat transaksi lama tetap dipertahankan.</p><p><a target="_blank" rel="noopener" href="${GIS}/peta">Buka Peta Kebun ↗</a></p><button type="button" data-connect>Aktifkan sambungan otomatis</button> <button type="button" data-check>Periksa sekarang</button><p data-status role="status"></p><div data-preview></div></div>`;host.prepend(panel);discover().then(()=>{panel.querySelector('a').href=EDITOR;});
 const status=panel.querySelector('[data-status]'),preview=panel.querySelector('[data-preview]');
 const requireAdmin=()=>{if(!isAdmin()||!canEdit())throw Error('Masuk sebagai admin dalam mode edit untuk menyambungkan referensi GIS.');};
 const show=async()=>{status.textContent='Memeriksa pembaruan GIS…';const result=await synchronizeGIS({D,app,canEdit,markChanged,save,isBusy:()=>!!document.querySelector('[role="dialog"]')},{force:true});status.textContent=result.deferred?'Pembaruan otomatis menunggu input selesai.':syncMessage(result);};
 panel.querySelector('[data-check]').onclick=()=>show().catch(e=>status.textContent=e.message);
 panel.querySelector('[data-connect]').onclick=()=>{try{requireAdmin();preview.innerHTML='<form data-login><h3>Hubungkan referensi GIS</h3><p>Aktifkan satu kali memakai akun admin Laporan Kebun. Izin ini hanya membaca referensi blok dan tanaman; tersimpan di berkas data terenkripsi agar semua pengguna menerima pembaruan otomatis. Password tidak disimpan. Akses edit peta tetap memerlukan login.</p><label>Nama pengguna GIS<input name="username" autocomplete="username" required></label><label>Password GIS<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Aktifkan otomatis</button><button type="button" data-cancel>Batal</button></form>';preview.querySelector('[data-cancel]').onclick=()=>preview.innerHTML='';preview.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;try{const input=Object.fromEntries(new FormData(form)),r=await fetch(DISCOVERY+'/api/gis-client/reference-login',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,app,persistent:true}),signal:AbortSignal.timeout(90000)}),value=await r.json();if(!r.ok)throw Error(value.error||'Sambungan belum berhasil');if(value.persistent!==true)throw Error('Layanan GIS masih diperbarui. Coba aktivasi kembali setelah beberapa saat.');const auth={token:value.token,expires:value.expires,origin:DISCOVERY,app};access.set(app,auth);D.state.data.web||={};D.state.data.web.gis||={};D.state.data.web.gis.reference_access=auth;form.reset();preview.innerHTML='';const result=await synchronizeGIS({D,app,canEdit,markChanged,save,isBusy:()=>false},{force:true});status.textContent=result.deferred?'Pembaruan menunggu input selesai.':syncMessage(result);}catch(err){status.textContent=err.message;button.disabled=false;}};}catch(e){status.textContent=e.message;}};

 const last=D.state.data?.web?.gis;status.textContent=last?.reference_access?'Otomatis aktif · terakhir diperiksa '+(last.last_checked||'belum pernah')+' · jadwal 06.00 WIB saat aplikasi dibuka.':last?'Admin perlu mengaktifkan sambungan otomatis satu kali. Referensi terakhir: '+(last.last_checked||'—'):'Sambungan otomatis belum diaktifkan oleh admin.';
 // No synchronization while a form is open or there are unsaved edits. Unknown
 // blocks, date conflicts and inactivation always require a reviewed operation.
 startGISAuto({D,app,isAdmin,canEdit,markChanged,save},message=>{if(status.isConnected)status.textContent=message;});
 return panel;
}

function syncMessage(r){return 'GIS diperbarui otomatis · '+r.day+' · '+r.applied+' perubahan, '+r.created+' blok baru.'+(r.persisted?' Tersimpan ke GitHub.':' Referensi terbaru tersedia di perangkat ini.');}
export function startGISAuto(options,notify) {
 if(typeof window==='undefined')return;currentContext=options;if(notify){messages.clear();messages.add(notify);}
 if(!timer){
  const tick=async()=>{if(busy||!currentContext)return;busy=true;try{const r=await synchronizeGIS({...currentContext,isBusy:()=>!!document.querySelector('[role="dialog"],dialog[open]')});if(!r.skipped&&!r.deferred){report(syncMessage(r));window.dispatchEvent(new CustomEvent('gis-updated'));}}catch(e){report('Pembaruan GIS belum berhasil: '+e.message+'. Data terakhir tetap tersedia; dicoba kembali otomatis.');}finally{busy=false;}};
  timer=setInterval(tick,60000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick();});window.addEventListener('gis-check',tick);
 }
 setTimeout(()=>window.dispatchEvent(new Event('gis-check')),1000);
}
