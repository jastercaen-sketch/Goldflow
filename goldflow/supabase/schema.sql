-- =====================================================================
-- Goldflow database schema (Supabase / PostgreSQL 15+)
-- Run this whole file once in Supabase -> SQL Editor -> New query.
-- Then run seed_recipes.sql.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Members: only users listed here can read or write anything.
-- ---------------------------------------------------------------------
create table if not exists public.members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  color        text not null default '#e8b04b',
  created_at   timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Settings (one row)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id            int primary key default 1 check (id = 1),
  region        text    not null default 'eu',
  ruleset_id    int     not null default 1,          -- 1 = PvP
  house_id      int,                                 -- the EU PvP Alliance house, found with collector/discover.mjs
  house_name    text,
  ah_cut        numeric not null default 0.05,       -- faction AH cut
  deposit_pct   numeric not null default 0.15,       -- deposit as share of vendor sell price per post
  relists       numeric not null default 1.5,        -- expected posts per unit before it sells
  undercut      numeric not null default 0.01,       -- how far under the floor you list
  hold_days     numeric not null default 3,          -- how long you are willing to hold stock
  min_profit    bigint  not null default 20000,      -- copper (2g)
  min_roi       numeric not null default 0.15,
  claim_hours   int     not null default 6,
  updated_at    timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- Items (static metadata, filled by the collector)
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id            int primary key,
  name          text,
  quality       text,
  item_class    text,
  item_subclass text,
  sell_price    bigint default 0,   -- vendor sell price (copper)
  stack_size    int,
  icon          text,
  resolved      boolean not null default true,
  updated_at    timestamptz not null default now()
);
create index if not exists items_name_idx on public.items (lower(name));

-- ---------------------------------------------------------------------
-- Market data (API-derived; purged after 30 days, per Blizzard API terms)
-- ---------------------------------------------------------------------
create unlogged table if not exists public.auctions_staging (
  house_id   int    not null,
  auction_id bigint not null,
  item_id    int    not null,
  unit_price bigint not null,
  quantity   int    not null,
  time_left  text
);
create index if not exists auctions_staging_house_idx on public.auctions_staging (house_id);

create table if not exists public.latest_auctions (
  house_id   int    not null,
  auction_id bigint not null,
  item_id    int    not null,
  unit_price bigint not null,
  quantity   int    not null,
  time_left  text,
  seen_at    timestamptz not null,
  primary key (house_id, auction_id)
);
create index if not exists latest_auctions_item_idx on public.latest_auctions (house_id, item_id, unit_price);

create table if not exists public.snapshots (
  house_id      int not null,
  ts            timestamptz not null,
  last_modified text,
  auctions      int,
  items         int,
  primary key (house_id, ts)
);

create table if not exists public.item_hourly (
  house_id     int not null,
  item_id      int not null,
  ts           timestamptz not null,
  min_price    bigint,
  p10_price    bigint,     -- quantity-weighted 10th percentile unit price
  median_price bigint,     -- quantity-weighted median unit price
  quantity     int,
  auctions     int,
  sold_est     int,        -- units in long auctions that vanished since the last scan (likely sold)
  primary key (house_id, item_id, ts)
);

create table if not exists public.item_daily (
  house_id   int not null,
  item_id    int not null,
  day        date not null,
  min_price  bigint,       -- median of the day's hourly floor prices
  p10_price  bigint,
  median_price bigint,
  avg_qty    int,
  sold_est   int,
  sold_obs   int,          -- hourly scans that could measure sales
  avg_auctions numeric,
  snapshots  int,
  primary key (house_id, item_id, day)
);
alter table public.item_daily add column if not exists sold_obs int;
alter table public.item_daily add column if not exists avg_auctions numeric;

-- Pre-computed stats per item, rebuilt after every snapshot
create table if not exists public.item_stats (
  house_id      int not null,
  item_id       int not null,
  last_ts       timestamptz,
  cur_min       bigint,
  cur_p10       bigint,
  cur_median    bigint,
  cur_qty       int,
  cur_auctions  int,
  med7_min      bigint,
  med7_p10      bigint,
  med30_min     bigint,
  avg_qty7      numeric,
  sold_per_day7 numeric,
  snapshots7    int,
  volatility7   numeric,
  avg_auctions7 numeric,
  primary key (house_id, item_id)
);

