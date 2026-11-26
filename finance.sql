-- ============================================================
--  THE OFFICE — OFFICE FUND (balances, deposits, shared purchases,
--  monthly bills, wishlist voting, notifications, forecast, statements)
--
--  Run ONCE in the Supabase SQL Editor, AFTER auth_upgrade.sql.
--  Safe to re-run: it only creates/replaces fund objects and never
--  touches the cleaning / requests / resources / projects data.
--
--  After running it, make your admin (one line, at the very bottom).
--
--  Design notes
--  * Money is stored in FILS (1 JD = 1000 fils) as whole numbers, so a
--    100 JD purchase split six ways is exactly 4 x 16.667 + 2 x 16.666.
--    Who pays the extra fils rotates so it is never the same person.
--  * Balances are never stored: a balance is the sum of that person's
--    rows in fund_tx. Rows are never edited or deleted; mistakes are
--    undone with reversal rows.
--  * Every fund table has RLS on and NO policies, so the anon key can't
--    read anything directly. Everything goes through the security-definer
--    functions below, which check username + password every call.
--  * Time-based work (bills falling due, vote deadlines + reminders,
--    "you still owe" reminders, monthly statements) runs inside
--    _fund_tick(), which every fund page calls on load. No cron needed.
-- ============================================================

set search_path = public, extensions;
create extension if not exists pgcrypto;
drop function if exists public._fund_owed_check(text);

-- ------------------------------------------------------------
-- 0) Who is in the fund
--    fund_role: null = not in the fund (other office services still work)
--               'member' = one of the paying users, has a desk
--               'admin'  = runs the fund; no desk, no share, no vote
-- ------------------------------------------------------------
alter table public.users add column if not exists fund_role text;
alter table public.users add column if not exists desk_id text;
alter table public.users add column if not exists fund_joined_at timestamptz;
alter table public.users add column if not exists fund_owed_reminded_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_fund_role_chk') then
    alter table public.users add constraint users_fund_role_chk check (fund_role is null or fund_role in ('member','admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_desk_id_key') then
    alter table public.users add constraint users_desk_id_key unique (desk_id);
  end if;
end $$;

-- ------------------------------------------------------------
-- 1) Tables
-- ------------------------------------------------------------
create table if not exists public.fund_state (
  key   text primary key,
  value bigint not null default 0
);

