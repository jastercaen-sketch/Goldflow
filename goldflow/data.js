// Goldflow data layer: a Supabase backend for the real site, and a demo backend with
// synthetic prices so the design can be tried without any setup.
import { planFlip, planVendorFlip, normSettings, DEFAULT_SETTINGS } from './engine.js';
import { STARTER_RECIPES } from './recipes.js';

// =====================================================================
// Supabase backend
// =====================================================================
export async function supabaseBackend(cfg) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const db = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  let houseId = null;

  const api = {
    demo: false,
    async session() { return (await db.auth.getSession()).data.session; },
    async signIn(email, password) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong password. Try again.' : error.message);
    },
    async signOut() { await db.auth.signOut(); },
    async me() {
      const { data: { user } } = await db.auth.getUser();
      if (!user) return null;
      const rows = ok(await db.from('members').select('*').eq('user_id', user.id));
      return rows[0] ? { ...rows[0], email: user.email } : { user_id: user.id, email: user.email, notMember: true };
    },
    async members() { return ok(await db.from('members').select('*').order('created_at')); },
    async updateMe(id, patch) { ok(await db.from('members').update(patch).eq('user_id', id)); },
    async settings() {
      const s = ok(await db.from('settings').select('*').eq('id', 1))[0] || {};
      houseId = s.house_id; return s;
    },
    async saveSettings(patch) { ok(await db.from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)); },
    async status() {
      if (!houseId) return null;
      const last = ok(await db.from('snapshots').select('*').eq('house_id', houseId).order('ts', { ascending: false }).limit(1))[0];
      if (!last) return null;
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { count } = await db.from('snapshots').select('ts', { count: 'exact', head: true }).eq('house_id', houseId).gte('ts', since);
      return { ...last, historyHours: count || 0 };
    },
    async deals() {
      if (!houseId) return [];
      return ok(await db.from('deals').select('*').eq('house_id', houseId).order('profit', { ascending: false }).limit(500));
    },
    async market(ids) {
      const out = new Map();
      const list = [...new Set(ids.filter(Boolean))];
      for (let i = 0; i < list.length; i += 150) {
        for (const r of ok(await db.from('item_market').select('*').in('item_id', list.slice(i, i + 150)))) out.set(r.item_id, r);
      }
      return out;
    },
    async search(q) {
      let req = db.from('item_market').select('*').not('name', 'is', null).limit(60);
      if (/^\d+$/.test(q)) req = db.from('item_market').select('*').eq('item_id', Number(q));
      else if (q) req = req.ilike('name', `%${q}%`).order('cur_qty', { ascending: false, nullsFirst: false });
      else req = req.order('sold_per_day7', { ascending: false, nullsFirst: false });
      return ok(await req);
    },
    async history(id) {
      const since = new Date(Date.now() - 3 * 864e5).toISOString();
      const [hourly, daily] = await Promise.all([
        db.from('item_hourly').select('ts,min_price,p10_price,median_price,quantity,sold_est').eq('house_id', houseId).eq('item_id', id).gte('ts', since).order('ts'),
        db.from('item_daily').select('day,min_price,p10_price,avg_qty,sold_est').eq('house_id', houseId).eq('item_id', id).order('day'),
      ]);
      return { hourly: ok(hourly), daily: ok(daily) };
    },
    async ladder(id) {
      return ok(await db.from('latest_auctions').select('unit_price,quantity,time_left').eq('house_id', houseId).eq('item_id', id).order('unit_price').limit(200));
    },
    async watchlist() { return ok(await db.from('watchlist').select('*').order('created_at')); },
    async watchSet(item_id, fields) { ok(await db.from('watchlist').upsert({ item_id, ...fields })); },
    async watchRemove(item_id) { ok(await db.from('watchlist').delete().eq('item_id', item_id)); },
    async claims() {
      return ok(await db.from('claims').select('*').eq('status', 'active').gt('expires_at', new Date().toISOString()));
    },
    async claim(row) { ok(await db.from('claims').insert(row)); },
    async setClaim(id, status) { ok(await db.from('claims').update({ status }).eq('id', id)); },
    async transactions() { return ok(await db.from('transactions').select('*').order('occurred_at', { ascending: false }).limit(5000)); },
    async addTransactions(rows) { ok(await db.from('transactions').insert(rows)); },
    async deleteTransactions(ids) { ok(await db.from('transactions').delete().in('id', ids)); },
    async recipes() {
      return ok(await db.from('recipes').select('*, reagents:recipe_reagents(*)').order('profession').order('name'));
    },
    async saveRecipe(r) {
      const { reagents, id, ...rest } = r;
      const row = { ...rest, product_item_id: rest.product_item_id || null };
      let rid = id;
      if (rid) ok(await db.from('recipes').update(row).eq('id', rid));
      else rid = ok(await db.from('recipes').insert(row).select('id'))[0].id;
      ok(await db.from('recipe_reagents').delete().eq('recipe_id', rid));
      if (reagents.length) ok(await db.from('recipe_reagents').insert(reagents.map((g) => ({
        recipe_id: rid, item_name: g.item_name, item_id: g.item_id || null, quantity: g.quantity,
        source: g.source, vendor_price: g.source === 'vendor' ? g.vendor_price : null,
      }))));
      await db.rpc('resolve_recipe_items');
    },
    async deleteRecipe(id) { ok(await db.from('recipes').delete().eq('id', id)); },
    subscribe(fn) {
      const ch = db.channel('goldflow');
      for (const table of ['claims', 'transactions', 'watchlist', 'deals']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => fn(table));
      }
      ch.subscribe();
    },
  };
  return api;
}

