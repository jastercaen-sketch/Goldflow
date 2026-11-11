// Goldflow trading engine. Pure functions, shared by the website and the collector.
// All money values are in copper (1g = 100s = 10,000c).

export const DEFAULT_SETTINGS = {
  ah_cut: 0.05, deposit_pct: 0.15, relists: 1.5, undercut: 0.01,
  hold_days: 3, min_profit: 20000, min_roi: 0.15, claim_hours: 6,
};

export function normSettings(s = {}) {
  const o = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (s[k] != null && s[k] !== '') o[k] = Number(s[k]);
  return o;
}

const pos = (x) => (x != null && Number(x) > 0 ? Number(x) : null);

// ---------- money ----------
export function splitMoney(c) {
  const neg = c < 0; c = Math.abs(Math.round(c || 0));
  return { neg, g: Math.floor(c / 10000), s: Math.floor((c % 10000) / 100), c: c % 100 };
}
export function fmtMoney(c, { sign = false, short = false } = {}) {
  if (c == null || !isFinite(c)) return '—';
  const m = splitMoney(c);
  const parts = [];
  if (m.g) parts.push(`${m.g.toLocaleString('en-US')}g`);
  if (m.s && !(short && m.g >= 100)) parts.push(`${m.s}s`);
  if ((m.c && !m.g && !(short && m.s >= 10)) || !parts.length) parts.push(`${m.c}c`);
  return (m.neg ? '−' : sign ? '+' : '') + parts.join(' ');
}
// "2g 50s", "2.5g", "250s", "2g50s10c" -> copper
export function parseMoney(str) {
  if (str == null) return null;
  const t = String(str).trim().toLowerCase().replace(/,/g, '');
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 10000); // bare number = gold
  let total = 0, found = false;
  const re = /(\d+(?:\.\d+)?)\s*([gsc])/g; let m;
  while ((m = re.exec(t))) { found = true; total += Number(m[1]) * ({ g: 10000, s: 100, c: 1 })[m[2]]; }
  return found ? Math.round(total) : null;
}

// ---------- prices ----------
// Conservative resale price: the lower of the 7-day and 30-day typical floor.
export function referencePrice(st) {
  const hist = [pos(st?.med7_min), pos(st?.med30_min)].filter(Boolean);
  if (!hist.length) return null;
  return Math.min(...hist);
}

export function depositPerUnit(item, s) {
  return Math.round((Number(item?.sell_price) || 0) * s.deposit_pct * s.relists);
}

const GEAR = /^(weapon|armor)$/i;

// ---------- confidence ----------
export function confidence({ stats, item, qty, ref, floorAfter, firstPrice }, s) {
  const tags = [];
  let c = 0;
  const snaps = Number(stats?.snapshots7) || 0;
  c += 25 * Math.min(1, snaps / 48);
  if (snaps < 12) tags.push('little history');

  const spd = stats?.sold_per_day7 == null ? null : Number(stats.sold_per_day7);
  if (spd == null) c += 30 * 0.3;
  else c += 30 * Math.min(1, (spd * s.hold_days) / Math.max(1, qty));
  if (spd != null && spd * s.hold_days < qty) tags.push('slow seller');
  if (spd != null && spd >= 20) tags.push('fast mover');
  if (spd != null && spd < 1) { c -= 10; tags.push('rarely sells'); }

  const vol = stats?.volatility7 == null ? null : Number(stats.volatility7);
  c += 20 * (vol == null ? 0.5 : 1 - Math.min(1, vol / 0.6));
  if (vol != null && vol > 0.45) tags.push('volatile');

  const depth = Number(stats?.avg_auctions7) || 0;
  c += 10 * Math.min(1, depth / 5);
  if (depth < 3) tags.push('thin market');

  const fl = floorAfter == null || !isFinite(floorAfter) ? 0.6 : Math.min(1, floorAfter / ref);
  c += 15 * fl;
  if (floorAfter != null && isFinite(floorAfter) && floorAfter < ref * 0.9) tags.push('competition below avg');

  if (GEAR.test(item?.item_class || '')) { c -= 15; tags.push('gear: check suffix/stats'); }
  if (firstPrice != null && ref && firstPrice < ref * 0.25) { c -= 15; tags.push('too good to be true?'); }
  // with under 12 hours of history nothing can be a confident "buy" yet
  if (snaps < 12) c = Math.min(c, 60);
  return { score: Math.max(0, Math.min(100, Math.round(c))), tags };
}

