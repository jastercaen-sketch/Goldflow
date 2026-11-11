// Goldflow front end. Plain ES modules, no build step.
import {
  planFlip, craftQuote, ledger, ladderCost, referencePrice, normSettings, splitMoney, parseMoney, fmtMoney, VERDICT_TEXT,
} from './engine.js';
import { supabaseBackend, demoBackend } from './data.js';

// ---------------------------------------------------------------- helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 0) => (x == null || !isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);
const num = (x, d = 0) => (x == null || !isFinite(x) ? '—' : Number(x).toLocaleString('en-GB', { maximumFractionDigits: d }));
const ago = (ts) => {
  if (!ts) return 'never'; const m = Math.round((Date.now() - new Date(ts)) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 48) return `${h} h ago`; return `${Math.round(h / 24)} days ago`;
};
const hoursLeft = (ts) => { const h = (new Date(ts) - Date.now()) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min left` : `${Math.round(h)} h left`; };
const shortDate = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function money(c, { sign = false, tone = false } = {}) {
  if (c == null || !isFinite(c)) return '<span class="m faint">—</span>';
  const { neg, g, s, c: cp } = splitMoney(c);
  const parts = [];
  if (g) parts.push(`${g.toLocaleString('en-GB')}<i class="g">g</i>`);
  if (s && g < 1000) parts.push(`${s}<i class="s">s</i>`);
  if ((cp && !g) || !parts.length) parts.push(`${cp}<i class="c">c</i>`);
  const cls = tone ? (neg ? 'neg' : c > 0 ? 'pos' : '') : '';
  return `<span class="m ${cls}">${neg ? '−' : sign && c > 0 ? '+' : ''}${parts.join(' ')}</span>`;
}

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

// ---------------------------------------------------------------- state
const S = {
  api: null, me: null, members: [], settings: {}, status: null, deals: [], market: new Map(), ladders: new Map(),
  claims: [], watch: [], tx: [], recipes: [], route: 'hearth',
  ui: {
    deals: { q: '', verdict: 'all', kind: 'all', minConf: 0, hideClaimed: false, cls: 'all', sort: 'score' },
    craft: { prof: 'all', q: '', verifiedOnly: false, open: null, crafts: 5, sort: 'profit' },
    ledger: { who: 'all' },
    market: { q: '', results: null },
  },
};
const ROUTES = [
  ['hearth', 'The Hearth'], ['deals', 'Deal Board'], ['crafting', 'Crafting Bench'],
  ['watchlist', 'Watchlist'], ['ledger', 'Ledger'], ['market', 'Market'],
];
const set = () => normSettings(S.settings);
const info = (id) => S.market.get(id) || { item_id: id, name: null };
const member = (uid) => S.members.find((m) => m.user_id === uid) || { display_name: 'Someone', color: '#999' };
const claimFor = (itemId) => S.claims.find((c) => c.item_id === itemId);

async function ensureMarket(ids) {
  const miss = [...new Set(ids)].filter((id) => id && !S.market.has(id));
  if (!miss.length) return;
  const got = await S.api.market(miss);
  for (const [k, v] of got) S.market.set(k, v);
}

// ---------------------------------------------------------------- item display
function itemName(m) { return m?.name || `Item #${m?.item_id ?? '?'}`; }
function icon(m, big = false) {
  const q = m?.quality || 'COMMON';
  if (m?.icon) return `<span class="icon ${big ? 'big' : ''} q-${q}" style="background-image:url('${esc(m.icon)}')" aria-hidden="true"></span>`;
  return `<span class="icon ${big ? 'big' : ''} q-${q}" aria-hidden="true">${esc(itemName(m)[0])}</span>`;
}
function item(m, { sub = '' } = {}) {
  return `<span class="item">${icon(m)}<span><a href="#" class="iname q-${m?.quality || 'COMMON'}" data-act="item" data-id="${m?.item_id}">${esc(itemName(m))}</a>${sub ? `<br><span class="faint" style="font-size:14px">${sub}</span>` : ''}</span></span>`;
}
function seal(verdict, kind) {
  if (kind === 'vendor') return '<span class="seal vendor">Vendor flip</span>';
  if (!verdict) return '<span class="faint">—</span>';
  const short = { buy: 'Buy', consider: 'Consider', wait: 'Wait' }[verdict];
  return `<span class="seal ${verdict}" title="${esc(VERDICT_TEXT[verdict])}">${short}</span>`;
}
function conf(score) {
  if (score == null) return '<span class="faint">—</span>';
  const c = score >= 65 ? 'var(--moss)' : score >= 45 ? 'var(--candle-deep)' : 'var(--ember)';
  return `<span class="conf" title="Confidence ${score}/100"><span class="bar"><i style="width:${score}%;--cc:${c}"></i></span>${score}</span>`;
}
function tags(list) {
  if (!list?.length) return '';
  const warn = /slow|volatile|thin|too good|gear|competition|little/;
  return `<div class="tags">${list.map((t) => `<span class="tag ${warn.test(t) ? 'warn' : ''}">${esc(t)}</span>`).join('')}</div>`;
}
function claimNote(c) {
  if (!c) return '';
  const mine = c.claimed_by === S.me.user_id;
  return `<div class="claimnote"><span class="dot" style="--c:${member(c.claimed_by).color}"></span> ${mine ? 'You claimed this' : `${esc(member(c.claimed_by).display_name)} is on it`} · ${hoursLeft(c.expires_at)}</div>`;
}

// ---------------------------------------------------------------- shell
function shell() {
  const s = set();
  const L = ledger(S.tx);
  const total = Object.values(L).reduce((a, u) => a + u.realized, 0);
  const week = Object.values(L).reduce((a, u) => a + u.events.filter((e) => Date.now() - new Date(e.at) < 7 * 864e5).reduce((x, e) => x + e.delta, 0), 0);
  const buyCount = S.deals.filter((d) => d.verdict === 'buy' && !claimFor(d.item_id)).length;
  return `
  ${S.api.demo ? '<div class="demo-ribbon">Demo mode — prices are synthetic. Add your Supabase keys to <b>config.js</b> to go live.</div>' : ''}
  <div class="scene" aria-hidden="true"></div>
  <header class="top wood">
    <a class="sign" href="#hearth"><h1>Goldflow</h1><small>${esc(S.settings.house_name || 'EU PvP · Alliance')}</small></a>
    <div class="purse">
      <div class="stat"><b>${money(week, { sign: true, tone: true })}</b><span>profit, last 7 days</span></div>
      <div class="stat"><b>${money(total, { sign: true, tone: true })}</b><span>profit, all time</span></div>
      <div class="who"><span class="dot" style="--c:${esc(S.me.color)}"></span>${esc(S.me.display_name)}
        <button class="btn ghost small" data-act="settings" style="color:#e7cf9f">Settings</button>
        <button class="btn ghost small" data-act="signout" style="color:#e7cf9f">Sign out</button></div>
    </div>
  </header>
  <nav class="tabs" aria-label="Sections">
    ${ROUTES.map(([k, l]) => `<a href="#${k}" ${S.route === k ? 'aria-current="page"' : ''}>${l}${k === 'deals' && buyCount ? `<span class="badge" title="Unclaimed deals worth buying">${buyCount}</span>` : ''}</a>`).join('')}
  </nav>
  <main class="sheet" id="main" tabindex="-1"></main>`;
}

function statusLine() {
  const st = S.status;
  if (!st) return `<div class="status"><span class="live stale"></span>No auction house scan yet.</div>`;
  const stale = Date.now() - new Date(st.ts) > 3 * 36e5;
  return `<div class="status"><span class="live ${stale ? 'stale' : ''}"></span>Last auction house scan ${ago(st.ts)} — ${num(st.auctions)} listings, ${num(st.items)} different items.${stale ? ' The scanner may have stopped; check GitHub Actions.' : ''}</div>`;
}

function setupNotices() {
  if (S.api.demo) return '';
  if (!S.settings.house_id) return `<div class="notice"><b>Pick your auction house.</b> Run <code>node collector/discover.mjs</code>, compare the prices with the Alliance AH in-game, then save it with <code>--save &lt;id&gt;</code> or in Settings.</div>`;
  return '';
}

// ---------------------------------------------------------------- views
const VIEWS = {};

VIEWS.hearth = () => {
  const s = set();
  const top = S.deals.filter((d) => d.verdict === 'buy' && !claimFor(d.item_id)).slice(0, 6);
  const L = ledger(S.tx);
  const users = S.members.map((m) => ({ m, u: L[m.user_id] || { realized: 0, events: [], items: {} } }));
  const week = (u) => u.events.filter((e) => Date.now() - new Date(e.at) < 7 * 864e5).reduce((a, e) => a + e.delta, 0);
  const stock = users.reduce((a, { u }) => a + invValue(u).value, 0);
  const weekTotal = users.reduce((a, { u }) => a + week(u), 0);
  return `
  <h2>Welcome back to the inn, ${esc(S.me.display_name)}</h2>
  <p class="lede">Three questions, every time you sit down by the fire: what is worth buying, who is handling it, and are we actually making gold?</p>
  ${setupNotices()}${statusLine()}
  <div class="hearth">
    <section class="panel">
      <h3>What is worth buying<small>Unclaimed deals with a credible resale price and buyers</small></h3>
      ${top.length ? top.map((d) => {
        const m = info(d.item_id);
        return `<div class="mini">${icon(m)}<div class="grow"><a href="#" class="iname q-${m.quality || 'COMMON'}" data-act="item" data-id="${d.item_id}">${esc(itemName(m))}</a>
          <div class="sub">Buy ${num(d.plan.qty)} up to ${money(d.plan.maxPrice)} each, list at ${money(d.plan.sellPrice)}</div></div>
          <div style="text-align:right">${money(d.profit, { sign: true, tone: true })}<div class="sub">${pct(d.roi)} ROI</div></div>
          <button class="btn small" data-act="claim" data-id="${d.item_id}" data-kind="${d.kind}">Claim</button></div>`;
      }).join('') : '<div class="empty">Nothing clears the bar right now. Fresh listings arrive every hour.</div>'}
      <div class="row" style="margin-top:12px"><a class="btn" href="#deals">Open the deal board</a></div>
    </section>
    <section class="panel">
      <h3>Who is handling it<small>Claims stop you both buying the same thing</small></h3>
      ${S.claims.length ? S.claims.map((c) => {
        const m = info(c.item_id); const mine = c.claimed_by === S.me.user_id;
        return `<div class="mini"><span class="dot" style="--c:${member(c.claimed_by).color}"></span>${icon(m)}<div class="grow">
          <a href="#" class="iname q-${m.quality || 'COMMON'}" data-act="item" data-id="${c.item_id}">${esc(itemName(m))}</a>
          <div class="sub">${esc(member(c.claimed_by).display_name)} · ${c.quantity ? `${num(c.quantity)} units` : ''}${c.max_price ? ` up to ${money(c.max_price)}` : ''} · ${hoursLeft(c.expires_at)}</div>
          ${c.note ? `<div class="sub"><i>${esc(c.note)}</i></div>` : ''}</div>
          ${mine ? `<button class="btn small" data-act="bought" data-id="${c.item_id}" data-claim="${c.id}">Bought</button><button class="btn ghost small" data-act="release" data-claim="${c.id}">Release</button>` : ''}</div>`;
      }).join('') : '<div class="empty">No open claims. Claim a deal before you head to the auctioneer.</div>'}
    </section>
    <section class="panel">
      <h3>Are we making gold<small>Realised profit after AH cut and lost deposits</small></h3>
      <div class="big-number">${money(weekTotal, { sign: true, tone: true })}</div><div class="muted">in the last 7 days</div>
      <div class="split">${users.map(({ m, u }) => `<div><span class="dot" style="--c:${m.color}"></span> ${esc(m.display_name)}<br>${money(week(u), { sign: true, tone: true })}</div>`).join('')}</div>
      ${weeklyChart(L)}
      <p class="muted" style="margin:8px 0 0">Stock on hand is worth about ${money(stock)} at today's prices.</p>
    </section>
  </div>`;
};

function invValue(u) {
  const s = set(); let value = 0, cost = 0;
  for (const it of Object.values(u.items || {})) {
    if (!it.qty) continue;
    const m = info(it.item_id); const ref = referencePrice(m) ?? m.cur_min;
    cost += it.cost;
    if (ref) value += it.qty * ref * (1 - s.ah_cut);
  }
  return { value, cost };
}

function weeklyChart(L) {
  const weeks = 8, W = 340, H = 120, now = Date.now();
  const start = (i) => now - (weeks - i) * 7 * 864e5;
  const series = S.members.map((m) => {
    const ev = L[m.user_id]?.events || [];
    return { m, vals: Array.from({ length: weeks }, (_, i) => ev.filter((e) => { const t = new Date(e.at); return t >= start(i) && t < start(i + 1); }).reduce((a, e) => a + e.delta, 0)) };
  });
  const all = series.flatMap((x) => x.vals);
  const max = Math.max(1, ...all.map(Math.abs));
  const hasNeg = all.some((v) => v < 0);
  const zero = hasNeg ? H / 2 : H - 16;
  const bw = (W - 20) / weeks;
  const n = series.length || 1;
  let bars = '';
  series.forEach(({ m, vals }, si) => vals.forEach((v, i) => {
    const h = (Math.abs(v) / max) * (hasNeg ? H / 2 - 10 : H - 26);
    const x = 10 + i * bw + 4 + si * ((bw - 8) / n);
    bars += `<rect x="${x.toFixed(1)}" y="${(v >= 0 ? zero - h : zero).toFixed(1)}" width="${((bw - 8) / n - 2).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2" fill="${m.color}" stroke="#3a2717" stroke-width=".6"><title>${esc(m.display_name)}: ${fmtMoney(v, { sign: true })}</title></rect>`;
  }));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly realised profit, last 8 weeks">
    <line x1="10" x2="${W - 10}" y1="${zero}" y2="${zero}" stroke="#9a805c" stroke-width="1"/>${bars}
    <text x="10" y="${H - 2}">8 weeks ago</text><text x="${W - 10}" y="${H - 2}" text-anchor="end">this week</text></svg>`;
}

// ---------- Deal board
VIEWS.deals = () => {
  const f = S.ui.deals;
  const classes = [...new Set(S.deals.map((d) => info(d.item_id).item_class).filter(Boolean))].sort();
  let rows = S.deals.filter((d) => {
    const m = info(d.item_id);
    if (f.q && !itemName(m).toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.verdict !== 'all' && d.verdict !== f.verdict) return false;
    if (f.kind !== 'all' && d.kind !== f.kind) return false;
    if (d.confidence < f.minConf) return false;
    if (f.cls !== 'all' && m.item_class !== f.cls) return false;
    if (f.hideClaimed && claimFor(d.item_id)) return false;
    return true;
  });
  const key = { score: (d) => d.profit * d.confidence, profit: (d) => d.profit, roi: (d) => d.roi, confidence: (d) => d.confidence }[f.sort];
  rows = rows.sort((a, b) => key(b) - key(a));
  const sortBtn = (k, label) => `<button class="sort" data-act="sort-deals" data-k="${k}" aria-pressed="${f.sort === k}">${label}</button>`;
  return `
  <div class="row"><h2>Deal board</h2><span class="spacer"></span><span class="muted">${rows.length} of ${S.deals.length} deals</span></div>
  <p class="lede">Each deal is a buy plan: which listings to take, the price you can realistically relist at after undercutting what's left, and whether the market buys that much within ${num(set().hold_days, 1)} days.</p>
  ${setupNotices()}${statusLine()}
  <div class="filters">
    <label class="f">Item<input type="search" data-filter="deals.q" value="${esc(f.q)}" placeholder="Search deals"></label>
    <label class="f">Verdict<select data-filter="deals.verdict">
      ${[['all', 'All'], ['buy', 'Buy'], ['consider', 'Consider'], ['wait', 'Wait — low confidence']].map(([v, l]) => `<option value="${v}" ${f.verdict === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Type<select data-filter="deals.kind">
      ${[['all', 'Flips and vendor'], ['flip', 'AH flips'], ['vendor', 'Vendor flips']].map(([v, l]) => `<option value="${v}" ${f.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Category<select data-filter="deals.cls"><option value="all">All</option>${classes.map((c) => `<option ${f.cls === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="f">Confidence at least ${f.minConf}<input type="range" min="0" max="90" step="5" value="${f.minConf}" data-filter="deals.minConf"></label>
    <label class="chk"><input type="checkbox" data-filter="deals.hideClaimed" ${f.hideClaimed ? 'checked' : ''}> Hide claimed</label>
  </div>
  ${rows.length ? `<div class="tablewrap"><table class="t">
    <thead><tr><th>Item</th><th>Verdict</th><th>Buy plan</th><th class="num">Cost</th><th class="num">List at</th><th class="num">${sortBtn('profit', 'Net profit')}</th><th class="num">${sortBtn('roi', 'ROI')}</th><th>${sortBtn('confidence', 'Confidence')}</th><th class="num">Sold/day</th><th></th></tr></thead>
    <tbody>${rows.map(dealRow).join('')}</tbody></table></div>`
    : `<div class="empty">${S.deals.length ? 'No deals match these filters.' : 'No deals yet. They appear after the scanner has a few hours of price history.'}</div>`}
  <p class="kbd" style="margin-top:14px">Net profit already subtracts the ${pct(set().ah_cut)} AH cut and expected deposits. Sort: ${sortBtn('score', 'best overall')}</p>`;
};

function dealRow(d) {
  const m = info(d.item_id); const p = d.plan; const c = claimFor(d.item_id);
  const mine = c && c.claimed_by === S.me.user_id;
  const watching = S.watch.some((w) => w.item_id === d.item_id);
  return `<tr class="${c ? 'claimed' : ''}">
    <td>${item(m, { sub: esc(m.item_class || '') })}${claimNote(c)}</td>
    <td>${seal(d.verdict, d.kind)}${d.verdict === 'wait' ? '<div class="faint" style="font-size:13px;margin-top:3px">High margin, low confidence</div>' : ''}</td>
    <td>Buy <b>${num(p.qty)}</b> from ${p.listings} listing${p.listings > 1 ? 's' : ''},<br>up to ${money(p.maxPrice)} each${tags(p.tags)}</td>
    <td class="num">${money(p.cost)}</td>
    <td class="num">${money(p.sellPrice)}<div class="faint" style="font-size:13px">${d.kind === 'vendor' ? 'to a vendor' : `typical ${fmtMoney(p.ref)}`}</div></td>
    <td class="num">${money(d.profit, { sign: true, tone: true })}</td>
    <td class="num">${pct(d.roi)}</td>
    <td>${conf(d.confidence)}</td>
    <td class="num">${p.soldPerDay == null ? '—' : num(p.soldPerDay, p.soldPerDay < 10 ? 1 : 0)}</td>
    <td style="white-space:nowrap">
      ${!c ? `<button class="btn small primary" data-act="claim" data-id="${d.item_id}" data-kind="${d.kind}">Claim</button>` : ''}
      ${!c || mine ? `<button class="btn small" data-act="bought" data-id="${d.item_id}" data-kind="${d.kind}" ${mine ? `data-claim="${c.id}"` : ''}>Bought</button>` : ''}
      ${mine ? `<button class="btn ghost small" data-act="release" data-claim="${c.id}">Release</button>` : ''}
      <button class="btn ghost small" data-act="watch" data-id="${d.item_id}" aria-pressed="${watching}">${watching ? 'Watching' : 'Watch'}</button>
    </td></tr>`;
}

// ---------- Crafting bench
VIEWS.crafting = () => {
  const f = S.ui.craft; const s = set();
  const profs = [...new Set(S.recipes.map((r) => r.profession))].sort();
  const quotes = S.recipes
    .filter((r) => (f.prof === 'all' || r.profession === f.prof) && (!f.verifiedOnly || r.verified) && (!f.q || r.name.toLowerCase().includes(f.q.toLowerCase())))
    .map((r) => ({ r, q: craftQuote(r, (id) => S.market.get(id), s) }));
  const key = { profit: (x) => x.q.profit ?? -1e15, margin: (x) => x.q.margin ?? -1e9, gain: (x) => x.q.conversionGain ?? -1e15 }[f.sort];
  quotes.sort((a, b) => key(b) - key(a));
  const sortBtn = (k, label) => `<button class="sort" data-act="sort-craft" data-k="${k}" aria-pressed="${f.sort === k}">${label}</button>`;
  return `
  <div class="row"><h2>Crafting bench</h2><span class="spacer"></span><button class="btn" data-act="recipe-new">Add a recipe</button></div>
  <p class="lede">Buy the ingredients, sell the product. Each recipe is priced from the live auction house; "vs. selling raw" shows what the conversion adds compared with selling the ingredients as they are.</p>
  <div class="filters">
    <label class="f">Recipe<input type="search" data-filter="craft.q" value="${esc(f.q)}" placeholder="Search recipes"></label>
    <label class="f">Profession<select data-filter="craft.prof"><option value="all">All</option>${profs.map((p) => `<option ${f.prof === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    <label class="chk"><input type="checkbox" data-filter="craft.verifiedOnly" ${f.verifiedOnly ? 'checked' : ''}> Only recipes checked in-game</label>
  </div>
  <div class="tablewrap"><table class="t">
    <thead><tr><th>Recipe</th><th class="num">Ingredients</th><th class="num">Product sells for</th><th class="num">${sortBtn('profit', 'Profit per craft')}</th><th class="num">${sortBtn('margin', 'Margin')}</th><th class="num">${sortBtn('gain', 'vs. selling raw')}</th><th class="num">Crafts/day the market takes</th><th>Verdict</th><th></th></tr></thead>
    <tbody>${quotes.map(({ r, q }) => craftRow(r, q)).join('') || '<tr><td colspan="9" class="empty">No recipes match.</td></tr>'}</tbody></table></div>
  <p class="kbd" style="margin-top:14px">Ingredient prices use the cheapest 10% of current listings; the product price is the lower of its 7/30-day typical floor and today's floor, minus the AH cut and deposit. Recipes marked "check in-game" were carried over from Classic.</p>`;
};

function craftRow(r, q) {
  const open = S.ui.craft.open === r.id;
  const pm = q.product || { name: r.product_name, item_id: r.product_item_id };
  const out = `<tr>
    <td>${r.product_item_id ? item({ ...pm, name: r.name }, { sub: `${esc(r.profession)}${r.yield > 1 ? ` · makes ${r.yield}` : ''}${r.verified ? '' : ' · check in-game'}` }) : `<b>${esc(r.name)}</b><br><span class="faint" style="font-size:14px">${esc(r.profession)} · product not seen on the AH yet</span>`}</td>
    <td class="num">${q.missing.length && !q.cost ? '—' : money(q.cost)}${q.missing.length ? `<div class="faint" style="font-size:13px">no price: ${esc(q.missing.slice(0, 2).join(', '))}${q.missing.length > 2 ? '…' : ''}</div>` : ''}</td>
    <td class="num">${money(q.revenue)}</td>
    <td class="num">${money(q.profit, { sign: true, tone: true })}</td>
    <td class="num">${pct(q.margin)}</td>
    <td class="num">${q.missing.length ? '—' : money(q.conversionGain, { sign: true, tone: true })}</td>
    <td class="num">${q.craftsPerDay == null ? '—' : num(q.craftsPerDay, q.craftsPerDay < 10 ? 1 : 0)}</td>
    <td>${q.profit != null && q.profit <= 0 ? '<span class="seal wait">Loses gold</span>' : seal(q.verdict)}</td>
    <td style="white-space:nowrap"><button class="btn small" data-act="craft-open" data-id="${r.id}" aria-expanded="${open}">${open ? 'Close' : 'Details'}</button></td></tr>`;
  return open ? out + `<tr class="expand"><td colspan="9">${craftDetail(r, q)}</td></tr>` : out;
}

function craftDetail(r, q) {
  const n = Math.max(1, Number(S.ui.craft.crafts) || 1); const s = set();
  let total = 0, short = [];
  const lines = q.reagents.map((g) => {
    const need = g.quantity * n;
    let cost = g.unit != null ? g.unit * need : null, note = g.from;
    if (g.source !== 'vendor' && g.item_id && S.ladders.has(g.item_id)) {
      const lc = ladderCost(S.ladders.get(g.item_id), need);
      cost = lc.cost + (lc.short && g.unit ? lc.short * g.unit : 0);
      note = lc.short ? `only ${num(need - lc.short)} listed` : `cheapest listings, up to ${fmtMoney(lc.maxPrice)}`;
      if (lc.short) short.push(g.item_name);
    }
    total += cost || 0;
    return `<tr><td>${num(need, 2)} ×</td><td>${g.item_id ? item({ ...info(g.item_id), item_id: g.item_id, name: info(g.item_id).name || g.item_name }) : esc(g.item_name)}</td>
      <td class="num">${money(g.unit)}</td><td class="num">${money(cost)}</td><td class="faint">${esc(g.source === 'vendor' ? 'vendor' : note || 'no price yet')}</td></tr>`;
  }).join('');
  const rev = q.revenue != null ? q.revenue * n : null;
  return `<div class="row" style="align-items:flex-end; margin-bottom:10px">
      <label class="f">Number of crafts<input type="number" min="1" value="${n}" data-filter="craft.crafts" style="width:110px"></label>
      <span class="muted">makes ${num(n * r.yield)} ${esc(r.product_name)}</span><span class="spacer"></span>
      <button class="btn primary" data-act="craft-log" data-id="${r.id}">Log this craft</button>
      <button class="btn" data-act="recipe-edit" data-id="${r.id}">Edit recipe</button>
      ${r.product_item_id ? `<button class="btn ghost" data-act="watch" data-id="${r.product_item_id}">Watch product</button>` : ''}
    </div>
    <table class="t" style="max-width:860px"><thead><tr><th>Need</th><th>Ingredient</th><th class="num">Unit price</th><th class="num">Cost for ${n}</th><th>Priced from</th></tr></thead><tbody>${lines}</tbody>
    <tfoot><tr><td></td><td><b>Total if you buy everything now</b></td><td></td><td class="num">${money(total)}</td><td></td></tr>
    <tr><td></td><td><b>Sale after AH cut and deposits</b></td><td></td><td class="num">${money(rev)}</td><td></td></tr>
    <tr><td></td><td><b>Profit for ${n} crafts</b></td><td></td><td class="num">${rev == null ? '—' : money(rev - total, { sign: true, tone: true })}</td><td></td></tr></tfoot></table>
    ${short.length ? `<p class="notice" style="margin-top:12px">Not enough listed right now for ${esc(short.join(', '))} — the rest is priced at today's typical price.</p>` : ''}
    ${q.craftsPerDay != null && n > q.craftsPerDay * s.hold_days ? `<p class="notice">The market only takes about ${num(q.craftsPerDay * s.hold_days, 1)} crafts' worth in ${num(s.hold_days)} days. Selling ${n} may push the price down.</p>` : ''}
    ${r.notes ? `<p class="muted">${esc(r.notes)}</p>` : ''}`;
}

// ---------- Watchlist
VIEWS.watchlist = () => {
  const s = set();
  const rows = S.watch.map((w) => ({ w, m: info(w.item_id) }));
  return `
  <div class="row"><h2>Watchlist</h2><span class="spacer"></span><a class="btn" href="#market">Find items to watch</a></div>
  <p class="lede">Items either of you is keeping an eye on, with your own buy and sell targets. Rows light up when today's price crosses a target.</p>
  ${rows.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Item</th><th class="num">Floor now</th><th class="num">Typical (7 days)</th><th class="num">Listed</th><th class="num">Buy below</th><th class="num">Sell above</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>
  ${rows.map(({ w, m }) => {
    const floor = m.cur_min; const buyHit = w.target_buy && floor && floor <= w.target_buy; const sellHit = w.target_sell && floor && floor >= w.target_sell;
    return `<tr style="${buyHit ? 'background:rgba(79,125,34,.13)' : sellHit ? 'background:rgba(242,196,90,.25)' : ''}">
      <td>${item(m, { sub: `added by ${esc(member(w.added_by).display_name)}` })}${claimNote(claimFor(w.item_id))}</td>
      <td class="num">${money(floor)}</td><td class="num">${money(m.med7_min)}</td><td class="num">${num(m.cur_qty)}</td>
      <td class="num">${money(w.target_buy)}</td><td class="num">${money(w.target_sell)}</td>
      <td>${buyHit ? '<span class="seal buy">Below your buy target</span>' : sellHit ? '<span class="seal consider">Time to sell</span>' : '<span class="faint">Waiting</span>'}</td>
      <td>${esc(w.note || '')}</td>
      <td style="white-space:nowrap"><button class="btn small" data-act="watch-edit" data-id="${w.item_id}">Edit</button><button class="btn ghost small" data-act="watch-remove" data-id="${w.item_id}">Remove</button></td></tr>`;
  }).join('')}</tbody></table></div>` : '<div class="empty">Nothing on the watchlist. Open any item and choose Watch.</div>'}`;
};

// ---------- Ledger
VIEWS.ledger = () => {
  const s = set(); const L = ledger(S.tx); const f = S.ui.ledger;
  const cards = S.members.map((m) => {
    const u = L[m.user_id] || { realized: 0, spent: 0, earned: 0, fees: 0, items: {} };
    const iv = invValue(u);
    return `<div class="mcard" style="--c:${m.color}"><b><span class="dot" style="--c:${m.color}"></span> ${esc(m.display_name)}</b>
      <div class="big-number" style="font-size:30px">${money(u.realized, { sign: true, tone: true })}</div><span class="muted">realised profit</span>
      <dl><dt>Bought</dt><dd>${money(u.spent)}</dd><dt>Sold</dt><dd>${money(u.earned)}</dd><dt>AH cut and deposits</dt><dd>${money(u.fees)}</dd><dt>Stock (cost)</dt><dd>${money(iv.cost)}</dd><dt>Stock (worth now)</dt><dd>${money(iv.value)}</dd></dl></div>`;
  }).join('');
  const tot = Object.values(L).reduce((a, u) => a + u.realized, 0);
  const totStock = Object.values(L).reduce((a, u) => { const v = invValue(u); return { v: a.v + v.value, c: a.c + v.cost }; }, { v: 0, c: 0 });
  const inv = [];
  for (const m of S.members) for (const it of Object.values(L[m.user_id]?.items || {})) if (it.qty > 0) inv.push({ m, it });
  const tx = S.tx.filter((t) => f.who === 'all' || t.user_id === f.who).slice(0, 200);
  const KIND = { buy: 'Bought', sell: 'Sold', craft_use: 'Used in craft', craft_make: 'Crafted', fee: 'Fee', adjust: 'Adjusted' };
  return `
  <div class="row"><h2>Ledger</h2><span class="spacer"></span>
    <button class="btn primary" data-act="tx-new" data-kind="buy">Log a purchase</button>
    <button class="btn primary" data-act="tx-new" data-kind="sell">Log a sale</button>
    <button class="btn" data-act="tx-new" data-kind="fee">Log lost deposits</button></div>
  <p class="lede">Every purchase, craft and sale, so you know what each of you has made. Profit uses the average cost of what you sold.</p>
  <div class="members">${cards}
    <div class="mcard total wood"><b>Together</b><div class="big-number" style="font-size:30px">${money(tot, { sign: true, tone: true })}</div><span>realised profit</span>
      <dl><dt>Stock at cost</dt><dd>${money(totStock.c)}</dd><dt>Stock worth now</dt><dd>${money(totStock.v)}</dd><dt>Unrealised</dt><dd>${money(totStock.v - totStock.c, { sign: true, tone: true })}</dd></dl></div></div>
  <h3>Stock on hand</h3>
  ${inv.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Item</th><th>Held by</th><th class="num">Quantity</th><th class="num">Average cost</th><th class="num">Worth now each</th><th class="num">Unrealised</th><th></th></tr></thead><tbody>
    ${inv.map(({ m, it }) => {
      const mi = info(it.item_id); const ref = referencePrice(mi) ?? mi.cur_min; const net = ref ? ref * (1 - s.ah_cut) : null;
      return `<tr><td>${item({ ...mi, item_id: it.item_id, name: mi.name || it.item_name })}</td><td><span class="dot" style="--c:${m.color}"></span> ${esc(m.display_name)}</td>
        <td class="num">${num(it.qty, 2)}</td><td class="num">${money(it.cost / it.qty)}</td><td class="num">${money(net)}</td>
        <td class="num">${net == null ? '—' : money(net * it.qty - it.cost, { sign: true, tone: true })}</td>
        <td>${m.user_id === S.me.user_id ? `<button class="btn small" data-act="tx-new" data-kind="sell" data-id="${it.item_id}" data-name="${esc(it.item_name || '')}">Sold some</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">No stock. Log a purchase to start tracking.</div>'}
  <hr class="rule">
  <div class="row"><h3 style="margin:0">History</h3><span class="spacer"></span>
    <label class="f" style="flex-direction:row;align-items:center">Show <select data-filter="ledger.who"><option value="all">Both of you</option>${S.members.map((m) => `<option value="${m.user_id}" ${f.who === m.user_id ? 'selected' : ''}>${esc(m.display_name)}</option>`).join('')}</select></label></div>
  ${tx.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Item</th><th class="num">Quantity</th><th class="num">Price each</th><th class="num">Fees</th><th>Note</th><th></th></tr></thead><tbody>
    ${tx.map((t) => `<tr><td>${shortDate(t.occurred_at)}</td><td><span class="dot" style="--c:${member(t.user_id).color}"></span> ${esc(member(t.user_id).display_name)}</td><td>${KIND[t.kind] || t.kind}</td>
      <td>${t.item_id ? item({ ...info(t.item_id), item_id: t.item_id, name: info(t.item_id).name || t.item_name }) : esc(t.item_name || '')}</td>
      <td class="num">${t.kind === 'fee' ? '' : num(t.quantity, 2)}</td><td class="num">${t.kind === 'fee' || t.kind === 'craft_use' ? '' : money(t.unit_price)}</td><td class="num">${t.fee ? money(t.fee) : ''}</td><td>${esc(t.note || '')}</td>
      <td><button class="btn ghost small" data-act="tx-delete" data-id="${t.id}" data-batch="${t.batch_id || ''}" aria-label="Delete entry">Delete</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Nothing logged yet.</div>'}`;
};

// ---------- Market
VIEWS.market = () => {
  const f = S.ui.market;
  if (f.results == null) { f.results = []; runSearch(''); }
  return `
  <h2>Market</h2>
  <p class="lede">Look up any item on the EU PvP Alliance auction house: price history, today's listings and how fast it sells.</p>
  ${statusLine()}
  <div class="filters"><label class="f" style="flex:1">Item name or ID<input type="search" id="msearch" value="${esc(f.q)}" placeholder="Try Runecloth, Black Lotus, Thorium…" autocomplete="off"></label></div>
  <div id="mresults">${marketTable(f.results)}</div>`;
};
function marketTable(list) {
  if (!list.length) return `<div class="empty">${S.ui.market.q ? 'No items by that name have been seen on the auction house.' : 'Searching…'}</div>`;
  return `<div class="tablewrap"><table class="t"><thead><tr><th>Item</th><th class="num">Floor now</th><th class="num">Typical (7 days)</th><th class="num">Typical (30 days)</th><th class="num">Listed</th><th class="num">Sold/day</th><th class="num">Swing</th><th></th></tr></thead><tbody>
  ${list.map((m) => `<tr><td>${item(m, { sub: esc(m.item_class || '') })}</td><td class="num">${money(m.cur_min)}</td><td class="num">${money(m.med7_min)}</td><td class="num">${money(m.med30_min)}</td>
    <td class="num">${num(m.cur_qty)}</td><td class="num">${m.sold_per_day7 == null ? '—' : num(m.sold_per_day7, m.sold_per_day7 < 10 ? 1 : 0)}</td><td class="num">${pct(m.volatility7)}</td>
    <td><button class="btn small" data-act="item" data-id="${m.item_id}">Open</button></td></tr>`).join('')}</tbody></table></div>`;
}
const runSearch = debounce(async (q) => {
  S.ui.market.q = q;
  const res = await S.api.search(q.trim());
  for (const r of res) S.market.set(r.item_id, r);
  S.ui.market.results = res;
  const box = $('#mresults'); if (box) box.innerHTML = marketTable(res);
}, 250);

// ---------------------------------------------------------------- charts
function lineChart(series, { w = 760, h = 220, xLabels = [] } = {}) {
  const pts = series.flatMap((s) => s.data.filter((v) => v != null));
  if (pts.length < 2) return '<div class="empty">Not enough history yet.</div>';
  let lo = Math.min(...pts), hi = Math.max(...pts); if (lo === hi) { lo *= 0.9; hi *= 1.1; }
  const pad = (hi - lo) * 0.08; lo = Math.max(0, lo - pad); hi += pad;
  const L = 70, R = 10, T = 10, B = 24, n = Math.max(...series.map((s) => s.data.length));
  const X = (i) => L + (i / Math.max(1, n - 1)) * (w - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const paths = series.map((s) => {
    let d = ''; s.data.forEach((v, i) => { if (v == null) return; d += `${d ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; });
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="4 4"' : ''}/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))}">
    ${ticks.map((t) => `<line x1="${L}" x2="${w - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="rgba(110,84,52,.22)"/><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(fmtMoney(t, { short: true }))}</text>`).join('')}
    ${paths}${xLabels.map(([i, t]) => `<text x="${X(i)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i >= n - 1 ? 'end' : 'middle'}">${esc(t)}</text>`).join('')}</svg>`;
}

// ---------------------------------------------------------------- modals
const dlg = () => $('#dlg');
function openModal(html, onSubmit) {
  const d = dlg();
  d.innerHTML = `<form class="modal" method="dialog" novalidate>${html}</form>`;
  const form = d.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') return d.close();
    const err = form.querySelector('.formerr'); if (err) err.textContent = '';
    try {
      const btn = e.submitter; if (btn) btn.disabled = true;
      const keep = await onSubmit?.(new FormData(form), form, e.submitter?.value);
      if (keep !== true) d.close();
      if (btn) btn.disabled = false;
    } catch (ex) {
      if (e.submitter) e.submitter.disabled = false;
      (form.querySelector('.formerr') || form.appendChild(Object.assign(document.createElement('div'), { className: 'formerr' }))).textContent = ex.message;
    }
  });
  if (!d.open) d.showModal();
  form.querySelector('[autofocus]') ? form.querySelector('[autofocus]').focus({ preventScroll: true })
    : form.querySelector('input:not([type=hidden]),select')?.focus({ preventScroll: true });
  form.scrollTop = 0;
  return form;
}
const cancelBtn = '<button class="btn ghost" value="cancel" formnovalidate>Cancel</button>';
const field = (label, name, value = '', attrs = '') => `<label class="f">${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const moneyField = (label, name, c) => field(label, name, c != null ? fmtMoney(c).replace(/ /g, ' ') : '', 'type="text" inputmode="decimal" placeholder="e.g. 2g 50s"');
function needMoney(v, label) { const c = parseMoney(v); if (c == null) throw new Error(`Enter ${label} like 2g 50s, 75s or 1.5 (gold).`); return c; }

// item picker backed by search
const pickCache = new Map();
function pickerField(label, name, value = '') {
  return `<label class="f">${label}<input name="${name}" list="dl-${name}" value="${esc(value)}" data-picker="${name}" autocomplete="off" required placeholder="Start typing an item name"><datalist id="dl-${name}"></datalist></label>`;
}
async function resolvePicked(nameValue) {
  const v = String(nameValue || '').trim(); if (!v) throw new Error('Choose an item.');
  if (pickCache.has(v.toLowerCase())) return pickCache.get(v.toLowerCase());
  const res = await S.api.search(v);
  const hit = res.find((r) => (r.name || '').toLowerCase() === v.toLowerCase()) || (res.length === 1 ? res[0] : null);
  if (hit) { S.market.set(hit.item_id, hit); return hit; }
  return { item_id: null, name: v };
}
document.addEventListener('input', debounce(async (e) => {
  const inp = e.target.closest?.('[data-picker]'); if (!inp) return;
  const res = await S.api.search(inp.value.trim());
  const dl = document.getElementById(inp.getAttribute('list'));
  if (dl) dl.innerHTML = res.filter((r) => r.name).slice(0, 30).map((r) => { pickCache.set(r.name.toLowerCase(), r); return `<option value="${esc(r.name)}">`; }).join('');
}, 200));

async function itemModal(id) {
  await ensureMarket([id]);
  const m = info(id); const s = set();
  const [hist, ladder] = await Promise.all([S.api.history(id), S.api.ladder(id)]);
  S.ladders.set(id, ladder);
  const plan = planFlip(ladder, m, m, s);
  const w = S.watch.find((x) => x.item_id === id);
  const h = hist.hourly;
  const xl = h.length ? [[0, shortDate(h[0].ts)], [Math.floor(h.length / 2), shortDate(h[Math.floor(h.length / 2)].ts)], [h.length - 1, 'now']] : [];
  const dl = hist.daily;
  const dxl = dl.length ? [[0, shortDate(dl[0].day)], [dl.length - 1, shortDate(dl[dl.length - 1].day)]] : [];
  let cum = 0, cumCost = 0;
  const ladderRows = ladder.slice(0, 40).map((l) => {
    cum += l.quantity; cumCost += l.quantity * l.unit_price;
    return `<tr><td class="num">${money(l.unit_price)}</td><td class="num">${num(l.quantity)}</td><td class="num">${num(cum)}</td><td class="num">${money(cumCost)}</td><td class="faint">${esc((l.time_left || '').replace('_', ' ').toLowerCase())}</td></tr>`;
  }).join('');
  openModal(`
    <header>${icon(m, true)}<div style="flex:1"><h2 class="q-${m.quality || 'COMMON'}" style="color:inherit">${esc(itemName(m))}</h2>
      <div class="muted">${esc([m.item_class, m.item_subclass].filter(Boolean).join(' / '))}${m.sell_price ? ` · vendor buys for ${fmtMoney(m.sell_price)}` : ''} ·
      <a href="https://www.wowhead.com/classic/search?q=${encodeURIComponent(itemName(m))}" target="_blank" rel="noopener">Wowhead</a></div></div>
      <button class="btn ghost" value="cancel" formnovalidate aria-label="Close" autofocus>Close</button></header>
    ${claimNote(claimFor(id))}
    <div class="split" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div>Floor now<br>${money(m.cur_min)}</div><div>Typical, 7 days<br>${money(m.med7_min)}</div><div>Typical, 30 days<br>${money(m.med30_min)}</div>
      <div>Listed now<br><b>${num(m.cur_qty)}</b> in ${num(m.cur_auctions)}</div><div>Sold per day<br><b>${m.sold_per_day7 == null ? '—' : num(m.sold_per_day7, 1)}</b></div>
    </div>
    ${plan ? `<div class="panel" style="margin:6px 0 14px">${seal(plan.verdict)} <b>Buy ${num(plan.qty)}</b> (${plan.listings} listing${plan.listings > 1 ? 's' : ''}) up to ${money(plan.maxPrice)}, cost ${money(plan.cost)}. List at ${money(plan.sellPrice)} → net ${money(plan.profit, { sign: true, tone: true })} (${pct(plan.roi)}). Confidence ${plan.confidence}.${tags(plan.tags)}</div>` : '<p class="muted">No profitable flip in today\'s listings.</p>'}
    <h3>Last 3 days, hourly</h3><div class="legend"><span><i style="--lc:#8b5d1c"></i>Floor price</span><span><i style="--lc:#4f7d22"></i>Cheapest 10% of units</span></div>
    ${lineChart([{ name: 'Floor', color: '#8b5d1c', data: h.map((x) => x.min_price) }, { name: 'Cheapest 10%', color: '#4f7d22', data: h.map((x) => x.p10_price), width: 1.5 }], { xLabels: xl })}
    <h3 style="margin-top:14px">Last 30 days</h3>
    ${lineChart([{ name: 'Daily floor', color: '#8b5d1c', data: dl.map((x) => x.min_price) }], { h: 160, xLabels: dxl })}
    <h3 style="margin-top:14px">Listings right now</h3>
    ${ladder.length ? `<div class="tablewrap" style="max-height:300px;overflow:auto"><table class="t"><thead><tr><th class="num">Price each</th><th class="num">Quantity</th><th class="num">Running total</th><th class="num">Cost to buy up to here</th><th>Time left</th></tr></thead><tbody>${ladderRows}</tbody></table></div>` : '<div class="empty">Nothing listed.</div>'}
    <h3 style="margin-top:18px">Watch targets</h3>
    <div class="grid">${moneyField('Tell us when it drops below', 'target_buy', w?.target_buy)}${moneyField('Tell us when it rises above', 'target_sell', w?.target_sell)}${field('Note', 'note', w?.note || '')}</div>
    <footer>${w ? '<button class="btn ghost" value="unwatch">Stop watching</button>' : ''}<button class="btn" value="claim">Claim</button><button class="btn primary" value="watch">${w ? 'Save targets' : 'Add to watchlist'}</button></footer>`,
  async (fd, form, action) => {
    if (action === 'unwatch') { await S.api.watchRemove(id); toast('Removed from the watchlist'); return reload('watch'); }
    if (action === 'claim') { setTimeout(() => claimModal(id, plan), 0); return; }
    await S.api.watchSet(id, { target_buy: parseMoney(fd.get('target_buy')), target_sell: parseMoney(fd.get('target_sell')), note: fd.get('note') || null });
    toast(w ? 'Targets saved' : 'Added to the watchlist'); await reload('watch');
  });
}

function claimModal(id, plan) {
  const m = info(id); const s = set();
  openModal(`<header><h2 style="flex:1">Claim ${esc(itemName(m))}</h2></header>
    <p class="muted">Your brother will see this on the board, so you don't both buy the same listings.</p>
    <div class="grid">${field('Units', 'quantity', plan?.qty ?? '', 'type="number" min="1"')}${moneyField('Pay at most (each)', 'max_price', plan?.maxPrice)}
    ${field('Hold the claim for (hours)', 'hours', s.claim_hours, 'type="number" min="1" max="72"')}${field('Note', 'note', '', 'placeholder="Optional"')}</div>
    <footer>${cancelBtn}<button class="btn primary" value="ok">Claim</button></footer>`,
  async (fd) => {
    if (claimFor(id)) throw new Error('Someone claimed this a moment ago.');
    const hours = Math.max(1, Number(fd.get('hours')) || s.claim_hours);
    await S.api.claim({ item_id: id, claimed_by: S.me.user_id, quantity: Number(fd.get('quantity')) || null, max_price: parseMoney(fd.get('max_price')), note: fd.get('note') || null, expires_at: new Date(Date.now() + hours * 36e5).toISOString() });
    toast(`Claimed ${itemName(m)}`); await reload('claims');
  });
}

function txModal(kind, pre = {}) {
  const s = set(); const m = pre.item_id ? info(pre.item_id) : null;
  const title = { buy: 'Log a purchase', sell: 'Log a sale', fee: 'Log lost deposits' }[kind];
  const itemInput = m ? `<input type="hidden" name="item" value="${esc(itemName(m))}"><div style="margin-bottom:12px">${item(m)}</div>` : pickerField('Item', 'item', pre.item_name || '');
  openModal(`<header><h2 style="flex:1">${title}</h2></header>${itemInput}
    <div class="grid">
      ${kind !== 'fee' ? field('Quantity', 'quantity', pre.quantity ?? '', 'type="number" min="0.01" step="any" required') : ''}
      ${kind !== 'fee' ? moneyField(kind === 'buy' ? 'Price paid each' : 'Sold for each', 'unit_price', pre.unit_price) : ''}
      ${kind === 'sell' ? moneyField(`AH cut (leave blank for ${pct(s.ah_cut)})`, 'fee', null) : ''}
      ${kind === 'fee' ? moneyField('Deposits lost', 'fee', null) : ''}
      ${field('Date', 'date', new Date().toISOString().slice(0, 10), 'type="date"')}
      ${field('Note', 'note', '', 'placeholder="Optional"')}
    </div><div class="formerr" role="alert"></div>
    <footer>${cancelBtn}<button class="btn primary" value="ok">Save</button></footer>`,
  async (fd) => {
    const it = m || (await resolvePicked(fd.get('item')));
    const q = kind === 'fee' ? 0 : Number(fd.get('quantity'));
    if (kind !== 'fee' && !(q > 0)) throw new Error('Enter how many.');
    const price = kind === 'fee' ? 0 : needMoney(fd.get('unit_price'), 'the price');
    let fee = 0;
    if (kind === 'sell') fee = parseMoney(fd.get('fee')) ?? Math.round(q * price * s.ah_cut);
    if (kind === 'fee') fee = needMoney(fd.get('fee'), 'the deposits');
    const d = fd.get('date'); const when = d && d !== new Date().toISOString().slice(0, 10) ? new Date(d + 'T12:00:00').toISOString() : new Date().toISOString();
    await S.api.addTransactions([{ user_id: S.me.user_id, kind, item_id: it.item_id, item_name: itemName(it), quantity: q, unit_price: price, fee, note: fd.get('note') || null, occurred_at: when }]);
    if (pre.claim) await S.api.setClaim(pre.claim, 'bought');
    toast({ buy: 'Purchase logged', sell: 'Sale logged', fee: 'Fee logged' }[kind]); await reload('transactions', 'claims');
  });
}

async function craftLogModal(rid) {
  const r = S.recipes.find((x) => x.id === rid); const s = set();
  const q = craftQuote(r, (id) => S.market.get(id), s);
  const mine = ledger(S.tx)[S.me.user_id]?.items || {};
  const n0 = Math.max(1, Number(S.ui.craft.crafts) || 1);
  const rows = (n) => q.reagents.map((g, i) => {
    const need = g.quantity * n; const have = g.item_id ? mine[g.item_id]?.qty || 0 : 0;
    const fromStock = Math.min(need, have);
    return `<tr><td>${esc(g.item_name)}</td><td class="num">${num(need, 2)}</td><td class="num">${num(have, 2)}</td><td class="num">${num(fromStock, 2)}</td>
      <td class="num">${num(need - fromStock, 2)}</td><td><input name="price${i}" value="${g.unit != null ? esc(fmtMoney(g.unit)) : ''}" style="width:110px" placeholder="price each"></td></tr>`;
  }).join('');
  const form = openModal(`<header><h2 style="flex:1">Log a craft: ${esc(r.name)}</h2></header>
    <p class="muted">Ingredients come out of your stock first, at what you paid. Anything you don't have in the ledger is recorded as bought at the price you enter.</p>
    <div class="grid">${field('Number of crafts', 'crafts', n0, 'type="number" min="1" required data-crafts')}${field('Made', 'made', n0 * r.yield, 'type="number" min="0" step="any"')}</div>
    <div class="tablewrap" style="margin-top:12px"><table class="t"><thead><tr><th>Ingredient</th><th class="num">Need</th><th class="num">In your stock</th><th class="num">From stock</th><th class="num">Bought now</th><th>Price each</th></tr></thead><tbody id="craftrows">${rows(n0)}</tbody></table></div>
    <div class="formerr" role="alert"></div><footer>${cancelBtn}<button class="btn primary" value="ok">Log craft</button></footer>`,
  async (fd) => {
    const n = Math.max(1, Number(fd.get('crafts')) || 1); const made = Number(fd.get('made')) || n * r.yield;
    if (!r.product_item_id) throw new Error('The product hasn\'t been matched to an item yet. It is matched once it appears on the AH.');
    const batch = crypto.randomUUID?.() || String(Date.now()); const now = new Date().toISOString();
    const out = []; let total = 0;
    q.reagents.forEach((g, i) => {
      const need = g.quantity * n; const it = g.item_id ? mine[g.item_id] : null;
      const have = it?.qty || 0; const fromStock = Math.min(need, have); const buy = need - fromStock;
      const avg = have ? it.cost / have : 0;
      const price = parseMoney(fd.get(`price${i}`));
      if (buy > 0 && price == null) throw new Error(`Enter a price for ${g.item_name}.`);
      if (buy > 0) out.push({ user_id: S.me.user_id, kind: 'buy', item_id: g.item_id, item_name: g.item_name, quantity: buy, unit_price: price, batch_id: batch, note: `For ${r.name}`, occurred_at: now });
      out.push({ user_id: S.me.user_id, kind: 'craft_use', item_id: g.item_id, item_name: g.item_name, quantity: need, unit_price: 0, batch_id: batch, occurred_at: now });
      total += fromStock * avg + buy * (price || 0);
    });
    out.push({ user_id: S.me.user_id, kind: 'craft_make', item_id: r.product_item_id, item_name: r.product_name, quantity: made, unit_price: Math.round(total / Math.max(1, made)), batch_id: batch, note: `${n} × ${r.name}`, occurred_at: now });
    await S.api.addTransactions(out);
    toast(`Logged ${made} ${r.product_name} at ${fmtMoney(total / Math.max(1, made))} each`); await reload('transactions');
  });
  form.querySelector('[data-crafts]').addEventListener('input', (e) => {
    const n = Math.max(1, Number(e.target.value) || 1);
    form.querySelector('#craftrows').innerHTML = rows(n); form.elements.made.value = n * r.yield;
  });
}

function recipeModal(rid) {
  const r = rid ? S.recipes.find((x) => x.id === rid) : { name: '', profession: 'Alchemy', product_name: '', yield: 1, verified: true, notes: '', reagents: [{ item_name: '', quantity: 1, source: 'ah' }] };
  const reagentRow = (g, i) => `<tr data-rg><td><input name="rg_name" list="dl-rg" data-picker="rg" value="${esc(g.item_name)}" placeholder="Ingredient" style="width:100%" autocomplete="off"></td>
    <td><input name="rg_qty" type="number" min="0.01" step="any" value="${g.quantity}" style="width:80px"></td>
    <td><select name="rg_src"><option value="ah" ${g.source !== 'vendor' ? 'selected' : ''}>Auction house</option><option value="vendor" ${g.source === 'vendor' ? 'selected' : ''}>Vendor</option></select></td>
    <td><input name="rg_vp" value="${g.vendor_price != null ? esc(fmtMoney(g.vendor_price)) : ''}" placeholder="vendor price" style="width:110px"></td>
    <td><button type="button" class="btn ghost small" data-act="rg-remove" aria-label="Remove ingredient">Remove</button></td></tr>`;
  const form = openModal(`<header><h2 style="flex:1">${rid ? 'Edit recipe' : 'Add a recipe'}</h2></header>
    <div class="grid">${field('Recipe name', 'name', r.name, 'required')}${field('Profession', 'profession', r.profession, 'required list="dl-prof"')}
      ${pickerField('Product (as named on the AH)', 'product', r.product_name)}${field('Makes', 'yield', r.yield, 'type="number" min="0.01" step="any"')}</div>
    <datalist id="dl-prof">${['Alchemy', 'Blacksmithing', 'Cooking', 'Enchanting', 'Engineering', 'First Aid', 'Leatherworking', 'Mining', 'Tailoring'].map((p) => `<option value="${p}">`).join('')}</datalist>
    <h3 style="margin-top:16px">Ingredients</h3><datalist id="dl-rg"></datalist>
    <table class="t"><tbody id="rgrows">${r.reagents.map(reagentRow).join('')}</tbody></table>
    <button type="button" class="btn small" id="rgadd" style="margin-top:8px">Add ingredient</button>
    <div class="grid" style="margin-top:14px">${field('Notes', 'notes', r.notes || '')}<label class="chk"><input type="checkbox" name="verified" ${r.verified ? 'checked' : ''}> Checked against the in-game recipe</label></div>
    <div class="formerr" role="alert"></div>
    <footer>${rid ? '<button class="btn ghost" value="delete" formnovalidate>Delete recipe</button>' : ''}${cancelBtn}<button class="btn primary" value="ok">Save recipe</button></footer>`,
  async (fd, f, action) => {
    if (action === 'delete') { await S.api.deleteRecipe(rid); toast('Recipe deleted'); return reload('recipes'); }
    const reagents = $$('[data-rg]', f).map((tr) => ({
      item_name: tr.querySelector('[name=rg_name]').value.trim(), quantity: Number(tr.querySelector('[name=rg_qty]').value),
      source: tr.querySelector('[name=rg_src]').value, vendor_price: parseMoney(tr.querySelector('[name=rg_vp]').value),
    })).filter((g) => g.item_name);
    if (!reagents.length) throw new Error('Add at least one ingredient.');
    if (reagents.some((g) => !(g.quantity > 0))) throw new Error('Every ingredient needs a quantity.');
    if (reagents.some((g) => g.source === 'vendor' && g.vendor_price == null)) throw new Error('Vendor ingredients need a vendor price.');
    for (const g of reagents) { const hit = pickCache.get(g.item_name.toLowerCase()); g.item_id = hit?.item_id || null; }
    const prod = await resolvePicked(fd.get('product'));
    await S.api.saveRecipe({ id: rid || undefined, name: fd.get('name'), profession: fd.get('profession'), product_name: itemName(prod), product_item_id: prod.item_id,
      yield: Number(fd.get('yield')) || 1, verified: !!fd.get('verified'), notes: fd.get('notes') || null, reagents });
    toast('Recipe saved'); await reload('recipes');
  });
  form.querySelector('#rgadd').addEventListener('click', () => form.querySelector('#rgrows').insertAdjacentHTML('beforeend', reagentRow({ item_name: '', quantity: 1, source: 'ah' })));
  form.addEventListener('click', (e) => { if (e.target.closest('[data-act=rg-remove]')) e.target.closest('tr').remove(); });
}

function settingsModal() {
  const s = { ...set(), ...S.settings };
  openModal(`<header><h2 style="flex:1">Settings</h2></header>
    <h3>You</h3><div class="grid">${field('Your name', 'display_name', S.me.display_name, 'required')}${field('Your colour', 'color', S.me.color, 'type="color"')}</div>
    <h3 style="margin-top:16px">Auction house</h3>
    <div class="grid">${field('House ID', 'house_id', S.settings.house_id ?? '', 'type="number"')}${field('House name', 'house_name', S.settings.house_name || '')}</div>
    <h3 style="margin-top:16px">Trading rules (shared by both of you)</h3>
    <div class="grid">
      ${field('AH cut (%)', 'ah_cut', s.ah_cut * 100, 'type="number" step="0.1" min="0" max="50"')}
      ${field('Deposit, % of vendor price', 'deposit_pct', s.deposit_pct * 100, 'type="number" step="0.5" min="0"')}
      ${field('Times you post before it sells', 'relists', s.relists, 'type="number" step="0.1" min="1"')}
      ${field('Undercut (%)', 'undercut', s.undercut * 100, 'type="number" step="0.5" min="0"')}
      ${field('Hold stock for at most (days)', 'hold_days', s.hold_days, 'type="number" step="0.5" min="0.5"')}
      ${moneyField('Minimum profit per deal', 'min_profit', s.min_profit)}
      ${field('Minimum ROI (%)', 'min_roi', s.min_roi * 100, 'type="number" step="1" min="0"')}
      ${field('Claims last (hours)', 'claim_hours', s.claim_hours, 'type="number" min="1" max="72"')}
    </div>
    <p class="kbd">Deal lists are recalculated by the scanner every hour with these rules.</p>
    <div class="formerr" role="alert"></div><footer>${cancelBtn}<button class="btn primary" value="ok">Save settings</button></footer>`,
  async (fd) => {
    const n = (k, div = 1) => Number(fd.get(k)) / div;
    await S.api.updateMe(S.me.user_id, { display_name: fd.get('display_name') || S.me.display_name, color: fd.get('color') || S.me.color });
    await S.api.saveSettings({
      house_id: fd.get('house_id') ? Number(fd.get('house_id')) : null, house_name: fd.get('house_name') || null,
      ah_cut: n('ah_cut', 100), deposit_pct: n('deposit_pct', 100), relists: n('relists'), undercut: n('undercut', 100), hold_days: n('hold_days'),
      min_profit: needMoney(fd.get('min_profit'), 'the minimum profit'), min_roi: n('min_roi', 100), claim_hours: n('claim_hours'),
    });
    toast('Settings saved'); await loadAll(); render();
  });
}

// ---------------------------------------------------------------- events
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act; const id = Number(el.dataset.id) || null;
  const deal = (iid, kind) => S.deals.find((d) => d.item_id === iid && (!kind || d.kind === kind));
  try {
    switch (act) {
      case 'item': e.preventDefault(); if (dlg().open) dlg().close(); await itemModal(id); break;
      case 'claim': claimModal(id, deal(id, el.dataset.kind)?.plan); break;
      case 'bought': { const d = deal(id, el.dataset.kind); const c = claimFor(id); txModal('buy', { item_id: id, quantity: c?.quantity ?? d?.plan.qty, unit_price: d?.plan.avgPrice ?? c?.max_price, claim: el.dataset.claim || null }); break; }
      case 'release': await S.api.setClaim(el.dataset.claim, 'released'); toast('Claim released'); await reload('claims'); break;
      case 'watch': {
        if (S.watch.some((w) => w.item_id === id)) { await itemModal(id); break; }
        await S.api.watchSet(id, { target_buy: null, target_sell: null, note: null }); toast(`Watching ${itemName(info(id))}`); await reload('watch'); break;
      }
      case 'watch-edit': await itemModal(id); break;
      case 'watch-remove': await S.api.watchRemove(id); toast('Removed from the watchlist'); await reload('watch'); break;
      case 'sort-deals': S.ui.deals.sort = el.dataset.k; renderMain(); break;
      case 'sort-craft': S.ui.craft.sort = el.dataset.k; renderMain(); break;
      case 'craft-open': {
        const rid = Number(el.dataset.id); S.ui.craft.open = S.ui.craft.open === rid ? null : rid; renderMain();
        if (S.ui.craft.open) {
          const r = S.recipes.find((x) => x.id === rid);
          await Promise.all(r.reagents.filter((g) => g.item_id && g.source !== 'vendor' && !S.ladders.has(g.item_id)).map(async (g) => S.ladders.set(g.item_id, await S.api.ladder(g.item_id))));
          renderMain();
        }
        break;
      }
      case 'craft-log': await craftLogModal(Number(el.dataset.id)); break;
      case 'recipe-new': recipeModal(null); break;
      case 'recipe-edit': recipeModal(Number(el.dataset.id)); break;
      case 'tx-new': txModal(el.dataset.kind, id ? { item_id: id, item_name: el.dataset.name } : {}); break;
      case 'tx-delete': {
        const t = S.tx.find((x) => String(x.id) === el.dataset.id);
        const ids = el.dataset.batch ? S.tx.filter((x) => x.batch_id === el.dataset.batch).map((x) => x.id) : [t.id];
        openModal(`<h2>Delete ${ids.length > 1 ? `this craft (${ids.length} entries)` : 'this entry'}?</h2><p class="muted">Profit and stock are recalculated without it.</p><footer>${cancelBtn}<button class="btn primary" value="ok">Delete</button></footer>`,
          async () => { await S.api.deleteTransactions(ids); toast('Deleted'); await reload('transactions'); });
        break;
      }
      case 'settings': settingsModal(); break;
      case 'signout': await S.api.signOut(); location.hash = ''; location.reload(); break;
    }
  } catch (ex) { console.error(ex); toast(ex.message); }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'msearch') return runSearch(el.value);
  const path = el.dataset?.filter; if (!path) return;
  const [grp, key] = path.split('.');
  const v = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
  S.ui[grp][key] = v;
  if (el.type === 'search' || el.type === 'number' || el.type === 'range') {
    const pos = el.selectionStart; renderMain();
    const again = document.querySelector(`[data-filter="${path}"]`);
    if (again) { again.focus(); try { if (pos != null) again.setSelectionRange(pos, pos); } catch { /* number inputs */ } }
  } else renderMain();
});

window.addEventListener('hashchange', () => { route(); render(); });
function route() { const h = location.hash.slice(1); S.route = ROUTES.some(([k]) => k === h) ? h : 'hearth'; }

// ---------------------------------------------------------------- loading
async function loadAll() {
  S.settings = await S.api.settings();
  const [members, status, deals, claims, watch, tx, recipes] = await Promise.all([
    S.api.members(), S.api.status(), S.api.deals(), S.api.claims(), S.api.watchlist(), S.api.transactions(), S.api.recipes(),
  ]);
  Object.assign(S, { members, status, deals, claims, watch, tx, recipes });
  S.market.clear();
  await ensureMarket([
    ...deals.map((d) => d.item_id), ...claims.map((c) => c.item_id), ...watch.map((w) => w.item_id), ...tx.map((t) => t.item_id),
    ...recipes.flatMap((r) => [r.product_item_id, ...r.reagents.map((g) => g.item_id)]),
  ].filter(Boolean));
}
async function reload(...what) {
  if (what.includes('claims')) S.claims = await S.api.claims();
  if (what.includes('watch')) S.watch = await S.api.watchlist();
  if (what.includes('transactions')) S.tx = await S.api.transactions();
  if (what.includes('recipes')) S.recipes = await S.api.recipes();
  if (what.includes('deals')) S.deals = await S.api.deals();
  await ensureMarket([...S.tx.map((t) => t.item_id), ...S.watch.map((w) => w.item_id), ...S.deals.map((d) => d.item_id), ...S.recipes.flatMap((r) => [r.product_item_id, ...r.reagents.map((g) => g.item_id)])].filter(Boolean));
  render();
}

function render() {
  const app = $('#app');
  app.innerHTML = shell();
  renderMain();
}
function renderMain() {
  const main = $('#main'); if (!main) return;
  main.innerHTML = VIEWS[S.route]();
  const nav = $('nav.tabs'); // keep the claim badge fresh
  if (nav) nav.outerHTML = shell().match(/<nav[\s\S]*?<\/nav>/)[0];
}

function loginScreen(err = '') {
  const players = (window.GOLDFLOW_CONFIG?.players?.length ? window.GOLDFLOW_CONFIG.players : [{ name: 'Mordain', email: 'mordain' }, { name: 'Wulfgar', email: 'wulfgar' }]);
  let last = null; try { last = localStorage.getItem('goldflow-seat'); } catch { /* storage off */ }
  const chosen = players.find((p) => p.name === last) ? last : players[0].name;
  $('#app').innerHTML = `${S.api.demo ? '<div class="demo-ribbon">Demo mode — any password will do.</div>' : ''}
  <div class="door"><div class="door-inner"><div class="sign"><h1>Goldflow</h1><small>A private table for two traders</small></div>
    <form class="modal login" id="login" novalidate>
      <h2>Who's at the table?</h2>
      <fieldset class="seats"><legend class="sr">Choose who you are</legend>
        ${players.map((p, i) => `<label class="seat"><input type="radio" name="seat" value="${esc(p.name)}" ${p.name === chosen ? 'checked' : ''}>
          <span class="crest" style="--c:${i ? '#8fc3d6' : '#f2c45a'}">${esc(p.name[0])}</span><b>${esc(p.name)}</b></label>`).join('')}
      </fieldset>
      <label class="f">Password<input type="password" name="password" autocomplete="current-password" required value="${S.api.demo ? 'demo' : ''}"></label>
      <div class="formerr" role="alert">${esc(err)}</div>
      <footer><button class="btn primary" style="width:100%;justify-content:center">Take a seat</button></footer>
    </form></div></div>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const p = players.find((x) => x.name === fd.get('seat'));
    if (!fd.get('password')) return loginScreen('Enter your password.');
    try { localStorage.setItem('goldflow-seat', p.name); } catch { /* storage off */ }
    try { await S.api.signIn(p.email, fd.get('password')); await start(); }
    catch (ex) { loginScreen(ex.message); }
  });
  $('#login [name=password]')?.focus();
}

async function start() {
  S.me = await S.api.me();
  if (S.me?.notMember) {
    $('#app').innerHTML = `<div class="door"><div class="modal"><h2>Not on the guest list</h2>
      <p>You're signed in as <b>${esc(S.me.email)}</b>, but this account hasn't been added to Goldflow yet.</p>
      <p class="muted">In Supabase, run:<br><code>insert into members (user_id, display_name) values ('${esc(S.me.user_id)}', 'Your name');</code></p>
      <footer><button class="btn" id="out">Sign out</button></footer></div></div>`;
    $('#out').onclick = async () => { await S.api.signOut(); location.reload(); };
    return;
  }
  await loadAll(); route(); render();
  S.api.subscribe(debounce((table) => reload(table === 'watchlist' ? 'watch' : table), 400));
}

(async function boot() {
  const cfg = window.GOLDFLOW_CONFIG || {};
  try {
    S.api = cfg.supabaseUrl && cfg.supabaseAnonKey ? await supabaseBackend(cfg) : demoBackend();
  } catch (e) {
    $('#app').innerHTML = `<div class="door"><div class="modal"><h2>Couldn't reach the database</h2><p>${esc(e.message)}</p></div></div>`; return;
  }
  if (await S.api.session()) await start(); else loginScreen();
})();
