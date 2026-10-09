create extension if not exists "pgcrypto";

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  location text,
  google_sheet_id text,
  google_sheet_range text not null default 'Sheet1!A:Z',
  drive_folder_id text
);

alter table public.events add column if not exists google_sheet_id text;
alter table public.events add column if not exists google_sheet_range text not null default 'Sheet1!A:Z';
alter table public.events add column if not exists drive_folder_id text;

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null unique,
  tier text not null,
  contract_details jsonb not null default '{}'::jsonb
);

alter table public.sponsors add column if not exists contract_details jsonb not null default '{}'::jsonb;
create unique index if not exists sponsors_company_name_normalized_uidx on public.sponsors (lower(btrim(company_name)));

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  sponsor_id uuid references public.sponsors(id) on delete set null,
  role text not null check (role in ('ADMIN', 'SPONSOR'))
);

create table if not exists public.sponsor_events (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  drive_folder_id text,
  unique (sponsor_id, event_id)
);

create table if not exists public.sponsor_campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  sponsor_event_id uuid not null references public.sponsor_events(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  email text not null check (length(btrim(email)) > 0),
  job_title text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.sponsor_events add column if not exists drive_folder_id text;

create table if not exists public.drive_folder_creation_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid unique references public.events(id) on delete cascade,
  sponsor_event_id uuid unique references public.sponsor_events(id) on delete cascade,
  drive_folder_id text unique,
  created_at timestamptz not null default now(),
  check ((event_id is not null) <> (sponsor_event_id is not null))
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  sponsor_event_id uuid not null references public.sponsor_events(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  status text not null default 'Needs You' check (status in ('Needs You', 'With Our Team', 'Complete', 'Overdue', 'pending_review')),
  submitted_at timestamptz,
  due_date date,
  quantity integer not null default 1 check (quantity > 0),
  action_url text,
  action_label text,
  response_text text,
  file_url text,
  file_name text,
  file_size_bytes bigint,
  file_id text,
  ai_recommendation text check (ai_recommendation in ('COMPLETE', 'NEEDS_CHANGES') or ai_recommendation is null),
  ai_feedback text,
  ai_reviewed_at timestamptz,
  admin_review_note text,
  input_fields jsonb not null default '[]'::jsonb,
  input_values jsonb not null default '{}'::jsonb,
  nominee_decisions jsonb not null default '{}'::jsonb,
  unique (sponsor_event_id, title)
);

create table if not exists public.task_upload_attempts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  status text not null check (status in ('pending_upload', 'upload_failed', 'uploaded', 'recovery_needed', 'completed')),
  file_name text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  drive_file_id text,
  file_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists submitted_at timestamptz;
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('Needs You', 'With Our Team', 'Complete', 'Overdue', 'pending_review'));
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists quantity integer not null default 1;
alter table public.tasks add column if not exists action_url text;
alter table public.tasks add column if not exists action_label text;
alter table public.tasks add column if not exists response_text text;
alter table public.tasks add column if not exists file_url text;
alter table public.tasks add column if not exists file_name text;
alter table public.tasks add column if not exists file_size_bytes bigint;
alter table public.tasks add column if not exists file_id text;
alter table public.tasks add column if not exists ai_recommendation text;
alter table public.tasks add column if not exists ai_feedback text;
alter table public.tasks add column if not exists ai_reviewed_at timestamptz;
alter table public.tasks add column if not exists admin_review_note text;
alter table public.tasks add column if not exists input_fields jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists input_values jsonb not null default '{}'::jsonb;
alter table public.tasks add column if not exists nominee_decisions jsonb not null default '{}'::jsonb;

create index if not exists sponsor_events_event_id_idx on public.sponsor_events(event_id);
create index if not exists tasks_sponsor_event_id_idx on public.tasks(sponsor_event_id);
create index if not exists task_upload_attempts_task_id_idx on public.task_upload_attempts(task_id);
create index if not exists task_upload_attempts_status_idx on public.task_upload_attempts(status);
drop index if exists public.sponsor_events_sponsor_event_unique;
create unique index sponsor_events_sponsor_event_unique on public.sponsor_events(sponsor_id, event_id);
drop index if exists public.tasks_sponsor_event_title_unique;
create unique index tasks_sponsor_event_title_unique on public.tasks(sponsor_event_id, title);

