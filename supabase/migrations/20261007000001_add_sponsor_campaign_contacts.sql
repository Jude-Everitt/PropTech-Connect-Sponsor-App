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

drop policy if exists "Sponsors and admins view campaign contacts" on public.sponsor_campaign_contacts;
create policy "Sponsors and admins view campaign contacts"
  on public.sponsor_campaign_contacts for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.sponsor_events se
      join public.user_profiles up on up.sponsor_id = se.sponsor_id
      where se.id = sponsor_campaign_contacts.sponsor_event_id
        and up.id = (select auth.uid())
        and up.role = 'SPONSOR'
    )
  );

drop policy if exists "Sponsors and admins manage campaign contacts" on public.sponsor_campaign_contacts;
create policy "Sponsors and admins manage campaign contacts"
  on public.sponsor_campaign_contacts for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.sponsor_events se
      join public.user_profiles up on up.sponsor_id = se.sponsor_id
      where se.id = sponsor_campaign_contacts.sponsor_event_id
        and up.id = (select auth.uid())
        and up.role = 'SPONSOR'
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.sponsor_events se
      join public.user_profiles up on up.sponsor_id = se.sponsor_id
      where se.id = sponsor_campaign_contacts.sponsor_event_id
        and up.id = (select auth.uid())
        and up.role = 'SPONSOR'
    )
  );

notify pgrst, 'reload schema';
