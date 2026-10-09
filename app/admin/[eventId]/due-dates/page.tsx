"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { deliverableGroup } from "@/lib/task-utils";
import type { Event } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = { params: Promise<{ eventId: string }> };

export default function DueDatesPage({ params }: Props) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: eventData, error: eventError }, { data: links, error: linksError }, { data: dates, error: datesError }] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId),
        supabase.from("deliverable_due_dates").select("category, due_date").eq("event_id", eventId),
      ]);
      const failure = eventError ?? linksError ?? datesError;
      if (failure) {
        setMessage(failure.message);
        return;
      }
      setEvent(eventData);
      const savedDates = Object.fromEntries((dates ?? []).map((row) => [row.category, row.due_date]));
      setSaved(savedDates);
      setDrafts(savedDates);
      if (!links?.length) return;
      const { data: tasks, error: tasksError } = await supabase.from("tasks").select("category").in("sponsor_event_id", links.map((link) => link.id));
      if (tasksError) {
        setMessage(tasksError.message);
        return;
      }
      setCategories([...new Set((tasks ?? []).map((task) => deliverableGroup(task.category)))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
    }
    void load();
  }, [eventId]);

  async function update(category: string, dueDate: string | null) {
    setBusy(category);
    setMessage(null);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/deliverable-due-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ event_id: eventId, category, due_date: dueDate }),
    });
    const result = await response.json() as { error?: string; tasks_updated?: number };
    if (!response.ok) {
      setMessage(result.error ?? "Could not save the due date.");
    } else {
      const next = { ...saved };
      if (dueDate) next[category] = dueDate; else delete next[category];
      setSaved(next);
      setDrafts((current) => {
        const copy = { ...current };
        if (dueDate) copy[category] = dueDate; else delete copy[category];
        return copy;
      });
      setMessage(dueDate ? `${category}: due date saved and applied to ${result.tasks_updated ?? 0} task${result.tasks_updated === 1 ? "" : "s"}.` : `${category}: due date removed from ${result.tasks_updated ?? 0} task${result.tasks_updated === 1 ? "" : "s"}.`);
    }
    setBusy(null);
  }

  return (
    <main className="portal-shell">
      <header className="portal-header"><Link href="/admin" className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link><div className="header-actions"><Link href={`/admin/${eventId}/deliverables`} className="back-link">← Deliverables</Link><SignOutButton /></div></header>
      <section className="admin-hero"><div><p className="eyebrow">Operations / due dates</p><h1>{event?.name ?? "Loading event..."}</h1><p className="intro-copy">Set one due date per deliverable. It applies to every task in that deliverable for all sponsors.</p></div></section>
      {message && <div className="notice">{message}</div>}
      <section className="admin-table-wrap">
        <table>
          <thead><tr><th>Deliverable</th><th>Due date</th><th /></tr></thead>
          <tbody>
            {categories.map((category) => {
              const draft = drafts[category] ?? "";
              const savedValue = saved[category] ?? "";
              return (
                <tr key={category}>
                  <td>{category}</td>
                  <td><input type="date" aria-label={`Due date for ${category}`} value={draft} disabled={busy === category} onChange={(changeEvent) => setDrafts((current) => ({ ...current, [category]: changeEvent.target.value }))} /></td>
                  <td>
                    <button className="sync-button" type="button" disabled={busy === category || !draft || draft === savedValue} onClick={() => void update(category, draft)}>{savedValue ? "Save change" : "Save"}</button>{" "}
                    <button className="roadmap-toggle" type="button" disabled={busy === category || !savedValue} onClick={() => void update(category, null)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!message && categories.length === 0 && <div className="empty-state">No deliverables found for this event.</div>}
      </section>
    </main>
  );
}
