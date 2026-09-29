"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { getContractRow, getContractTasks } from "@/lib/contract-tasks";
import { isGeneratedCopyTask } from "@/lib/task-utils";
import type { Event, Task } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = { params: Promise<{ eventId: string }> };
type Sponsor = { id: string; company_name: string; tier: string; contract_details: Record<string, string> };
type Row = Pick<Task, "id" | "sponsor_event_id" | "title" | "category" | "status" | "due_date" | "quantity"> & { sponsor: Sponsor };
type SponsorEventLink = { id: string; sponsor_id: string };
type SponsorSummary = {
  sponsor: Sponsor;
  tasks: Row[];
  complete: number;
  awaitingReview: number;
  awaitingSponsor: number;
  overdue: number;
  maxOverdueDays: number;
  percentage: number;
};

function taskState(task: Pick<Task, "status" | "due_date">, today: Date) {
  if (task.status === "Complete") return "complete" as const;
  if (task.status === "pending_review" || task.status === "With Our Team") return "review" as const;
  if (task.status === "Overdue") return "overdue" as const;
  if (task.due_date && new Date(`${task.due_date}T00:00:00`) < today) return "overdue" as const;
  return "awaiting" as const;
}

function taskStatusDisplay(task: Pick<Task, "status" | "due_date">, today: Date) {
  const state = taskState(task, today);
  if (state === "complete") return { label: "Complete", className: "badge-success" };
  if (state === "review") return { label: "Needs admin", className: "badge-warning" };
  if (state === "overdue") return { label: "Overdue", className: "badge-danger" };
  return { label: "Needs sponsor", className: "badge-danger" };
}