// =====================================================================
// Demo backend (synthetic, in-memory)
// =====================================================================
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const median = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };

// name, typical price (copper), vendor sell price, class, quality, units sold per day
const CATALOG = [
  ['Peacebloom', 45, 1, 'Trade Goods', 'COMMON', 120], ['Silverleaf', 40, 1, 'Trade Goods', 'COMMON', 140],
  ['Earthroot', 60, 2, 'Trade Goods', 'COMMON', 80], ['Mageroyal', 90, 5, 'Trade Goods', 'COMMON', 90],
  ['Briarthorn', 110, 5, 'Trade Goods', 'COMMON', 110], ['Bruiseweed', 180, 10, 'Trade Goods', 'COMMON', 70],
  ['Swiftthistle', 160, 7, 'Trade Goods', 'COMMON', 60], ['Stranglekelp', 140, 7, 'Trade Goods', 'COMMON', 90],
  ['Wild Steelbloom', 220, 10, 'Trade Goods', 'COMMON', 70], ['Kingsblood', 260, 15, 'Trade Goods', 'COMMON', 110],
  ['Liferoot', 300, 15, 'Trade Goods', 'COMMON', 80], ['Fadeleaf', 320, 20, 'Trade Goods', 'COMMON', 70],
  ['Goldthorn', 380, 20, 'Trade Goods', 'COMMON', 90], ["Khadgar's Whisker", 420, 25, 'Trade Goods', 'COMMON', 60],
  ['Wintersbite', 400, 25, 'Trade Goods', 'COMMON', 50], ['Firebloom', 520, 25, 'Trade Goods', 'COMMON', 60],
  ['Grave Moss', 450, 25, 'Trade Goods', 'COMMON', 40], ['Purple Lotus', 900, 30, 'Trade Goods', 'COMMON', 60],
  ["Arthas' Tears", 1100, 30, 'Trade Goods', 'COMMON', 50], ['Sungrass', 1300, 40, 'Trade Goods', 'COMMON', 70],
  ['Gromsblood', 1600, 50, 'Trade Goods', 'COMMON', 60], ['Golden Sansam', 2200, 60, 'Trade Goods', 'COMMON', 60],
  ['Dreamfoil', 2600, 60, 'Trade Goods', 'COMMON', 90], ['Mountain Silversage', 3400, 60, 'Trade Goods', 'COMMON', 50],
  ['Icecap', 1900, 60, 'Trade Goods', 'COMMON', 40], ['Black Lotus', 520000, 100, 'Trade Goods', 'COMMON', 2],
  ['Heart of the Wild', 1800, 100, 'Trade Goods', 'COMMON', 15], ['Stonescale Oil', 4200, 100, 'Trade Goods', 'COMMON', 25],
  ['Oily Blackmouth', 120, 4, 'Trade Goods', 'COMMON', 50], ['Blackmouth Oil', 400, 15, 'Trade Goods', 'COMMON', 30],
  ['Firefin Snapper', 150, 5, 'Trade Goods', 'COMMON', 30], ['Imbued Vial', 3000, 15, 'Trade Goods', 'COMMON', 10],
  ['Minor Mana Potion', 250, 10, 'Consumable', 'COMMON', 50], ['Lesser Mana Potion', 700, 30, 'Consumable', 'COMMON', 45],
  ['Mana Potion', 1500, 60, 'Consumable', 'COMMON', 55], ['Swiftness Potion', 900, 15, 'Consumable', 'COMMON', 40],
  ['Free Action Potion', 9500, 250, 'Consumable', 'COMMON', 25], ["Lesser Mender's Potion", 1400, 40, 'Consumable', 'COMMON', 50],
  ["Mender's Potion", 2900, 80, 'Consumable', 'COMMON', 60], ["Greater Mender's Potion", 5200, 150, 'Consumable', 'COMMON', 55],
  ['Elixir of Fortitude', 2100, 60, 'Consumable', 'COMMON', 30], ['Elixir of Greater Fortitude', 7400, 200, 'Consumable', 'COMMON', 20],
  ['Elixir of Ogre Strength', 1000, 30, 'Consumable', 'COMMON', 30], ['Elixir of Lesser Agility', 1200, 40, 'Consumable', 'COMMON', 30],
  ['Elixir of Greater Spirit', 3600, 120, 'Consumable', 'COMMON', 10], ['Lesser Invisibility Potion', 1700, 50, 'Consumable', 'COMMON', 15],
  ['Shadow Oil', 3400, 100, 'Consumable', 'COMMON', 20], ['Fire Oil', 520, 15, 'Consumable', 'COMMON', 15],
  ['Frost Protection Potion', 1900, 60, 'Consumable', 'COMMON', 15], ['Nature Protection Potion', 2300, 60, 'Consumable', 'COMMON', 15],
  ['Shadow Protection Potion', 2600, 60, 'Consumable', 'COMMON', 15], ['Major Rejuvenation Potion', 23000, 600, 'Consumable', 'COMMON', 6],
  ['Flask of the Titans', 680000, 1000, 'Consumable', 'COMMON', 4], ['Flask of Supreme Power', 640000, 1000, 'Consumable', 'COMMON', 4],
  ['Flask of Distilled Wisdom', 610000, 1000, 'Consumable', 'COMMON', 3], ['Flask of Petrification', 590000, 1000, 'Consumable', 'COMMON', 1],
  ['Flask of Chromatic Resistance', 600000, 1000, 'Consumable', 'COMMON', 1],
  ['Copper Ore', 90, 5, 'Trade Goods', 'COMMON', 150], ['Tin Ore', 110, 10, 'Trade Goods', 'COMMON', 100],
  ['Copper Bar', 110, 10, 'Trade Goods', 'COMMON', 140], ['Tin Bar', 140, 25, 'Trade Goods', 'COMMON', 90],
  ['Bronze Bar', 190, 50, 'Trade Goods', 'COMMON', 110], ['Silver Ore', 500, 75, 'Trade Goods', 'COMMON', 20],
  ['Silver Bar', 650, 50, 'Trade Goods', 'COMMON', 20], ['Iron Ore', 520, 75, 'Trade Goods', 'COMMON', 110],
  ['Iron Bar', 640, 100, 'Trade Goods', 'COMMON', 120], ['Coal', 400, 125, 'Trade Goods', 'COMMON', 50],
  ['Steel Bar', 1150, 100, 'Trade Goods', 'COMMON', 60], ['Gold Ore', 1700, 150, 'Trade Goods', 'UNCOMMON', 20],
  ['Gold Bar', 1900, 150, 'Trade Goods', 'UNCOMMON', 25], ['Mithril Ore', 1300, 100, 'Trade Goods', 'COMMON', 110],
  ['Mithril Bar', 1500, 100, 'Trade Goods', 'COMMON', 120], ['Truesilver Ore', 3400, 200, 'Trade Goods', 'UNCOMMON', 25],
  ['Truesilver Bar', 3800, 200, 'Trade Goods', 'UNCOMMON', 30], ['Thorium Ore', 1900, 250, 'Trade Goods', 'COMMON', 140],
  ['Thorium Bar', 2300, 600, 'Trade Goods', 'COMMON', 150],
  ['Linen Cloth', 25, 13, 'Trade Goods', 'COMMON', 300], ['Bolt of Linen Cloth', 70, 40, 'Trade Goods', 'COMMON', 120],
  ['Wool Cloth', 70, 33, 'Trade Goods', 'COMMON', 250], ['Bolt of Woolen Cloth', 260, 100, 'Trade Goods', 'COMMON', 90],
  ['Silk Cloth', 160, 38, 'Trade Goods', 'COMMON', 260], ['Bolt of Silk Cloth', 720, 150, 'Trade Goods', 'COMMON', 110],
  ['Mageweave Cloth', 320, 100, 'Trade Goods', 'COMMON', 280], ['Bolt of Mageweave', 1500, 200, 'Trade Goods', 'COMMON', 120],
  ['Runecloth', 1050, 200, 'Trade Goods', 'COMMON', 320], ['Bolt of Runecloth', 4600, 400, 'Trade Goods', 'COMMON', 120],
  ['Heavy Wool Bandage', 180, 20, 'Consumable', 'COMMON', 30], ['Heavy Silk Bandage', 360, 50, 'Consumable', 'COMMON', 40],
  ['Heavy Mageweave Bandage', 750, 100, 'Consumable', 'COMMON', 50], ['Heavy Runecloth Bandage', 2300, 250, 'Consumable', 'COMMON', 90],
  ['Light Leather', 80, 15, 'Trade Goods', 'COMMON', 140], ['Heavy Leather', 600, 50, 'Trade Goods', 'COMMON', 70],
  ['Thick Leather', 1000, 75, 'Trade Goods', 'COMMON', 80], ['Rugged Leather', 1400, 100, 'Trade Goods', 'COMMON', 120],
  ['Essence of Fire', 52000, 400, 'Trade Goods', 'UNCOMMON', 8], ['Large Brilliant Shard', 61000, 0, 'Trade Goods', 'RARE', 10],
  ['Greater Eternal Essence', 34000, 0, 'Trade Goods', 'UNCOMMON', 12], ['Illusion Dust', 9500, 0, 'Trade Goods', 'COMMON', 30],
  ['Arcane Crystal', 168000, 2500, 'Trade Goods', 'UNCOMMON', 4], ['Arcanite Bar', 285000, 2500, 'Trade Goods', 'UNCOMMON', 4],
  ["Blackhand's Breadth", 2400000, 21000, 'Armor', 'RARE', 0.2], ['Hand of Edward the Odd', 4100000, 31000, 'Weapon', 'EPIC', 0.1],
  ['Formula: Enchant Weapon - Crusader', 3300000, 3000, 'Recipe', 'UNCOMMON', 0.2],
  ['Heavy Hide Gloves of the Bear', 9800, 640, 'Armor', 'UNCOMMON', 2], ["Archer's Bow of the Eagle", 21000, 1500, 'Weapon', 'UNCOMMON', 1],
];
const HOUSE = 0;

