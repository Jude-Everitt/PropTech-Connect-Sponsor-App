create table if not exists public.deliverable_due_dates (
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  due_date date not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, category)
);

alter table public.deliverable_due_dates enable row level security;

drop policy if exists "Admins can view deliverable due dates" on public.deliverable_due_dates;
create policy "Admins can view deliverable due dates"
  on public.deliverable_due_dates for select to authenticated using (public.is_admin());

revoke all on public.deliverable_due_dates from anon;
grant select on public.deliverable_due_dates to authenticated;
grant select, insert, update, delete on public.deliverable_due_dates to service_role;
