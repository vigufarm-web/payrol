// Simulasi anggaran memakai transaksi periode terpilih, tanpa tarif default.
const sum = rows => (rows || []).reduce((n, r) => n + (Number(r.nominal) || 0), 0);
export function budgetMix(b, remaining, days) {
  const groups = new Map();
  let hk = 0, wages = 0, invalid = false;
  for (const r of b.hk || []) {
    if (r.deleted_at) continue;
    const h = Number(r.hk), rp = Number(r.nominal);
    if (!(h > 0) || !(rp > 0)) { invalid = true; continue; }
    const rate = rp / h;
    const key = Math.round(rate * 100) / 100;
    const g = groups.get(key) || { rate: key, hk: 0, employees: new Set() };
    g.hk += h; g.employees.add(r.employee_id); groups.set(key, g);
    hk += h; wages += rp;
  }
  const pendingPremium = sum(b.menunggu?.premi), pendingOvertime = sum(b.menunggu?.lembur);
  const pending = pendingPremium + pendingOvertime;
  const available = Math.max(0, remaining - pending);
  const premium = Number(b.upahPremi || 0) + pendingPremium;
  const overtime = Number(b.upahLembur || 0) + pendingOvertime;
  const piecework = Number(b.upahBorongan || 0);
  const basis = wages + premium + overtime + piecework;
  const valid = hk > 0 && !invalid && basis > 0 && days > 0;
  // Satu orang maksimum 1 HK/hari, juga ketika ia tercatat di beberapa tarif.
  const employees = new Map();
  for (const r of b.hk || []) if (!r.deleted_at && Number(r.hk) > 0) {
    employees.set(r.employee_id, (employees.get(r.employee_id) || 0) + Number(r.hk));
  }
  const capacityScale = employees.size ? days / Math.max(...employees.values()) : 0;
  const scale = valid ? Math.min(available / basis, capacityScale) : 0;
  return { valid, invalid, pending, available, shortage: Math.max(0, pending - remaining),
    unallocated: valid ? Math.max(0, available - basis * scale) : available,
    rate: hk > 0 ? wages / hk : null,
    hk: valid ? hk * scale : null, hkPerDay: valid ? hk * scale / days : null,
    groups: [...groups.values()].sort((a, z) => a.rate - z.rate).map(g => ({
      rate: g.rate, employees: g.employees.size, share: g.hk / hk,
      hk: valid ? g.hk * scale : null, hkPerDay: valid ? g.hk * scale / days : null,
    })),
    allocations: [
      { label: 'Gapok / upah HK', amount: wages * scale },
      { label: 'Premi', amount: premium * scale },
      { label: 'Lembur', amount: overtime * scale },
      { label: 'Borongan', amount: piecework * scale },
    ].map(x => ({ ...x, perDay: days > 0 ? x.amount / days : 0 })),
  };
}
