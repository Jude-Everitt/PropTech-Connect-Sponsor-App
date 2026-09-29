"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Task, TaskStatus } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = { params: Promise<{ eventId: string }> };
type TaskGroup = Record<string, Task[]>;

const statusClass: Record<TaskStatus, string> = {
  "Needs You": "badge-danger",
  "With Our Team": "badge-warning",
  Complete: "badge-success",
  Overdue: "badge-danger",
};

export default function SponsorRoadmapPage({ params }: Props) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sponsorName, setSponsorName] = useState("");
  const [contractDetails, setContractDetails] = useState<Record<string, string>>({});
  const [uploadingTask, setUploadingTask] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [reviewingTask, setReviewingTask] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoadmap() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setMessage("Sign in to view your roadmap.");
        return;
      }
      const { data: profile } = await supabase.from("user_profiles").select("sponsor_id").eq("id", userData.user.id).single();
      if (!profile?.sponsor_id) {
        setMessage("No sponsor is linked to this profile.");
        return;
      }
      const [{ data: eventData }, { data: sponsor }, { data: link }] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsors").select("company_name, contract_details").eq("id", profile.sponsor_id).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId).eq("sponsor_id", profile.sponsor_id).single(),
      ]);
      setEvent(eventData);
      setSponsorName(sponsor?.company_name ?? "Sponsor");
      setContractDetails((sponsor?.contract_details ?? {}) as Record<string, string>);
      if (link) {
        const { data } = await supabase.from("tasks").select("id, sponsor_event_id, title, description, category, status, due_date, quantity, input_fields, input_values, action_url, action_label, response_text, file_url, file_name, file_id, ai_recommendation, ai_feedback, ai_reviewed_at, admin_review_note").eq("sponsor_event_id", link.id).order("due_date");
        setTasks(data ?? []);
        setResponses(Object.fromEntries((data ?? []).map((task) => [task.id, task.response_text ?? ""])));
      }
    }
    void loadRoadmap();
  }, [eventId]);

  const groupedTasks = useMemo<TaskGroup>(() => tasks.reduce<TaskGroup>((groups, task) => {
    (groups[task.category] ??= []).push(task);
    return groups;
  }, {}), [tasks]);
  const completeCount = tasks.filter((task) => task.status === "Complete").length;

  async function uploadForTask(task: Task, file: File) {
    if (!event) return;
    setUploadingTask(task.id);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("eventName", event.name);
    formData.append("sponsorName", sponsorName);
    const session = (await supabase.auth.getSession()).data.session;
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    const result = (await response.json()) as { error?: string; link?: string; id?: string };
    if (!response.ok) {
      setMessage(result.error ?? "Upload failed.");
    } else {
      const { error } = await supabase.from("tasks").update({ status: "Complete", file_url: result.link ?? null, file_id: result.id ?? null, file_name: file.name }).eq("id", task.id);
      if (error) setMessage(error.message);
      else setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "Complete", file_url: result.link ?? null, file_id: result.id ?? null, file_name: file.name } : item));
    }
    setUploadingTask(null);
  }

  async function saveText(task: Task) {
    setSavingTask(task.id);
    setMessage(null);
    const responseText = responses[task.id]?.trim() ?? "";
    if (!responseText) {
      setMessage("Enter a response before saving.");
      setSavingTask(null);
      return;
    }
    const { error } = await supabase.from("tasks").update({ response_text: responseText }).eq("id", task.id);
    if (error) setMessage(error.message);
    else setTasks((current) => current.map((item) => item.id === task.id ? { ...item, response_text: responseText } : item));
    setSavingTask(null);
  }

  async function markComplete(task: Task) {
    setSavingTask(task.id);
    const { error } = await supabase.from("tasks").update({ status: "Complete" }).eq("id", task.id);
    if (error) setMessage(error.message);
    else setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "Complete" } : item));
    setSavingTask(null);
  }

  async function reviewWithGemini(task: Task) {
    setReviewingTask(task.id);
    setMessage(null);
    const session = (await supabase.auth.getSession()).data.session;
    const response = await fetch("/api/review-task", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ task_id: task.id, response_text: responses[task.id] ?? task.response_text, file_name: task.file_name }),
    });
    const result = (await response.json()) as { error?: string; recommendation?: "COMPLETE" | "NEEDS_CHANGES"; feedback?: string };
    if (!response.ok) setMessage(result.error ?? "Gemini review failed.");
    else setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ai_recommendation: result.recommendation ?? null, ai_feedback: result.feedback ?? null, ai_reviewed_at: new Date().toISOString() } : item));
    setReviewingTask(null);
  }

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <Link href="/hub" className="brand-mark"><span>PTC</span> / CONNECT</Link>
        <div className="header-actions"><Link href="/hub" className="back-link">← All events</Link><SignOutButton /></div>
      </header>
      <section className="roadmap-hero">
        <div>
          <p className="eyebrow">Sponsor roadmap</p>
          <h1>{event?.name ?? "Loading event..."}</h1>
          <p className="intro-copy">{event?.location ?? "Your deliverables, in one clear view."}</p>
        </div>
        <div className="progress-block"><strong>{completeCount}<span> / {tasks.length || "—"}</span></strong><small>deliverables complete</small></div>
      </section>
      {Object.keys(contractDetails).filter((key) => key !== "source_row" && contractDetails[key]).length > 0 && <section className="contract-strip"><p className="eyebrow">Contract snapshot</p><div className="contract-fields">{Object.entries(contractDetails).filter(([key, value]) => key !== "source_row" && value).slice(0, 8).map(([key, value]) => <div key={key}><small>{key.replace(/_/g, " ")}</small><strong>{value}</strong></div>)}</div></section>}
      {message && <div className="notice">{message}</div>}
      <section className="roadmap-list">
        {Object.entries(groupedTasks).map(([category, categoryTasks]) => (
          <div className="category-section" key={category}>
            <div className="category-heading"><p className="eyebrow">Deliverables</p><h2>{category}</h2><span>{categoryTasks.length} items</span></div>
            <div className="task-list">
              {categoryTasks.map((task) => (
                <div className="task-row" key={task.id}>
                  <div className={`task-check ${task.status === "Complete" ? "is-complete" : ""}`}>{task.status === "Complete" ? "✓" : ""}</div>
                  <div className="task-copy"><strong>{task.title}{task.quantity > 1 ? ` × ${task.quantity}` : ""}</strong><small>{task.due_date ? `Due ${new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Date to be confirmed"}</small>{task.description && <details className="task-requirements"><summary>What this task requires</summary><p>{task.description}</p></details>}{task.action_url && <a className="task-action-link" href={task.action_url} target="_blank" rel="noreferrer">{task.action_label ?? "Open link"} ↗</a>}</div>
                  <span className={`status-badge ${statusClass[task.status]}`}>{task.status}</span>
                  <div className="task-actions"><label className="upload-button">{uploadingTask === task.id ? "Uploading..." : task.file_name ? "Replace file" : "Upload file"}<input type="file" disabled={uploadingTask !== null || savingTask !== null} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadForTask(task, file); }} /></label><button className="complete-button" disabled={savingTask !== null || task.status === "Complete"} onClick={() => void markComplete(task)} type="button">{task.status === "Complete" ? "Complete" : "Mark Task Complete"}</button><button className="roadmap-toggle" disabled={reviewingTask !== null} onClick={() => void reviewWithGemini(task)} type="button">{reviewingTask === task.id ? "Reviewing..." : "Ask Gemini to review"}</button></div>
                  <div className="task-response"><textarea aria-label={`Response for ${task.title}`} placeholder="Add your response or details (optional)" value={responses[task.id] ?? ""} onChange={(event) => setResponses((current) => ({ ...current, [task.id]: event.target.value }))} /><button className="roadmap-toggle" disabled={savingTask === task.id} onClick={() => void saveText(task)} type="button">{savingTask === task.id ? "Saving..." : "Save response"}</button></div>
                  {task.admin_review_note && <div className="review-note"><small>Admin review note</small><p>{task.admin_review_note}</p></div>}{task.ai_feedback && <div className={`ai-feedback ${task.ai_recommendation === "COMPLETE" ? "is-positive" : "is-warning"}`}><strong>Gemini: {task.ai_recommendation === "COMPLETE" ? "Looks complete" : "Needs changes"}</strong><span>{task.ai_feedback}</span></div>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {!message && tasks.length === 0 && <div className="empty-state">No deliverables have been assigned for this event yet.</div>}
      </section>
    </main>
  );
}
