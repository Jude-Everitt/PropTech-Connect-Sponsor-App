"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { canonicalTicketTaskTitle } from "@/lib/contract-tasks";
import { isBrandingDeliverableCategory, isGeneratedCopyTask, isObsoleteBoothApprovalTask, isObsoleteBrandingArtworkTask, isSponsorContactFieldTask } from "@/lib/task-utils";
import type { Event } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = { params: Promise<{ eventId: string }> };
type HealthItem = { category: string; complete: number; total: number; incomplete: number; percentage: number; overdue: number; issued?: number; remaining?: number; taskComplete?: number; taskTotal?: number; isTicket?: boolean };
const ticketTaskTitles = ["Issue Team Tickets", "Issue Speaker Team Ticket", "Issue RE Tickets", "Confirm VIP Attendees"];
const ticketTileTitles: Record<string, string> = {
  "Issue Team Tickets": "Team Tickets",
  "Issue Speaker Team Ticket": "Speaker Team Ticket",
  "Issue RE Tickets": "RE Tickets",
  "Confirm VIP Attendees": "VIP Attendees",
};

export default function EventHealthPage({ params }: Props) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [health, setHealth] = useState<HealthItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadHealth() {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const [{ data: eventData, error: eventError }, { data: links, error: linksError }] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId),
      ]);
      if (eventError || linksError) {
        setMessage(eventError?.message ?? linksError?.message ?? "Could not load event health.");
        return;
      }
      setEvent(eventData);
      if (!links?.length) return;
      const { data: tasks, error: tasksError } = await supabase.from("tasks").select("sponsor_event_id, title, category, status, due_date, quantity, input_values").in("sponsor_event_id", links.map((link) => link.id));
      if (tasksError) {
        setMessage(tasksError.message);
        return;
      }
      const { data: registrations, error: registrationsError } = await supabase.from("cvent_ticket_registrations").select("sponsor_event_id, task_title, status").in("sponsor_event_id", links.map((link) => link.id));
      if (registrationsError) {
        setMessage(registrationsError.message);
        return;
      }
      const confirmedBySponsorTask = new Map<string, number>();
      (registrations ?? []).forEach((registration) => {
        if (registration.status.toLowerCase() !== "accepted" || !registration.sponsor_event_id) return;
        const key = `${registration.sponsor_event_id}::${registration.task_title}`;
        confirmedBySponsorTask.set(key, (confirmedBySponsorTask.get(key) ?? 0) + 1);
      });
      const grouped = new Map<string, HealthItem>();
      (tasks ?? []).filter((task) => !isGeneratedCopyTask(task.title) && !isObsoleteBoothApprovalTask(task.title, task.category) && !isObsoleteBrandingArtworkTask(task.title, task.category) && !isSponsorContactFieldTask(task.title, task.category)).forEach((task) => {
        const canonicalTitle = canonicalTicketTaskTitle(task.title);
        if (ticketTaskTitles.includes(canonicalTitle)) {
          const quantity = Math.max(0, task.quantity ?? 0);
          const nominees = task.input_values && typeof task.input_values === "object" && Array.isArray(task.input_values.nominees) ? task.input_values.nominees.length : null;
          const issued = canonicalTitle === "Confirm VIP Attendees" && nominees !== null
            ? Math.min(quantity, nominees)
            : Math.min(quantity, confirmedBySponsorTask.get(`${task.sponsor_event_id}::${canonicalTitle}`) ?? 0);
          const current = grouped.get(canonicalTitle) ?? { category: canonicalTitle, complete: 0, incomplete: 0, total: 0, percentage: 0, overdue: 0, issued: 0, remaining: 0, taskComplete: 0, taskTotal: 0, isTicket: true };
          current.total += quantity;
          current.taskTotal = (current.taskTotal ?? 0) + 1;
          if (task.status === "Complete") current.taskComplete = (current.taskComplete ?? 0) + 1;
          current.issued = (current.issued ?? 0) + issued;
          current.remaining = (current.remaining ?? 0) + Math.max(0, quantity - issued);
          current.complete += issued;
          current.incomplete += Math.max(0, quantity - issued);
          if (task.status === "Overdue" || (task.status !== "Complete" && task.due_date && new Date(`${task.due_date}T00:00:00`) < startOfToday)) current.overdue += 1;
          grouped.set(canonicalTitle, current);
          return;
        }
        if (task.category.toLowerCase() === "tickets" || task.category.toLowerCase() === "vip tickets" || task.category.toLowerCase() === "re tickets") return;
        const category = isBrandingDeliverableCategory(task.category) ? "Branding" : task.category;
        const current = grouped.get(category) ?? { category, complete: 0, incomplete: 0, total: 0, percentage: 0, overdue: 0 };
        current.total += 1;
        if (task.status === "Complete") current.complete += 1;
        else current.incomplete += 1;
        if (task.status === "Overdue" || (task.status !== "Complete" && task.due_date && new Date(`${task.due_date}T00:00:00`) < startOfToday)) current.overdue += 1;
        grouped.set(category, current);
      });
      setHealth(Array.from(grouped.values()).map((item) => ({ ...item, percentage: item.total ? Math.round((item.complete / item.total) * 100) : 0 })));
    }
    void loadHealth();
  }, [eventId]);

  const overall = useMemo(() => {
    const total = health.reduce((sum, item) => sum + (item.isTicket ? item.taskTotal ?? 0 : item.total), 0);
    const complete = health.reduce((sum, item) => sum + (item.isTicket ? item.taskComplete ?? 0 : item.complete), 0);
    const overdue = health.reduce((sum, item) => sum + item.overdue, 0);
    return { total, complete, overdue, percentage: total ? Math.round((complete / total) * 100) : 0 };
  }, [health]);

  return <main className="portal-shell"><header className="portal-header"><Link href={`/admin/${eventId}/deliverables`} className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link><div className="header-actions"><Link href={`/admin/${eventId}/deliverables`} className="back-link">← Tasks</Link><SignOutButton /></div></header><section className="admin-hero"><div><p className="eyebrow">Event health / {event?.name ?? "Loading event"}</p><h1>Task status<br /><em>across sponsors</em></h1><p className="intro-copy">Read-only completion totals by deliverable.</p></div><div className="admin-metric"><strong>{overall.percentage}%</strong><small>{overall.complete} / {overall.total} tasks complete</small>{overall.overdue > 0 && <span className="status-badge badge-danger">{overall.overdue} overdue</span>}</div></section>{message && <div className="notice">{message}</div>}<section className="health-page-grid">{health.map((item) => <article className="health-page-card" key={item.category}><div><p className="eyebrow">{item.isTicket ? "Ticket task" : "Deliverable"}</p><h2>{item.isTicket ? ticketTileTitles[item.category] ?? item.category : item.category}</h2></div><strong>{item.percentage}%</strong><div className="health-track"><span style={{ width: `${item.percentage}%` }} /></div><div className="health-page-meta">{item.isTicket ? <><span>{item.issued ?? 0} issued / {item.total} allocated</span><span>{item.remaining ?? 0} remaining</span></> : <><span>{item.complete} complete</span><span>{item.incomplete} incomplete</span></>}{item.overdue > 0 ? <span className="status-badge badge-danger">{item.overdue} overdue</span> : <span className="status-badge badge-success">No overdue tasks</span>}</div></article>)}{!message && !health.length && <div className="empty-state">No task statuses are available for this event yet.</div>}</section></main>;
}
