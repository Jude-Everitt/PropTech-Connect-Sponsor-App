alter table public.cvent_ticket_registrations
  add column if not exists inviting_sponsor text;