-- Deal candidates computed by the collector's trading engine
create table if not exists public.deals (
  house_id    int not null,
  item_id     int not null,
  computed_at timestamptz not null,
  kind        text not null default 'flip',   -- flip | vendor
  profit      bigint not null,
  roi         numeric not null,
  confidence  int not null,
  verdict     text not null,
  plan        jsonb not null,
  primary key (house_id, item_id, kind)
);

-- ---------------------------------------------------------------------
-- Team data
-- ---------------------------------------------------------------------
create table if not exists public.watchlist (
  item_id     int primary key,
  target_buy  bigint,
  target_sell bigint,
  note        text,
  added_by    uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.claims (
  id          uuid primary key default gen_random_uuid(),
  item_id     int not null,
  claimed_by  uuid not null references auth.users(id) default auth.uid(),
  quantity    int,
  max_price   bigint,
  note        text,
  status      text not null default 'active' check (status in ('active','bought','released')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '6 hours'
);
create index if not exists claims_active_idx on public.claims (status, expires_at);

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) default auth.uid(),
  kind        text not null check (kind in ('buy','sell','craft_use','craft_make','fee','adjust')),
  item_id     int,
  item_name   text,
  quantity    numeric not null default 0,  -- always positive; kind decides the direction
  unit_price  bigint  not null default 0,  -- buy/sell price, or cost basis for crafts
  fee         bigint  not null default 0,  -- AH cut, lost deposits
  batch_id    uuid,                        -- groups the rows of one craft
  note        text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists transactions_user_idx on public.transactions (user_id, occurred_at desc);

create table if not exists public.recipes (
  id              serial primary key,
  name            text not null,
  profession      text not null,
  product_name    text not null,
  product_item_id int,
  yield           numeric not null default 1,
  verified        boolean not null default false,
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.recipe_reagents (
  id           serial primary key,
  recipe_id    int not null references public.recipes(id) on delete cascade,
  item_name    text not null,
  item_id      int,
  quantity     numeric not null,
  source       text not null default 'ah' check (source in ('ah','vendor')),
  vendor_price bigint
);
create index if not exists recipe_reagents_recipe_idx on public.recipe_reagents (recipe_id);

-- ---------------------------------------------------------------------
-- Name -> item id matching for recipes
-- ---------------------------------------------------------------------
create or replace function public.resolve_recipe_items() returns void
language sql security definer set search_path = public as $$
  update public.recipes r set product_item_id = i.id
    from public.items i
   where r.product_item_id is null and i.name is not null and lower(i.name) = lower(r.product_name);
  update public.recipe_reagents rr set item_id = i.id
    from public.items i
   where rr.item_id is null and i.name is not null and lower(i.name) = lower(rr.item_name);
$$;

-- ---------------------------------------------------------------------
-- Snapshot processing (called by the collector after uploading staging rows)
-- Returns item IDs that still need metadata.
-- ---------------------------------------------------------------------
create or replace function public.process_snapshot(p_house int, p_ts timestamptz, p_last_modified text default null)
returns table (missing_item_id int)
language plpgsql security definer set search_path = public as $$
declare
  v_has_prev boolean;
begin
  select exists (select 1 from latest_auctions where house_id = p_house) into v_has_prev;

  -- 1. hourly stats per item (quantity-weighted percentiles) + likely-sold units
  with s as (
    select item_id, unit_price, quantity,
           sum(quantity) over (partition by item_id order by unit_price, auction_id) as cum,
           sum(quantity) over (partition by item_id) as tot
      from auctions_staging
     where house_id = p_house and unit_price > 0
  ), agg as (
    select item_id,
           min(unit_price)                                as min_price,
           min(unit_price) filter (where cum >= 0.10 * tot) as p10_price,
           min(unit_price) filter (where cum >= 0.50 * tot) as median_price,
           max(tot)::int                                  as quantity,
           count(*)::int                                  as auctions
      from s group by item_id
  ), vanished as (
    select la.item_id, sum(la.quantity)::int as sold
      from latest_auctions la
     where la.house_id = p_house
       and la.time_left in ('LONG','VERY_LONG')
       and not exists (select 1 from auctions_staging st
                        where st.house_id = p_house and st.auction_id = la.auction_id)
     group by la.item_id
  )
  insert into item_hourly (house_id, item_id, ts, min_price, p10_price, median_price, quantity, auctions, sold_est)
  select p_house, coalesce(a.item_id, v.item_id), p_ts,
         a.min_price, a.p10_price, a.median_price,
         coalesce(a.quantity, 0), coalesce(a.auctions, 0),
         case when v_has_prev then coalesce(v.sold, 0) else null end
    from agg a full join vanished v on v.item_id = a.item_id
  on conflict (house_id, item_id, ts) do update
     set min_price = excluded.min_price, p10_price = excluded.p10_price,
         median_price = excluded.median_price, quantity = excluded.quantity,
         auctions = excluded.auctions, sold_est = excluded.sold_est;

  -- 2. swap the current listings
  delete from latest_auctions where house_id = p_house;
  insert into latest_auctions (house_id, auction_id, item_id, unit_price, quantity, time_left, seen_at)
  select distinct on (auction_id) house_id, auction_id, item_id, unit_price, quantity, time_left, p_ts
    from auctions_staging where house_id = p_house
   order by auction_id;
  delete from auctions_staging where house_id = p_house;

  insert into snapshots (house_id, ts, last_modified, auctions, items)
  select p_house, p_ts, p_last_modified, count(*), count(distinct item_id)
    from latest_auctions where house_id = p_house
  on conflict (house_id, ts) do nothing;

  -- 3. daily rollup for today (UTC)
  insert into item_daily (house_id, item_id, day, min_price, p10_price, median_price, avg_qty, sold_est, sold_obs, avg_auctions, snapshots)
  select house_id, item_id, (ts at time zone 'utc')::date,
         percentile_disc(0.5) within group (order by min_price),
         percentile_disc(0.5) within group (order by p10_price),
         percentile_disc(0.5) within group (order by median_price),
         avg(quantity)::int, sum(sold_est)::int, count(sold_est)::int, avg(auctions), count(*) filter (where min_price is not null)
    from item_hourly
   where house_id = p_house
     and ts >= date_trunc('day', p_ts at time zone 'utc') at time zone 'utc'
     and ts <  (date_trunc('day', p_ts at time zone 'utc') + interval '1 day') at time zone 'utc'
   group by house_id, item_id, (ts at time zone 'utc')::date
  on conflict (house_id, item_id, day) do update
     set min_price = excluded.min_price, p10_price = excluded.p10_price,
         median_price = excluded.median_price, avg_qty = excluded.avg_qty,
         sold_est = excluded.sold_est, sold_obs = excluded.sold_obs,
         avg_auctions = excluded.avg_auctions, snapshots = excluded.snapshots;

  -- 4. retention: hourly 3 days (charts), daily + snapshots 30 days (keeps the database small)
  delete from item_hourly where house_id = p_house and ts < p_ts - interval '3 days';
  delete from item_daily  where house_id = p_house and day < (p_ts - interval '30 days')::date;
  delete from snapshots   where house_id = p_house and ts < p_ts - interval '30 days';
  delete from claims      where status <> 'active' and created_at < now() - interval '30 days';

  -- 5. rebuild item_stats
  delete from item_stats where house_id = p_house;
  with h7 as (
    select item_id,
           percentile_disc(0.5) within group (order by min_price) as med7_min,
           percentile_disc(0.5) within group (order by p10_price) as med7_p10,
           sum(avg_qty * snapshots)::numeric / nullif(sum(snapshots), 0) as avg_qty7,
           sum(sold_est) as sold7,
           sum(sold_obs) as sold_obs,
           sum(snapshots)::int as snapshots7,
           case when count(*) >= 3 and avg(min_price) > 0 then stddev_pop(min_price) / avg(min_price) end as volatility7,
           sum(avg_auctions * snapshots) / nullif(sum(snapshots), 0) as avg_auctions7
      from item_daily
     where house_id = p_house and min_price is not null
       and day > (p_ts at time zone 'utc')::date - 7
     group by item_id
  ), d30 as (
    select item_id, percentile_disc(0.5) within group (order by min_price) as med30_min
      from item_daily
     where house_id = p_house and min_price is not null
     group by item_id
  ), cur as (
    select * from item_hourly where house_id = p_house and ts = p_ts
  )
  insert into item_stats (house_id, item_id, last_ts, cur_min, cur_p10, cur_median, cur_qty, cur_auctions,
                          med7_min, med7_p10, med30_min, avg_qty7, sold_per_day7, snapshots7, volatility7, avg_auctions7)
  select p_house, h7.item_id, p_ts, cur.min_price, cur.p10_price, cur.median_price,
         coalesce(cur.quantity, 0), coalesce(cur.auctions, 0),
         h7.med7_min, h7.med7_p10, d30.med30_min, h7.avg_qty7,
         case when h7.sold_obs > 0 then h7.sold7::numeric / h7.sold_obs * 24 end,
         h7.snapshots7, h7.volatility7, h7.avg_auctions7
    from h7
    left join cur on cur.item_id = h7.item_id
    left join d30 on d30.item_id = h7.item_id;

  perform resolve_recipe_items();

  -- 6. which items still need names?
  return query
    select distinct x.id from (
      select item_id as id from latest_auctions where house_id = p_house
      union select item_id from recipe_reagents where item_id is not null
    ) x
    where not exists (select 1 from items i where i.id = x.id);
end;
$$;

-- ---------------------------------------------------------------------
-- The view the website reads: items + their current stats
-- ---------------------------------------------------------------------
create or replace view public.item_market with (security_invoker = on) as
select i.id as item_id, i.name, i.quality, i.item_class, i.item_subclass, i.sell_price, i.icon, i.stack_size,
       st.last_ts, st.cur_min, st.cur_p10, st.cur_median, st.cur_qty, st.cur_auctions,
       st.med7_min, st.med7_p10, st.med30_min, st.avg_qty7, st.sold_per_day7,
       st.snapshots7, st.volatility7, st.avg_auctions7
  from public.items i
  left join public.item_stats st
    on st.item_id = i.id
   and st.house_id = (select house_id from public.settings where id = 1);

-- ---------------------------------------------------------------------
-- Row level security: members only. The collector uses the service role key, which bypasses RLS.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['members','settings','items','latest_auctions','snapshots','item_hourly',
                           'item_daily','item_stats','deals','watchlist','claims','transactions',
                           'recipes','recipe_reagents','auctions_staging']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists members_all on public.%I', t);
  end loop;
end $$;

-- read-only market data
create policy members_all on public.items           for select to authenticated using (public.is_member());
create policy members_all on public.latest_auctions for select to authenticated using (public.is_member());
create policy members_all on public.snapshots       for select to authenticated using (public.is_member());
create policy members_all on public.item_hourly     for select to authenticated using (public.is_member());
create policy members_all on public.item_daily      for select to authenticated using (public.is_member());
create policy members_all on public.item_stats      for select to authenticated using (public.is_member());
create policy members_all on public.deals           for select to authenticated using (public.is_member());
create policy members_all on public.members         for select to authenticated using (public.is_member());
-- auctions_staging: no policy at all = no access except the service role

-- shared, editable team data
create policy members_all on public.settings        for all to authenticated using (public.is_member()) with check (public.is_member());
create policy members_all on public.watchlist       for all to authenticated using (public.is_member()) with check (public.is_member());
create policy members_all on public.claims          for all to authenticated using (public.is_member()) with check (public.is_member());
create policy members_all on public.transactions    for all to authenticated using (public.is_member()) with check (public.is_member());
create policy members_all on public.recipes         for all to authenticated using (public.is_member()) with check (public.is_member());
create policy members_all on public.recipe_reagents for all to authenticated using (public.is_member()) with check (public.is_member());

-- members may update their own display name / colour
drop policy if exists members_update_self on public.members;
create policy members_update_self on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- table privileges (row level security above still decides which rows)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant select on public.item_market to authenticated;

-- the processing functions are for the collector only
revoke all on function public.process_snapshot(int, timestamptz, text) from public, anon, authenticated;
revoke all on function public.resolve_recipe_items() from public, anon, authenticated;
grant execute on function public.process_snapshot(int, timestamptz, text) to service_role;
grant execute on function public.resolve_recipe_items() to service_role, authenticated;

-- live updates between the two of you
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.claims';       exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.transactions'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.watchlist';    exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.deals';        exception when others then null; end;
end $$;
