alter table public.tasks
  add column if not exists input_fields jsonb not null default '[]'::jsonb,
  add column if not exists input_values jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';