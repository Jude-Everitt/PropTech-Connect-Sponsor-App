drop policy if exists "Authenticated users can view events" on public.events;
drop policy if exists "Admins and linked sponsors can view events" on public.events;
create policy "Admins and linked sponsors can view events"
  on public.events for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.sponsor_events se
      join public.user_profiles up on up.sponsor_id = se.sponsor_id
      where se.event_id = events.id
        and up.id = (select auth.uid())
        and up.role = 'SPONSOR'
    )
  );

drop policy if exists "Authenticated users can view sponsors" on public.sponsors;
drop policy if exists "Admins and sponsors can view own sponsor" on public.sponsors;
create policy "Admins and sponsors can view own sponsor"
  on public.sponsors for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.user_profiles up
      where up.id = (select auth.uid())
        and up.role = 'SPONSOR'
        and up.sponsor_id = sponsors.id
    )
  );

drop policy if exists "Sponsors update their tasks" on public.tasks;
drop policy if exists "Sponsors update their own submissions" on public.tasks;
create policy "Sponsors update their own submissions"
  on public.tasks for update to authenticated
  using (
    exists (
      select 1
      from public.sponsor_events se
      join public.user_profiles up on up.sponsor_id = se.sponsor_id
      where se.id = tasks.sponsor_event_id
        and up.id = (select auth.uid())
        and up.role = 'SPONSOR'
    )
  )
  with check (
    exists (
      select 1
      from public.sponsor_events se
      join public.user_profiles up on up.sponsor_id = se.sponsor_id
      where se.id = tasks.sponsor_event_id
        and up.id = (select auth.uid())
        and up.role = 'SPONSOR'
    )
  );

create or replace function public.enforce_sponsor_task_submission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - array['response_text', 'input_values', 'file_url', 'file_name', 'file_id'])
     is distinct from
     (to_jsonb(old) - array['response_text', 'input_values', 'file_url', 'file_name', 'file_id']) then
    raise exception 'Sponsors may only update their submission fields';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_sponsor_task_submission_fields on public.tasks;
create trigger enforce_sponsor_task_submission_fields
  before update on public.tasks
  for each row execute function public.enforce_sponsor_task_submission_fields();

notify pgrst, 'reload schema';
