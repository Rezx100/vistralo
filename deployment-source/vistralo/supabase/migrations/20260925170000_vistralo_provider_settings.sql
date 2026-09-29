-- Provider credentials and narration settings.
-- Browsers encrypt API keys to the worker's public key, so the plaintext never
-- reaches the database. Ciphertext columns are write-only for clients.
create table public.vistralo_provider_settings (
  owner_id uuid primary key references public.vistralo_accounts(user_id) on delete cascade,
  openai_cipher text,
  heygen_cipher text,
  voice_id text not null default '',
  cost_cap_usd numeric(6,2) not null default 1.00 check (cost_cap_usd > 0 and cost_cap_usd <= 50),
  openai_configured boolean generated always as (openai_cipher is not null) stored,
  heygen_configured boolean generated always as (heygen_cipher is not null) stored,
  updated_at timestamptz not null default now()
);
alter table public.vistralo_provider_settings enable row level security;

-- Supabase default privileges grant new tables to authenticated wholesale, which
-- would expose the ciphertext columns. Revoke first, then grant per column.
revoke all on public.vistralo_provider_settings from authenticated, anon, public;
grant select (owner_id, voice_id, cost_cap_usd, openai_configured, heygen_configured, updated_at)
  on public.vistralo_provider_settings to authenticated;
grant all on public.vistralo_provider_settings to service_role;

-- Clients never write this table directly: ON CONFLICT would need SELECT on the
-- ciphertext columns, which must stay unreadable. Writes go through the function below.
create or replace function public.vistralo_save_provider_settings(
  p_openai text, p_heygen text, p_voice text, p_cap numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.vistralo_accounts where user_id = uid) then
    raise exception 'Sign in to change provider settings';
  end if;
  if p_cap is null or p_cap <= 0 or p_cap > 50 then
    raise exception 'Set a per-job cost cap between 0.01 and 50';
  end if;
  if coalesce(length(p_openai), 0) > 4000 or coalesce(length(p_heygen), 0) > 4000 then
    raise exception 'Encrypted key is unexpectedly large';
  end if;

  insert into public.vistralo_provider_settings (owner_id, voice_id, cost_cap_usd, openai_cipher, heygen_cipher, updated_at)
  values (uid, coalesce(p_voice, ''), p_cap, nullif(p_openai, ''), nullif(p_heygen, ''), now())
  on conflict (owner_id) do update set
    voice_id = coalesce(p_voice, ''),
    cost_cap_usd = p_cap,
    -- an empty value means "keep the stored key"
    openai_cipher = coalesce(nullif(p_openai, ''), vistralo_provider_settings.openai_cipher),
    heygen_cipher = coalesce(nullif(p_heygen, ''), vistralo_provider_settings.heygen_cipher),
    updated_at = now();
end;
$$;
revoke all on function public.vistralo_save_provider_settings(text, text, text, numeric) from public, anon;
grant execute on function public.vistralo_save_provider_settings(text, text, text, numeric) to authenticated;

create policy provider_settings_read on public.vistralo_provider_settings
  for select to authenticated using (owner_id = (select auth.uid()));
-- No insert/update policies: clients write only through
-- vistralo_save_provider_settings, which scopes every write to auth.uid().

-- The worker signs in as an admin and needs the ciphertext it alone can decrypt.
create or replace function public.vistralo_worker_secrets(target uuid)
returns table (openai_cipher text, heygen_cipher text, voice_id text, cost_cap_usd numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vistralo_accounts where user_id = auth.uid() and role = 'admin') then
    raise exception 'Admin access is required';
  end if;
  return query
    select s.openai_cipher, s.heygen_cipher, s.voice_id, s.cost_cap_usd
    from public.vistralo_provider_settings s where s.owner_id = target;
end;
$$;
revoke all on function public.vistralo_worker_secrets(uuid) from public, anon;
grant execute on function public.vistralo_worker_secrets(uuid) to authenticated;

-- The worker publishes an RSA public key; only the worker host holds the private key.
create table public.vistralo_worker_keys (
  id text primary key,
  public_key text not null,
  algorithm text not null default 'RSA-OAEP-256',
  updated_at timestamptz not null default now()
);
alter table public.vistralo_worker_keys enable row level security;
revoke all on public.vistralo_worker_keys from authenticated, anon, public;
grant select, insert, update on public.vistralo_worker_keys to authenticated;
grant all on public.vistralo_worker_keys to service_role;

create policy worker_keys_read on public.vistralo_worker_keys
  for select to authenticated
  using (exists (select 1 from public.vistralo_accounts where user_id = (select auth.uid())));
create policy worker_keys_admin_write on public.vistralo_worker_keys
  for insert to authenticated
  with check (exists (select 1 from public.vistralo_accounts where user_id = (select auth.uid()) and role = 'admin'));
create policy worker_keys_admin_update on public.vistralo_worker_keys
  for update to authenticated
  using (exists (select 1 from public.vistralo_accounts where user_id = (select auth.uid()) and role = 'admin'));

-- Narration adds two more stages to the job pipeline.
alter table public.vistralo_jobs drop constraint vistralo_jobs_kind_check;
alter table public.vistralo_jobs add constraint vistralo_jobs_kind_check
  check (kind in ('website','probe','render','analysis','narrate'));
