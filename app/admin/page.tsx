"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { isGeneratedCopyTask, isObsoleteBrandingArtworkTask } from "@/lib/task-utils";
import type { Event } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, { complete: number; total: number; percentage: number }>>({});

  async function switchAccount() {
    await supabase.auth.signOut();
    router.push("/auth/sign-in?role=admin");
  }

  useEffect(() => {
    async function loadEvents() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setMessage("Sign in with an admin account to continue.");
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", userData.user.id).single();
      if (profile?.role !== "ADMIN") {
        setMessage("This dashboard is only available to admin profiles.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.from("events").select("id, name, start_date, location").order("start_date");
      if (error) setMessage(error.message);
      setEvents(data ?? []);
      if (data?.length) {
        const { data: links } = await supabase.from("sponsor_events").select("id, event_id").in("event_id", data.map((event) => event.id));
        const { data: tasks } = links?.length
          ? await supabase.from("tasks").select("title, category, sponsor_event_id, status").in("sponsor_event_id", links.map((link) => link.id))
          : { data: [] };
        const eventByLink = new Map((links ?? []).map((link) => [link.id, link.event_id]));
        const nextProgress: Record<string, { complete: number; total: number; percentage: number }> = {};
        (tasks ?? []).filter((task) => !isGeneratedCopyTask(task.title) && !isObsoleteBrandingArtworkTask(task.title, task.category)).forEach((task) => {
          const eventId = eventByLink.get(task.sponsor_event_id) ?? "";
          const current = nextProgress[eventId] ?? { complete: 0, total: 0, percentage: 0 };
          current.total += 1;
          if (task.status === "Complete") current.complete += 1;
          nextProgress[eventId] = current;
        });
        Object.values(nextProgress).forEach((item) => { item.percentage = item.total ? Math.round((item.complete / item.total) * 100) : 0; });
        setProgress(nextProgress);
      }
      setLoading(false);
    }
    void loadEvents();
  }, []);

  return (
    <main className="portal-shell">
      <header className="portal-header"><Link href="/" className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link><div className="header-actions"><div className="header-meta">ADMIN OPERATIONS <span className="status-dot" /></div><SignOutButton /></div></header>
      <section className="hub-intro"><p className="eyebrow">Admin dashboard</p><h1>Every sponsor.<br /><em>Every promise.</em></h1><p className="intro-copy">Select an event to monitor sponsor deliverables, contract commitments, and progress.</p></section>
      {message && <div className="empty-state error-state">{message}<div className="account-actions"><Link className="primary-button" href="/auth/sign-in?role=admin">Sign in as admin <span>↗</span></Link><button className="sync-button" onClick={() => void switchAccount()}>Switch account</button></div></div>}
      <section className="event-grid" aria-live="polite">
        {loading && <div className="empty-state">Loading events...</div>}
        {!loading && !message && events.length === 0 && <div className="empty-state">No events have been configured yet.</div>}
        {events.map((event, index) => { const eventProgress = progress[event.id] ?? { complete: 0, total: 0, percentage: 0 }; return <Link className={`event-card event-card-${index % 3}`} href={`/admin/${event.id}/deliverables`} key={event.id}><div className="card-index">0{index + 1}</div><div><p className="card-kicker">{new Date(event.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p><h2>{event.name}</h2><p className="card-location">{event.location ?? "Location to be announced"}</p></div><div className="event-progress"><strong>{eventProgress.percentage}%</strong><small>{eventProgress.complete} / {eventProgress.total} deliverables complete</small></div><span className="card-arrow" aria-hidden="true">↗</span></Link>; })}
      </section>
    </main>
  );
}
