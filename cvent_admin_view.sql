create or replace view public.cvent_exhibitor_task_overview as
select
  e.event_id,
  e.event_name,
  ex.exhibitor_id,
  ex.exhibitor_name,
  ed.deliverable_id,
  ed.deliverable_name,
  dt.task_id,
  dt.task_name,
  dt.task_status,
  coalesce(jsonb_array_length(dt.task_files), 0) as file_count,
  dt.task_files,
  dt.task_name as task_label
from public.events e
join public.event_exhibitors ex on ex.event_id = e.event_id
join public.exhibitor_deliverables ed
  on ed.event_id = ex.event_id
 and ed.exhibitor_id = ex.exhibitor_id
join public.deliverable_tasks dt
  on dt.event_id = ed.event_id
 and dt.exhibitor_id = ed.exhibitor_id
 and dt.deliverable_id = ed.deliverable_id
order by e.event_name, ex.exhibitor_name, ed.deliverable_name, dt.task_name;

-- Example query:
-- select * from public.cvent_exhibitor_task_overview where event_id = '...';
