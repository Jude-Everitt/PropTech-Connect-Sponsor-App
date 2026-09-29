"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { getContractRow, getContractTasks, orderBoothTasks } from "@/lib/contract-tasks";
import { classifySponsorTask } from "@/lib/sponsor-overview";
import type { Event, Task } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = {
  eventId: string;
  sponsorId?: string;
  viewingAsAdmin?: boolean;
  status: "awaiting-review" | "awaiting-sponsor" | "overdue";
};
type Sponsor = { id: string; company_name: string; tier: string; contract_details: Record<string, unknown> };
type StatusTask = Pick<Task, "id" | "title" | "category" | "status" | "due_date" | "submitted_at" | "quantity" | "description" | "response_text" | "file_url" | "file_name">;

const statusConfig = {
  "awaiting-review": { title: "Submitted, awaiting review", state: "review", empty: "No deliverables are awaiting review." },
  "awaiting-sponsor": { title: "Not yet started / awaiting the sponsor", state: "pending", empty: "No deliverables are currently awaiting the sponsor." },
  overdue: { title: "Overdue deliverables", state: "overdue", empty: "No deliverables are overdue." },
} as const;

export default function SponsorTaskStatusList({ eventId, sponsorId, viewingAsAdmin = false, status }: Props) {
  const [event, setEvent] = useState<Event | null>(null);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [tasks, setTasks] = useState<StatusTask[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const config = statusConfig[status];

  useEffect(() => {
    async function load() {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setMessage("Sign in to view deliverables.");
        return;
      }

      let targetSponsorId = sponsorId;
      if (!viewingAsAdmin) {
        const { data: profile, error } = await supabase.from("user_profiles").select("sponsor_id").eq("id", authData.user.id).single();
        if (error || !profile?.sponsor_id) {
          setMessage("No sponsor is linked to this profile.");
          return;
        }
        targetSponsorId = profile.sponsor_id;
      }
      if (!targetSponsorId) {
        setMessage("No sponsor was selected.");
        return;
      }

      const [eventResult, sponsorResult, linkResult] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsors").select("id, company_name, tier, contract_details").eq("id", targetSponsorId).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId).eq("sponsor_id", targetSponsorId).single(),
      ]);
      if (eventResult.error || sponsorResult.error || linkResult.error || !linkResult.data) {
        setMessage(eventResult.error?.message ?? sponsorResult.error?.message ?? linkResult.error?.message ?? "Could not load deliverables.");
        return;
      }

      const { data, error } = await supabase.from("tasks")
        .select("id, title, category, status, due_date, submitted_at, quantity, description, response_text, file_url, file_name")
        .eq("sponsor_event_id", linkResult.data.id)
        .order("category")
        .order("title");
      if (error) {
        setMessage(error.message);
        return;
      }

      const entitlements = getContractTasks(getContractRow(sponsorResult.data.contract_details));
      const entitlementTitles = new Set(entitlements.map((task) => task.title));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const filtered = (data ?? []).filter((task) => entitlementTitles.has(task.title) && classifySponsorTask(task, today) === config.state).map((task) => {
        const entitlement = entitlements.find((item) => item.title === task.title && item.category === task.category)
          ?? entitlements.find((item) => item.title === task.title);
        return entitlement ? { ...task, category: entitlement.category } : task;
      });
      setEvent(eventResult.data);
      setSponsor(sponsorResult.data as Sponsor);
      setTasks(filtered);
    }
    void load();
  }, [eventId, sponsorId, viewingAsAdmin, status, config.state]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, StatusTask[]>();
    tasks.forEach((task) => {
      const group = groups.get(task.category) ?? [];
      group.push(task);
      groups.set(task.category, group);
    });
    for (const [category, group] of groups) {
      if (category.toLowerCase().includes("booth")) groups.set(category, orderBoothTasks(group));
    }
    return [...groups.entries()];
  }, [tasks]);

  const backHref = viewingAsAdmin ? `/admin/${eventId}/sponsors/${sponsorId}` : `/sponsor/${eventId}`;
  const reviewHref = `/admin/${eventId}/sponsors/${sponsorId}/submissions`;

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <Link href={backHref} className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link>
        <div className="header-actions"><Link href={backHref} className="back-link">← Roadmap</Link><SignOutButton /></div>
      </header>
      <section className="admin-hero">
        <div><p className="eyebrow">{viewingAsAdmin ? "Admin / deliverables" : "Sponsor deliverables"} / {event?.name ?? "Event"}</p><h1>{sponsor?.company_name ?? "Loading sponsor..."}</h1><p className="intro-copy">{config.title}</p></div>
        <div className="admin-metric"><strong>{tasks.length}</strong><small>{tasks.length === 1 ? "deliverable" : "deliverables"}</small></div>
      </section>
      {message && <div className="notice">{message}</div>}
      {viewingAsAdmin && status === "awaiting-review" && tasks.length > 0 && <Link className="primary-button" href={reviewHref}>Open review queue <span>↗</span></Link>}
      <section className="full-roadmap">
        {groupedTasks.map(([category, categoryTasks]) => (
          <div className="category-section" key={category}>
            <div className="category-heading"><h2>{category}</h2><span>{categoryTasks.length} matching</span></div>
            <div className="status-task-list">
              {categoryTasks.map((task) => (
                <article className="status-task-row" key={task.id}>
                  <div className="task-copy"><strong>{task.title}</strong><small>Quantity {task.quantity}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : " · No deadline set"}{task.submitted_at ? ` · Submitted ${new Date(task.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</small>
                    {task.description && <div className="task-instructions"><strong>Requirements</strong><p>{task.description}</p></div>}
                    {task.response_text && <p className="submitted-input">{task.response_text}</p>}
                    {task.file_url && <a className="task-action-link" href={task.file_url} target="_blank" rel="noreferrer">{task.file_name ?? "Open submitted file"} ↗</a>}
                  </div>
                  <span className={`status-badge ${status === "overdue" ? "badge-danger" : status === "awaiting-review" ? "badge-warning" : "badge-danger"}`}>{config.title}</span>
                </article>
              ))}
            </div>
          </div>
        ))}
        {!message && tasks.length === 0 && <div className="empty-state">{config.empty}</div>}
      </section>
    </main>
  );
}
