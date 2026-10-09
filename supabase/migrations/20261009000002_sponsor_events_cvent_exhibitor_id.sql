alter table public.sponsor_events
  add column if not exists cvent_exhibitor_id text;

create unique index if not exists sponsor_events_event_cvent_exhibitor_idx
  on public.sponsor_events(event_id, cvent_exhibitor_id)
  where cvent_exhibitor_id is not null;
