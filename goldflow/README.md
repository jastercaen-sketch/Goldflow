# Goldflow

A private auction-house trading tool for two players on **WoW: Forever, EU PvP, Alliance**.

- **Deal Board**: underpriced listings turned into buy plans. Each plan says which listings to buy, the price you can realistically relist at once you've undercut what's left, the profit after the AH cut and deposits, and a confidence score. A high margin with low confidence is marked "wait".
- **Crafting Bench**: every recipe priced from the live AH. Shows profit per craft, what the conversion adds compared with selling the ingredients raw, and how many crafts a day the market takes. You can log a craft, and the ingredients come out of your stock at what you paid.
- **Claims**: claim a deal so your brother doesn't buy the same listings. Claims show up live on his screen.
- **Watchlist**: shared, with buy and sell targets.
- **Ledger**: purchases, crafts, sales and lost deposits per player, average-cost profit, and stock valued at today's prices.
- **Market**: 7-day hourly and 30-day daily price charts, today's listings with cumulative cost, and sell-through per day.

Everything runs on free tiers: **Supabase** (database and login), **GitHub Actions** (hourly AH scan) and **Vercel** (website). No build step and no npm packages.

```
Blizzard API ──hourly──> GitHub Actions (collector/collect.mjs) ──> Supabase (Postgres + Auth)
                                                                     │
                                         Vercel static site <────────┘  (login required, row-level security)
```

---

## Setup (about 30 minutes)

### 1. Supabase: database and logins
1. Create a free project at supabase.com (pick an EU region).
2. Go to **SQL Editor**, paste all of `supabase/schema.sql` and click Run. Then do the same with `supabase/seed_recipes.sql`.
3. Go to **Authentication → Sign In / Providers → Email** and **turn off "Allow new users to sign up"**. Nobody else can create an account after this.
4. Go to **Authentication → Users → Add user** and create one user for you and one for your brother, each with email and password.
   Use the addresses in `config.js` (`mordain@goldflow.app` and `wulfgar@goldflow.app`) and tick "Auto confirm". Nobody ever types these addresses: the sign-in screen just asks who you are and your password.
5. In the SQL Editor, run `supabase/members.sql` to put Mordain and Wulfgar on the guest list.
6. Go to **Project Settings → API** and copy the **Project URL**, the **anon public** key and the **service_role** key. Keep the service_role key secret.

### 2. Blizzard API client
1. Go to https://develop.battle.net/access/clients and create a client. Any name works, and the redirect URL can be `http://localhost`.
2. Copy the **Client ID** and **Client Secret**.

### 3. Find the EU PvP Alliance auction house
The Forever API lists 15 houses (5 Alliance, 5 Horde, 5 Blackwater) and doesn't say which realm group each belongs to, so you match them against prices you see in-game:
```bash
export BLIZZARD_CLIENT_ID=... BLIZZARD_CLIENT_SECRET=...
export SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=...
node collector/discover.mjs
```
It prints the floor price of Linen, Silk and Runecloth, Copper Ore, Peacebloom and a few other common items for each Alliance house. Check a few of these at the Stormwind or Ironforge auctioneer. When a house matches, save it:
```bash
node collector/discover.mjs --save 113 "EU PvP Alliance"
```
You need Node 20 or newer. Or skip Node entirely: in GitHub, run the **Goldflow find auction house** workflow (Actions tab) and read the list in its log, then run it again with the id. You can also type the id in the website under **Settings**.

### 4. GitHub: the hourly scanner
1. Create a **private** GitHub repository and push this folder to it.
2. Go to **Settings → Secrets and variables → Actions** and add four secrets: `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Go to **Actions → Goldflow AH scan → Run workflow** to start the first scan. After that it runs every hour. Each run takes about 1–2 minutes, which comes to roughly 1,500 of the 2,000 free minutes a private repo gets per month. If you go over, make the repo public: no secrets are stored in the code.

The first run looks up names for a few thousand items, and it can take a couple of runs to name them all. Deals start appearing after a few hours of history, and get more reliable once there are 2–3 days.

### 5. Vercel: the website
1. Fill in `config.js` with the Project URL and the **anon** key. The anon key is safe to publish, because the data is protected by the login and row-level security.
2. Go to vercel.com → **Add New Project**, import the repo, and set Framework to **Other**. There is no build command and the output directory is the root. Deploy.
3. Open the site and sign in.

Without keys in `config.js`, the site runs in **demo mode** with synthetic prices.

---

## How the numbers work

**Typical price** is the median floor over the last 7 days (each day's median of hourly floors). Goldflow uses the lower of that and the 30-day daily median as the conservative resale price.

**Buy plan**: it walks today's listings from cheapest up. After each one it asks what you'd have to list at to undercut the *next* remaining listing (capped at the typical price), and what the whole batch would net after the AH cut and expected deposits. It keeps the batch with the highest profit, but never buys more than the market sold in your hold window (default 3 days).

**Sold per day** is estimated from listings in the "long" or "very long" time bracket that disappear between two hourly scans, so they most likely sold. Cancellations count too, so treat it as an upper bound.

**Confidence (0–100)** is built from:
- how much price history exists
- whether sales cover your quantity
- how much the price swings
- how many sellers the market has
- whether someone is already listing below the typical price

It is lowered for gear, because random "of the Bear" suffixes share one item id, and for prices that look too good to be true.

**Verdicts**:
- **Buy**: profit ≥ your minimum and confidence ≥ 65
- **Consider**: confidence 45–64
- **Wait**: high margin, low confidence

**Vendor flips** are listings below what a vendor pays, with no risk. They are shown in blue.

**Crafting**:
- Ingredients are priced at the cheapest 10% of current units, or at the vendor price for vials.
- The product is priced conservatively, net of AH cut and deposit.
- "vs. selling raw" is the product's net value minus what the ingredients would net if you sold them as they are.

All rules (AH cut, deposit %, undercut, hold days, minimum profit and ROI, claim length) are in **Settings** and shared by both of you.

## Things to check in-game
- **AH cut and deposit**: defaults are 5% cut and 15% of vendor price per post × 1.5 posts. Adjust them to match what Forever actually charges.
- **Recipes**: the Alchemy recipes come from WoW: Forever recipe data, including Forever's changes such as Mender's Potions, flasks needing 10 herbs, and Bronze smelting making 2 bars. Mining bars, cloth bolts and bandages were carried over from Classic and are marked "check in-game". Tick "Checked against the in-game recipe" once you've confirmed one. Add any recipe from the Crafting Bench.
- Recipes store ingredient **names**. They are matched to item ids automatically once the item has been seen on the AH.

## Data rules
- Blizzard's API terms limit how long API data is kept, so hourly data is deleted after 3 days, and daily data and snapshots after 30 days. This also keeps the database around 100 MB, well inside Supabase's free 500 MB. This happens automatically on every scan.
- AHledger's API is not used. Its licence doesn't allow building a stored history from it.
- The Forever API is new and undocumented. If Blizzard changes a route, `collector/lib.mjs` is the only file that talks to it.

## Files
| File | What it does |
|---|---|
| `index.html`, `app.js`, `config.js` | The website |
| `engine.js` | Deal plans, confidence, crafting and ledger maths (shared by the site and the scanner) |
| `data.js` | Supabase access and the demo data |
| `recipes.js` | Starter recipe book (`node tools/gen-seed.mjs` regenerates the SQL) |
| `collector/` | Hourly scanner and the house finder |
| `supabase/schema.sql` | Tables, snapshot processing, retention, row-level security |
| `test/` | `node test/engine.test.mjs` |
