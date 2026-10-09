alter table public.cvent_ticket_registrations
  add column if not exists exhibitor_id text;

create index if not exists cvent_ticket_registrations_exhibitor_idx
  on public.cvent_ticket_registrations(cvent_event_id, exhibitor_id);
