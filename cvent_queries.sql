-- 1) show all tasks with their status and file count
select
  event_id,
  exhibitor_id,
  deliverable_id,
  task_id,
  task_name,
  task_status,
  (
    select count(*)
    from public.cvent_task_files f
    where f.event_id = t.event_id
      and f.exhibitor_id = t.exhibitor_id
      and f.deliverable_id = t.deliverable_id
      and f.task_id = t.task_id
  ) as file_count
from public.cvent_tasks t
order by event_id, exhibitor_id, deliverable_id, task_name;

-- 2) show only incomplete tasks
select
  event_id,
  exhibitor_id,
  deliverable_id,
  task_id,
  task_name,
  task_status
from public.cvent_tasks
where task_status is null
   or task_status not in ('Complete', 'Completed', 'approved', 'Approved')
order by event_id, exhibitor_id, deliverable_id, task_name;

-- 3) show all files for one exhibitor and one deliverable
select
  f.event_id,
  f.exhibitor_id,
  f.deliverable_id,
  f.task_id,
  t.task_name,
  f.file_name,
  f.file_url,
  f.storage_path,
  f.file_size_bytes,
  f.mime_type,
  f.synced_at
from public.cvent_task_files f
join public.cvent_tasks t
  on t.event_id = f.event_id
 and t.exhibitor_id = f.exhibitor_id
 and t.deliverable_id = f.deliverable_id
 and t.task_id = f.task_id
where f.event_id = 'your_event_id'
  and f.exhibitor_id = 'your_exhibitor_id'
  and f.deliverable_id = 'your_deliverable_id'
order by f.task_id, f.file_name;

-- 4) show all tasks for one event and exhibitor
select
  t.event_id,
  t.exhibitor_id,
  t.deliverable_id,
  d.deliverable_name,
  t.task_id,
  t.task_name,
  t.task_status,
  (
    select count(*)
    from public.cvent_task_files f
    where f.event_id = t.event_id
      and f.exhibitor_id = t.exhibitor_id
      and f.deliverable_id = t.deliverable_id
      and f.task_id = t.task_id
  ) as file_count
from public.cvent_tasks t
join public.cvent_deliverables d
  on d.event_id = t.event_id
 and d.exhibitor_id = t.exhibitor_id
 and d.deliverable_id = t.deliverable_id
where t.event_id = 'your_event_id'
  and t.exhibitor_id = 'your_exhibitor_id'
order by d.deliverable_name, t.task_name;
