alter table public.tasks
  add column if not exists nominee_decisions jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
