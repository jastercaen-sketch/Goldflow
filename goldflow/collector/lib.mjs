// Shared helpers for the collector scripts (Node 20+, no dependencies).
export const env = process.env;
// Pasted keys sometimes carry spaces, line breaks or a label; keep only the key itself.
const keyShape = {};
for (const k of ['BLIZZARD_CLIENT_ID', 'BLIZZARD_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[k]) continue;
  const parts = String(env[k]).split(/\s+/).filter(Boolean);
  keyShape[k] = parts.map((p) => p.length).join(' + ');
  let pick = null;
  if (k === 'SUPABASE_SERVICE_ROLE_KEY') {
    // a key copied from a wrapped line arrives in pieces: rejoin everything from the sb_secret_ / eyJ start
    const i = parts.findIndex((p) => /^(sb_secret_|eyJ)/.test(p));
    if (i >= 0) pick = parts.slice(i).join('').replace(/[^A-Za-z0-9_.-]/g, '');
  } else if (k === 'SUPABASE_URL') pick = parts.find((p) => /^https?:\/\//.test(p));
  env[k] = pick || parts[0] || '';
}
{
  const k = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (k) console.log(`Supabase key check: pasted as pieces of ${keyShape.SUPABASE_SERVICE_ROLE_KEY} characters, using ${k.length} characters, starts with ${k.startsWith('sb_secret_') ? 'sb_secret_' : k.startsWith('eyJ') ? 'eyJ (legacy key)' : k.startsWith('sb_publishable_') ? 'sb_publishable_ (wrong key: that is the public one)' : 'something unexpected'}`);
}
export const REGION = (env.REGION || 'eu').toLowerCase();
export const RULESET_ID = Number(env.RULESET_ID || 1); // 1 = PvP
export const API = `https://${REGION}.api.blizzard.com`;
export const NS_DYNAMIC = `dynamic-forever-${REGION}`;
export const NS_STATIC = [`static-forever-${REGION}`, `static-classic1x-${REGION}`, `static-classic-${REGION}`];
export const LOCALE = env.LOCALE || 'en_GB';

export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchRetry(url, opts = {}, tries = 4) {
  for (let i = 1; ; i++) {
    let res;
    try { res = await fetch(url, opts); } catch (e) { if (i >= tries) throw e; await sleep(1000 * i); continue; }
    if ((res.status === 429 || res.status >= 500) && i < tries) { await sleep(1500 * i); continue; }
    return res;
  }
}

export function need(...names) {
  const miss = names.filter((n) => !env[n]);
  if (miss.length) { console.error('Missing environment variables:', miss.join(', ')); process.exit(1); }
}

// ---------- Blizzard ----------
let token = null;
export async function blizzardToken() {
  if (token) return token;
  need('BLIZZARD_CLIENT_ID', 'BLIZZARD_CLIENT_SECRET');
  const res = await fetchRetry('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${env.BLIZZARD_CLIENT_ID}:${env.BLIZZARD_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Blizzard token failed: ${res.status} ${await res.text()}`);
  token = (await res.json()).access_token;
  return token;
}

export async function blizzard(pathOrUrl, namespace) {
  const t = await blizzardToken();
  const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl);
  if (namespace && !url.searchParams.has('namespace')) url.searchParams.set('namespace', namespace);
  if (!url.searchParams.has('locale')) url.searchParams.set('locale', LOCALE);
  const res = await fetchRetry(url, { headers: { Authorization: `Bearer ${t}`, 'Accept-Encoding': 'gzip' } });
  return res;
}

export async function blizzardJson(path, namespace) {
  const res = await blizzard(path, namespace);
  if (!res.ok) throw new Error(`GET ${path} (${namespace}) -> ${res.status}`);
  return { json: await res.json(), lastModified: res.headers.get('last-modified') };
}

export function houseIndexPath() { return `/data/wow/ruleset/${RULESET_ID}/auctions/`; } // trailing slash required
export function housePath(id) { return `/data/wow/ruleset/${RULESET_ID}/auctions/${id}`; }

// Fetch one auction house (regular auctions + commodities), normalised to unit prices.
export async function fetchHouse(houseId) {
  const { json: house, lastModified } = await blizzardJson(housePath(houseId), NS_DYNAMIC);
  let commodities = [];
  const href = house?.commodities?.href;
  try {
    const c = await blizzardJson(href || `${housePath(houseId)}/commodities`, NS_DYNAMIC);
    commodities = c.json?.auctions || [];
  } catch (e) { log('commodities not available:', e.message); }

  const rows = new Map();
  const add = (a, unit) => {
    unit = Math.floor(unit || 0);
    if (!a?.id || !a.item?.id || unit < 1) return;
    rows.set(a.id, { auction_id: a.id, item_id: a.item.id, unit_price: unit, quantity: a.quantity || 1, time_left: a.time_left || null });
  };
  for (const a of house?.auctions || []) {
    const q = a.quantity || 1;
    add(a, a.unit_price ?? (a.buyout ? a.buyout / q : null)); // bid-only auctions are skipped
  }
  for (const a of commodities) add(a, a.unit_price);
  return { name: house?.name, lastModified, rows: [...rows.values()], raw: (house?.auctions?.length || 0) + commodities.length };
}

// ---------- Supabase (PostgREST) ----------
export async function sb(path, { method = 'GET', body, prefer, headers = {} } = {}) {
  need('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetchRetry(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      // legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys only in apikey
      ...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function sbAll(pathWithQuery, page = 1000) {
  const out = [];
  for (let offset = 0; ; offset += page) {
    const sep = pathWithQuery.includes('?') ? '&' : '?';
    const rows = await sb(`${pathWithQuery}${sep}limit=${page}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export async function sbInsert(table, rows, { batch = 5000, upsert = false } = {}) {
  for (let i = 0; i < rows.length; i += batch) {
    await sb(table, {
      method: 'POST', body: rows.slice(i, i + batch),
      prefer: upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    });
  }
}

export async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
