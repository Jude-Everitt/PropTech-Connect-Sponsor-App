create table if not exists public.cvent_events (
  event_id text primary key,
  event_name text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.cvent_exhibitors (
  event_id text not null references public.cvent_events(event_id) on delete cascade,
  exhibitor_id text not null,
  exhibitor_name text not null,
  synced_at timestamptz not null default now(),
  primary key (event_id, exhibitor_id)
);

create table if not exists public.cvent_deliverables (
  event_id text not null,
  exhibitor_id text not null,
  deliverable_id text not null,
  deliverable_name text not null,
  synced_at timestamptz not null default now(),
  primary key (event_id, exhibitor_id, deliverable_id),
  foreign key (event_id, exhibitor_id)
    references public.cvent_exhibitors(event_id, exhibitor_id) on delete cascade
);

create table if not exists public.cvent_tasks (
  event_id text not null,
  exhibitor_id text not null,
  deliverable_id text not null,
  task_id text not null,
  task_name text not null,
  task_status text,
  task_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (event_id, exhibitor_id, deliverable_id, task_id),
  foreign key (event_id, exhibitor_id, deliverable_id)
    references public.cvent_deliverables(event_id, exhibitor_id, deliverable_id) on delete cascade
);

create table if not exists public.cvent_task_files (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  exhibitor_id text not null,
  deliverable_id text not null,
  task_id text not null,
  file_name text not null,
  file_url text not null,
  storage_path text not null,
  file_size_bytes bigint,
  mime_type text,
  source_url text,
  source text not null default 'cvent',
  synced_at timestamptz not null default now(),
  unique (event_id, exhibitor_id, deliverable_id, task_id, file_name),
  foreign key (event_id, exhibitor_id, deliverable_id, task_id)
    references public.cvent_tasks(event_id, exhibitor_id, deliverable_id, task_id) on delete cascade
);

create index if not exists cvent_tasks_status_idx on public.cvent_tasks(task_status);
create index if not exists cvent_task_files_event_idx on public.cvent_task_files(event_id, exhibitor_id, deliverable_id, task_id);

alter table public.cvent_events enable row level security;
alter table public.cvent_exhibitors enable row level security;
alter table public.cvent_deliverables enable row level security;
alter table public.cvent_tasks enable row level security;
alter table public.cvent_task_files enable row level security;

revoke all on public.cvent_events, public.cvent_exhibitors, public.cvent_deliverables, public.cvent_tasks, public.cvent_task_files from anon, authenticated;
grant select, insert, update, delete on public.cvent_events, public.cvent_exhibitors, public.cvent_deliverables, public.cvent_tasks, public.cvent_task_files to service_role;

create or replace view public.cvent_task_overview as
select
  ct.event_id,
  ce.event_name,
  ct.exhibitor_id,
  cx.exhibitor_name,
  cd.deliverable_id,
  cd.deliverable_name,
  ct.task_id,
  ct.task_name,
  ct.task_status,
  coalesce(count(cff.id), 0) as file_count
from public.cvent_tasks ct
join public.cvent_events ce on ce.event_id = ct.event_id
join public.cvent_exhibitors cx on cx.event_id = ct.event_id and cx.exhibitor_id = ct.exhibitor_id
join public.cvent_deliverables cd on cd.event_id = ct.event_id and cd.exhibitor_id = ct.exhibitor_id and cd.deliverable_id = ct.deliverable_id
left join public.cvent_task_files cff
  on cff.event_id = ct.event_id
 and cff.exhibitor_id = ct.exhibitor_id
 and cff.deliverable_id = ct.deliverable_id
 and cff.task_id = ct.task_id
group by
  ct.event_id,
  ce.event_name,
  ct.exhibitor_id,
  cx.exhibitor_name,
  cd.deliverable_id,
  cd.deliverable_name,
  ct.task_id,
  ct.task_name,
  ct.task_status
order by ce.event_name, cx.exhibitor_name, cd.deliverable_name, ct.task_name;

revoke all on public.cvent_task_overview from anon, authenticated;
grant select on public.cvent_task_overview to service_role;
