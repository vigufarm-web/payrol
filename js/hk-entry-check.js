const number=v=>Number(v)||0;
export function checkHKEntries(data,incoming,{excludeIds=[],warnWithin=false}={}){
 const excluded=new Set(excludeIds.map(Number)),groups=new Map();
 for(const r of incoming){if(!(number(r.hk)>0))throw Error('HK harus lebih dari 0.');const key=Number(r.employee_id)+'|'+r.tanggal;const g=groups.get(key)||{employee_id:Number(r.employee_id),tanggal:r.tanggal,rows:[],existing:[],addedHK:0};g.rows.push(r);g.addedHK+=number(r.hk);groups.set(key,g);}
 for(const r of data?.tabel?.daily_payroll||[]){if(r.deleted_at||excluded.has(Number(r.id)))continue;const g=groups.get(Number(r.employee_id)+'|'+r.tanggal);if(g)g.existing.push(r);}
 const repeats=[];
 for(const g of groups.values()){g.existingHK=g.existing.reduce((s,r)=>s+number(r.hk),0);g.totalHK=g.existingHK+g.addedHK;g.name=(data?.tabel?.employees||[]).find(e=>Number(e.id)===g.employee_id)?.nama||'#'+g.employee_id;if(g.totalHK>1+1e-9)throw Error(`${g.name} pada ${g.tanggal}: ${g.existingHK} HK tercatat + ${g.addedHK} HK input = ${g.totalHK} HK. Maksimal 1 HK per pekerja per hari; penyimpanan ditolak.`);if(g.existing.length||(warnWithin&&new Set(g.rows.map((r,i)=>r._input_group??'row:'+i)).size>1))repeats.push(g);}
 return {groups:[...groups.values()],repeats};
}
export function singleSave(fn){let busy=false;return async function(event){if(busy)return;busy=true;const button=event?.currentTarget||event?.target;if(button)button.disabled=true;try{return await fn(event);}finally{busy=false;if(button?.isConnected)button.disabled=false;}};}
