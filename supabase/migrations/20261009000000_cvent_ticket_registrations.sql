create table if not exists public.cvent_ticket_registrations (
  attendee_id text primary key,
  cvent_event_id text not null,
  sponsor_event_id uuid references public.sponsor_events(id) on delete cascade,
  exhibitor_name text,
  task_title text not null,
  registration_type text not null,
  status text not null,
  first_name text,
  last_name text,
  email text,
  company text,
  job_title text,
  registered_at timestamptz,
  checked_in boolean not null default false,
  synced_at timestamptz not null default now()
);

create index if not exists cvent_ticket_registrations_sponsor_idx
  on public.cvent_ticket_registrations(sponsor_event_id, task_title);

alter table public.cvent_ticket_registrations enable row level security;

drop policy if exists "Admins can view cvent ticket registrations" on public.cvent_ticket_registrations;
create policy "Admins can view cvent ticket registrations"
  on public.cvent_ticket_registrations for select to authenticated using (public.is_admin());

revoke all on public.cvent_ticket_registrations from anon;
grant select on public.cvent_ticket_registrations to authenticated;
grant select, insert, update, delete on public.cvent_ticket_registrations to service_role;
