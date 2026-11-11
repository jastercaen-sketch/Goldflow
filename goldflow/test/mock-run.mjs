// End-to-end test of collector/collect.mjs against the local Postgres,
// with Blizzard and Supabase's REST API mocked in-process.
import { execFileSync } from 'node:child_process';

const PSQL = ['-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'gf', '-v', 'ON_ERROR_STOP=1', '-qAt'];
const sql = (q) => execFileSync('psql', PSQL, { input: q, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const SNAP = Number(process.env.SNAP || 1);
const ITEMS = { 3820: ['Stranglekelp', 25], 3356: ['Kingsblood', 20], 3372: ['Leaded Vial', 10], 3827: ['Mana Potion', 100], 2589: ['Linen Cloth', 13], 720: [null, 0] };
function auctions() {
  const out = []; let id = 1000 * SNAP;
  const push = (item, buyout, q, tl = 'VERY_LONG') => out.push({ id: id++, item: { id: item }, buyout, quantity: q, time_left: tl });
  push(3820, (SNAP < 3 ? 9200 : 3000) * 5, 5); push(3820, 9000 * 20, 20); push(3820, 9500 * 10, 10, 'LONG');
  push(3356, 6000 * 4, 4); push(3356, 6500 * 4, 4);
  push(3827, 21000, 1); push(3827, 29000, 1); push(3827, 30000, 1);
  push(2589, 100, 20); // below vendor price (13c)
  push(720, 100000, 1);
  out.push({ id: id++, item: { id: 3820 }, bid: 100, quantity: 1, time_left: 'LONG' }); // bid-only, skipped
  return out;
}

globalThis.fetch = async (url, opts = {}) => {
  url = new URL(url);
  const J = (o, status = 200, h = {}) => new Response(o == null ? null : JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...h } });
  if (url.host === 'oauth.battle.net') return J({ access_token: 'tok' });
  if (url.host.endsWith('api.blizzard.com')) {
    const p = url.pathname;
    if (/\/auctions\/\d+\/commodities$/.test(p)) return J({ auctions: [{ id: 9_000_000 + SNAP, item: { id: 3372 }, quantity: 40, unit_price: 150, time_left: 'LONG' }] });
    if (/\/auctions\/\d+$/.test(p)) return J({ id: 113, name: 'Alliance Auction House', auctions: auctions(), commodities: { href: url.origin + p + '/commodities' } }, 200, { 'last-modified': new Date(Date.UTC(2026, 10, 11, 9 + SNAP)).toUTCString() });
    let m = p.match(/\/item\/(\d+)$/);
    if (m) { const it = ITEMS[m[1]]; if (!it || !it[0]) return J({}, 404); return J({ name: it[0], quality: { type: 'COMMON' }, item_class: { name: 'Trade Goods' }, item_subclass: { name: 'Herb' }, sell_price: it[1] }); }
    if (p.includes('/media/item/')) return J({ assets: [{ key: 'icon', value: 'https://render.worldofwarcraft.com/x.jpg' }] });
    return J({}, 404);
  }
  // ---- PostgREST mock ----
  const table = url.pathname.replace('/rest/v1/', '');
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  const where = [];
  let order = '', limit = '', offset = '', select = '*';
  for (const [k, v] of url.searchParams) {
    if (k === 'select') select = v; else if (k === 'order') order = ' order by ' + v.replace('.desc', ' desc').replace('.asc', ''); else if (k === 'limit') limit = ' limit ' + v; else if (k === 'offset') offset = ' offset ' + v;
    else if (v.startsWith('eq.')) where.push(`${k} = ${lit(v.slice(3))}`);
  }
  const W = where.length ? ' where ' + where.join(' and ') : '';
  if (table.startsWith('rpc/')) {
    const fn = table.slice(4);
    const args = Object.entries(body || {}).map(([k, v]) => `${k} => ${v == null ? 'null' : lit(v)}`).join(', ');
    return J(JSON.parse(sql(`select coalesce(json_agg(x), '[]') from (select * from ${fn}(${args})) x;`) || '[]'));
  }
  if (method === 'GET') return J(JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (select ${select} from ${table}${W}${order}${limit}${offset}) t;`)));
  if (method === 'DELETE') { sql(`delete from ${table}${W};`); return J(null, 204); }
  if (method === 'PATCH') { const sets = Object.entries(body).map(([k, v]) => `${k} = ${v == null ? 'null' : lit(v)}`).join(', '); sql(`update ${table} set ${sets}${W};`); return J(null, 204); }
  if (method === 'POST') {
    const upsert = (opts.headers?.Prefer || '').includes('merge-duplicates');
    const cols = Object.keys(body[0]);
    const conflict = upsert ? ` on conflict (id) do update set ${cols.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',')}` : '';
    sql(`insert into ${table} (${cols.join(',')}) select ${cols.join(',')} from json_populate_recordset(null::${table}, ${lit(JSON.stringify(body))})${conflict};`);
    return J(null, 201);
  }
  return J({ error: 'unsupported' }, 400);
};

Object.assign(process.env, { BLIZZARD_CLIENT_ID: 'x', BLIZZARD_CLIENT_SECRET: 'y', SUPABASE_URL: 'http://mock', SUPABASE_SERVICE_ROLE_KEY: 'k' });
await import('../collector/collect.mjs');
