create table if not exists public.task_upload_attempts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  status text not null check (status in ('pending_upload', 'upload_failed', 'uploaded', 'recovery_needed', 'completed')),
  file_name text not null,
  drive_file_id text,
  file_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_upload_attempts_task_id_idx on public.task_upload_attempts(task_id);
create index if not exists task_upload_attempts_status_idx on public.task_upload_attempts(status);

alter table public.task_upload_attempts enable row level security;
grant usage on schema public to authenticated;
grant select on public.task_upload_attempts to authenticated;
grant select, insert, update, delete on public.task_upload_attempts to service_role;

drop policy if exists "Admins can view task upload attempts" on public.task_upload_attempts;
create policy "Admins can view task upload attempts"
  on public.task_upload_attempts for select to authenticated using (public.is_admin());

notify pgrst, 'reload schema';
