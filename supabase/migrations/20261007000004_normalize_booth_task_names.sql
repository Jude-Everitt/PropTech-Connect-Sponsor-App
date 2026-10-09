do $$
declare
  task_mapping record;
  sponsor_link record;
  winner_id uuid;
  winner_status text;
  winner_quantity integer;
  winner_input_values jsonb;
  winner public.tasks%rowtype;
  legacy_file public.tasks%rowtype;
  legacy_text text;
  has_complete boolean;
  duplicate_task_ids uuid[];
  legacy_titles text[];
begin
  for task_mapping in
    select * from (values
      ('Submit Booth Artwork', array['Submit booth artwork', 'Approve artwork']::text[]),
      ('Confirm Additional Furniture for Booth', array['Note booth additional rentals']::text[]),
      ('Confirm Booth Activations', array['Note booth activations']::text[])
    ) as mappings(new_title, old_titles)
  loop
    legacy_titles := array_append(task_mapping.old_titles, task_mapping.new_title);
    for sponsor_link in
      select distinct sponsor_event_id from public.tasks where title = any(legacy_titles)
    loop
      select id, status into winner_id, winner_status
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id and title = any(legacy_titles)
      order by (title = task_mapping.new_title) desc, (status = 'Complete') desc, id
      limit 1;

      winner_quantity := 1;
      select coalesce(bool_or(status = 'Complete'), false)
        into has_complete
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id and title = any(legacy_titles);
      if has_complete then
        winner_status := 'Complete';
      else
        select status into winner_status from public.tasks where id = winner_id;
      end if;

      select coalesce(input_values, '{}'::jsonb)
        into winner_input_values
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id and title = any(legacy_titles)
      order by (input_values ? 'additional_furniture' or input_values ? 'booth_activations') desc,
               (title = task_mapping.new_title) desc,
               id
      limit 1;

      select * into winner from public.tasks where id = winner_id;
      select * into legacy_file
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id and title = any(legacy_titles)
      order by (file_url is not null or file_id is not null) desc, created_at
      limit 1;

      select string_agg(nullif(btrim(response_text), ''), E'\n' order by created_at)
        into legacy_text
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id and title = any(legacy_titles);
      if legacy_text is not null and task_mapping.new_title = 'Confirm Additional Furniture for Booth' then
        winner_input_values := jsonb_set(coalesce(winner_input_values, '{}'::jsonb), '{additional_furniture}', to_jsonb(coalesce(winner_input_values->>'additional_furniture', legacy_text)), true);
      elsif legacy_text is not null and task_mapping.new_title = 'Confirm Booth Activations' then
        winner_input_values := jsonb_set(coalesce(winner_input_values, '{}'::jsonb), '{booth_activations}', to_jsonb(coalesce(winner_input_values->>'booth_activations', legacy_text)), true);
      end if;

      select array_agg(id) into duplicate_task_ids
      from public.tasks
      where sponsor_event_id = sponsor_link.sponsor_event_id
        and title = any(legacy_titles)
        and id <> winner_id;

      if duplicate_task_ids is not null then
        update public.task_upload_attempts set task_id = winner_id where task_id = any(duplicate_task_ids);
        delete from public.tasks where id = any(duplicate_task_ids);
      end if;

      update public.tasks
      set title = task_mapping.new_title,
          category = 'Exhibition Booth',
          quantity = winner_quantity,
          status = winner_status,
            input_values = coalesce(winner_input_values, '{}'::jsonb),
            response_text = coalesce(winner.response_text, legacy_file.response_text),
            file_url = coalesce(winner.file_url, legacy_file.file_url),
            file_name = coalesce(winner.file_name, legacy_file.file_name),
            file_size_bytes = coalesce(winner.file_size_bytes, legacy_file.file_size_bytes),
            file_id = coalesce(winner.file_id, legacy_file.file_id),
            submitted_at = coalesce(winner.submitted_at, legacy_file.submitted_at)
      where id = winner_id;
    end loop;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
