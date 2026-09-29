"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Event, Task, TaskStatus } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = { params: Promise<{ eventId: string }> };
type Sponsor = { id: string; company_name: string; tier: string; contract_details: Record<string, string> };
type Row = Task & { sponsor: Sponsor };
type SponsorSummary = {
  sponsor: Sponsor;
  tasks: Row[];
  complete: number;
  overdue: number;
  percentage: number;
};

const tierOrder = ["platinum", "gold", "silver", "bronze", "start up", "startup"];

function tierRank(tier: string) {
  const normalized = tier.trim().toLowerCase();
  const rank = tierOrder.indexOf(normalized);
  return rank === -1 ? tierOrder.length : rank;
}

const statusClass: Record<TaskStatus, string> = {
  "Needs You": "badge-danger",
  "With Our Team": "badge-warning",
  Complete: "badge-success",
  Overdue: "badge-danger",
};

const contractFields = [
  ["requires_booth", "Requires Booth"], ["booth_position", "Booth Position"], ["team_tickets", "Team Tickets"],
  ["re_tickets", "RE Tickets"], ["vip_tickets", "VIP Tickets"], ["sponsor_panels", "Sponsor Panels"],
  ["specified_panel", "Specified Panel"], ["case_study", "Case Study"], ["innovation", "Innovation"],
  ["workshop", "Workshop"], ["private_meeting_room", "Private Meeting Room"], ["choose_rt_tour_meetings", "Choose RT, Tour, Meetings"],
  ["roundtable", "Roundtable"], ["tours", "Tours"], ["10_meetings", "10 Meetings"], ["t1_branding", "T1 Branding"],
  ["t2_branding", "T2 Branding"], ["t3_branding", "T3 Branding"], ["t4_branding", "T4 Branding"], ["pillars", "Pillars"],
  ["pillar_location", "Pillar Location"], ["networking_app_profile", "Networking App Profile"],
] as const;

