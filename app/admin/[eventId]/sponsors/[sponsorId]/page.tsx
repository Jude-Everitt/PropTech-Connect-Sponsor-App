"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Task, TaskStatus } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";
import TaskSubmissionControls from "@/app/ui/task-submission-controls";

type Props = { params: Promise<{ eventId: string; sponsorId: string }> };
type Sponsor = { id: string; company_name: string; tier: string; contract_details: Record<string, string> };
type EditableTask = Task & { editing?: boolean };

const taskSelect = "id, sponsor_event_id, title, description, category, status, due_date, quantity, input_fields, input_values, action_url, action_label, response_text, file_url, file_name, file_id, ai_recommendation, ai_feedback, ai_reviewed_at, admin_review_note";
const statusClass: Record<TaskStatus, string> = { "Needs You": "badge-danger", "With Our Team": "badge-warning", Complete: "badge-success", Overdue: "badge-danger" };

export default function AdminSponsorRoadmapPage({ params }: Props) {
  const { eventId, sponsorId } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const [{ data: eventData, error: eventError }, { data: sponsorData, error: sponsorError }, { data: link, error: linkError }] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsors").select("id, company_name, tier, contract_details").eq("id", sponsorId).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId).eq("sponsor_id", sponsorId).single(),
      ]);
      if (eventError || sponsorError || linkError || !link) { setMessage(eventError?.message ?? sponsorError?.message ?? linkError?.message ?? "Sponsor roadmap could not be loaded."); return; }
      setEvent(eventData); setSponsor(sponsorData);
      const { data, error } = await supabase.from("tasks").select(taskSelect).eq("sponsor_event_id", link.id).order("category").order("title");
      if (error) setMessage(error.message);
      setTasks(data ?? []);
      setReviewNotes(Object.fromEntries((data ?? []).map((task) => [task.id, task.admin_review_note ?? ""])));
    }
    void load();
  }, [eventId, sponsorId]);

  const groups = useMemo(() => tasks.reduce<Record<string, EditableTask[]>>((result, task) => { (result[task.category] ??= []).push(task); return result; }, {}), [tasks]);
  const complete = tasks.filter((task) => task.status === "Complete").length;
  const overdue = tasks.filter((task) => task.status === "Overdue" || (task.due_date && task.status !== "Complete" && new Date(task.due_date) < new Date())).length;
  const percentage = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;

  async function saveTask(task: EditableTask, formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const responseText = String(formData.get("response_text") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const quantity = Math.max(1, Number(formData.get("quantity") ?? 1));
    const status = String(formData.get("status") ?? "Needs You") as TaskStatus;
    const dueDate = String(formData.get("due_date") ?? "").trim();
    const { data, error } = await supabase.from("tasks").update({ title, description, response_text: responseText || null, category, quantity, status, due_date: dueDate || null }).eq("id", task.id).select(taskSelect).single();
    if (error || !data) setMessage(error?.message ?? "Could not update task."); else setTasks((current) => current.map((item) => item.id === task.id ? data : item));
  }

  async function reviewTask(task: Task, decision: "confirm" | "changes") {
    const note = reviewNotes[task.id]?.trim() ?? "";
    if (decision === "changes" && !note) { setMessage("Add a note explaining what needs to change."); return; }
    const { data, error } = await supabase.from("tasks").update({ status: decision === "confirm" ? "Complete" : "Needs You", admin_review_note: note || null }).eq("id", task.id).select(taskSelect).single();
    if (error || !data) setMessage(error?.message ?? "Could not save review."); else setTasks((current) => current.map((item) => item.id === task.id ? data : item));
  }

  function updateTask(updated: Task) { setTasks((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); }

  return <main className="portal-shell"><header className="portal-header"><Link href={`/admin/${eventId}/deliverables`} className="brand-mark"><span>PTC</span> / CONNECT</Link><div className="header-actions"><Link href={`/admin/${eventId}/deliverables`} className="back-link">← Sponsors</Link><SignOutButton /></div></header><section className="admin-hero"><div><p className="eyebrow">Sponsor roadmap / {event?.name ?? "Event"}</p><h1>{sponsor?.company_name ?? "Loading sponsor..."}</h1><p className="intro-copy">Click any task to view requirements, submissions, and review controls.</p></div><div className="admin-metric"><strong>{percentage}%</strong><small>{complete} of {tasks.length} tasks complete</small>{overdue > 0 && <span className="status-badge badge-danger">{overdue} overdue</span>}</div></section>{message && <div className="notice">{message}</div>}<section className="full-roadmap">{Object.entries(groups).map(([category, categoryTasks]) => <div className="category-section" key={category}><div className="category-heading"><p className="eyebrow">Deliverables</p><h2>{category}</h2><span>{categoryTasks.length} tasks</span></div><div className="task-list">{categoryTasks.map((task) => <article className={`admin-task-accordion ${expandedTask === task.id ? "is-expanded" : ""}`} key={task.id}><button className="admin-task-summary" type="button" onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}><span className={`task-mini-status ${task.status === "Complete" ? "is-complete" : task.status === "Overdue" ? "is-overdue" : ""}`}>{task.status === "Complete" ? "✓" : ""}</span><span className="task-copy"><strong>{task.title}</strong><small>Quantity {task.quantity}{task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</small></span><span className={`status-badge ${statusClass[task.status]}`}>{task.status}</span><span className="accordion-chevron">{expandedTask === task.id ? "−" : "+"}</span></button>{expandedTask === task.id && <div className="admin-task-detail">{task.description && <details className="task-requirements" open><summary>What this task requires</summary><p>{task.description}</p></details>}{task.response_text && <div className="submitted-input"><small>Sponsor submitted</small><p>{task.response_text}</p></div>}{task.file_url && <a className="task-action-link" href={task.file_url} target="_blank" rel="noreferrer">Submitted file: {task.file_name ?? "Open file"} ↗</a>}{task.admin_review_note && <div className="review-note"><small>Admin review note</small><p>{task.admin_review_note}</p></div>}<TaskSubmissionControls task={task} eventName={event?.name ?? "Event"} sponsorName={sponsor?.company_name ?? "Sponsor"} onUpdated={updateTask} /><div className="admin-review"><textarea value={reviewNotes[task.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="Optional review note, or explain requested changes" /><div className="task-actions"><button className="complete-button" onClick={() => void reviewTask(task, "confirm")} type="button">Confirm submission</button><button className="roadmap-toggle" onClick={() => void reviewTask(task, "changes")} type="button">Request changes</button><button className="roadmap-toggle" onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, editing: true } : item))} type="button">Edit task fields</button></div></div>{task.editing && <form className="task-edit-form" action={(formData) => void saveTask(task, formData)}><label>Title<input name="title" defaultValue={task.title} /></label><label>Description<textarea name="description" defaultValue={task.description ?? ""} /></label><label>Submission details<textarea name="response_text" defaultValue={task.response_text ?? ""} /></label><label>Category<input name="category" defaultValue={task.category} /></label><label>Quantity<input min="1" name="quantity" type="number" defaultValue={task.quantity} /></label><label>Status<select name="status" defaultValue={task.status}><option>Needs You</option><option>With Our Team</option><option>Complete</option><option>Overdue</option></select></label><label>Due date<input name="due_date" type="date" defaultValue={task.due_date ?? ""} /></label><button className="sync-button" type="submit">Save task and submission</button></form>}</div>}</article>)}</div></div>)}{!message && !tasks.length && <div className="empty-state">No deliverables found for this sponsor.</div>}</section></main>;
}
