create table if not exists public.events (
  event_id text primary key,
  event_name text not null
);

create table if not exists public.event_exhibitors (
  event_id text not null references public.events(event_id) on delete cascade,
  exhibitor_id text not null,
  exhibitor_name text not null,
  primary key (event_id, exhibitor_id)
);

create table if not exists public.exhibitor_deliverables (
  event_id text not null,
  exhibitor_id text not null,
  deliverable_id text not null,
  deliverable_name text not null,
  primary key (event_id, exhibitor_id, deliverable_id),
  foreign key (event_id, exhibitor_id) references public.event_exhibitors(event_id, exhibitor_id) on delete cascade
);

create table if not exists public.deliverable_tasks (
  event_id text not null,
  exhibitor_id text not null,
  deliverable_id text not null,
  task_id text not null,
  task_name text not null,
  task_status text,
  task_files jsonb not null default '[]'::jsonb,
  primary key (event_id, exhibitor_id, deliverable_id, task_id),
  foreign key (event_id, exhibitor_id, deliverable_id)
    references public.exhibitor_deliverables(event_id, exhibitor_id, deliverable_id) on delete cascade
);

create index if not exists event_exhibitors_event_id_idx on public.event_exhibitors(event_id);
create index if not exists exhibitor_deliverables_event_idx on public.exhibitor_deliverables(event_id, exhibitor_id);
create index if not exists deliverable_tasks_event_idx on public.deliverable_tasks(event_id, exhibitor_id, deliverable_id);

-- Example rows for one event
insert into public.events (event_id, event_name)
values ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'PropTech Connect Middle East 2027')
on conflict (event_id) do nothing;

insert into public.event_exhibitors (event_id, exhibitor_id, exhibitor_name)
values
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_101', 'Acme Corp'),
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_204', 'Northwind Labs')
on conflict (event_id, exhibitor_id) do nothing;

insert into public.exhibitor_deliverables (event_id, exhibitor_id, deliverable_id, deliverable_name)
values
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_101', 'del_01', 'Booth'),
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_101', 'del_02', 'Branding'),
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_204', 'del_03', 'Sponsorship'),
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_204', 'del_04', 'Networking App')
on conflict (event_id, exhibitor_id, deliverable_id) do nothing;

insert into public.deliverable_tasks (event_id, exhibitor_id, deliverable_id, task_id, task_name, task_status, task_files)
values
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_101', 'del_01', 'task_9001', 'Submit Booth Artwork', 'Complete', '[{"name":"booth-artwork.pdf","url":"https://example.com/booth-artwork.pdf"}]'),
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_101', 'del_01', 'task_9002', 'Purchase Additional Furniture for Booth', 'Needs You', '[]'),
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_101', 'del_02', 'task_9003', 'Submit Logo + Brand Guidelines', 'pending_review', '[{"name":"brand-guidelines.pdf","url":"https://example.com/brand-guidelines.pdf"}]'),
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_204', 'del_03', 'task_9101', 'Sponsorship Deck', 'With Our Team', '[{"name":"deck.pdf","url":"https://example.com/deck.pdf"}]'),
  ('a75b5b1c-a9f0-4cd0-af37-6d752f114a9c', 'ex_204', 'del_04', 'task_9102', 'Complete Company Profile', 'Needs You', '[]')
on conflict (event_id, exhibitor_id, deliverable_id, task_id) do nothing;