alter table public.events enable row level security;
alter table public.sponsors enable row level security;
alter table public.user_profiles enable row level security;
alter table public.sponsor_events enable row level security;
alter table public.sponsor_campaign_contacts enable row level security;
alter table public.tasks enable row level security;
alter table public.task_upload_attempts enable row level security;
alter table public.drive_folder_creation_claims enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.events, public.sponsors, public.user_profiles, public.sponsor_events to authenticated;
grant select, insert, update, delete on public.sponsor_campaign_contacts to authenticated;
grant select on public.tasks to authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete
on public.events, public.sponsors, public.user_profiles, public.sponsor_events, public.tasks to service_role;
grant select, insert, update, delete on public.sponsor_campaign_contacts to service_role;
grant select, insert, update, delete on public.task_upload_attempts to service_role;
grant select on public.task_upload_attempts to authenticated;
grant select, insert, update, delete on public.drive_folder_creation_claims to service_role;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where id = (select auth.uid()) and role = 'ADMIN'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Authenticated users can view events" on public.events;
drop policy if exists "Admins and linked sponsors can view events" on public.events;
drop policy if exists "Admins can view events" on public.events;
create policy "Admins can view events"
  on public.events for select to authenticated using (public.is_admin());
drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events"
  on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Authenticated users can view sponsors" on public.sponsors;
drop policy if exists "Admins and sponsors can view own sponsor" on public.sponsors;
drop policy if exists "Admins can view sponsors" on public.sponsors;
create policy "Admins can view sponsors"
  on public.sponsors for select to authenticated using (public.is_admin());
drop policy if exists "Admins can manage sponsors" on public.sponsors;
create policy "Admins can manage sponsors"
  on public.sponsors for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users can view their profile" on public.user_profiles;
create policy "Users can view their profile"
  on public.user_profiles for select to authenticated using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "Admins can manage profiles" on public.user_profiles;
create policy "Admins can manage profiles"
  on public.user_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users can view relevant sponsor events" on public.sponsor_events;
drop policy if exists "Admins can view sponsor events" on public.sponsor_events;
create policy "Admins can view sponsor events"
  on public.sponsor_events for select to authenticated using (public.is_admin());
drop policy if exists "Admins can manage sponsor events" on public.sponsor_events;
create policy "Admins can manage sponsor events"
  on public.sponsor_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Sponsors and admins view campaign contacts" on public.sponsor_campaign_contacts;
drop policy if exists "Admins view campaign contacts" on public.sponsor_campaign_contacts;
create policy "Admins view campaign contacts"
  on public.sponsor_campaign_contacts for select to authenticated using (public.is_admin());
drop policy if exists "Sponsors and admins manage campaign contacts" on public.sponsor_campaign_contacts;
drop policy if exists "Admins manage campaign contacts" on public.sponsor_campaign_contacts;
create policy "Admins manage campaign contacts"
  on public.sponsor_campaign_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins view and edit all tasks" on public.tasks;
drop policy if exists "Admins view all tasks" on public.tasks;
create policy "Admins view all tasks"
  on public.tasks for select to authenticated using (public.is_admin());
drop policy if exists "Sponsors view their tasks" on public.tasks;
drop policy if exists "Sponsors view own tasks" on public.tasks;
drop policy if exists "Sponsors update their tasks" on public.tasks;
drop policy if exists "Sponsors update their own submissions" on public.tasks;

drop policy if exists "Admins can view task upload attempts" on public.task_upload_attempts;
create policy "Admins can view task upload attempts"
  on public.task_upload_attempts for select to authenticated using (public.is_admin());
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
      target_title := 'Confirm 10 Private Meetings';
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
