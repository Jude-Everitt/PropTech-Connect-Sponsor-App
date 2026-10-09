revoke insert, update, delete on public.tasks from authenticated;
grant select on public.tasks to authenticated;

drop policy if exists "Admins view and edit all tasks" on public.tasks;
drop policy if exists "Admins view all tasks" on public.tasks;
create policy "Admins view all tasks"
  on public.tasks for select to authenticated
  using (public.is_admin());

drop policy if exists "Sponsors update their tasks" on public.tasks;
drop policy if exists "Sponsors update their own submissions" on public.tasks;

notify pgrst, 'reload schema';