function buildDemo() {
  const R = rng(20261111);
  const now = Date.now() - (Date.now() % 36e5);
  const items = [], hourly = new Map(), daily = new Map(), ladders = new Map();
  CATALOG.forEach(([name, base, sell, cls, quality, vol], i) => {
    const id = 50000 + i;
    items.push({ id, name, quality, item_class: cls, item_subclass: null, sell_price: sell, icon: null });
    const phase = R() * 6.28, noise = vol < 2 ? 0.22 : 0.08, trend = (R() - 0.5) * 0.25;
    const h = [];
    for (let k = 167; k >= 0; k--) { // 7 days, newest 72h shown in the chart
      const ts = new Date(now - k * 36e5).toISOString();
      const f = 1 + 0.12 * Math.sin(((167 - k) / 24) * 6.28 + phase) + trend * (1 - k / 167) + (R() - 0.5) * noise * 2;
      const min = Math.max(1, Math.round(base * f));
      const exp = (vol / 24) * (0.4 + R() * 1.2); const sold = Math.floor(exp) + (R() < exp % 1 ? 1 : 0);
      h.push({ ts, min_price: min, p10_price: Math.round(min * 1.04), median_price: Math.round(min * 1.15), quantity: Math.round(vol * (1.5 + R())), sold_est: sold, auctions: Math.max(1, Math.round(vol / 6 + R() * 5)) });
    }
    hourly.set(id, h);
    const d = [];
    for (let k = 29; k >= 0; k--) {
      const day = new Date(now - k * 864e5).toISOString().slice(0, 10);
      const f = 1 + 0.06 * Math.sin(k / 4 + phase) + (R() - 0.5) * noise + trend * (k / 30) * -0.5;
      d.push({ day, min_price: Math.round(base * f), p10_price: Math.round(base * f * 1.04), avg_qty: Math.round(vol * 2), sold_est: Math.round(vol * (0.7 + R() * 0.6)) });
    }
    daily.set(id, d);
    // current listings
    const floor = h[h.length - 1].min_price;
    const L = [];
    const n = vol < 1 ? 2 + Math.floor(R() * 3) : 4 + Math.floor(R() * 10);
    const stack = cls === 'Trade Goods' ? [5, 10, 20, 20] : cls === 'Consumable' ? [1, 5, 5, 10] : [1];
    for (let j = 0; j < n; j++) L.push({ unit_price: Math.round(floor * (1 + j * 0.03 + R() * 0.05)), quantity: stack[Math.floor(R() * stack.length)], time_left: ['LONG', 'VERY_LONG', 'MEDIUM'][j % 3] });
    ladders.set(id, L);
  });
  // plant some bargains (and one trap) so the board has something to show
  const plant = (name, frac, qty, count = 1) => {
    const id = items.find((x) => x.name === name).id;
    const base = median(hourly.get(id).map((x) => x.min_price));
    for (let j = 0; j < count; j++) ladders.get(id).push({ unit_price: Math.round(base * (frac + j * 0.03)), quantity: qty, time_left: 'VERY_LONG' });
  };
  plant('Runecloth', 0.52, 20, 4); plant('Thorium Bar', 0.58, 20, 3); plant('Mageweave Cloth', 0.45, 20, 3); plant('Bolt of Runecloth', 0.6, 10, 2);
  plant("Greater Mender's Potion", 0.55, 5, 3); plant('Dreamfoil', 0.6, 20, 2); plant('Gromsblood', 0.6, 20, 2); plant('Free Action Potion', 0.5, 5, 2); plant('Essence of Fire', 0.62, 1, 2);
  plant('Large Brilliant Shard', 0.7, 2, 1); plant('Black Lotus', 0.72, 1, 1); plant('Arcanite Bar', 0.74, 1, 1);
  plant("Blackhand's Breadth", 0.55, 1, 1); plant('Formula: Enchant Weapon - Crusader', 0.6, 1, 1);
  plant('Heavy Hide Gloves of the Bear', 0.2, 1, 1); plant('Mithril Bar', 0.62, 20, 2); plant('Sungrass', 0.45, 20, 2);
  const copperBar = items.find((x) => x.name === 'Copper Bar');
  ladders.get(copperBar.id).push({ unit_price: 6, quantity: 20, time_left: 'LONG' }, { unit_price: 7, quantity: 20, time_left: 'LONG' }); // below vendor (10c)
  const linen = items.find((x) => x.name === 'Linen Cloth');
  linen.sell_price = 13; ladders.get(linen.id).push({ unit_price: 3, quantity: 20, time_left: 'LONG' }, { unit_price: 4, quantity: 20, time_left: 'LONG' }, { unit_price: 5, quantity: 20, time_left: 'LONG' });

  const stats = new Map();
  for (const it of items) {
    const h = hourly.get(it.id), d = daily.get(it.id), L = ladders.get(it.id).sort((a, b) => a.unit_price - b.unit_price);
    const mins = h.map((x) => x.min_price), mean = mins.reduce((a, b) => a + b, 0) / mins.length;
    const sd = Math.sqrt(mins.reduce((a, b) => a + (b - mean) ** 2, 0) / mins.length);
    const tot = L.reduce((a, x) => a + x.quantity, 0);
    let cum = 0, p10 = null, med = null;
    for (const l of L) { cum += l.quantity; if (p10 == null && cum >= tot * 0.1) p10 = l.unit_price; if (med == null && cum >= tot * 0.5) med = l.unit_price; }
    stats.set(it.id, {
      item_id: it.id, ...it, last_ts: h[h.length - 1].ts,
      cur_min: L[0]?.unit_price ?? null, cur_p10: p10, cur_median: med, cur_qty: tot, cur_auctions: L.length,
      med7_min: median(mins), med7_p10: median(h.map((x) => x.p10_price)), med30_min: median(d.map((x) => x.min_price)),
      avg_qty7: h.reduce((a, x) => a + x.quantity, 0) / h.length,
      sold_per_day7: (h.reduce((a, x) => a + x.sold_est, 0) / h.length) * 24,
      snapshots7: h.length, volatility7: sd / mean, avg_auctions7: h.reduce((a, x) => a + x.auctions, 0) / h.length,
    });
  }
  return { items, hourly, daily, ladders, stats, ts: new Date(now - 14 * 6e4).toISOString() };
}

