// ═══════════════════════════════════════════════
// HELPERS — formatting, date math, skip parsing
// ═══════════════════════════════════════════════

export const R = (n) => 'R' + Math.round(n).toLocaleString('en-ZA');
export const Rk = (n) => n >= 1000 ? 'R' + Math.round(n / 1000).toLocaleString('en-ZA') + 'k' : R(n);
export const pct = (n) => n.toFixed(1) + '%';

export const daysSince = (dateStr) => {
  const now = new Date();
  return Math.floor((now - new Date(dateStr)) / 86400000);
};

export const monthKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
export const shortMonth = (d) => d.toLocaleString('en-ZA', { month: 'short' });

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayOfWeek = (dateStr) => DAYS[new Date(dateStr).getDay()];

// Parse items string: "2x 6m³ Skip, 1x 2m³ Skip" → { s2: 1, s3: 0, s6: 2, s9: 0 }
export function parseItems(itemsStr) {
  const skips = { s2: 0, s3: 0, s6: 0, s9: 0 };
  if (!itemsStr) return skips;
  const re = /(\d+)\s*[xX×]\s*(\d+)\s*m/g;
  let m;
  while ((m = re.exec(itemsStr)) !== null) {
    const qty = parseInt(m[1]), size = parseInt(m[2]);
    if (size === 2) skips.s2 += qty;
    else if (size === 3) skips.s3 += qty;
    else if (size === 6) skips.s6 += qty;
    else if (size === 9) skips.s9 += qty;
  }
  return skips;
}

// Total skip count from an invoice
export function totalSkips(invoice) {
  const s = parseItems(invoice.items);
  return s.s2 + s.s3 + s.s6 + s.s9;
}

// Period filter helper
export function filterByPeriod(invArr, period) {
  const now = new Date();
  if (period === 'day') {
    const s = now.toISOString().slice(0, 10);
    return invArr.filter(i => i.date === s);
  }
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return invArr.filter(i => new Date(i.date) >= d);
  }
  if (period === 'month') {
    const mk = monthKey(now);
    return invArr.filter(i => i.date.startsWith(mk));
  }
  if (period === 'year') {
    const y = String(now.getFullYear());
    return invArr.filter(i => i.date.startsWith(y));
  }
  return invArr; // all
}

// Previous period for comparison
export function getPreviousPeriod(invArr, period) {
  const now = new Date();
  if (period === 'day') {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    const s = d.toISOString().slice(0, 10);
    return invArr.filter(i => i.date === s);
  }
  if (period === 'week') {
    const s = new Date(now); s.setDate(s.getDate() - 14);
    const e = new Date(now); e.setDate(e.getDate() - 7);
    return invArr.filter(i => { const x = new Date(i.date); return x >= s && x < e; });
  }
  if (period === 'month') {
    const pm = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    return invArr.filter(i => i.date.startsWith(pm));
  }
  if (period === 'year') {
    const py = String(now.getFullYear() - 1);
    return invArr.filter(i => i.date.startsWith(py));
  }
  return invArr;
}

// Period label
export function periodLabel(period) {
  const now = new Date();
  if (period === 'day') return 'Today · ' + now.toLocaleDateString('en-ZA');
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ' – today';
  }
  if (period === 'month') return now.toLocaleString('en-ZA', { month: 'long', year: 'numeric' });
  if (period === 'year') return 'Year to date ' + now.getFullYear();
  return 'All time';
}

// Compute firstSeen map (first invoice date per client)
export function buildFirstSeen(invArr) {
  const fs = {};
  invArr.forEach(i => {
    if (!fs[i.client] || i.date < fs[i.client]) fs[i.client] = i.date;
  });
  return fs;
}

// Build client map from invoices
export function buildClientMap(invArr) {
  const cm = {};
  invArr.forEach(i => {
    if (!cm[i.client]) cm[i.client] = { name: i.client, jobs: 0, rev: 0, banked: 0, last: '' };
    cm[i.client].jobs++;
    cm[i.client].rev += i.amount;
    cm[i.client].banked += i.banked;
    if (i.date > cm[i.client].last) cm[i.client].last = i.date;
  });
  return cm;
}

// Build driver stats from invoices
export function buildDriverStats(invArr) {
  const dm = {};
  invArr.forEach(i => {
    const d = i.driver || 'Unknown';
    if (!dm[d]) dm[d] = { name: d, jobs: 0, rev: 0, skips: 0, vehicles: new Set() };
    dm[d].jobs++;
    dm[d].rev += i.amount;
    dm[d].skips += totalSkips(i);
    dm[d].vehicles.add(i.vehicle);
  });
  return Object.values(dm).map(d => ({
    ...d,
    vehicles: [...d.vehicles],
    avgRevPerJob: d.jobs > 0 ? d.rev / d.jobs : 0,
    avgSkipsPerJob: d.jobs > 0 ? d.skips / d.jobs : 0,
  })).sort((a, b) => b.rev - a.rev);
}
