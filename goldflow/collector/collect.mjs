// Goldflow collector: fetch the auction house, store an hourly snapshot, compute deals.
// Run hourly (GitHub Actions does this for you). Env: see README.
import { planFlip, planVendorFlip, normSettings } from '../engine.js';
import {
  env, log, need, NS_STATIC, blizzard, fetchHouse, sb, sbAll, sbInsert, pool,
} from './lib.mjs';

need('BLIZZARD_CLIENT_ID', 'BLIZZARD_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
const MAX_NEW_ITEMS = Number(env.MAX_NEW_ITEMS || 600);
const MAX_DEALS = Number(env.MAX_DEALS || 500);

const [settingsRow] = await sb('settings?id=eq.1&select=*');
const settings = normSettings(settingsRow);
const houseId = Number(env.HOUSE_ID || settingsRow?.house_id);
if (!houseId) {
  console.error('No auction house chosen yet. Run `node collector/discover.mjs` and save the EU PvP Alliance house id.');
  process.exit(1);
}

// 1. fetch
log(`Fetching house ${houseId}…`);
const house = await fetchHouse(houseId);
log(`${house.raw} listings (${house.rows.length} with buyout) · ${house.name || ''} · Last-Modified ${house.lastModified}`);
if (!house.rows.length) { log('House is empty, nothing to do.'); process.exit(0); }

const [last] = await sb(`snapshots?house_id=eq.${houseId}&order=ts.desc&limit=1&select=ts,last_modified`);
if (!env.FORCE && last?.last_modified && house.lastModified && last.last_modified === house.lastModified) {
  log('Snapshot unchanged since last run — skipping.');
  process.exit(0);
}
const ts = new Date(house.lastModified ? Date.parse(house.lastModified) : Date.now());
if (isNaN(ts)) ts.setTime(Date.now());

// 2. upload + process
await sb(`auctions_staging?house_id=eq.${houseId}`, { method: 'DELETE', prefer: 'return=minimal' });
await sbInsert('auctions_staging', house.rows.map((r) => ({ house_id: houseId, ...r })));
log(`Uploaded ${house.rows.length} listings, processing…`);
const missing = (await sb('rpc/process_snapshot', {
  method: 'POST', body: { p_house: houseId, p_ts: ts.toISOString(), p_last_modified: house.lastModified },
})).map((r) => r.missing_item_id);
log(`Snapshot stored. ${missing.length} items need names.`);

// 3. item metadata
async function lookupItem(id) {
  for (const ns of NS_STATIC) {
    const res = await blizzard(`/data/wow/item/${id}`, ns);
    if (res.status === 404 || res.status === 403) continue;
    if (!res.ok) continue;
    const j = await res.json();
    let icon = null;
    try {
      const m = await blizzard(`/data/wow/media/item/${id}`, ns);
      if (m.ok) icon = (await m.json()).assets?.find((a) => a.key === 'icon')?.value || null;
    } catch { /* icon is optional */ }
    return {
      id, name: j.name ?? null, quality: j.quality?.type ?? null,
      item_class: j.item_class?.name ?? null, item_subclass: j.item_subclass?.name ?? null,
      sell_price: j.sell_price ?? 0, stack_size: j.max_count || null, icon, resolved: true,
      updated_at: new Date().toISOString(),
    };
  }
  return { id, name: null, resolved: false, updated_at: new Date().toISOString() };
}
const todo = missing.slice(0, MAX_NEW_ITEMS);
if (todo.length) {
  const items = await pool(todo, 8, lookupItem);
  // PostgREST bulk upsert needs identical keys on every row
  const keys = ['id', 'name', 'quality', 'item_class', 'item_subclass', 'sell_price', 'stack_size', 'icon', 'resolved', 'updated_at'];
  await sbInsert('items', items.map((it) => Object.fromEntries(keys.map((k) => [k, it[k] ?? (k === 'sell_price' ? 0 : null)]))), { upsert: true, batch: 500 });
  await sb('rpc/resolve_recipe_items', { method: 'POST', body: {} });
  log(`Looked up ${items.length} items (${items.filter((i) => !i.resolved).length} unknown to the API).`);
}

// 4. deals
const stats = new Map((await sbAll(`item_stats?house_id=eq.${houseId}&select=*`)).map((r) => [r.item_id, r]));
const meta = new Map((await sbAll('items?select=id,name,sell_price,item_class,quality')).map((r) => [r.id, r]));
const ladders = new Map();
for (const r of house.rows) {
  let l = ladders.get(r.item_id); if (!l) ladders.set(r.item_id, (l = []));
  l.push({ unit_price: r.unit_price, quantity: r.quantity });
}
const deals = [];
const now = new Date().toISOString();
for (const [itemId, ladder] of ladders) {
  const item = meta.get(itemId) || {};
  const st = stats.get(itemId);
  ladder.sort((a, b) => a.unit_price - b.unit_price);
  for (const plan of [planFlip(ladder, st, item, settings), planVendorFlip(ladder, item, settings)]) {
    if (!plan || !plan.verdict) continue;
    plan.buys = ladder.filter((l) => l.unit_price <= plan.maxPrice).slice(0, plan.listings).slice(0, 25);
    deals.push({
      house_id: houseId, item_id: itemId, computed_at: now, kind: plan.kind,
      profit: Math.round(plan.profit), roi: Number(plan.roi.toFixed(4)), confidence: plan.confidence,
      verdict: plan.verdict, plan,
    });
  }
}
deals.sort((a, b) => b.profit * b.confidence - a.profit * a.confidence);
const keep = deals.slice(0, MAX_DEALS);
await sb(`deals?house_id=eq.${houseId}`, { method: 'DELETE', prefer: 'return=minimal' });
await sbInsert('deals', keep, { batch: 500 });
log(`Deals: ${keep.length} kept (${keep.filter((d) => d.verdict === 'buy').length} "worth buying"). Done.`);