export default function AdminDeliverablesPage({ params }: Props) {
  const { eventId } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [activeCategory, setActiveCategory] = useState("Sponsors");
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedSponsor, setSelectedSponsorState] = useState<SponsorSummary | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editingContract, setEditingContract] = useState(false);
  const [savingContract, setSavingContract] = useState(false);

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
      if (!links?.length) return;
      const sponsorIds = links.map((link) => link.sponsor_id);
      const linkIds = links.map((link) => link.id);
      const [{ data: sponsors }, { data: tasks, error: taskError }] = await Promise.all([
        supabase.from("sponsors").select("id, company_name, tier, contract_details").in("id", sponsorIds),
        supabase.from("tasks").select("id, sponsor_event_id, title, description, category, status, due_date, quantity, input_fields, input_values, action_url, action_label, response_text, file_url, file_name, file_id, ai_recommendation, ai_feedback, ai_reviewed_at, admin_review_note").in("sponsor_event_id", linkIds),
      ]);
      if (taskError) {
        setMessage(taskError.message);
        return;
      }
      const sponsorMap = new Map((sponsors ?? []).map((sponsor) => [sponsor.id, sponsor]));
      const linkSponsorMap = new Map(links.map((link) => [link.id, link.sponsor_id]));
      setRows((tasks ?? []).flatMap((task) => {
        const sponsor = sponsorMap.get(linkSponsorMap.get(task.sponsor_event_id) ?? "");
        return sponsor ? [{ ...task, sponsor }] : [];
      }));
    }
    void loadDeliverables();
  }, [eventId]);

  const categories = useMemo(() => ["Sponsors", ...Array.from(new Set(rows.map((row) => row.category)))], [rows]);
  const visibleRows = activeCategory === "Sponsors" ? rows : rows.filter((row) => row.category === activeCategory);
  const summaries = useMemo<SponsorSummary[]>(() => {
    const grouped = new Map<string, SponsorSummary>();
    visibleRows.forEach((row) => {
      const current = grouped.get(row.sponsor.id) ?? { sponsor: row.sponsor, tasks: [], complete: 0, overdue: 0, percentage: 0 };
      current.tasks.push(row);
      if (row.status === "Complete") current.complete += 1;
      if (row.status === "Overdue" || (row.due_date && row.status !== "Complete" && new Date(row.due_date) < new Date())) current.overdue += 1;
      grouped.set(row.sponsor.id, current);
    });
    return Array.from(grouped.values()).map((summary) => ({ ...summary, percentage: summary.tasks.length ? Math.round((summary.complete / summary.tasks.length) * 100) : 0 })).sort((a, b) => tierRank(a.sponsor.tier) - tierRank(b.sponsor.tier) || a.sponsor.company_name.localeCompare(b.sponsor.company_name));
  }, [visibleRows]);
  const completeCount = rows.filter((row) => row.status === "Complete").length;
  const tierGroups = ["Platinum", "Gold", "Silver", "Bronze", "Start-up"].map((tier) => ({ tier, sponsors: summaries.filter((summary) => summary.sponsor.tier.trim().toLowerCase() === tier.toLowerCase() || (tier === "Start-up" && ["startup", "start up"].includes(summary.sponsor.tier.trim().toLowerCase()))) })).filter((group) => group.sponsors.length > 0);

  async function saveTask(taskId: string, formData: FormData, sponsor?: Sponsor) {
    const title = String(formData.get("title") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const quantity = Math.max(1, Number(formData.get("quantity") ?? 1));
    const status = String(formData.get("status") ?? "Needs You") as TaskStatus;
    const dueDate = String(formData.get("due_date") ?? "").trim();
    if (!title || !category || !Number.isInteger(quantity)) {
      setEditMessage("Title, category, and a whole-number quantity are required.");
      return;
    }
    setSavingTask(taskId);
    setEditMessage(null);
    const contractDetails = sponsor ? { ...sponsor.contract_details } : null;
    if (contractDetails) contractFields.forEach(([key]) => { contractDetails[key] = String(formData.get(`contract_${key}`) ?? "").trim(); });
    const { data, error } = await supabase.from("tasks").update({ title, category, quantity, status, due_date: dueDate || null }).eq("id", taskId).select("id, sponsor_event_id, title, description, category, status, due_date, quantity, input_fields, input_values, action_url, action_label, response_text, file_url, file_name, file_id, ai_recommendation, ai_feedback, ai_reviewed_at, admin_review_note").single();
    if (error || !data) {
      setEditMessage(error?.message ?? "Could not update deliverable.");
    } else {
      const { error: contractError } = sponsor && contractDetails ? await supabase.from("sponsors").update({ contract_details: contractDetails }).eq("id", sponsor.id) : { error: null };
      if (contractError) {
        setEditMessage(contractError.message);
        setSavingTask(null);
        return;
      }
      const updatedSponsor = sponsor && contractDetails ? { ...sponsor, contract_details: contractDetails } : null;
      if (updatedSponsor) setRows((current) => current.map((row) => row.sponsor.id === updatedSponsor.id ? { ...row, sponsor: updatedSponsor, ...(row.id === taskId ? data : {}) } : row));
      setSelectedSponsor((current) => current ? { ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...data } : task) } : current);
      if (updatedSponsor) setSelectedSponsor((current) => current ? { ...current, sponsor: updatedSponsor } : current);
      setEditingTask(null);
    }
    setSavingTask(null);
  }

  async function saveContract(sponsor: Sponsor, formData: FormData) {
    setSavingContract(true);
    setEditMessage(null);
    const contractDetails = { ...sponsor.contract_details };
    contractFields.forEach(([key]) => { contractDetails[key] = String(formData.get(key) ?? "").trim(); });
    const tier = String(formData.get("tier") ?? sponsor.tier).trim();
    const { error } = await supabase.from("sponsors").update({ tier, contract_details: contractDetails }).eq("id", sponsor.id);
    if (error) {
      setEditMessage(error.message);
    } else {
      const updatedSponsor = { ...sponsor, tier, contract_details: contractDetails };
      setRows((current) => current.map((row) => row.sponsor.id === sponsor.id ? { ...row, sponsor: updatedSponsor } : row));
      setSelectedSponsor((current) => current ? { ...current, sponsor: updatedSponsor } : current);
      setEditingContract(false);
    }
    setSavingContract(false);
  }

  return (
    <main className="portal-shell">
      <header className="portal-header"><Link href="/admin" className="brand-mark"><span>PTC</span> / CONNECT</Link><div className="header-actions"><button className="sync-button" disabled={syncing} onClick={() => void syncSpreadsheet()}>{syncing ? "Syncing..." : "Sync spreadsheet"}</button><Link href="/admin" className="back-link">← Admin home</Link><SignOutButton /></div></header>
      <section className="admin-hero"><div><p className="eyebrow">Operations / deliverables</p><h1>{event?.name ?? "Loading event..."}</h1><p className="intro-copy">Track every sponsor promise from one place.</p></div><div className="admin-metric"><strong>{completeCount}<span> / {rows.length}</span></strong><small>tasks complete</small></div></section>
      <Link className="primary-button event-health-button" href={`/admin/${eventId}/health`}>Event health <span>↗</span></Link>
      {message && <div className="notice">{message}</div>}
      {activeCategory === "Sponsors" && <section className="tier-sections" aria-label="Sponsors by tier">{tierGroups.map((group) => <div className="tier-section" key={group.tier}><div className="tier-section-heading"><p className="eyebrow">Sponsor tier</p><h2>{group.tier}</h2><span>{group.sponsors.length} sponsors</span></div><div className="tier-sponsor-names">{group.sponsors.map((summary) => <button key={summary.sponsor.id} type="button" onClick={() => setSelectedSponsor(summary)}>{summary.sponsor.company_name}<span>{summary.percentage}%</span></button>)}</div></div>)}</section>}
      {selectedSponsor && <button className="sync-button contract-open-button" onClick={() => setEditingContract(true)} type="button">Edit campaign inputs</button>}
      <nav className="category-tabs" aria-label="Deliverable categories">{categories.map((category) => <button className={activeCategory === category ? "active" : ""} key={category} onClick={() => setActiveCategory(category)}>{category}</button>)}</nav>
      <section className="admin-table-wrap"><table><thead><tr><th>Sponsor</th><th>Tier</th><th>Progress</th><th>Overdue</th><th>Roadmap</th></tr></thead><tbody>{summaries.map((summary) => <tr key={summary.sponsor.id} className="summary-row" onClick={() => setSelectedSponsor(summary)}><td className="sponsor-cell"><span className="sponsor-avatar">{summary.sponsor.company_name.slice(0, 1)}</span>{summary.sponsor.company_name}</td><td><span className="tier-label">{summary.sponsor.tier}</span></td><td><div className="progress-cell"><strong>{summary.percentage}%</strong><div className="progress-track"><span style={{ width: `${summary.percentage}%` }} /></div><small>{summary.complete} of {summary.tasks.length} complete</small></div></td><td>{summary.overdue > 0 ? <span className="status-badge badge-danger">{summary.overdue} overdue</span> : <span className="status-badge badge-success">On track</span>}</td><td><button className="roadmap-toggle" onClick={(event) => { event.stopPropagation(); setSelectedSponsor(summary); }}>View roadmap <span>↗</span></button></td></tr>)}</tbody></table>{!message && summaries.length === 0 && <div className="empty-state">No deliverables match this category yet.</div>}</section>
      {selectedSponsor && <div className="roadmap-overlay" role="presentation" onClick={() => setSelectedSponsor(null)}><aside className="roadmap-panel" role="dialog" aria-modal="true" aria-label={`${selectedSponsor.sponsor.company_name} roadmap`} onClick={(event) => event.stopPropagation()}><div className="roadmap-panel-header"><div><p className="eyebrow">Sponsor roadmap</p><h2>{selectedSponsor.sponsor.company_name}</h2><span>{selectedSponsor.sponsor.tier}</span></div><button className="roadmap-close" aria-label="Close roadmap" onClick={() => setSelectedSponsor(null)}>×</button></div><div className="roadmap-panel-progress"><strong>{selectedSponsor.percentage}%</strong><span>{selectedSponsor.complete} of {selectedSponsor.tasks.length} complete</span>{selectedSponsor.overdue > 0 && <span className="status-badge badge-danger">{selectedSponsor.overdue} overdue</span>}</div>{editMessage && <div className="notice">{editMessage}</div>}<div className="roadmap-panel-list">{selectedSponsor.tasks.map((task) => <div className="roadmap-detail-task" key={task.id}><span className={`task-mini-status ${task.status === "Complete" ? "is-complete" : task.status === "Overdue" ? "is-overdue" : ""}`}>{task.status === "Complete" ? "✓" : ""}</span>{editingTask === task.id ? <form className="task-edit-form" action={(formData) => void saveTask(task.id, formData)}><label>Title<input name="title" defaultValue={task.title} /></label><label>Category<input name="category" defaultValue={task.category} /></label><div className="task-edit-grid"><label>Qty<input min="1" name="quantity" type="number" defaultValue={task.quantity} /></label><label>Status<select name="status" defaultValue={task.status}><option>Needs You</option><option>With Our Team</option><option>Complete</option><option>Overdue</option></select></label><label>Due date<input name="due_date" type="date" defaultValue={task.due_date ?? ""} /></label></div><div className="task-edit-actions"><button className="sync-button" type="submit" disabled={savingTask === task.id}>{savingTask === task.id ? "Saving..." : "Save changes"}</button><button className="roadmap-toggle" type="button" onClick={() => setEditingTask(null)}>Cancel</button></div></form> : <><div><strong>{task.title}</strong><small>{task.category} · Qty {task.quantity}{task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</small></div><span className={`status-badge ${statusClass[task.status]}`}>{task.status}</span><button className="roadmap-toggle task-edit-button" type="button" onClick={() => { setEditingTask(task.id); setEditMessage(null); }}>Edit</button></>}</div>)}</div></aside></div>}
      {selectedSponsor && editingContract && <div className="contract-overlay" role="presentation" onClick={() => setEditingContract(false)}><div className="contract-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="contract-editor-heading"><div><p className="eyebrow">Campaign inputs</p><h3>Edit contract details</h3></div><button className="roadmap-close" onClick={() => setEditingContract(false)}>×</button></div><form className="contract-edit-form" action={(formData) => void saveContract(selectedSponsor.sponsor, formData)}><label>Tier<input name="tier" defaultValue={selectedSponsor.sponsor.tier} /></label><div className="contract-input-grid">{contractFields.map(([key, label]) => <label key={key}>{label}<input name={key} defaultValue={selectedSponsor.sponsor.contract_details[key] ?? ""} /></label>)}</div><button className="sync-button" type="submit" disabled={savingContract}>{savingContract ? "Saving..." : "Save contract inputs"}</button></form></div></div>}
    </main>
  );
}
