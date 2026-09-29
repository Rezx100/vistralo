-- Existing default grants can include table-wide UPDATE, which would override column grants.
revoke all on public.vistralo_accounts, public.vistralo_projects, public.vistralo_jobs, public.vistralo_runtime, public.vistralo_shares from anon, authenticated;
grant select on public.vistralo_accounts to authenticated;
grant update(display_name,workspace_name) on public.vistralo_accounts to authenticated;
grant select,insert,update,delete on public.vistralo_projects to authenticated;
grant select,insert on public.vistralo_jobs to authenticated;
grant select on public.vistralo_runtime to authenticated;
grant select,insert on public.vistralo_shares to authenticated;
grant update(revoked) on public.vistralo_shares to authenticated;
