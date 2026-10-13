-- Plans, Paddle customers and subscriptions, monthly usage and plan limits.
-- Applying this migration changes nothing for existing accounts: limits are only
-- enforced once vistralo_billing_config.enforce_limits is true, and sign-up only
-- opens once signup_enabled is true. Both start false. See docs/BILLING.md.

-- One row of switches. Only the service role (SQL editor, migrations) can change it.
create table public.vistralo_billing_config (
  id boolean primary key default true check (id),
  enforce_limits boolean not null default false,
  signup_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.vistralo_billing_config default values;
alter table public.vistralo_billing_config enable row level security;
revoke all on public.vistralo_billing_config from anon, authenticated, public;
grant select on public.vistralo_billing_config to authenticated;
grant all on public.vistralo_billing_config to service_role;
create policy billing_config_read on public.vistralo_billing_config for select to authenticated using (true);

-- A null limit means "no limit". web/billing/plans.ts mirrors these rows for the
-- pricing page; tests/billing.test.cjs fails if the two drift apart.
create table public.vistralo_plans (
  id text primary key check (id ~ '^[a-z]+$'),
  name text not null,
  rank integer not null unique,
  max_projects integer check (max_projects > 0),
  monthly_jobs integer check (monthly_jobs > 0),
  max_source_minutes integer check (max_source_minutes > 0),
  share_days integer not null check (share_days between 1 and 30)
);
insert into public.vistralo_plans (id, name, rank, max_projects, monthly_jobs, max_source_minutes, share_days) values
  ('free', 'Free', 0, 5, 3, 5, 7),
  ('pro', 'Pro', 1, 100, 60, 30, 30),
  ('studio', 'Studio', 2, null, 300, 120, 30);
alter table public.vistralo_plans enable row level security;
revoke all on public.vistralo_plans from anon, authenticated, public;
grant select on public.vistralo_plans to authenticated;
grant all on public.vistralo_plans to service_role;
create policy plans_read on public.vistralo_plans for select to authenticated using (true);

-- Written only by the webhook function (service role). Owners can read their own rows.
create table public.vistralo_billing_customers (
  user_id uuid primary key references public.vistralo_accounts(user_id) on delete cascade,
  paddle_customer_id text not null unique check (paddle_customer_id ~ '^ctm_[a-z0-9]+$'),
  created_at timestamptz not null default now()
);
alter table public.vistralo_billing_customers enable row level security;
revoke all on public.vistralo_billing_customers from anon, authenticated, public;
grant select on public.vistralo_billing_customers to authenticated;
grant all on public.vistralo_billing_customers to service_role;
create policy billing_customers_read on public.vistralo_billing_customers for select to authenticated using (user_id = (select auth.uid()));

-- ON DELETE RESTRICT on purpose: deleting an account that still has a subscription row
-- would leave Paddle billing a customer who no longer exists here. Cancel in Paddle first.
create table public.vistralo_billing_subscriptions (
  paddle_subscription_id text primary key check (paddle_subscription_id ~ '^sub_[a-z0-9]+$'),
  user_id uuid not null references public.vistralo_accounts(user_id) on delete restrict,
  paddle_customer_id text not null check (paddle_customer_id ~ '^ctm_[a-z0-9]+$'),
  -- Null when the subscription's price is not one of the configured plan prices: it grants nothing.
  plan_id text references public.vistralo_plans(id),
  price_id text,
  status text not null check (status in ('trialing', 'active', 'past_due', 'paused', 'canceled')),
  billing_interval text check (billing_interval in ('day', 'week', 'month', 'year')),
  current_period_end timestamptz,
  next_billed_at timestamptz,
  scheduled_action text check (scheduled_action in ('cancel', 'pause', 'resume')),
  scheduled_at timestamptz,
  resume_at timestamptz,
  paused_at timestamptz,
  canceled_at timestamptz,
  last_payment_status text check (last_payment_status in ('completed', 'failed')),
  last_payment_at timestamptz,
  -- When Paddle says the newest applied event happened; older events are ignored.
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vistralo_billing_subscriptions_user on public.vistralo_billing_subscriptions(user_id);
alter table public.vistralo_billing_subscriptions enable row level security;
revoke all on public.vistralo_billing_subscriptions from anon, authenticated, public;
grant select on public.vistralo_billing_subscriptions to authenticated;
grant all on public.vistralo_billing_subscriptions to service_role;
create policy billing_subscriptions_read on public.vistralo_billing_subscriptions for select to authenticated using (user_id = (select auth.uid()));

-- Every verified webhook, once. No client can read or write it.
create table public.vistralo_billing_events (
  event_id text primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text
);
alter table public.vistralo_billing_events enable row level security;
revoke all on public.vistralo_billing_events from anon, authenticated, public;
grant all on public.vistralo_billing_events to service_role;

-- AI walkthrough and website jobs started per calendar month (UTC).
create table public.vistralo_billing_usage (
  user_id uuid not null references public.vistralo_accounts(user_id) on delete cascade,
  period_start date not null,
  jobs integer not null default 0 check (jobs >= 0),
  primary key (user_id, period_start)
);
alter table public.vistralo_billing_usage enable row level security;
revoke all on public.vistralo_billing_usage from anon, authenticated, public;
grant select on public.vistralo_billing_usage to authenticated;
grant all on public.vistralo_billing_usage to service_role;
create policy billing_usage_read on public.vistralo_billing_usage for select to authenticated using (user_id = (select auth.uid()));

create function public.vistralo_period_start(p_at timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select (date_trunc('month', p_at at time zone 'utc'))::date;
$$;

-- Administrators (the owner and the worker's account) are never limited.
create function public.vistralo_limits_apply(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enforce_limits from public.vistralo_billing_config), false)
    and not exists (select 1 from public.vistralo_accounts where user_id = p_user and role = 'admin');
$$;

-- A subscription grants its plan while Paddle reports it trialing, active or past_due
-- (past_due: a payment failed and Paddle is still retrying). Paused and canceled grant nothing.
create function public.vistralo_effective_plan(p_user uuid) returns public.vistralo_plans
language sql stable security definer set search_path = '' as $$
  select p.* from public.vistralo_plans p
  where p.id = coalesce((
    select s.plan_id from public.vistralo_billing_subscriptions s
    join public.vistralo_plans sp on sp.id = s.plan_id
    where s.user_id = p_user and s.status in ('trialing', 'active', 'past_due')
    order by sp.rank desc limit 1
  ), 'free');
$$;

create function public.vistralo_jobs_used(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select jobs from public.vistralo_billing_usage
    where user_id = p_user and period_start = public.vistralo_period_start()), 0);
$$;

create function public.vistralo_active_projects(p_user uuid, p_except uuid default null) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.vistralo_projects
  where owner_id = p_user and id is distinct from p_except
    and coalesce(document->>'trashed', 'false') = 'false';
$$;

create function public.vistralo_project_slot_free(p_user uuid, p_except uuid default null) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare cap integer;
begin
  if not public.vistralo_limits_apply(p_user) then return true; end if;
  select max_projects into cap from public.vistralo_effective_plan(p_user);
  return cap is null or public.vistralo_active_projects(p_user, p_except) < cap;
end;
$$;

-- These three are called from row-level security policies, so signed-in users must be
-- able to execute them. They only ever answer for the caller (auth.uid()).
create function public.vistralo_can_create_project() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.vistralo_project_slot_free((select auth.uid()));
$$;

create function public.vistralo_can_queue_job(p_kind text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cap integer;
begin
  -- Probes and trim renders are housekeeping; only AI walkthroughs and website analyses count.
  if p_kind not in ('website', 'narrate') then return true; end if;
  if not public.vistralo_limits_apply(uid) then return true; end if;
  select monthly_jobs into cap from public.vistralo_effective_plan(uid);
  return cap is null or public.vistralo_jobs_used(uid) < cap;
end;
$$;

create function public.vistralo_share_days() returns integer
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); days integer;
begin
  if not public.vistralo_limits_apply(uid) then return 30; end if;
  select share_days into days from public.vistralo_effective_plan(uid);
  return coalesce(days, 7);
end;
$$;

revoke all on function public.vistralo_period_start(timestamptz) from public, anon, authenticated;
revoke all on function public.vistralo_limits_apply(uuid) from public, anon, authenticated;
revoke all on function public.vistralo_effective_plan(uuid) from public, anon, authenticated;
revoke all on function public.vistralo_jobs_used(uuid) from public, anon, authenticated;
revoke all on function public.vistralo_active_projects(uuid, uuid) from public, anon, authenticated;
revoke all on function public.vistralo_project_slot_free(uuid, uuid) from public, anon, authenticated;
revoke all on function public.vistralo_can_create_project() from public, anon;
revoke all on function public.vistralo_can_queue_job(text) from public, anon;
revoke all on function public.vistralo_share_days() from public, anon;
grant execute on function public.vistralo_can_create_project() to authenticated;
grant execute on function public.vistralo_can_queue_job(text) to authenticated;
grant execute on function public.vistralo_share_days() to authenticated;

-- Restrictive policies narrow whatever the existing permissive policies allow,
-- so they add the plan limit without rewriting those policies.
create policy project_plan_limit on public.vistralo_projects as restrictive
  for insert to authenticated with check (public.vistralo_can_create_project());
create policy jobs_plan_limit on public.vistralo_jobs as restrictive
  for insert to authenticated with check (public.vistralo_can_queue_job(kind));
-- An hour of slack: the browser computes the expiry from its own clock.
create policy shares_plan_limit on public.vistralo_shares as restrictive
  for insert to authenticated
  with check (expires_at <= now() + make_interval(days => public.vistralo_share_days()) + interval '1 hour');

-- A policy sees only the new row, so it cannot tell a restore from an edit.
-- Without this, Trash would be a way round the project limit.
create function public.vistralo_guard_project_restore() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(old.document->>'trashed', 'false') = 'true'
     and coalesce(new.document->>'trashed', 'false') = 'false' then
    if not public.vistralo_project_slot_free(new.owner_id, new.id) then
      raise exception 'Your plan''s project limit is reached. Upgrade, or move another project to Trash, before restoring this one.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.vistralo_guard_project_restore() from public, anon, authenticated;
create trigger vistralo_projects_restore_limit before update on public.vistralo_projects
  for each row execute function public.vistralo_guard_project_restore();

-- Usage is counted whether or not limits are enforced, so the number is right on the
-- day enforcement is switched on. A job that fails or is cancelled gives its slot back.
-- Counting must never be the reason a job cannot be queued, hence the handlers.
create function public.vistralo_count_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('website', 'narrate') then
    begin
      insert into public.vistralo_billing_usage (user_id, period_start, jobs)
      values (new.owner_id, public.vistralo_period_start(new.created_at), 1)
      on conflict (user_id, period_start) do update set jobs = public.vistralo_billing_usage.jobs + 1;
    exception when others then
      raise warning 'vistralo_count_job: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
create function public.vistralo_uncount_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('website', 'narrate')
     and old.state in ('queued', 'processing') and new.state in ('failed', 'cancelled') then
    begin
      update public.vistralo_billing_usage set jobs = greatest(jobs - 1, 0)
      where user_id = new.owner_id and period_start = public.vistralo_period_start(new.created_at);
    exception when others then
      raise warning 'vistralo_uncount_job: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.vistralo_count_job() from public, anon, authenticated;
revoke all on function public.vistralo_uncount_job() from public, anon, authenticated;
create trigger vistralo_jobs_count after insert on public.vistralo_jobs
  for each row execute function public.vistralo_count_job();
create trigger vistralo_jobs_uncount after update of state on public.vistralo_jobs
  for each row execute function public.vistralo_uncount_job();

-- What the app shows: the caller's plan, limits, usage and newest subscription.
create function public.vistralo_billing_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  account public.vistralo_accounts;
  plan public.vistralo_plans;
  sub public.vistralo_billing_subscriptions;
begin
  select * into account from public.vistralo_accounts where user_id = uid;
  if not found then raise exception 'Sign in to see your plan'; end if;
  plan := public.vistralo_effective_plan(uid);
  -- A subscription that still grants a plan comes first, then the most recent one.
  select * into sub from public.vistralo_billing_subscriptions
    where user_id = uid
    order by (status in ('trialing', 'active', 'past_due')) desc, occurred_at desc limit 1;
  return jsonb_build_object(
    'enforce', public.vistralo_limits_apply(uid),
    'admin', account.role = 'admin',
    'plan', plan.id,
    'limits', jsonb_build_object(
      'maxProjects', plan.max_projects, 'monthlyJobs', plan.monthly_jobs,
      'maxSourceMinutes', plan.max_source_minutes, 'shareDays', plan.share_days),
    'usage', jsonb_build_object(
      'projects', public.vistralo_active_projects(uid),
      'jobs', public.vistralo_jobs_used(uid),
      'periodStart', public.vistralo_period_start()),
    'customerId', (select paddle_customer_id from public.vistralo_billing_customers where user_id = uid),
    'subscription', case when sub.paddle_subscription_id is null then null else jsonb_build_object(
      'id', sub.paddle_subscription_id, 'plan', sub.plan_id, 'status', sub.status,
      'interval', sub.billing_interval, 'periodEnd', sub.current_period_end,
      'nextBilledAt', sub.next_billed_at, 'scheduledAction', sub.scheduled_action,
      'scheduledAt', sub.scheduled_at, 'resumeAt', sub.resume_at,
      'lastPayment', sub.last_payment_status) end
  );
end;
$$;
revoke all on function public.vistralo_billing_state() from public, anon;
grant execute on function public.vistralo_billing_state() to authenticated;

-- The worker signs in as an administrator and checks an owner's plan before paid work.
create function public.vistralo_worker_entitlement(target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare plan public.vistralo_plans;
begin
  if not exists (select 1 from public.vistralo_accounts where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access is required';
  end if;
  plan := public.vistralo_effective_plan(target);
  return jsonb_build_object(
    'enforce', public.vistralo_limits_apply(target),
    'plan', plan.id, 'planName', plan.name,
    'monthlyJobs', plan.monthly_jobs, 'maxSourceMinutes', plan.max_source_minutes,
    'jobsUsed', public.vistralo_jobs_used(target));
end;
$$;
revoke all on function public.vistralo_worker_entitlement(uuid) from public, anon;
grant execute on function public.vistralo_worker_entitlement(uuid) to authenticated;

-- Webhook side. Returns false when this event was already processed, so a retry is a no-op.
create function public.vistralo_begin_paddle_event(p_event_id text, p_event_type text, p_occurred_at timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
declare done timestamptz;
begin
  insert into public.vistralo_billing_events (event_id, event_type, occurred_at)
  values (p_event_id, p_event_type, p_occurred_at) on conflict (event_id) do nothing;
  select processed_at into done from public.vistralo_billing_events where event_id = p_event_id;
  return done is null;
end;
$$;

create function public.vistralo_finish_paddle_event(p_event_id text, p_outcome text) returns void
language sql security definer set search_path = '' as $$
  update public.vistralo_billing_events set processed_at = now(), outcome = left(p_outcome, 200)
  where event_id = p_event_id;
$$;

-- Applies one subscription event. Paddle does not guarantee delivery order, so an
-- event older than the one already stored is ignored.
create function public.vistralo_apply_paddle_subscription(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  sub_id text := p->>'subscriptionId';
  customer text := p->>'customerId';
  occurred timestamptz := (p->>'occurredAt')::timestamptz;
  owner uuid;
  claimed uuid;
  changed integer;
begin
  begin
    claimed := (p->>'userId')::uuid;
  exception when others then
    claimed := null;
  end;
  -- The checkout names the account in custom_data; otherwise fall back to what is already known.
  select user_id into owner from public.vistralo_accounts where user_id = claimed;
  if owner is null then
    select user_id into owner from public.vistralo_billing_subscriptions where paddle_subscription_id = sub_id;
  end if;
  if owner is null then
    select user_id into owner from public.vistralo_billing_customers where paddle_customer_id = customer;
  end if;
  if owner is null then return 'no_account'; end if;

  insert into public.vistralo_billing_customers (user_id, paddle_customer_id)
  values (owner, customer) on conflict do nothing;

  insert into public.vistralo_billing_subscriptions as s (
    paddle_subscription_id, user_id, paddle_customer_id, plan_id, price_id, status, billing_interval,
    current_period_end, next_billed_at, scheduled_action, scheduled_at, resume_at, paused_at, canceled_at, occurred_at)
  values (
    sub_id, owner, customer, p->>'planId', p->>'priceId', p->>'status', p->>'interval',
    (p->>'periodEnd')::timestamptz, (p->>'nextBilledAt')::timestamptz, p->>'scheduledAction',
    (p->>'scheduledAt')::timestamptz, (p->>'resumeAt')::timestamptz, (p->>'pausedAt')::timestamptz,
    (p->>'canceledAt')::timestamptz, occurred)
  on conflict (paddle_subscription_id) do update set
    paddle_customer_id = excluded.paddle_customer_id, plan_id = excluded.plan_id, price_id = excluded.price_id,
    status = excluded.status, billing_interval = excluded.billing_interval,
    current_period_end = excluded.current_period_end, next_billed_at = excluded.next_billed_at,
    scheduled_action = excluded.scheduled_action, scheduled_at = excluded.scheduled_at,
    resume_at = excluded.resume_at, paused_at = excluded.paused_at, canceled_at = excluded.canceled_at,
    occurred_at = excluded.occurred_at, updated_at = now()
  where s.occurred_at <= excluded.occurred_at;
  get diagnostics changed = row_count;
  return case when changed = 0 then 'stale' when p->>'planId' is null then 'unknown_price' else 'applied' end;
end;
$$;

create function public.vistralo_apply_paddle_payment(p_subscription_id text, p_status text, p_occurred_at timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.vistralo_billing_subscriptions
    set last_payment_status = p_status, last_payment_at = p_occurred_at, updated_at = now()
    where paddle_subscription_id = p_subscription_id
      and (last_payment_at is null or last_payment_at <= p_occurred_at);
  get diagnostics changed = row_count;
  return case when changed = 0 then 'no_subscription_yet' else 'applied' end;
end;
$$;

revoke all on function public.vistralo_begin_paddle_event(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.vistralo_finish_paddle_event(text, text) from public, anon, authenticated;
revoke all on function public.vistralo_apply_paddle_subscription(jsonb) from public, anon, authenticated;
revoke all on function public.vistralo_apply_paddle_payment(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.vistralo_begin_paddle_event(text, text, timestamptz) to service_role;
grant execute on function public.vistralo_finish_paddle_event(text, text) to service_role;
grant execute on function public.vistralo_apply_paddle_subscription(jsonb) to service_role;
grant execute on function public.vistralo_apply_paddle_payment(text, text, timestamptz) to service_role;

-- Self-serve sign-up: Supabase Auth creates and verifies the user; this gives a verified
-- user a member workspace. It refuses until signup_enabled is switched on.
create function public.vistralo_complete_signup() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); address text; confirmed timestamptz;
begin
  if uid is null then raise exception 'Sign in to finish creating your account'; end if;
  if exists (select 1 from public.vistralo_accounts where user_id = uid) then return; end if;
  if not coalesce((select signup_enabled from public.vistralo_billing_config), false) then
    raise exception 'Sign-up is not open yet. Contact contact@vistralo.com for access.';
  end if;
  select email, email_confirmed_at into address, confirmed from auth.users where id = uid;
  if confirmed is null then raise exception 'Confirm your email address before signing in'; end if;
  insert into public.vistralo_accounts (user_id, role, display_name)
  values (uid, 'member', left(split_part(coalesce(address, ''), '@', 1), 80))
  on conflict (user_id) do nothing;
end;
$$;
revoke all on function public.vistralo_complete_signup() from public, anon;
grant execute on function public.vistralo_complete_signup() to authenticated;
