alter table public.tasks add column if not exists file_size_bytes bigint;
alter table public.task_upload_attempts add column if not exists file_size_bytes bigint not null default 0;

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

  if new.title in ('Confirm team tickets', 'Confirm RE tickets', 'Confirm VIP tickets', 'Confirm team ticket allocation', 'Confirm RE ticket allocation', 'Confirm VIP ticket allocation') then
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
