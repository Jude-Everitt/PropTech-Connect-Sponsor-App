"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = { params: Promise<{ eventId: string }> };
type HealthItem = { category: string; complete: number; total: number; percentage: number; overdue: number };

export default function EventHealthPage({ params }: Props) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [health, setHealth] = useState<HealthItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadHealth() {
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
      const { data: tasks, error: tasksError } = await supabase.from("tasks").select("category, status, due_date").in("sponsor_event_id", links.map((link) => link.id));
      if (tasksError) {
        setMessage(tasksError.message);
        return;
      }
      const grouped = new Map<string, HealthItem>();
      (tasks ?? []).forEach((task) => {
        const current = grouped.get(task.category) ?? { category: task.category, complete: 0, total: 0, percentage: 0, overdue: 0 };
        current.total += 1;
        if (task.status === "Complete") current.complete += 1;
        if (task.status === "Overdue" || (task.due_date && task.status !== "Complete" && new Date(task.due_date) < new Date())) current.overdue += 1;
        grouped.set(task.category, current);
      });
      setHealth(Array.from(grouped.values()).map((item) => ({ ...item, percentage: item.total ? Math.round((item.complete / item.total) * 100) : 0 })));
    }
    void loadHealth();
  }, [eventId]);

  const overall = useMemo(() => {
    const total = health.reduce((sum, item) => sum + item.total, 0);
    const complete = health.reduce((sum, item) => sum + item.complete, 0);
    const overdue = health.reduce((sum, item) => sum + item.overdue, 0);
    return { total, complete, overdue, percentage: total ? Math.round((complete / total) * 100) : 0 };
  }, [health]);

  return <main className="portal-shell"><header className="portal-header"><Link href={`/admin/${eventId}/deliverables`} className="brand-mark"><span>PTC</span> / CONNECT</Link><div className="header-actions"><Link href={`/admin/${eventId}/deliverables`} className="back-link">← Sponsors</Link><SignOutButton /></div></header><section className="admin-hero"><div><p className="eyebrow">Event health / {event?.name ?? "Loading event"}</p><h1>How healthy<br /><em>is the event?</em></h1><p className="intro-copy">A clear view of deliverable completion across every sponsor campaign.</p></div><div className="admin-metric"><strong>{overall.percentage}%</strong><small>{overall.complete} / {overall.total} tasks complete</small>{overall.overdue > 0 && <span className="status-badge badge-danger">{overall.overdue} overdue</span>}</div></section>{message && <div className="notice">{message}</div>}<section className="health-page-grid">{health.map((item) => <article className="health-page-card" key={item.category}><div><p className="eyebrow">Deliverable category</p><h2>{item.category}</h2></div><strong>{item.percentage}%</strong><div className="health-track"><span style={{ width: `${item.percentage}%` }} /></div><div className="health-page-meta"><span>{item.complete} of {item.total} complete</span>{item.overdue > 0 ? <span className="status-badge badge-danger">{item.overdue} overdue</span> : <span className="status-badge badge-success">On track</span>}</div></article>)}{!message && !health.length && <div className="empty-state">No deliverables have been synced for this event yet.</div>}</section></main>;
}