function overdueDays(task: Pick<Task, "status" | "due_date">, today: Date) {
  if (!task.due_date) return task.status === "Overdue" ? 1 : 0;
  const due = new Date(`${task.due_date}T00:00:00`);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

export default function AdminDeliverablesPage({ params }: Props) {
  const { eventId } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsorEventLinks, setSponsorEventLinks] = useState<SponsorEventLink[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [activeCategory, setActiveCategory] = useState("Sponsors");
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedSponsor, setSelectedSponsorState] = useState<SponsorSummary | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  function setSelectedSponsor(value: SponsorSummary | null | ((current: SponsorSummary | null) => SponsorSummary | null)) {
    if (value && typeof value !== "function" && activeCategory === "Sponsors") {
      router.push(`/admin/${eventId}/sponsors/${value.sponsor.id}`);
      return;
    }
    setSelectedSponsorState(value);
  }

  async function syncSpreadsheet() {
    setSyncing(true);
    setMessage(null);
    const session = (await supabase.auth.getSession()).data.session;
    const response = await fetch("/api/sync/sheet", {
      method: "POST",
      body: JSON.stringify({ event_id: eventId }),
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    });
    const result = (await response.json()) as { error?: string; sponsors_synced?: number; tasks_created?: number };
    if (!response.ok) {
      setMessage(result.error ?? "Spreadsheet sync failed.");
    } else {
      setMessage(`Synced ${result.sponsors_synced ?? 0} sponsors and ${result.tasks_created ?? 0} deliverables.`);
      window.location.reload();
    }
    setSyncing(false);
  }

  useEffect(() => {
    async function loadDeliverables() {
      const [{ data: eventData, error: eventError }, { data: links, error: linkError }] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location, google_sheet_id, google_sheet_range").eq("id", eventId).single(),
        supabase.from("sponsor_events").select("id, sponsor_id").eq("event_id", eventId),
      ]);
      if (eventError || linkError) {
        setMessage(eventError?.message ?? linkError?.message ?? "Could not load event.");
        return;
      }
      setEvent(eventData);
      setSponsorEventLinks(links ?? []);
      if (!links?.length) return;
      const sponsorIds = links.map((link) => link.sponsor_id);
      const linkIds = links.map((link) => link.id);
      const [{ data: sponsors }, { data: tasks, error: taskError }] = await Promise.all([
        supabase.from("sponsors").select("id, company_name, tier, contract_details").in("id", sponsorIds),
        supabase.from("tasks").select("id, sponsor_event_id, title, category, status, due_date, quantity").in("sponsor_event_id", linkIds),
      ]);
      if (taskError) {
        setMessage(taskError.message);
        return;
      }
      const contractSponsors = (sponsors ?? []).filter((sponsor) => {
        return sponsor.contract_details.contract_roster === true;
      }).map((sponsor) => {
        const contract = getContractRow(sponsor.contract_details);
        const companyName = contract.company_name?.trim();
        return companyName ? { ...sponsor, company_name: companyName } : sponsor;
      });
      setSponsors(contractSponsors);
      const sponsorMap = new Map(contractSponsors.map((sponsor) => [sponsor.id, sponsor]));
      const linkSponsorMap = new Map(links.map((link) => [link.id, link.sponsor_id]));
      setRows((tasks ?? []).filter((task) => !isGeneratedCopyTask(task.title)).flatMap((task) => {
        const sponsor = sponsorMap.get(linkSponsorMap.get(task.sponsor_event_id) ?? "");
        if (!sponsor) return [];
        const entitlements = getContractTasks(getContractRow(sponsor.contract_details));
        const entitlement = entitlements.find((item) => item.title === task.title && item.category === task.category)
          ?? entitlements.find((item) => item.title === task.title);
        return entitlement ? [{ ...task, category: entitlement.category, quantity: entitlement.quantity, sponsor }] : [];
      }));
    }
    void loadDeliverables();
  }, [eventId]);

  const categories = useMemo(() => ["Sponsors", ...Array.from(new Set(rows.map((row) => row.category)))], [rows]);
  const visibleRows = activeCategory === "Sponsors" ? rows : rows.filter((row) => row.category === activeCategory);
  const summaries = useMemo<SponsorSummary[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return sponsors.flatMap((sponsor) => {
      const sponsorLinkIds = new Set(sponsorEventLinks.filter((link) => link.sponsor_id === sponsor.id).map((link) => link.id));
      const sponsorTasks = visibleRows.filter((row) => row.sponsor.id === sponsor.id && sponsorLinkIds.has(row.sponsor_event_id));
      if (activeCategory !== "Sponsors" && sponsorTasks.length === 0) return [];
      const summary: SponsorSummary = { sponsor, tasks: sponsorTasks, complete: 0, awaitingReview: 0, awaitingSponsor: 0, overdue: 0, maxOverdueDays: 0, percentage: 0 };
      sponsorTasks.forEach((task) => {
        const state = taskState(task, today);
        if (state === "complete") summary.complete += 1;
        else if (state === "review") summary.awaitingReview += 1;
        else if (state === "overdue") {
          summary.overdue += 1;
          summary.maxOverdueDays = Math.max(summary.maxOverdueDays, overdueDays(task, today));
        } else summary.awaitingSponsor += 1;
      });
      summary.percentage = sponsorTasks.length ? Math.round((summary.complete / sponsorTasks.length) * 100) : 0;
      return [summary];
    }).sort((a, b) => Number(a.tasks.length === 0) - Number(b.tasks.length === 0) || b.overdue - a.overdue || b.maxOverdueDays - a.maxOverdueDays || a.percentage - b.percentage || b.awaitingReview - a.awaitingReview || a.sponsor.company_name.localeCompare(b.sponsor.company_name));
  }, [sponsors, sponsorEventLinks, visibleRows, activeCategory]);
  const searchTerm = sponsorSearch.trim().toLowerCase();
  const filteredSummaries = searchTerm
    ? summaries.filter((summary) => summary.sponsor.company_name.toLowerCase().includes(searchTerm))
    : summaries;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventCounts = rows.reduce((counts, row) => {
    const state = taskState(row, today);
    if (state === "complete") counts.complete += 1;
    else if (state === "review") counts.awaitingReview += 1;
    else if (state === "overdue") counts.overdue += 1;
    else counts.awaitingSponsor += 1;
    return counts;
  }, { complete: 0, awaitingReview: 0, overdue: 0, awaitingSponsor: 0 });

  async function saveDueDate(task: Row, formData: FormData) {
    const dueDate = String(formData.get("due_date") ?? "").trim();
    setSavingTask(task.id);
    setEditMessage(null);
    const { data, error } = await supabase.from("tasks").update({ due_date: dueDate || null }).eq("id", task.id).select("id, due_date").single();
    if (error || !data) {
      setEditMessage(error?.message ?? "Could not update due date.");
    } else {
      setRows((current) => current.map((row) => row.id === task.id ? { ...row, due_date: data.due_date } : row));
      setSelectedSponsorState((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, due_date: data.due_date } : item) } : current);
      setEditingTask(null);
    }
    setSavingTask(null);
  }

  return (
    <main className="portal-shell">
      <header className="portal-header"><Link href="/admin" className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link><div className="header-actions"><button className="sync-button" disabled={syncing} onClick={() => void syncSpreadsheet()}>{syncing ? "Syncing..." : "Sync now"}</button><Link href="/admin" className="back-link">← Admin home</Link><SignOutButton /></div></header>
      <section className="admin-hero"><div><p className="eyebrow">Operations / deliverables</p><h1>{event?.name ?? "Loading event..."}</h1><p className="intro-copy">Sponsor progress, ordered by who needs attention first.</p></div><div className="admin-metric"><strong>{eventCounts.complete}<span> / {rows.length}</span></strong><small>confirmed</small></div></section>
      <Link className="primary-button event-health-button" href={`/admin/${eventId}/health`}>Event health <span>↗</span></Link>
      {message && <div className="notice">{message}</div>}
      {activeCategory === "Sponsors" && <section className="deliverable-status-summary" aria-label="Event deliverable status summary"><strong>{eventCounts.complete} confirmed</strong><span>{eventCounts.awaitingReview} awaiting review</span><span>{eventCounts.awaitingSponsor} awaiting sponsors</span><span className={eventCounts.overdue > 0 ? "status-badge badge-danger" : ""}>{eventCounts.overdue} overdue</span></section>}
      <nav className="category-tabs" aria-label="Deliverable categories">{categories.map((category) => <button className={activeCategory === category ? "active" : ""} key={category} onClick={() => setActiveCategory(category)}>{category}</button>)}</nav>
      <div className="sponsor-search"><label className="visually-hidden" htmlFor="sponsor-search">Search sponsors</label><input id="sponsor-search" type="search" autoComplete="off" placeholder="Search sponsors" value={sponsorSearch} onChange={(event) => setSponsorSearch(event.target.value)} /></div>
      <section className="admin-table-wrap"><table><thead><tr><th>Sponsor</th><th>Tier</th><th>Confirmed</th><th>Awaiting review</th><th>Awaiting sponsor</th><th>Overdue</th><th>Completion</th></tr></thead><tbody>{filteredSummaries.map((summary) => <tr key={summary.sponsor.id} className="summary-row" onClick={() => setSelectedSponsor(summary)}><td className="sponsor-cell"><div className="sponsor-cell-content"><span className="sponsor-avatar">{summary.sponsor.company_name.slice(0, 1)}</span><span>{summary.sponsor.company_name}</span></div></td><td><span className="tier-label">{summary.sponsor.tier}</span></td><td>{summary.complete} / {summary.tasks.length}</td><td>{summary.awaitingReview || "—"}</td><td>{summary.awaitingSponsor || "—"}</td><td>{summary.overdue > 0 ? <span className="status-badge badge-danger">{summary.overdue} overdue</span> : "—"}</td><td><div className="progress-cell"><strong>{summary.percentage}%</strong><div className="progress-track"><span style={{ width: `${summary.percentage}%` }} /></div></div></td></tr>)}</tbody></table>{!message && filteredSummaries.length === 0 && <div className="empty-state">{searchTerm ? "No sponsors match your search." : activeCategory === "Sponsors" ? "No sponsors are linked to this event yet." : "No sponsors have deliverables in this category."}</div>}</section>
      {selectedSponsor && <div className="roadmap-overlay" role="presentation" onClick={() => setSelectedSponsor(null)}>
        <aside className="roadmap-panel" role="dialog" aria-modal="true" aria-label={`${selectedSponsor.sponsor.company_name} roadmap`} onClick={(event) => event.stopPropagation()}>
          <div className="roadmap-panel-header">
            <div>
              <p className="eyebrow">Sponsor roadmap</p>
              <div className="roadmap-panel-title-row">
                <h2>{selectedSponsor.sponsor.company_name}</h2>
                {activeCategory === "Exhibition Booth" && <div className="roadmap-booth-position"><small>Booth position</small><strong>{String(selectedSponsor.sponsor.contract_details.booth_position ?? "").trim() || "Unassigned"}</strong></div>}
              </div>
              <span>{selectedSponsor.sponsor.tier}</span>
            </div>
            <button className="roadmap-close" aria-label="Close roadmap" onClick={() => setSelectedSponsor(null)}>×</button>
          </div>
          <div className="roadmap-panel-progress">
            <strong>{selectedSponsor.percentage}%</strong>
            <span>{selectedSponsor.complete} of {selectedSponsor.tasks.length} complete</span>
            {selectedSponsor.overdue > 0 && <span className="status-badge badge-danger">{selectedSponsor.overdue} overdue</span>}
          </div>
          {editMessage && <div className="notice">{editMessage}</div>}
          <div className="roadmap-panel-list">
            {selectedSponsor.tasks.map((task) => {
              const statusDisplay = taskStatusDisplay(task, today);
              return <div className="roadmap-detail-task" key={task.id}>
                <span className={`task-mini-status ${task.status === "Complete" ? "is-complete" : statusDisplay.label === "Overdue" ? "is-overdue" : ""}`}>{task.status === "Complete" ? "✓" : ""}</span>
                {editingTask === task.id ? (
                  <form className="task-edit-form" action={(formData) => void saveDueDate(task, formData)}>
                    <label>Due date<input name="due_date" type="date" defaultValue={task.due_date ?? ""} /></label>
                    <div className="task-edit-actions">
                      <button className="sync-button" type="submit" disabled={savingTask === task.id}>{savingTask === task.id ? "Saving..." : "Save due date"}</button>
                      <button className="roadmap-toggle" type="button" onClick={() => setEditingTask(null)}>Cancel</button>
                    </div>
                  </form>
                ) : <>
                  <div><strong>{task.title}</strong><small>{task.category} · Qty {task.quantity}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</small></div>
                  <span className={`status-badge ${statusDisplay.className}`}>{statusDisplay.label}</span>
                  <button className="roadmap-toggle task-edit-button" type="button" onClick={() => { setEditingTask(task.id); setEditMessage(null); }}>Edit due date</button>
                </>}
              </div>;
            })}
            {!selectedSponsor.tasks.length && <div className="empty-state">No deliverables in this category.</div>}
          </div>
        </aside>
      </div>}
    </main>
  );
}
