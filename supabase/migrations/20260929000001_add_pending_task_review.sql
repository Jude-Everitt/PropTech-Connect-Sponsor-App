alter table public.tasks add column if not exists submitted_at timestamptz;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check
  check (status in ('Needs You', 'With Our Team', 'Complete', 'Overdue', 'pending_review'));

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

  if (to_jsonb(new) - array['response_text', 'input_values', 'file_url', 'file_name', 'file_id', 'status', 'submitted_at', 'admin_review_note'])
     is distinct from
     (to_jsonb(old) - array['response_text', 'input_values', 'file_url', 'file_name', 'file_id', 'status', 'submitted_at', 'admin_review_note']) then
    raise exception 'Sponsors may only update their submission fields';
  end if;

  if new.status <> 'pending_review' or new.submitted_at is null or new.admin_review_note is not null then
    raise exception 'Sponsor submissions must enter pending review';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_sponsor_task_submission_fields on public.tasks;
create trigger enforce_sponsor_task_submission_fields
  before update on public.tasks
  for each row execute function public.enforce_sponsor_task_submission_fields();

notify pgrst, 'reload schema';