export function verdictFor(profit, roi, conf, s) {
  if (profit < s.min_profit || roi < s.min_roi) return null;
  if (conf >= 65) return 'buy';
  if (conf >= 45) return 'consider';
  return 'wait';
}
export const VERDICT_TEXT = {
  buy: 'Worth buying',
  consider: 'Worth a look',
  wait: 'High margin, low confidence — wait',
};

// ---------- flip plan ----------
// ladder: current listings for one item, any order: [{unit_price, quantity}]
export function planFlip(ladder, stats, item, settings) {
  const s = normSettings(settings);
  const ref = referencePrice(stats);
  if (!ref || !ladder?.length) return null;
  const L = [...ladder].filter((x) => x.unit_price > 0 && x.quantity > 0).sort((a, b) => a.unit_price - b.unit_price);
  if (!L.length) return null;
  const dep = depositPerUnit(item, s);
  const spd = stats?.sold_per_day7 == null ? null : Number(stats.sold_per_day7);
  const cap = spd == null ? null : Math.max(1, spd * s.hold_days);

  let qty = 0, cost = 0, best = null;
  for (let k = 0; k < L.length; k++) {
    const l = L[k];
    if (cap != null && k > 0 && qty + l.quantity > cap) break; // don't buy more than you can sell in hold_days
    qty += l.quantity; cost += l.unit_price * l.quantity;
    const floorAfter = k + 1 < L.length ? L[k + 1].unit_price : Infinity;
    const sellPrice = Math.floor(Math.min(ref, floorAfter) * (1 - s.undercut));
    const revenue = Math.floor(qty * sellPrice * (1 - s.ah_cut)) - qty * dep;
    const profit = revenue - cost;
    if (!best || profit > best.profit) {
      best = { listings: k + 1, qty, cost, maxPrice: l.unit_price, sellPrice, revenue, profit, floorAfter };
    }
    // listings priced above what we could ever net per unit can't be profitable
    if (k + 1 < L.length && L[k + 1].unit_price >= ref * (1 - s.undercut) * (1 - s.ah_cut) - dep) break;
  }
  if (!best || best.profit <= 0) return null;
  const roi = best.profit / Math.max(1, best.cost);
  const conf = confidence({ stats, item, qty: best.qty, ref, floorAfter: best.floorAfter, firstPrice: L[0].unit_price }, s);
  return {
    kind: 'flip', ...best,
    floorAfter: isFinite(best.floorAfter) ? best.floorAfter : null,
    avgPrice: Math.round(best.cost / best.qty), ref, depositPerUnit: dep,
    roi, confidence: conf.score, tags: conf.tags,
    soldPerDay: spd, daysToSell: spd ? best.qty / spd : null,
    discount: 1 - L[0].unit_price / ref,
    verdict: verdictFor(best.profit, roi, conf.score, s),
  };
}

// Listings below the vendor sell price: buy and sell to any vendor, no risk.
export function planVendorFlip(ladder, item, settings) {
  const s = normSettings(settings);
  const v = Number(item?.sell_price) || 0;
  if (!v || !ladder?.length) return null;
  const L = ladder.filter((x) => x.unit_price > 0 && x.unit_price < v).sort((a, b) => a.unit_price - b.unit_price);
  if (!L.length) return null;
  const qty = L.reduce((a, x) => a + x.quantity, 0);
  const cost = L.reduce((a, x) => a + x.unit_price * x.quantity, 0);
  const profit = qty * v - cost;
  if (profit < Math.max(100, s.min_profit / 4)) return null;
  return {
    kind: 'vendor', listings: L.length, qty, cost, maxPrice: L[L.length - 1].unit_price,
    sellPrice: v, revenue: qty * v, profit, roi: profit / cost, avgPrice: Math.round(cost / qty),
    confidence: 95, tags: ['sell to vendor'], verdict: 'buy', ref: v, depositPerUnit: 0,
  };
}

