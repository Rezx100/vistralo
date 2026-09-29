-- Owners cannot update jobs directly (only the admin worker can), so cancelling goes
-- through this function, which only ever moves the caller's own unfinished jobs to cancelled.
create or replace function public.vistralo_cancel_jobs(p_project uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n integer;
begin
  if uid is null then
    raise exception 'Sign in to cancel a job';
  end if;
  update public.vistralo_jobs
    set state = 'cancelled', finished_at = now(), progress = '{}'
    where project_id = p_project and owner_id = uid and state in ('queued', 'processing');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.vistralo_cancel_jobs(uuid) from public, anon;
grant execute on function public.vistralo_cancel_jobs(uuid) to authenticated;