-- The ledger. amount_fils > 0 = money in, < 0 = money out.
create table if not exists public.fund_tx (
  id          uuid primary key default gen_random_uuid(),
  user_name   text not null references public.users(name),
  amount_fils bigint not null check (amount_fils <> 0),
  kind        text not null check (kind in ('deposit','purchase','bill','reversal')),
  ref_id      uuid,               -- deposit / purchase / bill charge it came from
  memo        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists fund_tx_user_idx on public.fund_tx(user_name, created_at desc);
create index if not exists fund_tx_ref_idx  on public.fund_tx(ref_id);

create table if not exists public.fund_deposits (
  id          uuid primary key default gen_random_uuid(),
  user_name   text not null references public.users(name),
  amount_fils bigint not null check (amount_fils > 0),
  method      text not null default 'cash' check (method in ('cash','cliq','bank','other')),
  note        text,
  status      text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','reversed')),
  reason      text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  text
);

create table if not exists public.fund_purchases (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  total_fils     bigint not null check (total_fils > 0),
  note           text,
  proposal_id    uuid,
  created_by     text not null,
  created_at     timestamptz not null default now(),
  reversed_at    timestamptz,
  reversed_by    text,
  reverse_reason text
);

create table if not exists public.fund_bills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  amount_fils bigint check (amount_fils is null or amount_fils > 0),  -- null = changes every month
  due_day     int  not null check (due_day between 1 and 28),
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.fund_bill_charges (
  id             uuid primary key default gen_random_uuid(),
  bill_id        uuid not null references public.fund_bills(id),
  period         date not null,               -- first day of the month it is for
  suggested_fils bigint,                      -- fixed amount, or an estimate for variable bills
  amount_fils    bigint,                      -- what the admin actually charged
  status         text not null default 'due' check (status in ('due','charged','skipped','reversed')),
  note           text,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     text,
  unique (bill_id, period)
);

create table if not exists public.fund_proposals (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  price_fils   bigint not null check (price_fils > 0),
  link         text,
  reason       text,
  proposed_by  text not null references public.users(name),
  status       text not null default 'open' check (status in ('open','approved','rejected','expired','withdrawn','bought')),
  deadline     timestamptz not null,
  parent_id    uuid references public.fund_proposals(id),
  purchase_id  uuid,
  reminded_24  boolean not null default false,
  reminded_6   boolean not null default false,
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);

create table if not exists public.fund_votes (
  proposal_id uuid not null references public.fund_proposals(id) on delete cascade,
  voter       text not null references public.users(name),
  approve     boolean not null,
  comment     text,
  created_at  timestamptz not null default now(),
  primary key (proposal_id, voter)
);

create table if not exists public.fund_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_name   text not null references public.users(name),
  kind        text not null,
  title       text not null,
  body        text,
  amount_fils bigint,
  ref_id      uuid,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists fund_notif_user_idx on public.fund_notifications(user_name, created_at desc);

create table if not exists public.fund_statements (
  user_name     text not null references public.users(name),
  period        date not null,
  opening_fils  bigint not null,
  in_fils       bigint not null,
  out_fils      bigint not null,
  closing_fils  bigint not null,
  tx_count      int not null,
  created_at    timestamptz not null default now(),
  primary key (user_name, period)
);

-- Lock every fund table away from the anon key (functions only).
do $$
declare t text;
begin
  foreach t in array array['fund_state','fund_tx','fund_deposits','fund_purchases','fund_bills',
                           'fund_bill_charges','fund_proposals','fund_votes','fund_notifications','fund_statements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2) Small helpers
-- ------------------------------------------------------------
create or replace function public._fund_desks() returns text[]
language sql immutable as $$ select array['k1','k2','d1','d2','d3','d4','d5'] $$;

create or replace function public._fund_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Amman')::date $$;

-- local midnight (Amman) of a date, as a timestamptz
create or replace function public._fund_ts(p_day date) returns timestamptz
language sql stable as $$ select (p_day::timestamp at time zone 'Asia/Amman') $$;

-- 16.667 JD style text
create or replace function public._jd(p_fils bigint) returns text
language sql immutable as $$
  select (case when p_fils < 0 then '-' else '' end)
         || to_char(abs(coalesce(p_fils,0)) / 1000.0, 'FM9999999990.000') || ' JD'
$$;

-- JD amount typed by a person -> fils (max 3 decimals)
create or replace function public._fils(p_jd numeric, p_what text default 'Amount') returns bigint
language plpgsql immutable as $$
begin
  if p_jd is null or p_jd <= 0 then raise exception '% must be more than 0', p_what; end if;
  if p_jd > 100000 then raise exception '% is too large', p_what; end if;
  if round(p_jd, 3) <> p_jd then raise exception '% can have at most 3 decimals (fils)', p_what; end if;
  return (p_jd * 1000)::bigint;
end; $$;

create or replace function public._fund_method(p_m text) returns text
language sql immutable as $$
  select case p_m when 'cash' then 'Cash' when 'cliq' then 'CliQ' when 'bank' then 'Bank transfer' else 'Other' end
$$;

create or replace function public._fund_balance(p_user text) returns bigint
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(sum(amount_fils), 0)::bigint from public.fund_tx where user_name = p_user
$$;

create or replace function public._fund_member_count() returns int
language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int from public.users where fund_role = 'member'
$$;

-- check password + membership; returns the users row
create or replace function public._fund_user(p_name text, p_pin text) returns public.users
language plpgsql security definer set search_path = public, extensions as $$
declare v_name text; v_u public.users;
begin
  v_name := public._require(p_name, p_pin);
  select * into v_u from public.users where name = v_name;
  if v_u.fund_role is null then
    raise exception 'You are not in the office fund yet. Ask the admin to add you.';
  end if;
  return v_u;
end; $$;

create or replace function public._fund_admin(p_name text, p_pin text) returns public.users
language plpgsql security definer set search_path = public, extensions as $$
declare v_u public.users;
begin
  v_u := public._fund_user(p_name, p_pin);
  if v_u.fund_role <> 'admin' then raise exception 'Only the admin can do that'; end if;
  return v_u;
end; $$;

create or replace function public._notify(p_user text, p_kind text, p_title text, p_body text,
                                          p_amount bigint default null, p_ref uuid default null, p_link text default null)
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.fund_notifications(user_name, kind, title, body, amount_fils, ref_id, link)
  values (p_user, p_kind, p_title, p_body, p_amount, p_ref, p_link)
$$;

create or replace function public._notify_role(p_role text, p_kind text, p_title text, p_body text,
                                               p_amount bigint default null, p_ref uuid default null,
                                               p_link text default null, p_except text default null)
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.fund_notifications(user_name, kind, title, body, amount_fils, ref_id, link)
  select name, p_kind, p_title, p_body, p_amount, p_ref, p_link
  from public.users where fund_role = p_role and name is distinct from p_except
$$;

-- After money leaves someone's balance: if it just dropped below zero,
-- send one "you owe" alert (the 3-day reminders in _fund_tick follow up).
create or replace function public._fund_owed_check(p_user text, p_before bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_bal bigint := public._fund_balance(p_user);
begin
  if v_bal < 0 and p_before >= 0 then
    perform public._notify(p_user, 'owed', 'You owe ' || public._jd(-v_bal),
      'Your balance went below zero. Make a deposit to cover it.', v_bal, null, 'fund.html#wallet');
  end if;
  if v_bal < 0 and p_before >= 0 then
    update public.users set fund_owed_reminded_at = now() where name = p_user;
  end if;
end; $$;

-- Charge p_total fils across every member, exactly, rotating the extra fils.
create or replace function public._fund_split(p_total bigint, p_kind text, p_ref uuid, p_memo text, p_by text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  v_n int := public._fund_member_count();
  v_base bigint; v_rem int; v_cur int; v_i int := 0; v_share bigint; v_before bigint; v_after bigint; m record;
begin
  if v_n = 0 then raise exception 'There are no members to split this between'; end if;
  v_base := p_total / v_n;
  v_rem  := (p_total % v_n)::int;
  insert into public.fund_state(key, value) values ('split_cursor', 0) on conflict (key) do nothing;
  select value::int into v_cur from public.fund_state where key = 'split_cursor' for update;
  v_cur := v_cur % v_n;
  for m in select name from public.users where fund_role = 'member' order by name loop
    -- members at positions cur .. cur+rem-1 (wrapping) pay one extra fils
    v_share := v_base + case when ((v_i - v_cur) % v_n + v_n) % v_n < v_rem then 1 else 0 end;
    v_before := public._fund_balance(m.name);
    insert into public.fund_tx(user_name, amount_fils, kind, ref_id, memo, created_by)
      values (m.name, -v_share, p_kind, p_ref, p_memo, p_by);
    v_after := v_before - v_share;
    perform public._notify(m.name, p_kind, p_memo,
      'Your share: ' || public._jd(v_share) || ' (total ' || public._jd(p_total) || ' split ' || v_n || ' ways). '
      || case when v_after < 0 then 'You now owe ' || public._jd(-v_after) || '.'
              else 'New balance: ' || public._jd(v_after) || '.' end,
      -v_share, p_ref, 'fund.html#wallet');
    perform public._fund_owed_check(m.name, v_before);
    v_i := v_i + 1;
  end loop;
  update public.fund_state set value = (v_cur + v_rem) % v_n where key = 'split_cursor';
  return v_n;
end; $$;

-- Estimate for a bill: fixed amount, else average of the last 3 charges.
create or replace function public._fund_bill_estimate(p_bill uuid) returns bigint
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select amount_fils from public.fund_bills where id = p_bill),
    (select round(avg(amount_fils))::bigint from (
       select amount_fils from public.fund_bill_charges
       where bill_id = p_bill and status = 'charged' order by period desc limit 3) x)
  )
$$;

-- Unanimous rule: approved once every current member has voted yes.
create or replace function public._fund_check_unanimous(p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_p public.fund_proposals; v_n int := public._fund_member_count(); v_yes int;
begin
  select * into v_p from public.fund_proposals where id = p_id for update;
  if v_p.status <> 'open' or v_n = 0 then return; end if;
  select count(*) into v_yes from public.fund_votes v join public.users u on u.name = v.voter
   where v.proposal_id = p_id and v.approve and u.fund_role = 'member';
  if v_yes >= v_n then
    update public.fund_proposals set status = 'approved', closed_at = now() where id = p_id;
    perform public._notify_role('member', 'proposal_approved', 'Approved by everyone: ' || v_p.title,
      'All ' || v_n || ' members said yes. The admin can buy it now (' || public._jd(v_p.price_fils / v_n) || ' each, about).',
      null, p_id, 'expenses.html#wishlist');
    perform public._notify_role('admin', 'proposal_approved', 'Ready to buy: ' || v_p.title,
      'All ' || v_n || ' members approved it. Record the purchase when you buy it.', v_p.price_fils, p_id, 'admin.html#purchase');
  end if;
end; $$;

-- ------------------------------------------------------------
-- 3) Time-based work. Called by every fund page load; throttled to
--    once a minute and safe to run in parallel (advisory lock).
-- ------------------------------------------------------------
create or replace function public._fund_tick(p_force boolean default false) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_today date := public._fund_today();
  v_period date := date_trunc('month', public._fund_today())::date;
  v_prev date := (date_trunc('month', public._fund_today()) - interval '1 month')::date;
  v_last bigint; v_now bigint := extract(epoch from now())::bigint;
  b record; p record; m record; v_est bigint; v_yes int; v_n int;
  v_open bigint; v_in bigint; v_out bigint; v_cnt int;
begin
  if not pg_try_advisory_xact_lock(hashtext('fund_tick')) then return; end if;
  insert into public.fund_state(key, value) values ('last_tick', 0) on conflict (key) do nothing;
  select value into v_last from public.fund_state where key = 'last_tick';
  if not p_force and v_now - v_last < 60 then return; end if;
  update public.fund_state set value = v_now where key = 'last_tick';
  v_n := public._fund_member_count();

  -- a) monthly bills that reached their due day this month -> waiting for admin
  for b in select * from public.fund_bills
           where active and extract(day from v_today) >= due_day
             and (created_at at time zone 'Asia/Amman')::date <= v_today
             and not exists (select 1 from public.fund_bill_charges c where c.bill_id = fund_bills.id and c.period = v_period)
  loop
    v_est := public._fund_bill_estimate(b.id);
    insert into public.fund_bill_charges(bill_id, period, suggested_fils) values (b.id, v_period, v_est)
      on conflict (bill_id, period) do nothing;
    perform public._notify_role('admin', 'bill_due', b.name || ' is due (' || to_char(v_period, 'FMMonth YYYY') || ')',
      case when b.amount_fils is null then 'Enter this month''s real amount to charge everyone.'
           else 'Confirm ' || public._jd(b.amount_fils) || ' to charge everyone.' end,
      v_est, b.id, 'admin.html#bills');
  end loop;

  -- b) votes whose deadline passed without everyone saying yes -> expired
  for p in update public.fund_proposals set status = 'expired', closed_at = now()
           where status = 'open' and deadline <= now() returning * loop
    select count(*) into v_yes from public.fund_votes v join public.users u on u.name = v.voter
     where v.proposal_id = p.id and v.approve and u.fund_role = 'member';
    perform public._notify_role('member', 'proposal_expired', 'Not approved: ' || p.title,
      'The vote closed with ' || v_yes || ' of ' || v_n || ' yes. Everyone has to agree. It can be proposed again.',
      null, p.id, 'expenses.html#wishlist');
  end loop;

  -- c) reminders to members who haven't voted yet (24h and 6h before the deadline)
  for p in select * from public.fund_proposals
           where status = 'open' and ((not reminded_24 and deadline - now() <= interval '24 hours')
                                   or (not reminded_6  and deadline - now() <= interval '6 hours')) loop
    insert into public.fund_notifications(user_name, kind, title, body, ref_id, link)
    select u.name, 'vote_reminder', 'Your vote is needed: ' || p.title,
           'Voting closes in ' || case when p.deadline - now() <= interval '6 hours' then 'under 6 hours' else 'under 24 hours' end
           || '. It only passes if everyone says yes.', p.id, 'expenses.html#wishlist'
      from public.users u
     where u.fund_role = 'member'
       and not exists (select 1 from public.fund_votes v where v.proposal_id = p.id and v.voter = u.name);
    update public.fund_proposals
       set reminded_24 = reminded_24 or deadline - now() <= interval '24 hours',
           reminded_6  = reminded_6  or deadline - now() <= interval '6 hours'
     where id = p.id;
  end loop;

  -- d) still owing -> reminder every 3 days
  for m in select name from public.users
           where fund_role = 'member'
             and (fund_owed_reminded_at is null or fund_owed_reminded_at < now() - interval '3 days') loop
    if public._fund_balance(m.name) < 0 then
      perform public._notify(m.name, 'owed', 'Reminder: you owe ' || public._jd(-public._fund_balance(m.name)),
        'Make a deposit to bring your balance back to zero.', public._fund_balance(m.name), null, 'fund.html#wallet');
      update public.users set fund_owed_reminded_at = now() where name = m.name;
    end if;
  end loop;

  -- e) monthly statement for last month (once per member)
  for m in select name from public.users
           where fund_role = 'member' and fund_joined_at < public._fund_ts(v_period)
             and not exists (select 1 from public.fund_statements s where s.user_name = users.name and s.period = v_prev) loop
    select coalesce(sum(amount_fils), 0) into v_open from public.fund_tx
     where user_name = m.name and created_at < public._fund_ts(v_prev);
    select coalesce(sum(amount_fils) filter (where amount_fils > 0), 0),
           coalesce(-sum(amount_fils) filter (where amount_fils < 0), 0), count(*)
      into v_in, v_out, v_cnt
      from public.fund_tx
     where user_name = m.name and created_at >= public._fund_ts(v_prev) and created_at < public._fund_ts(v_period);
    insert into public.fund_statements(user_name, period, opening_fils, in_fils, out_fils, closing_fils, tx_count)
      values (m.name, v_prev, v_open, v_in, v_out, v_open + v_in - v_out, v_cnt)
      on conflict do nothing;
    perform public._notify(m.name, 'statement', 'Your ' || to_char(v_prev, 'FMMonth YYYY') || ' statement',
      'In ' || public._jd(v_in) || ', out ' || public._jd(v_out) || ', closing balance ' || public._jd(v_open + v_in - v_out) || '.',
      v_open + v_in - v_out, null, 'fund.html#statements');
  end loop;
