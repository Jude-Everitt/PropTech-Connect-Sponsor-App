"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { canonicalTicketTaskTitle, getContractRow, getContractTasks, parseBrandingTaskStorageTitle } from "@/lib/contract-tasks";
import { isBrandingDeliverableCategory, isGeneratedCopyTask, isSponsorContactFieldTask } from "@/lib/task-utils";
import { normalizeRoadmapTasks, pendingItemsCsv, pendingTaskList } from "@/lib/status-email";
import { classifyExportTask, getSponsorContactFields } from "@/lib/sponsor-contact-export";
import type { Event, Task } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

type Props = { params: Promise<{ eventId: string }> };
type Sponsor = { id: string; company_name: string; tier: string; contract_details: Record<string, string> };
type Row = Pick<Task, "id" | "sponsor_event_id" | "title" | "category" | "status" | "due_date" | "quantity"> & { sponsor: Sponsor };
type SponsorEventLink = { id: string; sponsor_id: string };
type FilterKey = "tier" | "accountManager" | "clientSuccessManager" | "deliverable" | "task" | "status";
type FilterState = Record<FilterKey, string[]>;
type SponsorSummary = {
  sponsor: Sponsor;
  tasks: Row[];
  complete: number;
  incomplete: number;
  overdue: number;
  maxOverdueDays: number;
  percentage: number;
};

const filterLabels: Record<FilterKey, string> = {
  tier: "Tier",
  accountManager: "Account manager",
  clientSuccessManager: "Client success manager",
  deliverable: "Deliverable",
  task: "Task",
  status: "Task status",
};

const emptyFilters: FilterState = { tier: [], accountManager: [], clientSuccessManager: [], deliverable: [], task: [], status: [] };

function MultiSelectFilter({ filterKey, options, selected, onChange }: {
  filterKey: FilterKey;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <details className="contact-filter">
      <summary>{filterLabels[filterKey]}{selected.length ? ` (${selected.length})` : ""}</summary>
      <div className="contact-filter-menu">
        {options.length ? options.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((value) => value !== option))} /><span>{option}</span></label>) : <small>No options in this event</small>}
      </div>
    </details>
  );
}

function taskState(task: Pick<Task, "status" | "due_date">, today: Date) {
  return classifyExportTask(task, today);
}

function taskStatusDisplay(task: Pick<Task, "status" | "due_date">, today: Date) {
  const state = taskState(task, today);
  if (state === "Complete") return { label: "Complete", className: "badge-success" };
  if (state === "Overdue") return { label: "Overdue", className: "badge-danger" };
  return { label: "Incomplete", className: "badge-warning" };
}

