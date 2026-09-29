"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { getContractRow, getContractTasks } from "@/lib/contract-tasks";
import type { Event, Task, TaskStatus } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";
import TaskSubmissionControls from "@/app/ui/task-submission-controls";

type Props = {
  eventId: string;
  sponsorId?: string;
  viewingAsAdmin?: boolean;
};
type Sponsor = { id: string; company_name: string; tier: string; contract_details: Record<string, unknown> };
type EditableTask = Task & { editing?: boolean };

const taskSelect = "id, sponsor_event_id, title, description, category, status, submitted_at, due_date, quantity, input_fields, input_values, action_url, action_label, response_text, file_url, file_name, file_size_bytes, file_id, ai_recommendation, ai_feedback, ai_reviewed_at, admin_review_note";
const statusClass: Record<TaskStatus, string> = {
  "Needs You": "badge-danger",
  "With Our Team": "badge-warning",
  Complete: "badge-success",
  Overdue: "badge-danger",
  pending_review: "badge-warning",
};

function statusLabel(status: TaskStatus) {
  if (status === "Complete") return "Confirmed / approved";
  if (status === "pending_review" || status === "With Our Team") return "Submitted, awaiting your review";
  if (status === "Overdue") return "Overdue";
  return "Not yet started / awaiting the sponsor";
}

function categoryLabel(category: string) {
  const value = category.toLowerCase();
  if (value.includes("booth")) return "Booth";
  if (value.includes("panel")) return "Panels";
  if (value.includes("roundtable")) return "Roundtable";
  if (value.includes("case study")) return "Case study";
  if (value.includes("branding") || value.includes("pillar")) return "Branding";
  if (value.includes("ticket")) return "Tickets";
  if (value.includes("meeting")) return "Meetings";
  if (value.includes("tour")) return "Tours";
  if (value.includes("workshop")) return "Workshops";
  if (value.includes("innovation")) return "Innovation";
  if (value.includes("networking")) return "Networking";
  return category;
}

