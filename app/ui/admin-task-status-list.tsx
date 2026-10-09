"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { classifyExportTask } from "@/lib/sponsor-contact-export";
import type { Event, Task } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = { eventId: string; sponsorId: string; state: "Incomplete" | "Overdue" };
type Sponsor = { company_name: string; tier: string };
type StatusTask = Pick<Task, "id" | "title" | "category" | "status" | "due_date" | "quantity" | "description">;

export default function AdminTaskStatusList({ eventId, sponsorId, state }: Props) {
  const [event, setEvent] = useState<Event | null>(null);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [tasks, setTasks] = useState<StatusTask[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const title = state === "Overdue" ? "Overdue tasks" : "Incomplete tasks";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setMessage("Sign in with an admin account to view task status.");
        return;
      }
      const { data: profile, error: profileError } = await supabase.from("user_profiles").select("role").eq("id", authData.user.id).single();
      if (profileError || profile?.role !== "ADMIN") {
        setMessage("Admin access is required to view task status.");
        return;
      }
      const [eventResult, sponsorResult, linkResult] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsors").select("company_name, tier").eq("id", sponsorId).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId).eq("sponsor_id", sponsorId).single(),
      ]);
      if (eventResult.error || sponsorResult.error || linkResult.error || !linkResult.data) {
        setMessage(eventResult.error?.message ?? sponsorResult.error?.message ?? linkResult.error?.message ?? "Could not load task status.");
        return;
      }
      const { data, error } = await supabase.from("tasks").select("id, title, category, status, due_date, quantity, description").eq("sponsor_event_id", linkResult.data.id).order("category").order("title");
      if (error) {
        setMessage(error.message);
        return;
      }
      if (cancelled) return;
      setEvent(eventResult.data);
      setSponsor(sponsorResult.data);
      setTasks((data ?? []).filter((task) => classifyExportTask(task) === state));
    }
    void load();
    return () => { cancelled = true; };
  }, [eventId, sponsorId, state]);

  return (
    <main className="portal-shell">
      <header className="portal-header"><Link href={`/admin/${eventId}/deliverables`} className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link><div className="header-actions"><Link href={`/admin/${eventId}/sponsors/${sponsorId}`} className="back-link">← Company</Link><SignOutButton /></div></header>
      <section className="admin-hero"><div><p className="eyebrow">Admin / task status / {event?.name ?? "Event"}</p><h1>{sponsor?.company_name ?? "Loading company..."}</h1><p className="intro-copy">{title}</p></div><div className="admin-metric"><strong>{tasks.length}</strong><small>{tasks.length === 1 ? "task" : "tasks"}</small></div></section>
      {message && <div className="notice">{message}</div>}
      <section className="status-task-list">{tasks.map((task) => <article className="status-task-row" key={task.id}><div className="task-copy"><strong>{task.title}</strong><small>{task.category} · Quantity {task.quantity}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : " · No deadline set"}</small>{task.description && <p>{task.description}</p>}</div><span className={`status-badge ${state === "Overdue" ? "badge-danger" : "badge-warning"}`}>{state}</span></article>)}{!message && tasks.length === 0 && <div className="empty-state">No {state.toLowerCase()} tasks for this company.</div>}</section>
    </main>
  );
}