function overdueDays(task: Pick<Task, "status" | "due_date">, today: Date) {
  if (!task.due_date) return task.status === "Overdue" ? 1 : 0;
  const due = new Date(`${task.due_date}T00:00:00`);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

function deliverableFilterCategory(category: string) {
  return isBrandingDeliverableCategory(category) ? "Branding" : category;
}

function matchesDeliverableFilters(category: string, selected: string[]) {
  if (!selected.length) return true;
  return selected.some((selection) => selection === "Branding"
    ? isBrandingDeliverableCategory(category) && category.trim().toLowerCase() !== "company branding"
    : category === selection);
}

export default function AdminDeliverablesPage({ params }: Props) {
  const { eventId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsorEventLinks, setSponsorEventLinks] = useState<SponsorEventLink[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [activeCategory, setActiveCategory] = useState(searchParams.get("category") ?? "Sponsors");
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exportingEmails, setExportingEmails] = useState(false);
  const [selectedSponsor, setSelectedSponsorState] = useState<SponsorSummary | null>(null);

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
      // Sheet sync sets ticket quantities, so Cvent registrations are synced after it.
      const cventResponse = await fetch("/api/sync/cvent-tickets", {
        method: "POST",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!cventResponse.ok) {
        const cventResult = (await cventResponse.json()) as { error?: string };
        setMessage(`Spreadsheet synced, but Cvent ticket sync failed: ${cventResult.error ?? cventResponse.status}`);
        setSyncing(false);
        return;
      }
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
      const normalizedTasks = (tasks ?? []).filter((task) => !isGeneratedCopyTask(task.title) && !isSponsorContactFieldTask(task.title, task.category)).flatMap((task) => {
        const sponsor = sponsorMap.get(linkSponsorMap.get(task.sponsor_event_id) ?? "");
        if (!sponsor) return [];
        const parsedBrandingTitle = parseBrandingTaskStorageTitle(task.title);
        const title = parsedBrandingTitle?.title ?? canonicalTicketTaskTitle(task.title);
        const entitlementTitle = parsedBrandingTitle ? task.title : title;
        const entitlements = getContractTasks(getContractRow(sponsor.contract_details));
        const entitlement = entitlements.find((item) => item.title === entitlementTitle && item.category === task.category)
          ?? entitlements.find((item) => item.title === entitlementTitle);
        return entitlement ? [{ ...task, title, category: entitlement.category, quantity: entitlement.quantity, sponsor }] : [];
      });
      const deduplicatedTasks = new Map<string, (typeof normalizedTasks)[number]>();
      normalizedTasks.forEach((task) => {
        const key = `${task.sponsor_event_id}:${task.category}:${task.title}`;
        const current = deduplicatedTasks.get(key);
        if (!current || (task.status === "Complete" && current.status !== "Complete")) deduplicatedTasks.set(key, task);
      });
      setRows([...deduplicatedTasks.values()]);
    }
    void loadDeliverables();
  }, [eventId]);

  const filterOptions = useMemo<Record<FilterKey, string[]>>(() => {
    const values: Record<FilterKey, Set<string>> = {
      tier: new Set(), accountManager: new Set(), clientSuccessManager: new Set(), deliverable: new Set(), task: new Set(), status: new Set(),
    };
    sponsors.forEach((sponsor) => {
      const contact = getSponsorContactFields(sponsor.contract_details);
      if (sponsor.tier) values.tier.add(sponsor.tier);
      if (contact.accountManager) values.accountManager.add(contact.accountManager);
      if (contact.clientSuccessManager) values.clientSuccessManager.add(contact.clientSuccessManager);
    });
    rows.forEach((row) => {
      values.deliverable.add(deliverableFilterCategory(row.category));
      values.status.add(taskState(row, new Date()));
    });
    rows
      .filter((row) => matchesDeliverableFilters(row.category, filters.deliverable))
      .forEach((row) => values.task.add(row.title));
    values.status.add("Complete");
    values.status.add("Incomplete");
    values.status.add("Overdue");
    return Object.fromEntries(Object.entries(values).map(([key, options]) => [key, [...options].sort((a, b) => a.localeCompare(b))])) as Record<FilterKey, string[]>;
  }, [sponsors, rows, filters.deliverable]);
  const searchTerm = sponsorSearch.trim().toLowerCase();
  const hasTaskFilters = filters.deliverable.length > 0 || filters.task.length > 0 || filters.status.length > 0;
  const companyMatches = sponsors.filter((sponsor) => {
    const contact = getSponsorContactFields(sponsor.contract_details);
    return (!searchTerm || sponsor.company_name.toLowerCase().includes(searchTerm))
      && (!filters.tier.length || filters.tier.includes(sponsor.tier))
      && (!filters.accountManager.length || filters.accountManager.includes(contact.accountManager))
      && (!filters.clientSuccessManager.length || filters.clientSuccessManager.includes(contact.clientSuccessManager));
  });
  const companyIds = new Set(companyMatches.map((sponsor) => sponsor.id));
  const matchingTaskRows = rows.filter((row) => {
    return companyIds.has(row.sponsor.id)
      && matchesDeliverableFilters(row.category, filters.deliverable)
      && (!filters.task.length || filters.task.includes(row.title))
      && (!filters.status.length || filters.status.includes(taskState(row, new Date())));
  });
  const categories = useMemo(() => ["Sponsors", ...Array.from(new Set(matchingTaskRows.map((row) => deliverableFilterCategory(row.category)))).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))], [matchingTaskRows]);
  const visibleCategory = categories.includes(activeCategory) ? activeCategory : "Sponsors";
  const visibleRows = visibleCategory === "Sponsors" ? matchingTaskRows : matchingTaskRows.filter((row) => deliverableFilterCategory(row.category) === visibleCategory && (visibleCategory !== "Branding" || row.category.trim().toLowerCase() !== "company branding"));
  const summaries = useMemo<SponsorSummary[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return companyMatches.flatMap((sponsor) => {
      const sponsorLinkIds = new Set(sponsorEventLinks.filter((link) => link.sponsor_id === sponsor.id).map((link) => link.id));
      const sponsorTasks = visibleRows.filter((row) => row.sponsor.id === sponsor.id && sponsorLinkIds.has(row.sponsor_event_id));
      if ((visibleCategory !== "Sponsors" || hasTaskFilters) && sponsorTasks.length === 0) return [];
      const summary: SponsorSummary = { sponsor, tasks: sponsorTasks, complete: 0, incomplete: 0, overdue: 0, maxOverdueDays: 0, percentage: 0 };
      sponsorTasks.forEach((task) => {
        const state = taskState(task, today);
        if (state === "Complete") summary.complete += 1;
        else summary.incomplete += 1;
        if (state === "Overdue") {
          summary.overdue += 1;
          summary.maxOverdueDays = Math.max(summary.maxOverdueDays, overdueDays(task, today));
        }
      });
      summary.percentage = sponsorTasks.length ? Math.round((summary.complete / sponsorTasks.length) * 100) : 0;
      return [summary];
    }).sort((a, b) => Number(a.tasks.length === 0) - Number(b.tasks.length === 0) || b.overdue - a.overdue || b.maxOverdueDays - a.maxOverdueDays || a.percentage - b.percentage || a.sponsor.company_name.localeCompare(b.sponsor.company_name));
  }, [companyMatches, sponsorEventLinks, visibleRows, visibleCategory, hasTaskFilters]);
  const filteredSummaries = summaries;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventCounts = matchingTaskRows.reduce((counts, row) => {
    const state = taskState(row, today);
    if (state === "Complete") counts.complete += 1;
    else counts.incomplete += 1;
    if (state === "Overdue") counts.overdue += 1;
    return counts;
  }, { complete: 0, incomplete: 0, overdue: 0 });

  function setFilter(filterKey: FilterKey, values: string[]) {
    setFilters((current) => ({ ...current, [filterKey]: values }));
  }

  async function exportStatusEmails() {
    if (!event || !filteredSummaries.length) return;
    setExportingEmails(true);
    setMessage(null);
    // Fresh reads so the export reflects current task statuses.
    const linkBySponsor = new Map(sponsorEventLinks.map((link) => [link.sponsor_id, link.id]));
    const linkIds = filteredSummaries.flatMap((summary) => linkBySponsor.get(summary.sponsor.id) ?? []);
    const [tasksResult, contactsResult] = await Promise.all([
      supabase.from("tasks").select("id, sponsor_event_id, title, description, category, status, due_date, quantity, action_url, action_label, input_values").in("sponsor_event_id", linkIds),
      supabase.from("sponsor_campaign_contacts").select("sponsor_event_id, name, email").in("sponsor_event_id", linkIds).order("created_at"),
    ]);
    const failure = tasksResult.error ?? contactsResult.error;
    if (failure) {
      setMessage(failure.message);
      setExportingEmails(false);
      return;
    }
    const rows = [...filteredSummaries].sort((a, b) => a.sponsor.company_name.localeCompare(b.sponsor.company_name)).flatMap((summary) => {
      const linkId = linkBySponsor.get(summary.sponsor.id);
      if (!linkId) return [];
      const contacts = (contactsResult.data ?? []).filter((contact) => contact.sponsor_event_id === linkId);
      const tasks = normalizeRoadmapTasks((tasksResult.data ?? []).filter((task) => task.sponsor_event_id === linkId), summary.sponsor.contract_details);
      return [{ companyName: summary.sponsor.company_name, contacts, pendingTasks: pendingTaskList(tasks) }];
    });
    const blob = new Blob([pendingItemsCsv(rows)], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${(event.name ?? "sponsors").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-pending-items.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    setExportingEmails(false);
  }

  const activeFilterCount = Object.values(filters).reduce((sum, values) => sum + values.length, 0);


  return (
    <main className="portal-shell">
      <header className="portal-header"><Link href="/admin" className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link><div className="header-actions"><button className="sync-button" disabled={syncing} onClick={() => void syncSpreadsheet()}>{syncing ? "Syncing..." : "Sync now"}</button><Link href="/admin" className="back-link">← Admin home</Link><SignOutButton /></div></header>
      <section className="admin-hero"><div><p className="eyebrow">Operations / deliverables</p><h1>{event?.name ?? "Loading event..."}</h1><p className="intro-copy">Sponsor progress, ordered by who needs attention first.</p></div><div className="admin-metric"><strong>{eventCounts.complete}<span> / {rows.length}</span></strong><small>confirmed</small></div></section>
      <div className="admin-action-row" aria-label="Admin views"><Link className="primary-button event-health-button" href={`/admin/${eventId}/health`}>Event health <span>↗</span></Link><Link className="primary-button event-health-button" href={`/admin/${eventId}/due-dates`}>Due Dates</Link></div>
      {message && <div className="notice">{message}</div>}
      {visibleCategory === "Sponsors" && <section className="deliverable-status-summary" aria-label="Filtered task status summary"><strong>{eventCounts.complete} complete</strong><span>{eventCounts.incomplete} incomplete</span><span className={eventCounts.overdue > 0 ? "status-badge badge-danger" : ""}>{eventCounts.overdue} overdue</span></section>}
      <nav className="category-tabs" aria-label="Deliverable categories">{categories.map((category) => <button className={visibleCategory === category ? "active" : ""} key={category} onClick={() => setActiveCategory(category)}>{category}</button>)}</nav>
      <section className="contact-filter-toolbar" aria-label="Filter sponsor and deliverable lists">
        {(Object.keys(filterLabels) as FilterKey[]).map((filterKey) => <MultiSelectFilter key={filterKey} filterKey={filterKey} options={filterOptions[filterKey]} selected={filters[filterKey]} onChange={(values) => setFilter(filterKey, values)} />)}
        {activeFilterCount > 0 && <button className="roadmap-toggle" type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button>}
        <button className="sync-button contact-export-button" type="button" disabled={!filteredSummaries.length || exportingEmails} onClick={() => void exportStatusEmails()}>{exportingEmails ? "Preparing emails..." : "Export Shown Company Pending Items"}</button>
      </section>
      <div className="sponsor-search"><label className="visually-hidden" htmlFor="sponsor-search">Search sponsors</label><input id="sponsor-search" type="search" autoComplete="off" placeholder="Search sponsors" value={sponsorSearch} onChange={(event) => setSponsorSearch(event.target.value)} /></div>
      <section className="admin-table-wrap"><table><thead><tr><th>Sponsor</th><th>Tier</th><th>Complete</th><th>Incomplete</th><th>Overdue</th><th>Completion</th></tr></thead><tbody>{filteredSummaries.map((summary) => <tr key={summary.sponsor.id} className="summary-row" onClick={() => setSelectedSponsor(summary)}><td className="sponsor-cell"><div className="sponsor-cell-content"><span className="sponsor-avatar">{summary.sponsor.company_name.slice(0, 1)}</span><span>{summary.sponsor.company_name}</span></div></td><td><span className="tier-label">{summary.sponsor.tier}</span></td><td>{summary.complete} / {summary.tasks.length}</td><td>{summary.incomplete || "—"}</td><td>{summary.overdue > 0 ? <span className="status-badge badge-danger">{summary.overdue} overdue</span> : "—"}</td><td><div className="progress-cell"><strong>{summary.percentage}%</strong><div className="progress-track"><span style={{ width: `${summary.percentage}%` }} /></div></div></td></tr>)}</tbody></table>{!message && filteredSummaries.length === 0 && <div className="empty-state">{searchTerm ? "No sponsors match your search." : visibleCategory === "Sponsors" ? "No sponsors match the selected filters." : "No sponsors have matching tasks in this deliverable."}</div>}</section>
      {selectedSponsor && <div className="roadmap-overlay" role="presentation" onClick={() => setSelectedSponsor(null)}>
        <aside className="roadmap-panel" role="dialog" aria-modal="true" aria-label={`${selectedSponsor.sponsor.company_name} roadmap`} onClick={(event) => event.stopPropagation()}>
          <div className="roadmap-panel-header">
            <div>
              <p className="eyebrow">Company overview</p>
              <div className="roadmap-panel-title-row">
                <h2>{selectedSponsor.sponsor.company_name}</h2>
                {visibleCategory === "Exhibition Booth" && <div className="roadmap-booth-position"><small>Booth position</small><strong>{String(selectedSponsor.sponsor.contract_details.booth_position ?? "").trim() || "Unassigned"}</strong></div>}
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
          <div className="roadmap-panel-list">
            {selectedSponsor.tasks.map((task) => {
              const statusDisplay = taskStatusDisplay(task, today);
              return <div className="roadmap-detail-task" key={task.id}>
                <span className={`task-mini-status ${task.status === "Complete" ? "is-complete" : statusDisplay.label === "Overdue" ? "is-overdue" : ""}`} />
                <div><strong>{task.title}</strong><small>{task.category} · Qty {task.quantity}{task.due_date ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</small></div>
                <span className={`status-badge ${statusDisplay.className}`}>{statusDisplay.label}</span>
              </div>;
            })}
            {!selectedSponsor.tasks.length && <div className="empty-state">No deliverables in this category.</div>}
          </div>
        </aside>
      </div>}
    </main>
  );
}
