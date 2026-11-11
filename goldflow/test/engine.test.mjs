import assert from 'node:assert/strict';
import { planFlip, planVendorFlip, craftQuote, ledger, fmtMoney, parseMoney, ladderCost } from '../engine.js';

// money
assert.equal(fmtMoney(285000), '28g 50s');
assert.equal(fmtMoney(85000, { sign: true }), '+8g 50s');
assert.equal(fmtMoney(-1205), '−12s 5c');
assert.equal(fmtMoney(0), '0c');
assert.equal(parseMoney('2g 50s'), 25000);
assert.equal(parseMoney('2.5'), 25000);
assert.equal(parseMoney('75s 3c'), 7503);

// the spec's illustrative trade: 10 units @2g, resale 3g, 5% cut -> +8g 50s
const s0 = { ah_cut: 0.05, undercut: 0, deposit_pct: 0, min_profit: 1, min_roi: 0.01 };
const st = { med7_min: 30000, med30_min: 30000, sold_per_day7: 20, snapshots7: 160, volatility7: 0.1, avg_auctions7: 12 };
let p = planFlip([{ unit_price: 20000, quantity: 10 }, { unit_price: 31000, quantity: 5 }], st, { sell_price: 500 }, s0);
assert.equal(p.cost, 200000); assert.equal(p.revenue, 285000); assert.equal(p.profit, 85000);
assert.equal(Math.round(p.roi * 1000), 425);
console.log('spec trade:', fmtMoney(p.profit), (p.roi * 100).toFixed(1) + '%', 'conf', p.confidence, p.verdict, p.tags);

// buying the cheap one forces you to undercut the next listing
p = planFlip([{ unit_price: 20000, quantity: 1 }, { unit_price: 24000, quantity: 1 }, { unit_price: 31000, quantity: 3 }], st, {}, s0);
assert.equal(p.listings, 2); assert.equal(p.sellPrice, 30000);

// demand cap: sells 1/day, hold 3 days -> don't buy 50
p = planFlip([{ unit_price: 1000, quantity: 3 }, { unit_price: 1000, quantity: 50 }, { unit_price: 2900, quantity: 9 }], { ...st, med7_min: 3000, med30_min: 3000, sold_per_day7: 1 }, {}, s0);
assert.equal(p, null); // same-price competitor: no edge
p = planFlip([{ unit_price: 1000, quantity: 3 }, { unit_price: 2900, quantity: 50 }], { ...st, med7_min: 3000, med30_min: 3000, sold_per_day7: 1 }, {}, s0);
assert.equal(p.qty, 3);

// several cheap listings in a row: buy them all, then relist under the next real floor
p = planFlip([{ unit_price: 529, quantity: 20 }, { unit_price: 559, quantity: 20 }, { unit_price: 968, quantity: 20 }], { ...st, med7_min: 1017, med30_min: 1093, sold_per_day7: 300 }, {}, s0);
assert.equal(p.qty, 40); assert.equal(p.sellPrice, 968);

// no history -> no judgement
assert.equal(planFlip([{ unit_price: 1, quantity: 1 }], {}, {}, s0), null);

// vendor flip
const v = planVendorFlip([{ unit_price: 50, quantity: 20 }, { unit_price: 500, quantity: 1 }], { sell_price: 120 }, { min_profit: 100 });
assert.equal(v.qty, 20); assert.equal(v.profit, 1400);

// craft: 2 herbs @1g + vial 2s -> potion sells 3g
const m = { 1: { cur_p10: 10000, cur_min: 9500, med7_min: 10000, sell_price: 10 }, 9: { med7_min: 30000, med30_min: 32000, cur_min: 31000, sell_price: 100, sold_per_day7: 30, snapshots7: 100, avg_auctions7: 10, volatility7: 0.1 } };
const q = craftQuote({ product_item_id: 9, product_name: 'Potion', yield: 1, reagents: [
  { item_id: 1, item_name: 'Herb', quantity: 2, source: 'ah' }, { item_name: 'Leaded Vial', quantity: 1, source: 'vendor', vendor_price: 200 }] },
  (id) => m[id], { ah_cut: 0.05, undercut: 0, deposit_pct: 0.15, relists: 1 });
assert.equal(q.cost, 20200); assert.equal(q.revenue, 28500 - 15); assert.equal(q.profit, 28485 - 20200);
console.log('craft:', fmtMoney(q.profit), 'conversion gain vs raw', fmtMoney(q.conversionGain), q.verdict);

assert.deepEqual(ladderCost([{ unit_price: 5, quantity: 2 }, { unit_price: 1, quantity: 3 }], 4), { cost: 8, maxPrice: 5, short: 0 });

// ledger
const L = ledger([
  { user_id: 'a', kind: 'buy', item_id: 1, quantity: 10, unit_price: 100, occurred_at: '2026-11-01' },
  { user_id: 'a', kind: 'craft_use', item_id: 1, quantity: 4, unit_price: 0, occurred_at: '2026-11-02' },
  { user_id: 'a', kind: 'craft_make', item_id: 2, quantity: 2, unit_price: 200, occurred_at: '2026-11-02' },
  { user_id: 'a', kind: 'sell', item_id: 2, quantity: 2, unit_price: 500, fee: 50, occurred_at: '2026-11-03' },
  { user_id: 'a', kind: 'sell', item_id: 1, quantity: 6, unit_price: 150, fee: 45, occurred_at: '2026-11-03' },
]);
assert.equal(L.a.realized, (1000 - 50 - 400) + (900 - 45 - 600));
assert.equal(L.a.items[1].qty, 0);
console.log('all engine tests passed');
