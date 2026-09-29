create extension if not exists "pgcrypto";

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  location text,
  google_sheet_id text,
  google_sheet_range text not null default 'Sheet1!A:Z'
);

alter table public.events add column if not exists google_sheet_id text;
alter table public.events add column if not exists google_sheet_range text not null default 'Sheet1!A:Z';

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null unique,
  tier text not null,
  contract_details jsonb not null default '{}'::jsonb
);

alter table public.sponsors add column if not exists contract_details jsonb not null default '{}'::jsonb;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  sponsor_id uuid references public.sponsors(id) on delete set null,
  role text not null check (role in ('ADMIN', 'SPONSOR'))
);

create table if not exists public.sponsor_events (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  unique (sponsor_id, event_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  sponsor_event_id uuid not null references public.sponsor_events(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  status text not null default 'Needs You' check (status in ('Needs You', 'With Our Team', 'Complete', 'Overdue')),
  due_date date,
  quantity integer not null default 1 check (quantity > 0),
  action_url text,
  action_label text,
  response_text text,
  file_url text,
  file_name text,
  file_id text,
  ai_recommendation text check (ai_recommendation in ('COMPLETE', 'NEEDS_CHANGES') or ai_recommendation is null),
  ai_feedback text,
  ai_reviewed_at timestamptz,
  admin_review_note text,
  input_fields jsonb not null default '[]'::jsonb,
  input_values jsonb not null default '{}'::jsonb,
  unique (sponsor_event_id, title)
);

alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists quantity integer not null default 1;
alter table public.tasks add column if not exists action_url text;
alter table public.tasks add column if not exists action_label text;
alter table public.tasks add column if not exists response_text text;
alter table public.tasks add column if not exists file_url text;
alter table public.tasks add column if not exists file_name text;
alter table public.tasks add column if not exists file_id text;
alter table public.tasks add column if not exists ai_recommendation text;
alter table public.tasks add column if not exists ai_feedback text;
alter table public.tasks add column if not exists ai_reviewed_at timestamptz;
alter table public.tasks add column if not exists admin_review_note text;
alter table public.tasks add column if not exists input_fields jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists input_values jsonb not null default '{}'::jsonb;

create index if not exists sponsor_events_event_id_idx on public.sponsor_events(event_id);
create index if not exists tasks_sponsor_event_id_idx on public.tasks(sponsor_event_id);
drop index if exists public.sponsor_events_sponsor_event_unique;
create unique index sponsor_events_sponsor_event_unique on public.sponsor_events(sponsor_id, event_id);
drop index if exists public.tasks_sponsor_event_title_unique;
create unique index tasks_sponsor_event_title_unique on public.tasks(sponsor_event_id, title);

alter table public.events enable row level security;
alter table public.sponsors enable row level security;
alter table public.user_profiles enable row level security;
alter table public.sponsor_events enable row level security;
alter table public.tasks enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.events, public.sponsors, public.user_profiles, public.sponsor_events, public.tasks to authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete
on public.events, public.sponsors, public.user_profiles, public.sponsor_events, public.tasks to service_role;

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
drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events"
  on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());

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
create policy "Users can view relevant sponsor events"
  on public.sponsor_events for select to authenticated
  using (public.is_admin() or sponsor_id = (select sponsor_id from public.user_profiles where id = (select auth.uid())));
drop policy if exists "Admins can manage sponsor events" on public.sponsor_events;
create policy "Admins can manage sponsor events"
  on public.sponsor_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins view and edit all tasks" on public.tasks;
drop policy if exists "Admins view all tasks" on public.tasks;
create policy "Admins view and edit all tasks"
  on public.tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Sponsors view their tasks" on public.tasks;
drop policy if exists "Sponsors view own tasks" on public.tasks;
create policy "Sponsors view their tasks"
  on public.tasks for select to authenticated
  using (sponsor_event_id in (
    select se.id from public.sponsor_events se
    where se.sponsor_id = (select sponsor_id from public.user_profiles where id = (select auth.uid()))
  ));
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
