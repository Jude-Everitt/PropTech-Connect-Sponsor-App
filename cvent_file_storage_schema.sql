create table if not exists public.cvent_event_files (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  exhibitor_id text not null,
  deliverable_id text not null,
  task_id text not null,
  file_name text not null,
  file_url text,
  file_size_bytes bigint,
  mime_type text,
  source text not null default 'cvent',
  content_base64 text,
  synced_at timestamptz not null default now(),
  unique (event_id, exhibitor_id, deliverable_id, task_id, file_name)
);

create index if not exists cvent_event_files_event_idx on public.cvent_event_files(event_id, exhibitor_id, deliverable_id, task_id);

-- Example row shape:
-- insert into public.cvent_event_files (
--   event_id,
--   exhibitor_id,
--   deliverable_id,
--   task_id,
--   file_name,
--   file_url,
--   file_size_bytes,
--   mime_type,
--   source,
--   content_base64
-- ) values (
--   'a75b5b1c-a9f0-4cd0-af37-6d752f114a9c',
--   'ex_101',
--   'del_02',
--   'task_9003',
--   'brand-guidelines.pdf',
--   'https://example.com/file/brand-guidelines.pdf',
--   182400,
--   'application/pdf',
--   'cvent',
--   'JVBERi0xLjQK...'
-- );
