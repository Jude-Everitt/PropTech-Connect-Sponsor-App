"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import type { Event, Task } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";
import TaskSubmissionControls from "@/app/ui/task-submission-controls";

type Props = { params: Promise<{ eventId: string; sponsorId: string }> };
type Sponsor = { company_name: string };
const taskSelect = "id, sponsor_event_id, title, description, category, status, due_date, quantity, input_fields, input_values, action_url, action_label, response_text, file_url, file_name, file_id, ai_recommendation, ai_feedback, ai_reviewed_at, admin_review_note";

export default function AdminSubmissionsPage({ params }: Props) {
  const { eventId, sponsorId } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [reviewingTask, setReviewingTask] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: eventData, error: eventError }, { data: sponsorData, error: sponsorError }, { data: link, error: linkError }] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsors").select("company_name").eq("id", sponsorId).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId).eq("sponsor_id", sponsorId).single(),
      ]);
      if (eventError || sponsorError || linkError || !link) {
        setMessage(eventError?.message ?? sponsorError?.message ?? linkError?.message ?? "Could not load submissions.");
        return;
      }
      setEvent(eventData);
      setSponsor(sponsorData);
      const { data, error } = await supabase.from("tasks").select(taskSelect).eq("sponsor_event_id", link.id).order("category").order("title");
      if (error) setMessage(error.message);
      setTasks(data ?? []);
      setReviewNotes(Object.fromEntries((data ?? []).map((task) => [task.id, task.admin_review_note ?? ""])));
    }
    void load();
  }, [eventId, sponsorId]);

  async function reviewTask(task: Task, decision: "confirm" | "changes") {
    setReviewingTask(task.id);
    setMessage(null);
    const note = reviewNotes[task.id]?.trim() ?? "";
    if (decision === "changes" && !note) {
      setMessage("Add a review note explaining what the sponsor needs to change.");
      setReviewingTask(null);
      return;
    }
    const { data, error } = await supabase.from("tasks").update({ status: decision === "confirm" ? "Complete" : "Needs You", admin_review_note: note || null }).eq("id", task.id).select(taskSelect).single();
    if (error || !data) setMessage(error?.message ?? "Could not save review.");
    else setTasks((current) => current.map((item) => item.id === task.id ? data : item));
    setReviewingTask(null);
  }

  return <main className="portal-shell"><header className="portal-header"><Link href={`/admin/${eventId}/sponsors/${sponsorId}`} className="brand-mark"><span>PTC</span> / CONNECT</Link><div className="header-actions"><Link href={`/admin/${eventId}/sponsors/${sponsorId}`} className="back-link">← Roadmap</Link><SignOutButton /></div></header><section className="admin-hero"><div><p className="eyebrow">Admin submissions / {event?.name ?? "Event"}</p><h1>{sponsor?.company_name ?? "Sponsor"}</h1><p className="intro-copy">Review submitted details and files, then confirm or request changes.</p></div></section>{message && <div className="notice">{message}</div>}<section className="admin-submissions-page">{tasks.map((task) => <article className="admin-submission-card" key={task.id}><div><p className="eyebrow">{task.category}</p><h2>{task.title}</h2><small>Status: {task.status} · Quantity: {task.quantity}</small>{task.description && <details className="task-requirements"><summary>What this task requires</summary><p>{task.description}</p></details>}{task.response_text && <div className="submitted-input"><small>Submitted input</small><p>{task.response_text}</p></div>}{task.file_url && <a className="task-action-link" href={task.file_url} target="_blank" rel="noreferrer">Submitted file: {task.file_name ?? "Open file"} ↗</a>}{task.admin_review_note && <div className="review-note"><small>Admin review note</small><p>{task.admin_review_note}</p></div>}</div><TaskSubmissionControls task={task} eventName={event?.name ?? "Event"} sponsorName={sponsor?.company_name ?? "Sponsor"} viewingAsAdmin onUpdated={(updated) => setTasks((current) => current.map((item) => item.id === updated.id ? { ...updated } : item))} /><div className="admin-review"><textarea value={reviewNotes[task.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="Optional note, or explain requested changes" /><div className="task-actions"><button className="complete-button" disabled={reviewingTask === task.id} onClick={() => void reviewTask(task, "confirm")} type="button">Confirm submission</button><button className="roadmap-toggle" disabled={reviewingTask === task.id} onClick={() => void reviewTask(task, "changes")} type="button">Request changes</button></div></div></article>)}{!message && !tasks.length && <div className="empty-state">No tasks found for this sponsor.</div>}</section></main>;
}