export function demoBackend() {
  const M = buildDemo();
  const byName = new Map(M.items.map((i) => [i.name.toLowerCase(), i.id]));
  const members = [
    { user_id: 'me', display_name: 'Mordain', color: '#f2c45a' },
    { user_id: 'bro', display_name: 'Wulfgar', color: '#8fc3d6' },
  ];
  let settings = { id: 1, ...DEFAULT_SETTINGS, region: 'eu', ruleset_id: 1, house_id: 113, house_name: 'Alliance Auction House (demo)' };
  const day = (d, h = 0) => new Date(Date.now() - d * 864e5 - h * 36e5).toISOString();
  const id = (n) => byName.get(n.toLowerCase());
  let uid = 1; const tid = () => `t${uid++}`;
  let tx = [
    { user_id: 'me', kind: 'buy', item_id: id('Runecloth'), item_name: 'Runecloth', quantity: 60, unit_price: 700, occurred_at: day(12) },
    { user_id: 'me', kind: 'sell', item_id: id('Runecloth'), item_name: 'Runecloth', quantity: 60, unit_price: 1040, fee: 3120, occurred_at: day(10) },
    { user_id: 'bro', kind: 'buy', item_id: id('Thorium Ore'), item_name: 'Thorium Ore', quantity: 40, unit_price: 1500, occurred_at: day(9) },
    { user_id: 'bro', kind: 'craft_use', item_id: id('Thorium Ore'), item_name: 'Thorium Ore', quantity: 40, unit_price: 1500, occurred_at: day(9, -1), batch_id: 'b1' },
    { user_id: 'bro', kind: 'craft_make', item_id: id('Thorium Bar'), item_name: 'Thorium Bar', quantity: 40, unit_price: 1500, occurred_at: day(9, -1), batch_id: 'b1' },
    { user_id: 'bro', kind: 'sell', item_id: id('Thorium Bar'), item_name: 'Thorium Bar', quantity: 30, unit_price: 2290, fee: 3435, occurred_at: day(7) },
    { user_id: 'me', kind: 'buy', item_id: id('Black Lotus'), item_name: 'Black Lotus', quantity: 1, unit_price: 380000, occurred_at: day(6) },
    { user_id: 'me', kind: 'sell', item_id: id('Black Lotus'), item_name: 'Black Lotus', quantity: 1, unit_price: 515000, fee: 25750, occurred_at: day(4) },
    { user_id: 'bro', kind: 'buy', item_id: id('Dreamfoil'), item_name: 'Dreamfoil', quantity: 30, unit_price: 1900, occurred_at: day(3) },
    { user_id: 'me', kind: 'buy', item_id: id('Mageweave Cloth'), item_name: 'Mageweave Cloth', quantity: 100, unit_price: 210, occurred_at: day(2) },
    { user_id: 'me', kind: 'fee', item_id: id('Mageweave Cloth'), item_name: 'Mageweave Cloth', quantity: 0, unit_price: 0, fee: 1500, note: 'Lost deposits', occurred_at: day(1) },
    { user_id: 'bro', kind: 'sell', item_id: id('Thorium Bar'), item_name: 'Thorium Bar', quantity: 10, unit_price: 2350, fee: 1175, occurred_at: day(0, 5) },
  ].map((t) => ({ id: tid(), fee: 0, note: null, ...t }));
  let claims = [{ id: 'c1', item_id: id('Thorium Bar'), claimed_by: 'bro', quantity: 40, max_price: 1700, note: 'Smelting run tonight', status: 'active', created_at: day(0, 1), expires_at: new Date(Date.now() + 4 * 36e5).toISOString() }];
  let watch = [
    { item_id: id('Black Lotus'), target_buy: 420000, target_sell: 560000, note: 'Raid nights spike', added_by: 'me', created_at: day(5) },
    { item_id: id('Arcanite Bar'), target_buy: 230000, target_sell: null, note: null, added_by: 'bro', created_at: day(4) },
    { item_id: id('Free Action Potion'), target_buy: null, target_sell: 11000, note: 'PvP demand', added_by: 'bro', created_at: day(2) },
  ];
  let recipes = STARTER_RECIPES.map((r, i) => ({
    id: i + 1, name: r.name, profession: r.profession, product_name: r.product, product_item_id: id(r.product) || null,
    yield: r.yield, verified: r.verified, notes: r.notes,
    reagents: r.reagents.map((g, j) => ({ id: `${i}-${j}`, item_name: g.item, item_id: id(g.item) || null, quantity: g.qty, source: g.source, vendor_price: g.vendor_price })),
  }));
  const listeners = [];
  const emit = (t) => listeners.forEach((f) => f(t));
  let signedIn = false, meId = 'me';

  const computeDeals = () => {
    const s = normSettings(settings), out = [];
    for (const it of M.items) {
      const L = M.ladders.get(it.id);
      for (const plan of [planFlip(L, M.stats.get(it.id), it, s), planVendorFlip(L, it, s)]) {
        if (!plan?.verdict) continue;
        plan.buys = [...L].sort((a, b) => a.unit_price - b.unit_price).slice(0, plan.listings);
        out.push({ house_id: HOUSE, item_id: it.id, kind: plan.kind, computed_at: M.ts, profit: plan.profit, roi: plan.roi, confidence: plan.confidence, verdict: plan.verdict, plan });
      }
    }
    return out.sort((a, b) => b.profit * b.confidence - a.profit * a.confidence);
  };

  return {
    demo: true,
    async session() { return signedIn ? { user: { id: 'me' } } : null; },
    async signIn(email, password) {
      if (!password) throw new Error('Enter any password to try the demo.');
      signedIn = true; meId = /wulfgar/i.test(email) ? 'bro' : 'me';
    },
    async signOut() { signedIn = false; },
    async me() { return { ...members.find((m) => m.user_id === meId), email: 'demo@goldflow' }; },
    async members() { return members; },
    async updateMe(id, patch) { Object.assign(members.find((m) => m.user_id === id), patch); },
    async settings() { return settings; },
    async saveSettings(p) { settings = { ...settings, ...p }; emit('deals'); },
    async status() { return { ts: M.ts, auctions: [...M.ladders.values()].reduce((a, l) => a + l.length, 0), items: M.items.length, historyHours: 118 }; },
    async deals() { return computeDeals(); },
    async market(ids) { return new Map(ids.filter((i) => M.stats.has(i)).map((i) => [i, M.stats.get(i)])); },
    async search(q) {
      const all = [...M.stats.values()];
      if (!q) return all.sort((a, b) => b.sold_per_day7 - a.sold_per_day7).slice(0, 60);
      return all.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()) || String(x.item_id) === q).slice(0, 60);
    },
    async history(i) { return { hourly: (M.hourly.get(i) || []).slice(-72), daily: M.daily.get(i) || [] }; },
    async ladder(i) { return [...(M.ladders.get(i) || [])].sort((a, b) => a.unit_price - b.unit_price); },
    async watchlist() { return watch; },
    async watchSet(item_id, f) { const w = watch.find((x) => x.item_id === item_id); if (w) Object.assign(w, f); else watch.push({ item_id, added_by: 'me', created_at: new Date().toISOString(), ...f }); emit('watchlist'); },
    async watchRemove(item_id) { watch = watch.filter((x) => x.item_id !== item_id); emit('watchlist'); },
    async claims() { return claims.filter((c) => c.status === 'active' && new Date(c.expires_at) > new Date()); },
    async claim(row) { claims.push({ id: tid(), claimed_by: 'me', status: 'active', created_at: new Date().toISOString(), ...row }); emit('claims'); },
    async setClaim(cid, status) { const c = claims.find((x) => x.id === cid); if (c) c.status = status; emit('claims'); },
    async transactions() { return [...tx].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)); },
    async addTransactions(rows) { tx.push(...rows.map((r) => ({ id: tid(), user_id: 'me', fee: 0, occurred_at: new Date().toISOString(), ...r }))); emit('transactions'); },
    async deleteTransactions(ids) { tx = tx.filter((t) => !ids.includes(t.id)); emit('transactions'); },
    async recipes() { return recipes; },
    async saveRecipe(r) {
      const fix = { ...r, product_item_id: r.product_item_id || id(r.product_name) || null, reagents: r.reagents.map((g) => ({ ...g, item_id: g.item_id || id(g.item_name) || null })) };
      if (r.id) recipes = recipes.map((x) => (x.id === r.id ? fix : x)); else recipes.push({ ...fix, id: Date.now() });
    },
    async deleteRecipe(rid) { recipes = recipes.filter((x) => x.id !== rid); },
    subscribe(fn) { listeners.push(fn); },
    nameToId: (n) => id(n),
  };
}
