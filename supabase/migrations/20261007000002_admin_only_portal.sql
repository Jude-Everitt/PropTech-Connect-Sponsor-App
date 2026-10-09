create table if not exists public.sponsor_campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  sponsor_event_id uuid not null references public.sponsor_events(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  email text not null check (length(btrim(email)) > 0),
  job_title text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.sponsor_campaign_contacts enable row level security;
grant select, insert, update, delete on public.sponsor_campaign_contacts to authenticated, service_role;

drop policy if exists "Admins and linked sponsors can view events" on public.events;
drop policy if exists "Authenticated users can view events" on public.events;
drop policy if exists "Admins can view events" on public.events;
create policy "Admins can view events"
  on public.events for select to authenticated using (public.is_admin());

drop policy if exists "Admins and sponsors can view own sponsor" on public.sponsors;
drop policy if exists "Authenticated users can view sponsors" on public.sponsors;
drop policy if exists "Admins can view sponsors" on public.sponsors;
create policy "Admins can view sponsors"
  on public.sponsors for select to authenticated using (public.is_admin());

drop policy if exists "Users can view relevant sponsor events" on public.sponsor_events;
drop policy if exists "Admins can view sponsor events" on public.sponsor_events;
create policy "Admins can view sponsor events"
  on public.sponsor_events for select to authenticated using (public.is_admin());
drop policy if exists "Admins can manage sponsor events" on public.sponsor_events;
create policy "Admins can manage sponsor events"
  on public.sponsor_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Sponsors view their tasks" on public.tasks;
drop policy if exists "Sponsors view own tasks" on public.tasks;
drop policy if exists "Sponsors update their tasks" on public.tasks;
drop policy if exists "Sponsors update their own submissions" on public.tasks;

drop policy if exists "Sponsors and admins view campaign contacts" on public.sponsor_campaign_contacts;
drop policy if exists "Admins view campaign contacts" on public.sponsor_campaign_contacts;
create policy "Admins view campaign contacts"
  on public.sponsor_campaign_contacts for select to authenticated
  using (public.is_admin());

drop policy if exists "Sponsors and admins manage campaign contacts" on public.sponsor_campaign_contacts;
drop policy if exists "Admins manage campaign contacts" on public.sponsor_campaign_contacts;
create policy "Admins manage campaign contacts"
  on public.sponsor_campaign_contacts for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