end; $$;

-- ------------------------------------------------------------
-- 4) Members: deposits, wishlist, votes, notifications
-- ------------------------------------------------------------
create or replace function public.fund_request_deposit(p_name text, p_pin text, p_amount numeric, p_method text, p_note text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_u public.users; v_id uuid; v_f bigint;
begin
  v_u := public._fund_user(p_name, p_pin);
  if v_u.fund_role <> 'member' then raise exception 'Only members make deposits'; end if;
  v_f := public._fils(p_amount, 'Deposit');
  if p_method is null or p_method not in ('cash','cliq','bank','other') then p_method := 'cash'; end if;
  insert into public.fund_deposits(user_name, amount_fils, method, note)
    values (v_u.name, v_f, p_method, nullif(btrim(p_note), '')) returning id into v_id;
  perform public._notify_role('admin', 'deposit_request', v_u.name || ' deposited ' || public._jd(v_f),
    'Method: ' || public._fund_method(p_method) || coalesce(' · ' || nullif(btrim(p_note), ''), '') || '. Approve it once you have the money.',
    v_f, v_id, 'admin.html#deposits');
  return v_id;
end; $$;

create or replace function public.fund_cancel_deposit(p_name text, p_pin text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_u public.users;
begin
  v_u := public._fund_user(p_name, p_pin);
  update public.fund_deposits set status = 'cancelled', decided_at = now(), decided_by = v_u.name
   where id = p_id and user_name = v_u.name and status = 'pending';
  if not found then raise exception 'That deposit is no longer pending'; end if;
end; $$;

create or replace function public.fund_propose(p_name text, p_pin text, p_title text, p_price numeric,
                                               p_link text, p_reason text, p_days int, p_parent uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_u public.users; v_id uuid; v_f bigint; v_parent public.fund_proposals; v_deadline timestamptz;
begin
  v_u := public._fund_user(p_name, p_pin);
  p_title := btrim(coalesce(p_title, ''));
  if length(p_title) = 0 then raise exception 'Say what you want to buy'; end if;
  if length(p_title) > 120 then raise exception 'Keep the name under 120 characters'; end if;
  v_f := public._fils(p_price, 'Price');
  p_days := least(greatest(coalesce(p_days, 3), 1), 14);
  if p_parent is not null then
    select * into v_parent from public.fund_proposals where id = p_parent;
    if v_parent.id is null then raise exception 'The original item was not found'; end if;
    if v_parent.status not in ('rejected','expired','withdrawn') then
      raise exception 'Only a rejected, expired or withdrawn item can be proposed again';
    end if;
  end if;
  v_deadline := now() + make_interval(days => p_days);
  insert into public.fund_proposals(title, price_fils, link, reason, proposed_by, deadline, parent_id, reminded_24, reminded_6)
    values (p_title, v_f, nullif(btrim(p_link), ''), nullif(btrim(p_reason), ''), v_u.name, v_deadline, p_parent,
            p_days <= 1, false)
    returning id into v_id;
  -- the person proposing it obviously wants it
  if v_u.fund_role = 'member' then
    insert into public.fund_votes(proposal_id, voter, approve) values (v_id, v_u.name, true);
  end if;
  perform public._notify_role('member', 'proposal_new',
    case when p_parent is null then 'New wishlist item: ' else 'Proposed again: ' end || p_title,
    v_u.name || ' wants to buy it for ' || public._jd(v_f) || '. Vote by ' ||
    to_char(v_deadline at time zone 'Asia/Amman', 'FMDy DD Mon, HH24:MI') || '. Everyone has to agree.',
    v_f, v_id, 'expenses.html#wishlist', v_u.name);
  perform public._fund_check_unanimous(v_id);
  return v_id;
end; $$;

create or replace function public.fund_vote(p_name text, p_pin text, p_id uuid, p_approve boolean, p_comment text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_u public.users; v_p public.fund_proposals;
begin
  v_u := public._fund_user(p_name, p_pin);
  if v_u.fund_role <> 'member' then raise exception 'The admin doesn''t vote'; end if;
  perform public._fund_tick(true);
  select * into v_p from public.fund_proposals where id = p_id for update;
  if v_p.id is null then raise exception 'Item not found'; end if;
  if v_p.status <> 'open' then raise exception 'Voting on this item is closed'; end if;
  p_comment := nullif(btrim(coalesce(p_comment, '')), '');
  if p_approve is null then raise exception 'Choose yes or no'; end if;
  if not p_approve and (p_comment is null or length(p_comment) < 3) then
    raise exception 'Say briefly why you''re voting no, so it can be changed and proposed again';
  end if;
  insert into public.fund_votes(proposal_id, voter, approve, comment) values (p_id, v_u.name, p_approve, p_comment)
    on conflict (proposal_id, voter) do update set approve = excluded.approve, comment = excluded.comment, created_at = now();
  if not p_approve then
    update public.fund_proposals set status = 'rejected', closed_at = now() where id = p_id;
    perform public._notify_role('member', 'proposal_rejected', 'Rejected: ' || v_p.title,
      v_u.name || ' voted no: "' || p_comment || '". It can be changed and proposed again.',
      null, p_id, 'expenses.html#wishlist', v_u.name);
    return 'rejected';
  end if;
  perform public._fund_check_unanimous(p_id);
  return (select status from public.fund_proposals where id = p_id);
end; $$;

create or replace function public.fund_withdraw_proposal(p_name text, p_pin text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_u public.users; v_p public.fund_proposals;
begin
  v_u := public._fund_user(p_name, p_pin);
  select * into v_p from public.fund_proposals where id = p_id for update;
  if v_p.id is null then raise exception 'Item not found'; end if;
  if v_p.proposed_by <> v_u.name and v_u.fund_role <> 'admin' then raise exception 'Only the person who proposed it (or the admin) can withdraw it'; end if;
  if v_p.status not in ('open','approved') then raise exception 'This item is already closed'; end if;
  update public.fund_proposals set status = 'withdrawn', closed_at = now() where id = p_id;
  perform public._notify_role('member', 'proposal_withdrawn', 'Withdrawn: ' || v_p.title,
    v_u.name || ' withdrew it.', null, p_id, 'expenses.html#wishlist', v_u.name);
end; $$;

create or replace function public.fund_mark_read(p_name text, p_pin text, p_ids uuid[])
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_u public.users;
begin
  v_u := public._fund_user(p_name, p_pin);
  update public.fund_notifications set read_at = now()
   where user_name = v_u.name and read_at is null and (p_ids is null or id = any(p_ids));
end; $$;

-- Bell count for the nav on every page. Returns null (not an error)
-- for people who aren't in the fund, so other pages stay quiet.
create or replace function public.fund_unread(p_name text, p_pin text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_name text; v_role text;
begin
  v_name := public._require(p_name, p_pin);
  select fund_role into v_role from public.users where name = v_name;
  if v_role is null then return null; end if;
  perform public._fund_tick();
  return (select count(*)::int from public.fund_notifications where user_name = v_name and read_at is null);
end; $$;

-- ------------------------------------------------------------
-- 5) Admin
-- ------------------------------------------------------------
create or replace function public.fund_add_member(p_name text, p_pin text, p_user text, p_desk text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users; v_t public.users;
begin
  v_a := public._fund_admin(p_name, p_pin);
  select * into v_t from public.users where name = btrim(p_user) for update;
  if v_t.name is null then raise exception 'No account called "%". They need to create an account first.', p_user; end if;
  if v_t.fund_role is not null then raise exception '% is already in the fund', v_t.name; end if;
  if p_desk is null or not (p_desk = any(public._fund_desks())) then raise exception 'Pick a desk'; end if;
  if exists (select 1 from public.users where desk_id = p_desk) then raise exception 'That desk is taken'; end if;
  update public.users set fund_role = 'member', desk_id = p_desk, fund_joined_at = now() where name = v_t.name;
  perform public._notify(v_t.name, 'welcome', 'Welcome to the office fund',
    'You can now see your balance, make deposits and vote on things to buy.', null, null, 'fund.html');
end; $$;

create or replace function public.fund_set_desk(p_name text, p_pin text, p_user text, p_desk text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users;
begin
  v_a := public._fund_admin(p_name, p_pin);
  if p_desk is null or not (p_desk = any(public._fund_desks())) then raise exception 'Pick a desk'; end if;
  if exists (select 1 from public.users where desk_id = p_desk and name <> p_user) then raise exception 'That desk is taken'; end if;
  update public.users set desk_id = p_desk where name = p_user and fund_role = 'member';
  if not found then raise exception 'Member not found'; end if;
end; $$;

-- Only for mistakes: a member can be taken out while their balance is exactly zero.
create or replace function public.fund_remove_member(p_name text, p_pin text, p_user text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users; p record;
begin
  v_a := public._fund_admin(p_name, p_pin);
  if not exists (select 1 from public.users where name = p_user and fund_role = 'member') then raise exception 'Member not found'; end if;
  if public._fund_balance(p_user) <> 0 then raise exception 'Their balance must be exactly 0 JD first'; end if;
  if exists (select 1 from public.fund_deposits where user_name = p_user and status = 'pending') then
    raise exception 'They have a deposit waiting. Approve or reject it first.';
  end if;
  update public.users set fund_role = null, desk_id = null where name = p_user;
  for p in select id from public.fund_proposals where status = 'open' loop
    perform public._fund_check_unanimous(p.id);
  end loop;
end; $$;

create or replace function public.fund_decide_deposit(p_name text, p_pin text, p_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users; v_d public.fund_deposits; v_before bigint; v_after bigint;
begin
  v_a := public._fund_admin(p_name, p_pin);
  select * into v_d from public.fund_deposits where id = p_id for update;
  if v_d.id is null then raise exception 'Deposit not found'; end if;
  if v_d.status <> 'pending' then raise exception 'This deposit was already handled'; end if;
  if p_approve then
    v_before := public._fund_balance(v_d.user_name);
    update public.fund_deposits set status = 'approved', decided_at = now(), decided_by = v_a.name where id = p_id;
    insert into public.fund_tx(user_name, amount_fils, kind, ref_id, memo, created_by)
      values (v_d.user_name, v_d.amount_fils, 'deposit', p_id, 'Deposit (' || public._fund_method(v_d.method) || ')', v_a.name);
    v_after := v_before + v_d.amount_fils;
    perform public._notify(v_d.user_name, 'deposit_approved', 'Deposit approved: +' || public._jd(v_d.amount_fils),
      'New balance: ' || public._jd(v_after) || '.' ||
      case when v_before < 0 and v_after >= 0 then ' You no longer owe anything.'
           when v_after < 0 then ' You still owe ' || public._jd(-v_after) || '.' else '' end,
      v_d.amount_fils, p_id, 'fund.html#wallet');
  else
    p_reason := nullif(btrim(coalesce(p_reason, '')), '');
    if p_reason is null then raise exception 'Give a reason for rejecting it'; end if;
    update public.fund_deposits set status = 'rejected', reason = p_reason, decided_at = now(), decided_by = v_a.name where id = p_id;
    perform public._notify(v_d.user_name, 'deposit_rejected', 'Deposit rejected: ' || public._jd(v_d.amount_fils),
      'Reason: ' || p_reason, v_d.amount_fils, p_id, 'fund.html#wallet');
  end if;
end; $$;

create or replace function public.fund_record_purchase(p_name text, p_pin text, p_title text, p_total numeric, p_note text, p_proposal uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users; v_f bigint; v_id uuid; v_p public.fund_proposals;
begin
  v_a := public._fund_admin(p_name, p_pin);
  p_title := btrim(coalesce(p_title, ''));
  if length(p_title) = 0 then raise exception 'Say what you bought'; end if;
  v_f := public._fils(p_total, 'Total');
  if p_proposal is not null then
    select * into v_p from public.fund_proposals where id = p_proposal for update;
    if v_p.status <> 'approved' then raise exception 'That wishlist item is not approved'; end if;
  end if;
  insert into public.fund_purchases(title, total_fils, note, proposal_id, created_by)
    values (p_title, v_f, nullif(btrim(p_note), ''), p_proposal, v_a.name) returning id into v_id;
  perform public._fund_split(v_f, 'purchase', v_id, 'Purchase: ' || p_title, v_a.name);
  if p_proposal is not null then
    update public.fund_proposals set status = 'bought', purchase_id = v_id where id = p_proposal;
  end if;
  return v_id;
end; $$;

create or replace function public.fund_save_bill(p_name text, p_pin text, p_id uuid, p_bill_name text,
                                                 p_amount numeric, p_due_day int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users; v_f bigint; v_id uuid;
begin
  v_a := public._fund_admin(p_name, p_pin);
  p_bill_name := btrim(coalesce(p_bill_name, ''));
  if length(p_bill_name) = 0 then raise exception 'Name the bill'; end if;
  if p_due_day is null or p_due_day not between 1 and 28 then raise exception 'Due day must be 1 to 28'; end if;
  v_f := case when p_amount is null then null else public._fils(p_amount, 'Amount') end;
  if p_id is null then
    insert into public.fund_bills(name, amount_fils, due_day, active, created_by)
      values (p_bill_name, v_f, p_due_day, coalesce(p_active, true), v_a.name) returning id into v_id;
  else
    update public.fund_bills set name = p_bill_name, amount_fils = v_f, due_day = p_due_day, active = coalesce(p_active, active)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Bill not found'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.fund_charge_bill(p_name text, p_pin text, p_charge uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users; v_c public.fund_bill_charges; v_b public.fund_bills; v_f bigint;
begin
  v_a := public._fund_admin(p_name, p_pin);
  select * into v_c from public.fund_bill_charges where id = p_charge for update;
  if v_c.id is null then raise exception 'Bill not found'; end if;
  if v_c.status <> 'due' then raise exception 'This bill was already handled'; end if;
  select * into v_b from public.fund_bills where id = v_c.bill_id;
  v_f := public._fils(coalesce(p_amount, v_c.suggested_fils / 1000.0), 'Amount');
  update public.fund_bill_charges set amount_fils = v_f, status = 'charged', decided_at = now(), decided_by = v_a.name
   where id = p_charge;
  perform public._fund_split(v_f, 'bill', p_charge, v_b.name || ' · ' || to_char(v_c.period, 'FMMonth YYYY'), v_a.name);
end; $$;

create or replace function public.fund_skip_bill(p_name text, p_pin text, p_charge uuid, p_note text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users;
begin
  v_a := public._fund_admin(p_name, p_pin);
  update public.fund_bill_charges set status = 'skipped', note = nullif(btrim(p_note), ''), decided_at = now(), decided_by = v_a.name
   where id = p_charge and status = 'due';
  if not found then raise exception 'This bill was already handled'; end if;
end; $$;

-- Undo a whole event (an approved deposit, a purchase or a charged bill)
-- by adding opposite rows. The original rows stay in the history.
create or replace function public.fund_reverse(p_name text, p_pin text, p_ref uuid, p_reason text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.users; t record; v_cnt int := 0; v_before bigint;
begin
  v_a := public._fund_admin(p_name, p_pin);
  p_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if p_reason is null then raise exception 'Give a reason for the reversal'; end if;
  perform 1 from public.fund_state where key = 'split_cursor' for update;  -- serialise money writes
  if exists (select 1 from public.fund_tx where ref_id = p_ref and kind = 'reversal') then
    raise exception 'This was already reversed';
  end if;
  for t in select * from public.fund_tx where ref_id = p_ref and kind in ('deposit','purchase','bill') loop
    v_before := public._fund_balance(t.user_name);
    insert into public.fund_tx(user_name, amount_fils, kind, ref_id, memo, created_by)
      values (t.user_name, -t.amount_fils, 'reversal', p_ref, 'Reversed: ' || t.memo, v_a.name);
    perform public._notify(t.user_name, 'reversal', 'Reversed: ' || t.memo,
      'Reason: ' || p_reason || '. ' || case when t.amount_fils < 0 then public._jd(-t.amount_fils) || ' back to you'
                                             else public._jd(t.amount_fils) || ' taken back' end
      || '. New balance: ' || public._jd(public._fund_balance(t.user_name)) || '.',
      -t.amount_fils, p_ref, 'fund.html#wallet');
    perform public._fund_owed_check(t.user_name, v_before);
    v_cnt := v_cnt + 1;
  end loop;
  if v_cnt = 0 then raise exception 'Nothing to reverse'; end if;
  update public.fund_purchases set reversed_at = now(), reversed_by = v_a.name, reverse_reason = p_reason where id = p_ref;
  update public.fund_proposals set status = 'approved', purchase_id = null where purchase_id = p_ref;
  update public.fund_bill_charges set status = 'reversed', note = p_reason where id = p_ref;
  update public.fund_deposits set status = 'reversed', reason = p_reason where id = p_ref;
  return v_cnt;
end; $$;

-- ------------------------------------------------------------
-- 6) One call that loads everything a fund page needs
-- ------------------------------------------------------------
create or replace function public.fund_dashboard(p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_u public.users; v_today date; v_period date; v_out jsonb; v_up jsonb := '[]'::jsonb;
  bl record; v_est bigint; v_due date; v_next date; v_c public.fund_bill_charges;
begin
  v_u := public._fund_user(p_name, p_pin);
  perform public._fund_tick();
  v_today := public._fund_today();
  v_period := date_trunc('month', v_today)::date;

  -- upcoming money out in the next 30 days (for the forecast)
  for bl in select * from public.fund_bills where active loop
    v_est := public._fund_bill_estimate(bl.id);
    select * into v_c from public.fund_bill_charges where bill_id = bl.id and period = v_period;
    if v_c.id is not null and v_c.status = 'due' then
      v_up := v_up || jsonb_build_object('kind','bill','label', bl.name, 'date', v_period + (bl.due_day - 1),
                'total_fils', coalesce(v_c.suggested_fils, v_est), 'estimated', bl.amount_fils is null, 'waiting', true);
    elsif v_c.id is null and bl.due_day > extract(day from v_today) then
      v_up := v_up || jsonb_build_object('kind','bill','label', bl.name, 'date', v_period + (bl.due_day - 1),
                'total_fils', v_est, 'estimated', bl.amount_fils is null, 'waiting', false);
    end if;
    v_next := (v_period + interval '1 month')::date + (bl.due_day - 1);
    if v_next <= v_today + 30 then
      v_up := v_up || jsonb_build_object('kind','bill','label', bl.name, 'date', v_next,
                'total_fils', v_est, 'estimated', bl.amount_fils is null, 'waiting', false);
    end if;
  end loop;
  v_up := v_up || coalesce((select jsonb_agg(jsonb_build_object('kind','wishlist','label', title, 'date', null,
                'total_fils', price_fils, 'estimated', false, 'waiting', false))
              from public.fund_proposals where status = 'approved'), '[]'::jsonb);

  v_out := jsonb_build_object(
    'today', v_today,
    'me', jsonb_build_object('name', v_u.name, 'role', v_u.fund_role, 'desk_id', v_u.desk_id,
            'balance_fils', public._fund_balance(v_u.name),
            'pending_fils', (select coalesce(sum(amount_fils),0) from public.fund_deposits where user_name = v_u.name and status = 'pending')),
    'desks', to_jsonb(public._fund_desks()),
    'members', coalesce((select jsonb_agg(jsonb_build_object('name', u.name, 'desk_id', u.desk_id,
                  'balance_fils', public._fund_balance(u.name),
                  'pending_fils', (select coalesce(sum(amount_fils),0) from public.fund_deposits d where d.user_name = u.name and d.status = 'pending'))
                  order by u.name) from public.users u where u.fund_role = 'member'), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(name order by name) from public.users where fund_role = 'admin'), '[]'::jsonb),
    'tx', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from
              (select id, amount_fils, kind, ref_id, memo, created_at from public.fund_tx
                where user_name = v_u.name order by created_at desc limit 300) t), '[]'::jsonb),
    'deposits', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from
              (select * from public.fund_deposits where user_name = v_u.name order by created_at desc limit 30) d), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from
              (select id, kind, title, body, amount_fils, link, read_at, created_at from public.fund_notifications
                where user_name = v_u.name order by created_at desc limit 80) n), '[]'::jsonb),
    'unread', (select count(*) from public.fund_notifications where user_name = v_u.name and read_at is null),
    'bills', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'amount_fils', b.amount_fils,
                 'due_day', b.due_day, 'active', b.active, 'estimate_fils', public._fund_bill_estimate(b.id)) order by b.due_day, b.name)
                 from public.fund_bills b), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(x order by x->>'period' desc, x->>'bill_name') from
              (select jsonb_build_object('id', c.id, 'bill_id', c.bill_id, 'bill_name', b.name, 'period', c.period,
                 'suggested_fils', c.suggested_fils, 'amount_fils', c.amount_fils, 'status', c.status, 'note', c.note,
                 'decided_at', c.decided_at) as x
                 from public.fund_bill_charges c join public.fund_bills b on b.id = c.bill_id
                 where c.period >= (v_period - interval '12 months')) s), '[]'::jsonb),
    'proposals', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'price_fils', p.price_fils,
                 'link', p.link, 'reason', p.reason, 'proposed_by', p.proposed_by, 'status', p.status,
                 'deadline', p.deadline, 'parent_id', p.parent_id, 'created_at', p.created_at, 'closed_at', p.closed_at,
                 'votes', coalesce((select jsonb_agg(jsonb_build_object('voter', v.voter, 'approve', v.approve, 'comment', v.comment, 'at', v.created_at))
                                     from public.fund_votes v where v.proposal_id = p.id), '[]'::jsonb))
                 order by p.created_at desc)
                 from (select * from public.fund_proposals order by created_at desc limit 80) p), '[]'::jsonb),
    'upcoming', v_up,
    'monthly_fils', coalesce((select sum(public._fund_bill_estimate(id)) from public.fund_bills where active), 0),
    'statements', coalesce((select jsonb_agg(to_jsonb(s) order by s.period desc) from public.fund_statements s where s.user_name = v_u.name), '[]'::jsonb)
  );

  if v_u.fund_role = 'admin' then
    v_out := v_out || jsonb_build_object('admin', jsonb_build_object(
      'pending_deposits', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at)
                            from public.fund_deposits d where d.status = 'pending'), '[]'::jsonb),
      'candidates', coalesce((select jsonb_agg(name order by name) from public.users where fund_role is null), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(ev.e order by ev.e->>'at' desc) from (
        select u.e from (
          select jsonb_build_object('ref', p.id, 'type', 'purchase', 'label', p.title, 'total_fils', p.total_fils,
                   'at', p.created_at, 'by', p.created_by, 'reversed', p.reversed_at is not null, 'reason', p.reverse_reason) e
            from public.fund_purchases p
          union all
          select jsonb_build_object('ref', c.id, 'type', 'bill', 'label', b.name || ' · ' || to_char(c.period, 'FMMonth YYYY'),
                   'total_fils', c.amount_fils, 'at', c.decided_at, 'by', c.decided_by, 'reversed', c.status = 'reversed', 'reason', case when c.status = 'reversed' then c.note end)
            from public.fund_bill_charges c join public.fund_bills b on b.id = c.bill_id where c.status in ('charged','reversed')
          union all
          select jsonb_build_object('ref', d.id, 'type', 'deposit', 'label', 'Deposit from ' || d.user_name || ' (' || public._fund_method(d.method) || ')',
                   'total_fils', d.amount_fils, 'at', d.decided_at, 'by', d.decided_by, 'reversed', d.status = 'reversed', 'reason', case when d.status = 'reversed' then d.reason end)
            from public.fund_deposits d where d.status in ('approved','reversed')
        ) u order by u.e->>'at' desc limit 150) ev), '[]'::jsonb)
    ));
  end if;
  return v_out;