export default function SponsorRoadmap({ eventId, sponsorId, viewingAsAdmin = false }: Props) {
  const [event, setEvent] = useState<Event | null>(null);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [savingBoothPosition, setSavingBoothPosition] = useState(false);

  useEffect(() => {
    async function loadRoadmap() {
      setMessage(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setMessage("Sign in to view this roadmap.");
        return;
      }

      let targetSponsorId = sponsorId;
      if (!viewingAsAdmin) {
        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("sponsor_id")
          .eq("id", userData.user.id)
          .single();
        if (profileError || !profile?.sponsor_id) {
          setMessage("No sponsor is linked to this profile.");
          return;
        }
        targetSponsorId = profile.sponsor_id;
      }
      if (!targetSponsorId) {
        setMessage("No sponsor was selected for this roadmap.");
        return;
      }

      const [eventResult, sponsorResult, linkResult] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsors").select("id, company_name, tier, contract_details").eq("id", targetSponsorId).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId).eq("sponsor_id", targetSponsorId).single(),
      ]);
      if (eventResult.error || sponsorResult.error || linkResult.error || !linkResult.data) {
        setMessage(eventResult.error?.message ?? sponsorResult.error?.message ?? linkResult.error?.message ?? "Roadmap could not be loaded.");
        return;
      }

      const { data, error } = await supabase
        .from("tasks")
        .select(taskSelect)
        .eq("sponsor_event_id", linkResult.data.id)
        .order("category")
        .order("title");
      if (error) {
        setMessage(error.message);
        return;
      }

      const sponsorData = sponsorResult.data as Sponsor;
      const entitledTasks = getContractTasks(getContractRow(sponsorData.contract_details));
      const entitledTitles = new Set(entitledTasks.map((task) => task.title));
      const visibleTasks = (data ?? []).flatMap((task) => {
        if (!entitledTitles.has(task.title)) return [];
        const entitlement = entitledTasks.find((item) => item.title === task.title && item.category === task.category)
          ?? entitledTasks.find((item) => item.title === task.title);
        return entitlement ? [{
          ...task,
          category: entitlement.category,
          quantity: entitlement.quantity,
          description: task.description ?? entitlement.description,
          action_url: task.action_url ?? entitlement.action_url ?? null,
          action_label: task.action_label ?? entitlement.action_label ?? null,
        }] : [task];
      });

      setEvent(eventResult.data);
      setSponsor(sponsorData);
      setTasks(visibleTasks);
      setReviewNotes(Object.fromEntries(visibleTasks.map((task) => [task.id, task.admin_review_note ?? ""])));
    }
    void loadRoadmap();
  }, [eventId, sponsorId, viewingAsAdmin]);

  const groups = useMemo(() => tasks.reduce<Record<string, EditableTask[]>>((result, task) => {
    const category = categoryLabel(task.category);
    (result[category] ??= []).push(task);
    return result;
  }, {}), [tasks]);
  const complete = tasks.filter((task) => task.status === "Complete").length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = tasks.filter((task) => task.status === "Overdue" || (task.status !== "Complete" && task.status !== "pending_review" && task.status !== "With Our Team" && task.due_date && new Date(`${task.due_date}T00:00:00`) < today)).length;
  const percentage = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;
  const awaitingReview = tasks.filter((task) => task.status === "pending_review" || task.status === "With Our Team").length;
  const awaitingSponsor = tasks.filter((task) => task.status === "Needs You" && !(task.due_date && new Date(`${task.due_date}T00:00:00`) < today)).length;

  async function saveTask(task: EditableTask, formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const quantity = Math.max(1, Number(formData.get("quantity") ?? 1));
    const status = String(formData.get("status") ?? "Needs You") as TaskStatus;
    const dueDate = String(formData.get("due_date") ?? "").trim();
    if (!title || !category || !Number.isInteger(quantity)) {
      setMessage("Title, category, and a whole-number quantity are required.");
      return;
    }
    setSavingTask(task.id);
    setMessage(null);
    const { data, error } = await supabase
      .from("tasks")
      .update({ title, description, category, quantity, status, due_date: dueDate || null })
      .eq("id", task.id)
      .select(taskSelect)
      .single();
    if (error || !data) {
      setMessage(error?.message ?? "Could not update task.");
    } else {
      setTasks((current) => current.map((item) => item.id === task.id ? data : item));
      setEditingTask(null);
    }
    setSavingTask(null);
  }

  async function reviewTask(task: Task, decision: "confirm" | "changes") {
    const note = reviewNotes[task.id]?.trim() ?? "";
    if (decision === "changes" && !note) {
      setMessage("Add a note explaining what needs to change.");
      return;
    }
    setMessage(null);
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: decision === "confirm" ? "Complete" : "Needs You", admin_review_note: note || null })
      .eq("id", task.id)
      .select(taskSelect)
      .single();
    if (error || !data) setMessage(error?.message ?? "Could not save review.");
    else setTasks((current) => current.map((item) => item.id === task.id ? data : item));
  }

  function updateTask(updated: Task) {
    setTasks((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
  }

  async function saveBoothPosition(formData: FormData) {
    if (!sponsor) return;
    setSavingBoothPosition(true);
    setMessage(null);
    const contractDetails = {
      ...sponsor.contract_details,
      booth_position: String(formData.get("booth_position") ?? "").trim(),
    };
    const { error } = await supabase.from("sponsors").update({ contract_details: contractDetails }).eq("id", sponsor.id);
    if (error) setMessage(error.message);
    else setSponsor({ ...sponsor, contract_details: contractDetails });
    setSavingBoothPosition(false);
  }

  const homeHref = viewingAsAdmin ? `/admin/${eventId}/deliverables` : "/hub";

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <Link href={homeHref} className="brand-mark"><span>PTC</span> / CONNECT</Link>
        <div className="header-actions">
          <Link href={homeHref} className="back-link">{viewingAsAdmin ? "← Sponsors" : "← All events"}</Link>
          <SignOutButton />
        </div>
      </header>
      <section className="admin-hero">
        <div>
          <p className="eyebrow">{viewingAsAdmin ? "Admin view / " : "Sponsor roadmap / "}{event?.name ?? "Event"}</p>
          <h1>{sponsor?.company_name ?? "Loading sponsor..."}</h1>
          <p className="intro-copy">{viewingAsAdmin ? "Review and manage this sponsor's roadmap." : event?.location ?? "Your deliverables, in one clear view."}</p>
        </div>
        <div className="admin-metric">
          <strong>{percentage}%</strong>
          <small>{complete} of {tasks.length} confirmed</small>
          {overdue > 0 && <span className="status-badge badge-danger">{overdue} overdue</span>}
        </div>
      </section>
      <section className="deliverable-status-summary" aria-label="Sponsor deliverable status summary">
        <strong>{complete} of {tasks.length} confirmed</strong>
        <span>{awaitingReview} awaiting your review</span>
        <span>{awaitingSponsor} awaiting the sponsor</span>
        <span className={overdue > 0 ? "status-badge badge-danger" : ""}>{overdue} overdue</span>
      </section>
      {viewingAsAdmin && awaitingReview > 0 && sponsor && (
        <Link className="notice" href={`/admin/${eventId}/sponsors/${sponsor.id}/submissions`}>
          {awaitingReview} submission{awaitingReview === 1 ? "" : "s"} awaiting review
        </Link>
      )}
      {message && <div className="notice">{message}</div>}
      {(sponsor && Object.entries(sponsor.contract_details).some(([key, value]) => key !== "source_row" && value) || viewingAsAdmin) && (
        <section className="contract-strip">
          <p className="eyebrow">Campaign inputs</p>
          <div className="contract-fields">
            {Object.entries(sponsor?.contract_details ?? {}).filter(([key, value]) => key !== "source_row" && value).slice(0, 8).map(([key, value]) => (
              <div key={key}><small>{key.replace(/_/g, " ")}</small><strong>{String(value)}</strong></div>
            ))}
          </div>
          {viewingAsAdmin && sponsor && (
            <form className="task-edit-form" action={(formData) => void saveBoothPosition(formData)}>
              <label>Booth position<input name="booth_position" defaultValue={String(sponsor.contract_details.booth_position ?? "")} /></label>
              <button className="sync-button" type="submit" disabled={savingBoothPosition}>{savingBoothPosition ? "Saving..." : "Save booth position"}</button>
            </form>
          )}
        </section>
      )}
      <section className="full-roadmap">
        {Object.entries(groups).map(([category, categoryTasks]) => (
          <div className="category-section" key={category}>
            <div className="category-heading"><p className="eyebrow">Deliverables</p><h2>{category}</h2><span>{categoryTasks.length} tasks</span></div>
            <div className="task-list">
              {categoryTasks.map((task) => (
                <article className={`admin-task-accordion ${expandedTask === task.id ? "is-expanded" : ""}`} key={task.id}>
                  <button className="admin-task-summary" type="button" onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}>
                    <span className={`task-mini-status ${task.status === "Complete" ? "is-complete" : task.status === "Overdue" ? "is-overdue" : ""}`}>{task.status === "Complete" ? "✓" : ""}</span>
                    <span className="task-copy"><strong>{task.title}</strong><small>Quantity {task.quantity}{task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</small></span>
                    <span className={`status-badge ${statusClass[task.status]}`}>{statusLabel(task.status)}</span>
                    <span className="accordion-chevron">{expandedTask === task.id ? "−" : "+"}</span>
                  </button>
                  {expandedTask === task.id && (
                    <div className="admin-task-detail">
                      {task.description && <details className="task-requirements" open><summary>What this task requires</summary><p>{task.description}</p></details>}
                      {task.admin_review_note && <div className="review-note"><small>Admin review note</small><p>{task.admin_review_note}</p></div>}
                      <TaskSubmissionControls task={task} eventName={event?.name ?? "Event"} sponsorName={sponsor?.company_name ?? "Sponsor"} viewingAsAdmin={viewingAsAdmin} onUpdated={updateTask} />
                      {viewingAsAdmin && (
                        <>
                          <div className="admin-review">
                            <textarea value={reviewNotes[task.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="Optional review note, or explain requested changes" />
                            <div className="task-actions">
                              <button className="complete-button" onClick={() => void reviewTask(task, "confirm")} type="button">Approve submission</button>
                              <button className="roadmap-toggle" onClick={() => void reviewTask(task, "changes")} type="button">Request changes</button>
                              <button className="roadmap-toggle" onClick={() => setEditingTask(editingTask === task.id ? null : task.id)} type="button">{editingTask === task.id ? "Cancel edit" : "Edit task"}</button>
                            </div>
                          </div>
                          {editingTask === task.id && (
                            <form className="task-edit-form" action={(formData) => void saveTask(task, formData)}>
                              <label>Title<input name="title" defaultValue={task.title} /></label>
                              <label>Description<textarea name="description" defaultValue={task.description ?? ""} /></label>
                              <label>Category<input name="category" defaultValue={task.category} /></label>
                              <div className="task-edit-grid">
                                <label>Quantity<input min="1" name="quantity" type="number" defaultValue={task.quantity} /></label>
                                <label>Status<select name="status" defaultValue={task.status}><option>Needs You</option><option>With Our Team</option><option>Complete</option><option>Overdue</option></select></label>
                                <label>Deadline<input name="due_date" type="date" defaultValue={task.due_date ?? ""} /></label>
                              </div>
                              <button className="sync-button" type="submit" disabled={savingTask === task.id}>{savingTask === task.id ? "Saving..." : "Save task"}</button>
                            </form>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        ))}
        {!message && !tasks.length && <div className="empty-state">No deliverables found for this sponsor.</div>}
      </section>
    </main>
  );
}