do $$
declare
  legacy_task record;
  canonical_task_id uuid;
begin
  for legacy_task in
    select id, sponsor_event_id, status, input_values
    from public.tasks
    where title = 'Confirm 10 meetings'
  loop
    select id into canonical_task_id
    from public.tasks
    where sponsor_event_id = legacy_task.sponsor_event_id
      and title = 'Confirm 10 Private Meetings'
    limit 1;

    if canonical_task_id is not null then
      update public.task_upload_attempts
      set task_id = canonical_task_id
      where task_id = legacy_task.id;

      update public.tasks
      set status = case when status = 'Complete' or legacy_task.status = 'Complete' then 'Complete' else status end,
          input_values = coalesce(input_values, '{}'::jsonb) || coalesce(legacy_task.input_values, '{}'::jsonb)
      where id = canonical_task_id;

      delete from public.tasks where id = legacy_task.id;
    else
      update public.tasks
      set title = 'Confirm 10 Private Meetings', category = '10 Meetings'
      where id = legacy_task.id;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
