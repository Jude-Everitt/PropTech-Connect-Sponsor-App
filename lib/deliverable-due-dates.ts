import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverableGroup } from "@/lib/task-utils";
import type { Database } from "@/lib/types";

type Client = SupabaseClient<Database>;

// Writes each saved deliverable due date onto every task in that deliverable, for all sponsors of the event.
export async function applyDeliverableDueDates(client: Client, eventId: string, onlyGroup?: string) {
  const [{ data: saved, error: savedError }, { data: links, error: linksError }] = await Promise.all([
    client.from("deliverable_due_dates").select("category, due_date").eq("event_id", eventId),
    client.from("sponsor_events").select("id").eq("event_id", eventId),
  ]);
  if (savedError) throw savedError;
  if (linksError) throw linksError;
  if (!links?.length) return 0;
  const dates = new Map((saved ?? []).map((row) => [row.category, row.due_date]));
  const { data: tasks, error: tasksError } = await client.from("tasks").select("id, category, due_date").in("sponsor_event_id", links.map((link) => link.id));
  if (tasksError) throw tasksError;
  const byTarget = new Map<string | null, string[]>();
  for (const task of tasks ?? []) {
    const group = deliverableGroup(task.category);
    if (onlyGroup !== undefined && group !== onlyGroup) continue;
    // Groups without a saved date are left alone unless that group was explicitly cleared.
    if (!dates.has(group) && onlyGroup === undefined) continue;
    const target = dates.get(group) ?? null;
    if (task.due_date === target) continue;
    byTarget.set(target, [...(byTarget.get(target) ?? []), task.id]);
  }
  let updated = 0;
  for (const [target, ids] of byTarget) {
    for (let index = 0; index < ids.length; index += 200) {
      const chunk = ids.slice(index, index + 200);
      const { error } = await client.from("tasks").update({ due_date: target }).in("id", chunk);
      if (error) throw error;
      updated += chunk.length;
    }
  }
  return updated;
}
