const DAY=86400000;
export const trashTables=['daily_payroll','borongan_transactions','lembur_transactions','premi_transactions'];
export function purgeExpiredTrash(data,now=new Date()){
 const cutoff=new Date(now).getTime()-30*DAY,removed=[];
 for(const table of trashTables){const rows=data?.tabel?.[table];if(!rows)continue;data.tabel[table]=rows.filter(r=>{const when=Date.parse(r.deleted_at);if(!r.deleted_at||!Number.isFinite(when)||when>cutoff)return true;removed.push({table,id:String(r.id)});return false;});}
 for(const {table,id} of removed)if(data.web?.persetujuan?.[table])delete data.web.persetujuan[table][id];
 if(data.web?.riwayatTambahan)for(const h of data.web.riwayatTambahan)if(removed.some(x=>x.table===h.tabel&&x.id===String(h.id))){delete h.sebelum;delete h.persetujuan;}
 return removed.length;
}
