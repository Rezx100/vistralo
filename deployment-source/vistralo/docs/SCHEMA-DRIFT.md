# Where the migrations and production disagree

Written 13 October 2026 by reading the code. **The live Supabase project was not opened**, so nothing here was confirmed against it. Each row says what the code does and what `supabase/migrations` provides; where production must differ for the app to work as it does today, that is marked "inferred".

Why it matters: a database built from the five migrations in this repository would not run the worker. Anyone who restores from the migrations, starts a staging project, or reviews a new migration (the billing one included) against them is working from an incomplete picture.

Nothing in this document should be applied to production. The last section says how to record the real schema without changing it.

## 1. Certain: the code uses something no migration creates

| # | The code | The migrations | Effect on a database built from the migrations |
| --- | --- | --- | --- |
| 1 | The worker claims work with `db.rpc('vistralo_claim_next_job')` (`scripts/local-admin-worker.cjs`, main loop) | Only `public.vistralo_claim_job()` exists (first migration), and it is granted to `service_role` alone | The worker's first poll fails with "function not found". No job is ever claimed |
| 2 | `vistralo_jobs.progress` is written by the worker (`update({ progress })`, and `progress: {}` when a job ends or is requeued) and read by the app (`web/cloud.ts`, `liveProgress`) | No migration adds a `progress` column | Every progress update fails; the project page never shows a stage, percentage or preview frame |
| 3 | `public.vistralo_cancel_jobs` sets `progress = '{}'` (`20260929042058_vistralo_cancel_jobs.sql`) | Same missing column. PL/pgSQL does not check column names when a function is created, so the migration applies cleanly | Cancel fails at the moment someone presses it |
| 4 | `web/cloud.ts` allows uploads up to 50 GB over the resumable endpoint, and the worker downloads sources up to 50 GB | The bucket is created with `file_size_limit` 52428800, which is 50 MB | Any recording over 50 MB is refused by storage |
| 5 | `web/database.types.ts` lists five tables and one function (`vistralo_claim_job`) | The migrations create thirteen tables and many functions | The file is out of date and nothing imports it. It should be regenerated or removed so nobody trusts it |

## 2. Inferred: production must grant the worker more than the migrations do

The worker signs in with an email and password (`VISTRALO_ADMIN_EMAIL`), so it runs as the `authenticated` role with `role = 'admin'` in `vistralo_accounts`. It does not use the service-role key. The migrations give an administrator no rights beyond any other member, except in three functions (`vistralo_worker_secrets`, `vistralo_worker_entitlement`) and two `vistralo_worker_keys` policies. Yet the worker does all of the following to other people's rows, and production evidently lets it:

| # | What the worker does | What the migrations allow `authenticated` | So production must have (inferred) |
| --- | --- | --- | --- |
| 6 | Reads any owner's project: `from('vistralo_projects').select('*').eq('id', …).eq('owner_id', job.owner_id)` | `project_read`: own rows only | A select policy for administrators |
| 7 | Updates any owner's project document when a job ends or fails | `project_update`: own rows only | An update policy for administrators |
| 8 | Updates `vistralo_jobs` (`progress`, `state`, `error`, `started_at`, `finished_at`) and reads any job's `state` | `select` and `insert` only; there is no `update` grant on the table at all, and `jobs_read` is own rows only | An update grant plus select and update policies for administrators |
| 9 | Upserts its heartbeat into `vistralo_runtime` | `select` only | Insert and update rights for administrators |
| 10 | Uploads outputs to `<owner>/<project>/<job>/…` and signs download links for sources in other owners' folders | `media_insert` and `media_read` require the first folder to equal the caller's own user ID | Storage policies that let an administrator read and write any folder in `vistralo-media` |
| 11 | Calls `vistralo_claim_next_job()` as `authenticated` | See row 1 | A function, most likely `security definer` with an administrator check, that moves the oldest queued job to `processing` |

These six are the ones a security review should look at first: they are the widest permissions in the system and the repository has no record of how they are written.

## 3. Settings that live only in the Supabase dashboard

There is no `supabase/config.toml`, so none of this is recorded in Git:

- Auth: the minimum password length (the app says 12), whether "Confirm email" is on, the allowed redirect addresses (`/auth/callback` and `/?recovery=1` on `app.vistralo.com`), and the email templates.
- Edge Functions: `vistralo-share` is opened by people with no account, so it must be deployed without JWT verification. `docs/BILLING.md` says the same for `vistralo-paddle-webhook`. Neither setting is in the repository.
- Storage: the project-wide file size limit that `web/cloud.ts` describes as "Pro plan with spend cap on".
- Accounts: the first migration says accounts are "provisioned explicitly". There is no script for it, so each account was presumably inserted by hand.

## 4. What this means for the billing migration

`20261013103120_vistralo_billing.sql` was tested against the first four migrations, not against production. It adds restrictive policies and triggers and leaves the existing policies alone, which limits the risk.

Pull request 12 says the migration has since been applied to the live project (it was renamed to the version number production recorded). This document's author did not apply it and has not looked at the result. The three points below were written before that. Since the migration applied without stopping, the third is settled; the first two are things to confirm on the live schema now, before limits are switched on.

1. Its triggers fire on the worker's writes. `vistralo_projects_restore_limit` runs before every project update, including the worker's, and `vistralo_jobs_uncount` runs on every job state change. Both are `security definer` and use the row's `owner_id`, not the caller, so they should behave the same for the worker. Confirm that a real job still finishes: the worker's update path (rows 7 and 8) has to reach these triggers without an error.
2. Its insert policies are restrictive for `authenticated`. If production inserts jobs or projects as an administrator on someone else's behalf, `vistralo_can_queue_job` and `vistralo_can_create_project` will count against the administrator's own plan. `vistralo_limits_apply` exempts administrators, so this should be harmless; confirm it.
3. If production had already held an object with one of the new names, the migration would have stopped at that statement. It uses plain `create`, not `create or replace`, so it cannot have overwritten anything.

## 5. Recording the real schema (read-only)

Any of these captures production without changing it. Run them yourself; an agent must not connect to the live project.

- `supabase db dump --schema public,storage --linked > schema.sql` writes the schema with no data.
- Or, in the SQL editor, read the pieces this document could not see:

```sql
-- Rows 1 and 11: the claim function as it really is
select pg_get_functiondef(p.oid) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'vistralo_claim%';

-- Rows 2 and 3: the columns of the jobs table
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'vistralo_jobs' order by ordinal_position;

-- Rows 6 to 10: every policy on the Vistralo tables and on storage
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename like 'vistralo_%') or (schemaname = 'storage' and tablename = 'objects')
order by 1, 2, 3;

-- Row 8 and 9: table grants
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'vistralo_%' and grantee in ('authenticated', 'anon')
order by 1, 2, 3;

-- Row 4: the bucket
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'vistralo-media';
```

Once the real definitions are known, the fix is a single "baseline" migration that states them (using `if not exists` and `create or replace`, so applying it to production changes nothing), followed by regenerating `web/database.types.ts`. Until then, `supabase/migrations` does not describe what is running.