end; $$;

-- ------------------------------------------------------------
-- 7) Permissions: the anon key may call the public functions only.
-- ------------------------------------------------------------
revoke all on function public._fund_desks() from public, anon, authenticated;
revoke all on function public._fund_today() from public, anon, authenticated;
revoke all on function public._fund_ts(date) from public, anon, authenticated;
revoke all on function public._jd(bigint) from public, anon, authenticated;
revoke all on function public._fund_method(text) from public, anon, authenticated;
revoke all on function public._fils(numeric,text) from public, anon, authenticated;
revoke all on function public._fund_member_count() from public, anon, authenticated;
revoke all on function public._fund_bill_estimate(uuid) from public, anon, authenticated;
revoke all on function public._fund_split(bigint,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public._fund_tick(boolean) from public, anon, authenticated;
revoke all on function public._notify(text,text,text,text,bigint,uuid,text) from public, anon, authenticated;
revoke all on function public._notify_role(text,text,text,text,bigint,uuid,text,text) from public, anon, authenticated;
revoke all on function public._fund_owed_check(text,bigint) from public, anon, authenticated;
revoke all on function public._fund_check_unanimous(uuid) from public, anon, authenticated;
revoke all on function public._fund_balance(text) from public, anon, authenticated;
revoke all on function public._fund_user(text,text) from public, anon, authenticated;
revoke all on function public._fund_admin(text,text) from public, anon, authenticated;

grant execute on function
  public.fund_dashboard(text,text),
  public.fund_unread(text,text),
  public.fund_mark_read(text,text,uuid[]),
  public.fund_request_deposit(text,text,numeric,text,text),
  public.fund_cancel_deposit(text,text,uuid),
  public.fund_propose(text,text,text,numeric,text,text,int,uuid),
  public.fund_vote(text,text,uuid,boolean,text),
  public.fund_withdraw_proposal(text,text,uuid),
  public.fund_add_member(text,text,text,text),
  public.fund_set_desk(text,text,text,text),
  public.fund_remove_member(text,text,text),
  public.fund_decide_deposit(text,text,uuid,boolean,text),
  public.fund_record_purchase(text,text,text,numeric,text,uuid),
  public.fund_save_bill(text,text,uuid,text,numeric,int,boolean),
  public.fund_charge_bill(text,text,uuid,numeric),
  public.fund_skip_bill(text,text,uuid,text),
  public.fund_reverse(text,text,uuid,text)
  to anon;

-- ------------------------------------------------------------
-- 8) Make your admin. Replace the name with the admin's username
--    (the account must already exist), then run just this line:
--
--    update public.users set fund_role = 'admin', desk_id = null where name = 'Admin';
--
--    The admin then adds the six members (and their desks) from admin.html.
--    (Or run the separate seed_accounts.sql you were given, which creates
--    all seven accounts and seats everyone. Keep that file out of git.)
-- ------------------------------------------------------------
