create or replace function public.apply_approved_meeting_option()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sponsor_id uuid;
  updated_contract_details jsonb;
  selected_option text;
  target_key text;
  approved_key text;
  target_title text;
  target_category text;
  target_description text;
  target_action_url text;
  target_action_label text;
  base_quantity_text text;
  approved_quantity_text text;
  base_quantity integer := 0;
  approved_quantity integer := 0;
  target_quantity integer;
begin
  if new.title <> 'Call Account Manager and Client Success to confirm option' then
    return new;
  end if;

  selected_option := lower(btrim(coalesce(new.input_values ->> 'option', '')));
  case selected_option
    when 'roundtable' then
      target_key := 'roundtable';
      approved_key := 'approved_option_roundtable';
      target_title := 'Book a call with Elena (Head of Content)';
      target_category := 'Roundtables';
      target_description := 'Use the supplied booking link to arrange a call with Elena, Head of Content.';
      target_action_url := 'https://meetings-eu1.hubspot.com/evu/roundtable';
      target_action_label := 'Booking Link';
    when 'tour' then
      target_key := 'tours';
      approved_key := 'approved_option_tours';
      target_title := 'Select a tour';
      target_category := 'Tours';
      target_description := 'Select the preferred tour option and provide any attendee or access requirements.';
      target_action_url := null;
      target_action_label := null;
    when '10 meetings' then
      target_key := '10_meetings';
      approved_key := 'approved_option_10_meetings';
      target_title := 'Confirm 10 meetings';
      target_category := '10 Meetings';
      target_description := '';
      target_action_url := null;
      target_action_label := null;
    else
      raise exception 'The submitted Roundtable/Meeting/Tour option is missing or invalid';
  end case;

  select se.sponsor_id into sponsor_id
  from public.sponsor_events se
  where se.id = new.sponsor_event_id;
  if sponsor_id is null then
    raise exception 'Could not find sponsor for approved option';
  end if;

  select s.contract_details into updated_contract_details
  from public.sponsors s
  where s.id = sponsor_id
  for update;
  if updated_contract_details is null then
    raise exception 'Could not load sponsor contract details';
  end if;

  base_quantity_text := nullif(btrim(updated_contract_details ->> target_key), '');
  if base_quantity_text ~ '^-?[0-9][0-9,]*(\.[0-9]+)?$' then
    base_quantity := greatest(0, floor(replace(base_quantity_text, ',', '')::numeric)::integer);
  elsif lower(coalesce(base_quantity_text, '')) not in ('false', 'no', 'n', 'none', 'not included', 'na', 'n/a', '-') then
    base_quantity := case when base_quantity_text is null then 0 else 1 end;
  end if;

  approved_quantity_text := nullif(btrim(updated_contract_details ->> approved_key), '');
  if approved_quantity_text ~ '^[0-9][0-9,]*$' then
    approved_quantity := replace(approved_quantity_text, ',', '')::integer;
  end if;

  approved_quantity := approved_quantity + 1;
  target_quantity := base_quantity + approved_quantity;
  updated_contract_details := jsonb_set(updated_contract_details, array[approved_key], to_jsonb(approved_quantity), true);

  update public.sponsors
  set contract_details = updated_contract_details
  where id = sponsor_id;

  insert into public.tasks (
    sponsor_event_id,
    title,
    description,
    category,
    status,
    quantity,
    action_url,
    action_label
  ) values (
    new.sponsor_event_id,
    target_title,
    target_description,
    target_category,
    'Needs You',
    target_quantity,
    target_action_url,
    target_action_label
  )
  on conflict (sponsor_event_id, title) do update set
    description = excluded.description,
    category = excluded.category,
    quantity = excluded.quantity,
    action_url = excluded.action_url,
    action_label = excluded.action_label,
    status = case
      when public.tasks.status = 'Complete' and public.tasks.quantity < excluded.quantity then 'Needs You'
      else public.tasks.status
    end;

  return new;
end;
$$;

revoke all on function public.apply_approved_meeting_option() from public;

drop trigger if exists apply_approved_meeting_option on public.tasks;
create trigger apply_approved_meeting_option
  after update of status on public.tasks
  for each row
  when (old.status = 'pending_review' and new.status = 'Complete')
  execute function public.apply_approved_meeting_option();

notify pgrst, 'reload schema';