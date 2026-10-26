// Simulasi memakai pekerja yang memiliki transaksi pada divisi/periode terpilih.
const sum = rows => (rows || []).reduce((n, r) => n + (Number(r.nominal) || 0), 0);
export function budgetMix(b, remaining, days) {
  const workers = new Map();
  let hk = 0, wages = 0, invalid = false;
  for (const r of b.hk || []) {
    if (r.deleted_at) continue;
    const h = Number(r.hk), rp = Number(r.nominal);
    if (!(h > 0) || !(rp > 0) || r.employee_id == null) { invalid = true; continue; }
    const id = String(r.employee_id), date = r.tanggal || '';
    const w = workers.get(id);
    // Gabungkan pecahan blok pada tanggal terakhir, bukan menghitung orang dua kali.
    if (!w || date > w.date) workers.set(id, {date, hk:h, wages:rp});
    else if (date === w.date) { w.hk += h; w.wages += rp; }
    hk += h; wages += rp;
  }
  const groups = new Map();
  for (const w of workers.values()) {
    const rate = Math.round(w.wages / w.hk * 100) / 100;
    const g = groups.get(rate) || {rate, employees:0};
    g.employees++; groups.set(rate, g);
  }
  const rates = [...groups.values()].sort((a,z)=>z.rate-a.rate);
  const lowest = rates.at(-1)?.rate;
  const pendingPremium = sum(b.menunggu?.premi), pendingOvertime = sum(b.menunggu?.lembur);
  const pending = pendingPremium + pendingOvertime;
  const available = Math.max(0, remaining - pending);
  const premiumRate = hk > 0 ? (Number(b.upahPremi || 0) + pendingPremium) / hk : 0;
  const overtimeRate = hk > 0 ? (Number(b.upahLembur || 0) + pendingOvertime) / hk : 0;
  const pieceworkRate = hk > 0 ? Number(b.upahBorongan || 0) / hk : 0;
  const extrasRate = premiumRate + overtimeRate + pieceworkRate;
  const valid = hk > 0 && !invalid && days > 0;
  const priority = rates.filter(g=>g.rate > lowest);
  const priorityHK = priority.reduce((n,g)=>n+g.employees,0) * Math.max(0,days);
  const priorityWages = priority.reduce((n,g)=>n+g.employees*g.rate,0) * Math.max(0,days);
  const required = priorityWages + priorityHK * extrasRate;
  const priorityShortage = valid ? Math.max(0, required - available) : 0;
  const feasible = valid && priorityShortage < 0.005;
  const low = rates.at(-1);
  const lowHK = feasible ? Math.min(low.employees * days, Math.max(0, available-required) / (lowest+extrasRate)) : 0;
  const totalHK = feasible ? priorityHK + lowHK : 0;
  const futureWages = feasible ? priorityWages + lowHK * lowest : 0;
  const allocations = [
    {label:'Gapok / upah HK',amount:futureWages},
    {label:'Premi',amount:totalHK*premiumRate},
    {label:'Lembur',amount:totalHK*overtimeRate},
    {label:'Borongan',amount:totalHK*pieceworkRate},
  ].map(x=>({...x,perDay:days>0?x.amount/days:0}));
  return {valid, invalid, feasible, pending, available,
    shortage:Math.max(0,pending-remaining), priorityShortage, required, priorityHK,
    unallocated:Math.max(0,available-allocations.reduce((n,x)=>n+x.amount,0)),
    rate:hk>0?wages/hk:null, hk:valid?totalHK:null, hkPerDay:valid?totalHK/days:null,
    groups:rates.map(g=>({...g, priority:g.rate>lowest,
      hk:feasible?(g.rate>lowest?g.employees*days:lowHK):0,
      hkPerDay:feasible?(g.rate>lowest?g.employees:lowHK/days):0,
      rule:g.rate>lowest?'1 HK/orang/hari dahulu':'Sisa anggaran',
    })), allocations,
  };
}
