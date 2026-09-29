alter table public.events add column if not exists drive_folder_id text;
alter table public.sponsor_events add column if not exists drive_folder_id text;

create table if not exists public.drive_folder_creation_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid unique references public.events(id) on delete cascade,
  sponsor_event_id uuid unique references public.sponsor_events(id) on delete cascade,
  drive_folder_id text unique,
  created_at timestamptz not null default now(),
  check ((event_id is not null) <> (sponsor_event_id is not null))
);

alter table public.drive_folder_creation_claims enable row level security;
grant select, insert, update, delete on public.drive_folder_creation_claims to service_role;
notify pgrst, 'reload schema';