// ---------- crafting ----------
// priceOf(itemId) -> item_market row (or undefined)
export function craftQuote(recipe, priceOf, settings, { crafts = 1 } = {}) {
  const s = normSettings(settings);
  const missing = [];
  let cost = 0, rawValue = 0;
  const reagents = (recipe.reagents || []).map((rg) => {
    const m = rg.item_id ? priceOf(rg.item_id) : null;
    let unit = null, from = '';
    if (rg.source === 'vendor' && rg.vendor_price != null) { unit = Number(rg.vendor_price); from = 'vendor'; }
    else if (m) {
      unit = pos(m.cur_p10) ?? pos(m.cur_min) ?? pos(m.med7_min);
      from = pos(m.cur_p10) ? 'AH now' : pos(m.cur_min) ? 'AH now' : '7-day avg';
    }
    if (unit == null) missing.push(rg.item_name);
    const line = unit == null ? null : unit * rg.quantity;
    cost += line || 0;
    // what these reagents would fetch if sold raw instead
    let raw = 0;
    if (rg.source !== 'vendor' && m) {
      const ref = referencePrice(m) ?? pos(m.cur_min);
      if (ref) raw = (ref * (1 - s.undercut) * (1 - s.ah_cut) - depositPerUnit(m, s)) * rg.quantity;
    }
    rawValue += Math.max(0, raw);
    return { ...rg, market: m, unit, from, line };
  });

  const pm = recipe.product_item_id ? priceOf(recipe.product_item_id) : null;
  let sellUnit = null;
  if (pm) {
    const cands = [referencePrice(pm), pos(pm.cur_min)].filter(Boolean);
    if (cands.length) sellUnit = Math.floor(Math.min(...cands) * (1 - s.undercut));
  }
  if (sellUnit == null) missing.push(recipe.product_name + ' (product price)');
  const yieldQty = Number(recipe.yield) || 1;
  const netUnit = sellUnit == null ? null : Math.floor(sellUnit * (1 - s.ah_cut)) - depositPerUnit(pm, s);
  const revenue = netUnit == null ? null : netUnit * yieldQty;
  const profit = revenue == null || missing.length ? null : revenue - cost;
  const spd = pm?.sold_per_day7 == null ? null : Number(pm.sold_per_day7);
  let conf = null;
  if (pm && profit != null) {
    conf = confidence({ stats: pm, item: pm, qty: yieldQty * crafts, ref: referencePrice(pm) || sellUnit, floorAfter: null }, s);
  }
  return {
    reagents, missing, cost, sellUnit, netUnit, revenue, profit, yieldQty,
    margin: profit != null && cost > 0 ? profit / cost : null,
    rawValue, conversionGain: revenue != null ? revenue - rawValue : null,
    craftsPerDay: spd != null ? spd / yieldQty : null,
    confidence: conf?.score ?? null, tags: conf?.tags ?? [],
    // judge a realistic batch: what the market absorbs in a day (1..20 crafts)
    verdict: profit != null && conf ? verdictFor(profit * Math.max(crafts, Math.min(20, Math.max(1, Math.floor((spd ?? 1) / yieldQty)))), profit / Math.max(1, cost), conf.score, s) : null,
    product: pm,
  };
}

// Cost of buying `qty` units by walking the cheapest listings.
export function ladderCost(ladder, qty) {
  const L = [...(ladder || [])].sort((a, b) => a.unit_price - b.unit_price);
  let need = qty, cost = 0, maxPrice = 0;
  for (const l of L) {
    if (need <= 0) break;
    const take = Math.min(need, l.quantity);
    cost += take * l.unit_price; need -= take; maxPrice = l.unit_price;
  }
  return { cost, maxPrice, short: Math.max(0, need) };
}

// ---------- ledger ----------
// Average-cost inventory and realised profit per member.
export function ledger(transactions) {
  const tx = [...(transactions || [])].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const users = {};
  const U = (id) => (users[id] ||= { realized: 0, spent: 0, earned: 0, fees: 0, items: {}, events: [] });
  for (const t of tx) {
    const u = U(t.user_id);
    const key = t.item_id ?? `name:${t.item_name}`;
    const it = (u.items[key] ||= { item_id: t.item_id, item_name: t.item_name, qty: 0, cost: 0 });
    const q = Number(t.quantity) || 0, p = Number(t.unit_price) || 0, fee = Number(t.fee) || 0;
    const avg = it.qty > 0 ? it.cost / it.qty : 0;
    let delta = 0;
    switch (t.kind) {
      case 'buy': it.qty += q; it.cost += q * p; u.spent += q * p; break;
      case 'craft_make': it.qty += q; it.cost += q * p; break;
      case 'craft_use': { const take = Math.min(q, it.qty); it.cost -= take * avg; it.qty -= take; break; }
      case 'sell': {
        const basis = Math.min(q, it.qty) * avg;
        delta = q * p - fee - basis;
        it.cost -= basis; it.qty = Math.max(0, it.qty - q);
        u.earned += q * p; u.fees += fee; break;
      }
      case 'fee': delta = -fee; u.fees += fee; break;
      case 'adjust': it.qty += q; it.cost += q * p; break;
    }
    if (it.qty <= 1e-9) { it.qty = 0; it.cost = 0; }
    if (delta) { u.realized += delta; u.events.push({ at: t.occurred_at, delta }); }
  }
  return users;
}
