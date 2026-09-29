-- Vistralo-only schema. Accounts are provisioned explicitly; clients cannot grant roles.
create table public.vistralo_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  display_name text not null default '', workspace_name text not null default 'My workspace',
  created_at timestamptz not null default now()
);
alter table public.vistralo_accounts enable row level security;
grant select on public.vistralo_accounts to authenticated;
grant update (display_name, workspace_name) on public.vistralo_accounts to authenticated;
grant all on public.vistralo_accounts to service_role;
create policy account_read on public.vistralo_accounts for select to authenticated using (user_id=(select auth.uid()));
create policy account_preferences on public.vistralo_accounts for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.vistralo_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.vistralo_accounts(user_id) on delete cascade,
  document jsonb not null check(jsonb_typeof(document)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index vistralo_projects_owner on public.vistralo_projects(owner_id,updated_at desc);
alter table public.vistralo_projects enable row level security;
grant select,insert,update,delete on public.vistralo_projects to authenticated,service_role;
create policy project_read on public.vistralo_projects for select to authenticated using(owner_id=(select auth.uid()));
create policy project_create on public.vistralo_projects for insert to authenticated with check(owner_id=(select auth.uid()));
create policy project_update on public.vistralo_projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy project_delete on public.vistralo_projects for delete to authenticated using(owner_id=(select auth.uid()) and document->>'trashed'='true');

create table public.vistralo_jobs (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.vistralo_projects(id) on delete cascade,
 owner_id uuid not null references public.vistralo_accounts(user_id), kind text not null check(kind in ('website','probe','render')),
 payload jsonb not null default '{}',state text not null default 'queued' check(state in ('queued','processing','ready','failed','cancelled')),
 error text, created_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz
);
create index vistralo_jobs_owner on public.vistralo_jobs(owner_id);
create index vistralo_jobs_project on public.vistralo_jobs(project_id);
create unique index vistralo_one_active_job on public.vistralo_jobs(project_id) where state in ('queued','processing');
alter table public.vistralo_jobs enable row level security;
grant select,insert on public.vistralo_jobs to authenticated;
grant all on public.vistralo_jobs to service_role;
create policy jobs_read on public.vistralo_jobs for select to authenticated using(owner_id=(select auth.uid()));
create policy jobs_create on public.vistralo_jobs for insert to authenticated with check(owner_id=(select auth.uid()) and state='queued' and exists(select 1 from public.vistralo_projects p where p.id=project_id and p.owner_id=(select auth.uid()) and coalesce(p.document->>'trashed','false')='false'));

create table public.vistralo_runtime (id text primary key, heartbeat_at timestamptz not null, capabilities jsonb not null default '{}');
alter table public.vistralo_runtime enable row level security;
grant select on public.vistralo_runtime to authenticated;
grant all on public.vistralo_runtime to service_role;
create policy runtime_read on public.vistralo_runtime for select to authenticated using(exists(select 1 from public.vistralo_accounts where user_id=(select auth.uid())));

create table public.vistralo_shares (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.vistralo_projects(id) on delete cascade,
 owner_id uuid not null references public.vistralo_accounts(user_id), token_hash text not null unique,
 expires_at timestamptz not null,revoked boolean not null default false,created_at timestamptz not null default now()
);
create index vistralo_shares_owner on public.vistralo_shares(owner_id);
create index vistralo_shares_project on public.vistralo_shares(project_id);
alter table public.vistralo_shares enable row level security;
grant select,insert on public.vistralo_shares to authenticated;
grant update(revoked) on public.vistralo_shares to authenticated;
grant all on public.vistralo_shares to service_role;
create policy shares_read on public.vistralo_shares for select to authenticated using(owner_id=(select auth.uid()));
create policy shares_create on public.vistralo_shares for insert to authenticated with check(owner_id=(select auth.uid()) and expires_at > now() and expires_at <= now()+interval '30 days' and exists(select 1 from public.vistralo_projects p where p.id=project_id and p.owner_id=(select auth.uid()) and coalesce(p.document->>'trashed','false')='false'));
create policy shares_revoke on public.vistralo_shares for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and revoked=true);

insert into storage.buckets(id,name,public,file_size_limit) values('vistralo-media','vistralo-media',false,52428800);
create policy media_read on storage.objects for select to authenticated using(bucket_id='vistralo-media' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.vistralo_accounts where user_id=(select auth.uid())));
create policy media_insert on storage.objects for insert to authenticated with check(bucket_id='vistralo-media' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.vistralo_projects where id::text=(storage.foldername(name))[2] and owner_id=(select auth.uid()) and coalesce(document->>'trashed','false')='false'));
create policy media_delete on storage.objects for delete to authenticated using(bucket_id='vistralo-media' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.vistralo_accounts where user_id=(select auth.uid())));

-- Only the trusted worker can claim a queued job. SKIP LOCKED prevents duplicate work.
create function public.vistralo_claim_job() returns setof public.vistralo_jobs language sql security invoker set search_path='' as $$
 update public.vistralo_jobs set state='processing',started_at=now()
 where id=(select id from public.vistralo_jobs where state='queued' order by created_at for update skip locked limit 1) returning *;
$$;
revoke all on function public.vistralo_claim_job() from public,anon,authenticated;
grant execute on function public.vistralo_claim_job() to service_role;
