// Find the right auction house id for EU PvP Alliance.
//   node collector/discover.mjs            -> list houses with sample prices to compare in-game
//   node collector/discover.mjs --save 113 -> store house 113 in Goldflow's settings
//   add --all to also scan Horde/Blackwater houses
import { env, log, RULESET_ID, NS_DYNAMIC, blizzardJson, houseIndexPath, fetchHouse, sb } from './lib.mjs';
import { fmtMoney } from '../engine.js';

const args = process.argv.slice(2);
const saveIdx = args.indexOf('--save');
if (saveIdx >= 0) {
  const id = Number(args[saveIdx + 1]);
  if (!id) { console.error('Usage: --save <houseId>'); process.exit(1); }
  const name = args[saveIdx + 2] || null;
  await sb('settings?id=eq.1', { method: 'PATCH', body: { house_id: id, house_name: name, ruleset_id: RULESET_ID, updated_at: new Date().toISOString() } });
  log(`Saved house ${id} to Goldflow settings.`);
  process.exit(0);
}

// Common items to compare against what you see in-game (classic item ids)
const BENCH = { 2589: 'Linen Cloth', 2592: 'Wool Cloth', 4306: 'Silk Cloth', 4338: 'Mageweave Cloth', 14047: 'Runecloth',
  2770: 'Copper Ore', 2840: 'Copper Bar', 2772: 'Iron Ore', 2447: 'Peacebloom', 765: 'Silverleaf', 2318: 'Light Leather' };

const { json: rs } = await blizzardJson('/data/wow/ruleset/index', NS_DYNAMIC);
log('Rulesets:', (rs.rulesets || rs.results || []).map((r) => `${r.id}=${r.name?.en_GB || r.name || ''}`).join(', ') || JSON.stringify(rs).slice(0, 200));

const { json: idx } = await blizzardJson(houseIndexPath(), NS_DYNAMIC);
const houses = idx.auctions || [];
console.log(`\nRuleset ${RULESET_ID} lists ${houses.length} houses:`);
for (const h of houses) console.log(`  id ${h.id}\t${h.name?.en_GB || h.name || ''}\t${h.key?.href || ''}`);

const scan = houses.filter((h) => args.includes('--all') || /alliance/i.test(JSON.stringify(h.name)));
console.log(`\nScanning ${scan.length} house(s). Compare these floor prices with the Alliance AH in-game:\n`);
for (const h of scan) {
  try {
    const house = await fetchHouse(h.id);
    const floor = {};
    for (const r of house.rows) if (BENCH[r.item_id] && (!floor[r.item_id] || r.unit_price < floor[r.item_id])) floor[r.item_id] = r.unit_price;
    console.log(`House ${h.id} — ${house.rows.length} listings, ${new Set(house.rows.map((r) => r.item_id)).size} items, updated ${house.lastModified}`);
    for (const [id, n] of Object.entries(BENCH)) if (floor[id]) console.log(`   ${n.padEnd(16)} ${fmtMoney(floor[id])}`);
    console.log('');
  } catch (e) { console.log(`House ${h.id}: ${e.message}\n`); }
}
console.log('When one matches what you see in Stormwind/Ironforge, save it with:\n  node collector/discover.mjs --save <id> "EU PvP Alliance"');
if (!env.SUPABASE_URL) console.log('(needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set)');
