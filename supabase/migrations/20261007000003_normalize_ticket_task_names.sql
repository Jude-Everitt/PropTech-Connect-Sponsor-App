do $$
declare
  task_mapping record;
  sponsor_link record;
  winner_id uuid;
  winner_status text;
  winner_quantity integer;
  winner_input_values jsonb;
  has_complete boolean;
  duplicate_task_ids uuid[];
  legacy_titles text[];
begin
  for task_mapping in
    select * from (values
      ('Issue Team Tickets', array['Confirm team ticket allocation', 'Confirm team tickets']::text[]),
      ('Issue RE Tickets', array['Confirm RE ticket allocation', 'Confirm RE tickets']::text[]),
      ('Confirm VIP Attendees', array['Confirm VIP ticket allocation', 'Confirm VIP tickets']::text[])
    ) as mappings(new_title, old_titles)
  loop
    legacy_titles := array_append(task_mapping.old_titles, task_mapping.new_title);

    for sponsor_link in
      select distinct sponsor_event_id
      from public.tasks
      where title = any(legacy_titles)
    loop
      select id, status
        into winner_id, winner_status
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id
        and title = any(legacy_titles)
      order by (title = task_mapping.new_title) desc,
               (status = 'Complete') desc,
               (case when jsonb_typeof(input_values -> 'nominees') = 'array' then jsonb_array_length(input_values -> 'nominees') > 0 else false end) desc,
               id
      limit 1;

      select greatest(1, max(quantity)),
             coalesce(bool_or(status = 'Complete'), false)
        into winner_quantity, has_complete
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id
        and title = any(legacy_titles);
      if has_complete then
        winner_status := 'Complete';
      else
        select status into winner_status from public.tasks where id = winner_id;
      end if;

      select coalesce(input_values, '{}'::jsonb)
        into winner_input_values
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id
        and title = any(legacy_titles)
      order by (case when jsonb_typeof(input_values -> 'nominees') = 'array' then jsonb_array_length(input_values -> 'nominees') > 0 else false end) desc,
               (title = task_mapping.new_title) desc,
               id
      limit 1;

      select array_agg(id)
        into duplicate_task_ids
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id
        and title = any(legacy_titles)
        and id <> winner_id;

      if duplicate_task_ids is not null then
        update public.task_upload_attempts
        set task_id = winner_id
        where task_id = any(duplicate_task_ids);

        delete from public.tasks where id = any(duplicate_task_ids);
      end if;

      update public.tasks
      set title = task_mapping.new_title,
          category = 'Tickets',
          quantity = winner_quantity,
          status = winner_status,
          input_values = coalesce(winner_input_values, '{}'::jsonb)
      where id = winner_id;
    end loop;
  end loop;
end;
$$;

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

  if (to_jsonb(new) - array['response_text', 'input_values', 'file_url', 'file_name', 'file_size_bytes', 'file_id', 'status', 'submitted_at', 'admin_review_note'])
     is distinct from
     (to_jsonb(old) - array['response_text', 'input_values', 'file_url', 'file_name', 'file_size_bytes', 'file_id', 'status', 'submitted_at', 'admin_review_note']) then
    raise exception 'Sponsors may only update their submission fields';
  end if;

  if new.status <> 'pending_review' or new.submitted_at is null or new.admin_review_note is not null then
    raise exception 'Sponsor submissions must enter pending review';
  end if;

  if new.title in ('Issue Team Tickets', 'Issue Speaker Team Ticket', 'Issue RE Tickets', 'Confirm VIP Attendees', 'Confirm team tickets', 'Confirm RE tickets', 'Confirm VIP tickets', 'Confirm team ticket allocation', 'Confirm RE ticket allocation', 'Confirm VIP ticket allocation') then
    if jsonb_typeof(new.input_values -> 'nominees') is distinct from 'array' then
      raise exception 'Ticket nominees must be provided as a list';
    end if;
    if jsonb_array_length(new.input_values -> 'nominees') < 1
       or jsonb_array_length(new.input_values -> 'nominees') > new.quantity then
      raise exception 'Ticket nominees must be provided and cannot exceed the allocated quantity';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(new.input_values -> 'nominees') as entries(nominee)
      where jsonb_typeof(nominee) is distinct from 'object'
         or nullif(btrim(nominee ->> 'first_name'), '') is null
         or nullif(btrim(nominee ->> 'last_name'), '') is null
         or coalesce(nominee ->> 'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) then
      raise exception 'Each ticket nominee requires a first name, last name, and valid email';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_sponsor_task_submission_fields on public.tasks;
create trigger enforce_sponsor_task_submission_fields
  before update on public.tasks
  for each row execute function public.enforce_sponsor_task_submission_fields();

notify pgrst, 'reload schema';
