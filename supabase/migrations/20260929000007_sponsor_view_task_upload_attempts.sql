drop policy if exists "Sponsors can view their task upload attempts" on public.task_upload_attempts;
create policy "Sponsors can view their task upload attempts"
  on public.task_upload_attempts for select to authenticated
  using (
    exists (
      select 1
      from public.user_profiles up
      where up.id = (select auth.uid())
        and up.role = 'SPONSOR'
        and up.sponsor_id = task_upload_attempts.sponsor_id
    )
  );

notify pgrst, 'reload schema';