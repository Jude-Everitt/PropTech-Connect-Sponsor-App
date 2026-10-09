"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { getTourSelectionValues, orderBoothTasks, panelTaskBaseTitles, parsePanelTaskStorageTitle } from "@/lib/contract-tasks";
import { splitSponsorContractDetails } from "@/lib/sponsor-contract-sections";
import { classifyExportTask } from "@/lib/sponsor-contact-export";
import { categoryLabel, composeStatusEmail, confirmedTicketCounts, normalizeRoadmapTasks, statusEmailCsv } from "@/lib/status-email";
import type { Database, Event, Task } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";
import BoothTaskConfirmation from "@/app/ui/booth-task-confirmation";
import DisplayedCompanyNameEditor from "@/app/ui/displayed-company-name-editor";
import VipTicketAllocation from "@/app/ui/vip-ticket-allocation";
import CventTicketRegistrations from "@/app/ui/cvent-ticket-registrations";
import WorkshopTaskEditor from "@/app/ui/workshop-task-editor";

type Props = {
  eventId: string;
  sponsorId: string;
};
type Sponsor = { id: string; company_name: string; tier: string; contract_details: Record<string, unknown> };
type ReadOnlyTask = Pick<Task, "id" | "sponsor_event_id" | "title" | "description" | "category" | "status" | "due_date" | "quantity" | "action_url" | "action_label" | "input_values">;
type CampaignContact = Database["public"]["Tables"]["sponsor_campaign_contacts"]["Row"];

const taskSelect = "id, sponsor_event_id, title, description, category, status, due_date, quantity, action_url, action_label, input_values";
const roundtableTaskOrder = ["Confirm Roundtable Title", "Approve Roundtable Questions Submitted by the Moderator"];
const brandingCategoryOrder = [
  "Company Branding",
  "Stage Branding",
  "Pillar Branding",
  "Elevator Branding",
  "Escalator Branding",
  "Stairs Branding",
  "Digital Screen Branding",
  "Help Desk Branding",
  "Registration Desk Branding",
  "Cloakroom Branding",
  "Speaker Lounge Branding",
  "Lanyard Branding",
  "Badge Branding",
  "Coffee Station Branding",
  "Coffee Cart Sponsor",
  "Coffee Bar Branding",
  "WiFi Sponsor",
  "Networking App & Area Branding",
];

function statusLabel(task: Pick<ReadOnlyTask, "status" | "due_date">) {
  return classifyExportTask(task);
}

function statusClassFor(label: string) {
  if (label === "Complete") return "badge-success";
  if (label === "Overdue") return "badge-danger";
  return "badge-warning";
}

export default function SponsorRoadmap({ eventId, sponsorId }: Props) {
  const [event, setEvent] = useState<Event | null>(null);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [tasks, setTasks] = useState<ReadOnlyTask[]>([]);
  const [campaignContacts, setCampaignContacts] = useState<CampaignContact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactJobTitle, setContactJobTitle] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [completingCaseStudyTaskId, setCompletingCaseStudyTaskId] = useState<string | null>(null);
  const [caseStudyTaskMessage, setCaseStudyTaskMessage] = useState<string | null>(null);
  const [updatingPanelHeadshotTaskId, setUpdatingPanelHeadshotTaskId] = useState<string | null>(null);
  const [panelHeadshotMessage, setPanelHeadshotMessage] = useState<string | null>(null);
  const [updatingNetworkingTaskId, setUpdatingNetworkingTaskId] = useState<string | null>(null);
  const [networkingTaskMessage, setNetworkingTaskMessage] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setRefreshTick((current) => current + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = window.setInterval(onVisibilityChange, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    async function loadRoadmap() {
      setMessage(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setMessage("Sign in to view this roadmap.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();
      if (profileError || profile?.role !== "ADMIN") {
        setMessage("Admin access is required to view this company page.");
        return;
      }
      if (!sponsorId) {
        setMessage("No sponsor was selected for this company page.");
        return;
      }

      const [eventResult, sponsorResult, linkResult] = await Promise.all([
        supabase.from("events").select("id, name, start_date, location").eq("id", eventId).single(),
        supabase.from("sponsors").select("id, company_name, tier, contract_details").eq("id", sponsorId).single(),
        supabase.from("sponsor_events").select("id").eq("event_id", eventId).eq("sponsor_id", sponsorId).single(),
      ]);
      if (eventResult.error || sponsorResult.error || linkResult.error || !linkResult.data) {
        setMessage(eventResult.error?.message ?? sponsorResult.error?.message ?? linkResult.error?.message ?? "Roadmap could not be loaded.");
        return;
      }

      const [taskResult, contactResult] = await Promise.all([
        supabase.from("tasks").select(taskSelect).eq("sponsor_event_id", linkResult.data.id).order("category").order("title"),
        supabase.from("sponsor_campaign_contacts").select("id, sponsor_event_id, name, email, job_title, phone, created_at").eq("sponsor_event_id", linkResult.data.id).order("created_at"),
      ]);
      if (taskResult.error) {
        setMessage(taskResult.error.message);
        return;
      }
      setCampaignContacts(contactResult.data ?? []);
      setContactMessage(contactResult.error?.message ?? null);

      const sponsorData = sponsorResult.data as Sponsor;
      const visibleTasks = normalizeRoadmapTasks(taskResult.data ?? [], sponsorData.contract_details);

      setEvent(eventResult.data);
      setSponsor(sponsorData);
      setTasks(visibleTasks);
    }
    void loadRoadmap();
  }, [eventId, sponsorId, refreshTick]);

  async function addCampaignContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingContact(true);
    setContactMessage(null);
    const link = await supabase.from("sponsor_events").select("id").eq("event_id", eventId).eq("sponsor_id", sponsorId).single();
    if (link.error || !link.data) {
      setContactMessage(link.error?.message ?? "Could not load sponsor event.");
      setSavingContact(false);
      return;
    }
    const { data, error } = await supabase.from("sponsor_campaign_contacts").insert({
      sponsor_event_id: link.data.id,
      name: contactName.trim(),
      email: contactEmail.trim(),
      job_title: contactJobTitle.trim() || null,
      phone: contactPhone.trim() || null,
    }).select("id, sponsor_event_id, name, email, job_title, phone, created_at").single();
    if (error || !data) {
      setContactMessage(error?.message ?? "Could not save Campaign Point of Contact.");
    } else {
      setCampaignContacts((current) => [...current, data]);
      setContactName("");
      setContactEmail("");
      setContactJobTitle("");
      setContactPhone("");
    }
    setSavingContact(false);
  }

  async function removeCampaignContact(contactId: string) {
    setContactMessage(null);
    const { error } = await supabase.from("sponsor_campaign_contacts").delete().eq("id", contactId);
    if (error) setContactMessage(error.message);
    else setCampaignContacts((current) => current.filter((contact) => contact.id !== contactId));
  }

  async function exportStatusEmail() {
    if (!sponsor || !event || !tasks.length) return;
    setMessage(null);
    // Re-read statuses and Cvent registrations so the export always reflects the latest state.
    const sponsorEventId = tasks[0].sponsor_event_id;
    const [freshTasks, registrations, contacts] = await Promise.all([
      supabase.from("tasks").select("id, status, input_values").eq("sponsor_event_id", sponsorEventId),
      supabase.from("cvent_ticket_registrations").select("task_title, status").eq("sponsor_event_id", sponsorEventId),
      supabase.from("sponsor_campaign_contacts").select("name, email").eq("sponsor_event_id", sponsorEventId).order("created_at"),
    ]);
    if (freshTasks.error || registrations.error || contacts.error) {
      setMessage(freshTasks.error?.message ?? registrations.error?.message ?? contacts.error?.message ?? "Could not export the status email.");
      return;
    }
    const freshById = new Map((freshTasks.data ?? []).map((task) => [task.id, task]));
    const email = composeStatusEmail({
      companyName: sponsor.company_name,
      tier: sponsor.tier,
      eventName: event.name,
      contacts: contacts.data ?? [],
      tasks: tasks.map((task) => ({ ...task, status: freshById.get(task.id)?.status ?? task.status, input_values: (freshById.get(task.id)?.input_values as ReadOnlyTask["input_values"]) ?? task.input_values })),
      confirmedTickets: confirmedTicketCounts(registrations.data ?? []),
    });
    const blob = new Blob([statusEmailCsv(sponsor.company_name, contacts.data ?? [], email)], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${sponsor.company_name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-status-email.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  const groups = useMemo(() => {
    const result = tasks.reduce<Record<string, ReadOnlyTask[]>>((groupsByCategory, task) => {
      const category = categoryLabel(task.category);
      (groupsByCategory[category] ??= []).push(task);
      return groupsByCategory;
    }, {});
    if (result.Booth) result.Booth = orderBoothTasks(result.Booth);
    return result;
  }, [tasks]);
  const panelStageGroups = useMemo(() => {
    const byStage = new Map<string, ReadOnlyTask[]>();
    for (const task of tasks) {
      if (task.category !== "Sponsor Panels") continue;
      const parsedTitle = parsePanelTaskStorageTitle(task.title);
      if (!parsedTitle) continue;
      byStage.set(parsedTitle.stage, [...(byStage.get(parsedTitle.stage) ?? []), task]);
    }
    return [...byStage.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [tasks]);
  const brandingGroups = useMemo(() => {
    const byCategory = new Map<string, ReadOnlyTask[]>();
    for (const task of tasks) {
      const category = categoryLabel(task.category);
      if (!brandingCategoryOrder.includes(category)) continue;
      byCategory.set(category, [...(byCategory.get(category) ?? []), task]);
    }
    return [...brandingCategoryOrder].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })).flatMap((category) => byCategory.has(category) ? [[category, byCategory.get(category)!] as const] : []);
  }, [tasks]);
  const [caseStudyExpanded, setCaseStudyExpanded] = useState(false);
  const [innovationStageExpanded, setInnovationStageExpanded] = useState(false);
  const [roundtableExpanded, setRoundtableExpanded] = useState(false);
  const [updatingRoundtableTaskId, setUpdatingRoundtableTaskId] = useState<string | null>(null);
  const [roundtableTaskMessage, setRoundtableTaskMessage] = useState<string | null>(null);
  const complete = tasks.filter((task) => statusLabel(task) === "Complete").length;
  const overdue = tasks.filter((task) => statusLabel(task) === "Overdue").length;
  const percentage = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;
  const incomplete = tasks.filter((task) => statusLabel(task) === "Incomplete").length;
  const displayedNameValue = tasks.find((task) => task.title === "Confirm Displayed Name of Company")?.input_values?.displayed_company_name;
  const displayedName = typeof displayedNameValue === "string" ? displayedNameValue.trim() : "";
  const contractSections = splitSponsorContractDetails(sponsor?.contract_details ?? {});
  const homeHref = `/admin/${eventId}/deliverables`;

  async function updateCaseStudyHeadshotStatus(taskId: string, action: "complete" | "uncomplete") {
    setCompletingCaseStudyTaskId(taskId);
    setCaseStudyTaskMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/admin/complete-case-study-headshot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: taskId, action }),
      });
      const result = await response.json() as { error?: string; task?: { status?: Task["status"] } };
      if (!response.ok) {
        setCaseStudyTaskMessage(result.error ?? "Could not mark the task complete.");
        return;
      }
      setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: result.task?.status ?? (action === "complete" ? "Complete" : "Needs You") } : task));
    } catch (error) {
      setCaseStudyTaskMessage(error instanceof Error ? error.message : "Could not mark the task complete.");
    } finally {
      setCompletingCaseStudyTaskId(null);
    }
  }

  async function updateRoundtableQuestionsStatus(taskId: string, action: "approve" | "unapprove") {
    setUpdatingRoundtableTaskId(taskId);
    setRoundtableTaskMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/admin/update-roundtable-questions-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: taskId, action }),
      });
      const result = await response.json() as { error?: string; task?: { status?: Task["status"] } };
      if (!response.ok) {
        setRoundtableTaskMessage(result.error ?? "Could not update roundtable question approval.");
        return;
      }
      setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: result.task?.status ?? (action === "approve" ? "Complete" : "Needs You") } : task));
    } catch (error) {
      setRoundtableTaskMessage(error instanceof Error ? error.message : "Could not update roundtable question approval.");
    } finally {
      setUpdatingRoundtableTaskId(null);
    }
  }

  async function updatePanelHeadshotStatus(taskId: string, action: "complete" | "uncomplete") {
    setUpdatingPanelHeadshotTaskId(taskId);
    setPanelHeadshotMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/admin/update-panel-headshot-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: taskId, action }),
      });
      const result = await response.json() as { error?: string; task?: { status?: Task["status"] } };
      if (!response.ok) {
        setPanelHeadshotMessage(result.error ?? "Could not update panel headshot status.");
        return;
      }
      setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: result.task?.status ?? (action === "complete" ? "Complete" : "Needs You") } : task));
    } catch (error) {
      setPanelHeadshotMessage(error instanceof Error ? error.message : "Could not update panel headshot status.");
    } finally {
      setUpdatingPanelHeadshotTaskId(null);
    }
  }

  async function updateNetworkingTaskStatus(taskId: string, action: "complete" | "uncomplete") {
    setUpdatingNetworkingTaskId(taskId);
    setNetworkingTaskMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/admin/update-networking-app-task-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: taskId, action }),
      });
      const result = await response.json() as { error?: string; task?: { status?: Task["status"] } };
      if (!response.ok) {
        setNetworkingTaskMessage(result.error ?? "Could not update Networking App task status.");
        return;
      }
      setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: result.task?.status ?? (action === "complete" ? "Complete" : "Needs You") } : task));
    } catch (error) {
      setNetworkingTaskMessage(error instanceof Error ? error.message : "Could not update Networking App task status.");
    } finally {
      setUpdatingNetworkingTaskId(null);
    }
  }

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <Link href={homeHref} className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link>
        <div className="header-actions">
          <Link href={homeHref} className="back-link">← Sponsors</Link>
          <button className="sync-button" type="button" disabled={!tasks.length} onClick={() => void exportStatusEmail()}>Export status email</button>
          <SignOutButton />
        </div>
      </header>
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Admin / company / {event?.name ?? "Event"}</p>
          <h1>{sponsor?.company_name ?? "Loading sponsor..."}</h1>
          {displayedName && <p className="displayed-event-name">Displayed Event Name: {displayedName}</p>}
          <p className="intro-copy">Task status from connected sources and admin confirmations.</p>
        </div>
        <div className="admin-metric">
          <strong>{percentage}%</strong>
          <small>{complete} of {tasks.length} confirmed</small>
          {overdue > 0 && <span className="status-badge badge-danger">{overdue} overdue</span>}
        </div>
      </section>
      <section className="deliverable-status-summary" aria-label="Sponsor task status summary">
        <strong>{complete} complete</strong>
        <span>{incomplete} incomplete</span>
        <Link className={overdue > 0 ? "status-badge badge-danger" : "status-summary-link"} href={`/admin/${eventId}/sponsors/${sponsorId}/status/overdue`}>{overdue} overdue</Link>
      </section>
      {message && <div className="notice">{message}</div>}
      <section className="contract-strip">
          {contractSections.accountDetails.length > 0 && <section className="contract-subsection" aria-label="Account details"><p className="eyebrow">Account details</p><div className="contract-fields">{contractSections.accountDetails.map((field) => <div key={field.key}><small>{field.label}</small><strong>{field.value}</strong></div>)}</div></section>}
          <section className="contract-subsection campaign-contact-section" aria-label="Campaign points of contact">
            <p className="eyebrow">Campaign Points of Contact</p>
            {campaignContacts.length > 0 ? <div className="campaign-contact-list">{campaignContacts.map((contact) => <div className="campaign-contact-row" key={contact.id}><div><strong>{contact.name}</strong><small>{contact.job_title || "Campaign contact"}{contact.phone ? ` · ${contact.phone}` : ""}</small></div><a href={`mailto:${contact.email}`}>{contact.email}</a><button className="roadmap-toggle" type="button" aria-label={`Remove ${contact.name}`} onClick={() => void removeCampaignContact(contact.id)}>Remove</button></div>)}</div> : <p className="campaign-contact-empty">No Campaign Points of Contact added yet.</p>}
            {contactMessage && <div className="notice">{contactMessage}</div>}
            <form className="campaign-contact-form" onSubmit={(event) => void addCampaignContact(event)}><label>Name<input required autoComplete="name" value={contactName} onChange={(event) => setContactName(event.target.value)} /></label><label>Email<input required type="email" autoComplete="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></label><label>Job title<input autoComplete="organization-title" value={contactJobTitle} onChange={(event) => setContactJobTitle(event.target.value)} /></label><label>Phone<input type="tel" autoComplete="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></label><button className="sync-button" type="submit" disabled={savingContact}>{savingContact ? "Adding..." : "Add contact"}</button></form>
          </section>
          {contractSections.deliverables.length > 0 && <section className="contract-subsection" aria-label="Account deliverables"><p className="eyebrow">Account deliverables</p><div className="contract-fields">{contractSections.deliverables.map((field) => <div key={field.key}><small>{field.label}</small><strong>{field.value}</strong></div>)}</div></section>}
      </section>
      <section className="full-roadmap">
        {brandingGroups.length > 0 && <div className="category-section branding-tree-section">
          <div className="category-heading"><h2>Branding</h2><span>1 deliverable</span></div>
          <div className="task-list">
            <details className="admin-task-accordion branding-root-accordion">
              <summary className="admin-task-summary">
                <span className={`task-mini-status ${brandingGroups.flatMap(([, items]) => items).some((task) => statusLabel(task) === "Overdue") ? "is-overdue" : brandingGroups.flatMap(([, items]) => items).every((task) => statusLabel(task) === "Complete") ? "is-complete" : ""}`} />
                <span className="task-copy"><strong>Branding</strong><small>{brandingGroups.flatMap(([, items]) => items).filter((task) => statusLabel(task) === "Complete").length} of {brandingGroups.flatMap(([, items]) => items).length} tasks complete</small></span>
                <span className={`status-badge ${brandingGroups.flatMap(([, items]) => items).every((task) => statusLabel(task) === "Complete") ? "badge-success" : "badge-warning"}`}>{brandingGroups.flatMap(([, items]) => items).every((task) => statusLabel(task) === "Complete") ? "Complete" : "Incomplete"}</span>
                <span className="accordion-chevron">+</span>
              </summary>
              <div className="branding-subdeliverables">
                {brandingGroups.map(([category, categoryTasks]) => {
                  const completedTasks = categoryTasks.filter((task) => statusLabel(task) === "Complete").length;
                  const categoryOverdue = categoryTasks.some((task) => statusLabel(task) === "Overdue");
                  const categoryComplete = categoryTasks.length > 0 && completedTasks === categoryTasks.length;
                  return <details className="admin-task-accordion branding-subdeliverable" key={category}>
                    <summary className="admin-task-summary">
                      <span className={`task-mini-status ${categoryOverdue ? "is-overdue" : categoryComplete ? "is-complete" : ""}`} />
                      <span className="task-copy"><strong>{category}</strong><small>{completedTasks} of {categoryTasks.length} tasks complete</small></span>
                      <span className={`status-badge ${categoryComplete ? "badge-success" : "badge-warning"}`}>{categoryComplete ? "Complete" : "Incomplete"}</span>
                      <span className="accordion-chevron">+</span>
                    </summary>
                    <div className="branding-task-list">
                      {categoryTasks.map((task) => (
                        <details className="admin-task-accordion branding-task" key={task.id}>
                          <summary className="admin-task-summary">
                            <span className={`task-mini-status ${statusLabel(task) === "Complete" ? "is-complete" : statusLabel(task) === "Overdue" ? "is-overdue" : ""}`} />
                            <span className="task-copy"><strong>{task.title}</strong><small>Quantity {task.quantity}</small></span>
                            <span className={`status-badge ${statusClassFor(statusLabel(task))}`}>{statusLabel(task)}</span>
                            <span className="accordion-chevron">+</span>
                          </summary>
                          <div className="admin-task-detail">
                            {task.description && <p className="task-instructions">{task.description}</p>}
                            {task.title === "Confirm Displayed Name of Company" && <DisplayedCompanyNameEditor
                              taskId={task.id}
                              savedName={String(task.input_values?.displayed_company_name ?? "")}
                              onSaved={(name, isComplete) => setTasks((current) => current.map((item) => item.id === task.id ? {
                                ...item,
                                status: isComplete ? "Complete" : item.status,
                                input_values: { ...item.input_values, displayed_company_name: name },
                              } : item))}
                            />}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>;
                })}
              </div>
            </details>
          </div>
        </div>}
        {Object.entries(groups).filter(([category]) => !brandingCategoryOrder.includes(category)).sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: "base" })).map(([category, categoryTasks]) => (
          <div className="category-section" key={category}>
            <div className="category-heading"><h2>{category}</h2><span>{["Case study", "Innovation", "Roundtable"].includes(category) ? "1 deliverable" : category === "Panels" ? `${panelStageGroups.length} panel groups` : `${categoryTasks.length} tasks`}</span></div>
            <div className="task-list">
              {category === "Panels" && panelStageGroups.map(([stage, stageTasks]) => {
                const orderedTasks = [...stageTasks].sort((left, right) => {
                  const leftTitle = parsePanelTaskStorageTitle(left.title)?.baseTitle ?? left.title;
                  const rightTitle = parsePanelTaskStorageTitle(right.title)?.baseTitle ?? right.title;
                  return panelTaskBaseTitles.indexOf(leftTitle as typeof panelTaskBaseTitles[number]) - panelTaskBaseTitles.indexOf(rightTitle as typeof panelTaskBaseTitles[number]);
                });
                const completeCount = stageTasks.filter((task) => statusLabel(task) === "Complete").length;
                const isComplete = stageTasks.length > 0 && completeCount === stageTasks.length;
                const isOverdue = stageTasks.some((task) => statusLabel(task) === "Overdue");
                return <article className="admin-task-accordion case-study-session-accordion" key={`panel-${stage}`}>
                  <details>
                    <summary className="admin-task-summary">
                      <span className={`task-mini-status ${isOverdue ? "is-overdue" : isComplete ? "is-complete" : ""}`} />
                      <span className="task-copy"><strong>{stage}</strong><small>{completeCount} of {stageTasks.length} tasks complete</small></span>
                      <span className={`status-badge ${isComplete ? "badge-success" : "badge-warning"}`}>{isComplete ? "Complete" : "Incomplete"}</span>
                      <span className="accordion-chevron">+</span>
                    </summary>
                    <div className="case-study-subtasks">
                      {orderedTasks.map((task) => {
                        const baseTitle = parsePanelTaskStorageTitle(task.title)?.baseTitle ?? task.title;
                        return <div className="case-study-subtask" key={task.id}>
                          <span className={`task-mini-status ${statusLabel(task) === "Complete" ? "is-complete" : statusLabel(task) === "Overdue" ? "is-overdue" : ""}`} />
                          <div className="task-copy"><strong>{baseTitle}</strong>{task.description && <p>{task.description}</p>}</div>
                          <span className={`status-badge ${statusClassFor(statusLabel(task))}`}>{statusLabel(task)}</span>
                          {baseTitle === "Submit Speaker Headshot + Bio" && <button className={statusLabel(task) === "Complete" ? "roadmap-toggle case-study-complete-button" : "complete-button case-study-complete-button"} type="button" disabled={updatingPanelHeadshotTaskId === task.id} onClick={() => void updatePanelHeadshotStatus(task.id, statusLabel(task) === "Complete" ? "uncomplete" : "complete")}>{updatingPanelHeadshotTaskId === task.id ? "Saving..." : statusLabel(task) === "Complete" ? "Unmark Complete" : "Mark Complete"}</button>}
                        </div>;
                      })}
                      {panelHeadshotMessage && <p className="case-study-task-message" role="alert">{panelHeadshotMessage}</p>}
                      <section className="case-study-session-details" aria-label={`${stage} panel details`}>
                        <h3>Panel Details</h3>
                        {(() => {
                          const session = stageTasks.find((task) => task.input_values?.panel_session)?.input_values?.panel_session as Record<string, unknown> | undefined;
                          const valueFor = (field: string) => String(session?.[field] ?? "").trim() || "Not provided";
                          const speakerName = ["First Name", "Last Name"].map((field) => String(session?.[field] ?? "").trim()).filter(Boolean).join(" ") || "Not provided";
                          return <dl>
                            <div><dt>First Name Last Name</dt><dd>{speakerName}</dd></div>
                            {["Job Title", "Company Name", "Email", "Date", "Time", "Stage", "Panel Title"].map((field) => <div key={field}><dt>{field}</dt><dd>{valueFor(field)}</dd></div>)}
                          </dl>;
                        })()}
                      </section>
                    </div>
                  </details>
                </article>;
              })}
              {category === "Roundtable" && <article className={`admin-task-accordion case-study-session-accordion ${roundtableExpanded ? "is-expanded" : ""}`}>
                <button className="admin-task-summary" type="button" aria-expanded={roundtableExpanded} onClick={() => setRoundtableExpanded((expanded) => !expanded)}>
                  <span className={`task-mini-status ${categoryTasks.some((task) => statusLabel(task) === "Overdue") ? "is-overdue" : categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "is-complete" : ""}`} />
                  <span className="task-copy"><strong>Roundtable</strong><small>{categoryTasks.filter((task) => statusLabel(task) === "Complete").length} of {categoryTasks.length} tasks complete</small></span>
                  <span className={`status-badge ${categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "badge-success" : "badge-warning"}`}>{categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "Complete" : "Incomplete"}</span>
                  <span className="accordion-chevron">{roundtableExpanded ? "−" : "+"}</span>
                </button>
                {roundtableExpanded && <div className="case-study-subtasks">
                  {[...categoryTasks].sort((left, right) => roundtableTaskOrder.indexOf(left.title) - roundtableTaskOrder.indexOf(right.title)).map((task) => (
                    <div className="case-study-subtask" key={task.id}>
                      <span className={`task-mini-status ${statusLabel(task) === "Complete" ? "is-complete" : statusLabel(task) === "Overdue" ? "is-overdue" : ""}`} />
                      <div className="task-copy"><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}</div>
                      <span className={`status-badge ${statusClassFor(statusLabel(task))}`}>{statusLabel(task)}</span>
                      {task.title === "Approve Roundtable Questions Submitted by the Moderator" && <button className={statusLabel(task) === "Complete" ? "roadmap-toggle case-study-complete-button" : "complete-button case-study-complete-button"} type="button" disabled={updatingRoundtableTaskId === task.id} onClick={() => void updateRoundtableQuestionsStatus(task.id, statusLabel(task) === "Complete" ? "unapprove" : "approve")}>{updatingRoundtableTaskId === task.id ? "Saving..." : statusLabel(task) === "Complete" ? "Unapprove" : "Approve Questions"}</button>}
                    </div>
                  ))}
                  {roundtableTaskMessage && <p className="case-study-task-message" role="alert">{roundtableTaskMessage}</p>}
                  <section className="case-study-session-details" aria-label="Roundtable details">
                    <h3>Roundtable Details</h3>
                    {(() => {
                      const fields = ["Luma Link", "Day", "Room", "Time", "Title", "Sponsor", "Target List URL", "Company Type", "Asset Class", "Other Info", "Roundtable Questions", "Attendee List"];
                      const sessionTask = categoryTasks.find((task) => task.input_values?.roundtable_session);
                      const session = sessionTask?.input_values?.roundtable_session as Record<string, unknown> | undefined;
                      const valueFor = (field: string) => String(session?.[field] ?? "").trim() || "Not provided";
                      return <dl>{fields.map((field) => <div key={field}><dt>{field}</dt><dd>{valueFor(field)}</dd></div>)}</dl>;
                    })()}
                  </section>
                </div>}
              </article>}
              {category === "Innovation" && <article className={`admin-task-accordion case-study-session-accordion ${innovationStageExpanded ? "is-expanded" : ""}`}>
                <button className="admin-task-summary" type="button" aria-expanded={innovationStageExpanded} onClick={() => setInnovationStageExpanded((expanded) => !expanded)}>
                  <span className={`task-mini-status ${categoryTasks.some((task) => statusLabel(task) === "Overdue") ? "is-overdue" : categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "is-complete" : ""}`} />
                  <span className="task-copy"><strong>Innovation Stage</strong><small>{categoryTasks.filter((task) => statusLabel(task) === "Complete").length} of {categoryTasks.length} tasks complete</small></span>
                  <span className={`status-badge ${categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "badge-success" : "badge-warning"}`}>{categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "Complete" : "Incomplete"}</span>
                  <span className="accordion-chevron">{innovationStageExpanded ? "−" : "+"}</span>
                </button>
                {innovationStageExpanded && <div className="case-study-subtasks">
                  {categoryTasks.map((task) => (
                    <div className="case-study-subtask" key={task.id}>
                      <span className={`task-mini-status ${statusLabel(task) === "Complete" ? "is-complete" : statusLabel(task) === "Overdue" ? "is-overdue" : ""}`} />
                      <div className="task-copy"><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}</div>
                      <span className={`status-badge ${statusClassFor(statusLabel(task))}`}>{statusLabel(task)}</span>
                    </div>
                  ))}
                  <section className="case-study-session-details" aria-label="Innovation Stage presentation details">
                    <h3>Innovation Stage Presentation Details</h3>
                    {(() => {
                      const fields = ["Quantity", "Panel", "Date", "Time", "Title", "Slides"];
                      const sessionTask = categoryTasks.find((task) => task.input_values?.innovation_stage_session);
                      const session = sessionTask?.input_values?.innovation_stage_session as Record<string, unknown> | undefined;
                      const valueFor = (field: string) => String(session?.[field] ?? "").trim() || "Not provided";
                      return <dl>
                        {fields.map((field) => <div key={field}><dt>{field}</dt><dd>{valueFor(field)}</dd></div>)}
                        <div><dt>Speaker</dt><dd>{["Name", "Job Title", "Company"].map(valueFor).join(" - ")}</dd></div>
                        <div><dt>Speaker Email</dt><dd>{valueFor("Email")}</dd></div>
                      </dl>;
                    })()}
                  </section>
                </div>}
              </article>}
              {category === "Case study" && <article className={`admin-task-accordion case-study-session-accordion ${caseStudyExpanded ? "is-expanded" : ""}`}>
                <button className="admin-task-summary" type="button" aria-expanded={caseStudyExpanded} onClick={() => setCaseStudyExpanded((expanded) => !expanded)}>
                  <span className={`task-mini-status ${categoryTasks.some((task) => statusLabel(task) === "Overdue") ? "is-overdue" : categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "is-complete" : ""}`} />
                  <span className="task-copy"><strong>Confirm Case Study Session</strong><small>{categoryTasks.filter((task) => statusLabel(task) === "Complete").length} of {categoryTasks.length} tasks complete</small></span>
                  <span className={`status-badge ${categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "badge-success" : "badge-warning"}`}>{categoryTasks.length > 0 && categoryTasks.every((task) => statusLabel(task) === "Complete") ? "Complete" : "Incomplete"}</span>
                  <span className="accordion-chevron">{caseStudyExpanded ? "−" : "+"}</span>
                </button>
                {caseStudyExpanded && <div className="case-study-subtasks">
                  {categoryTasks.map((task) => (
                    <div className="case-study-subtask" key={task.id}>
                      <span className={`task-mini-status ${statusLabel(task) === "Complete" ? "is-complete" : statusLabel(task) === "Overdue" ? "is-overdue" : ""}`} />
                      <div className="task-copy"><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}</div>
                      <span className={`status-badge ${statusClassFor(statusLabel(task))}`}>{statusLabel(task)}</span>
                      {task.title === "Submit Speaker Headshot + Bio" && <button className={statusLabel(task) === "Complete" ? "roadmap-toggle case-study-complete-button" : "complete-button case-study-complete-button"} type="button" disabled={completingCaseStudyTaskId === task.id} onClick={() => void updateCaseStudyHeadshotStatus(task.id, statusLabel(task) === "Complete" ? "uncomplete" : "complete")}>{completingCaseStudyTaskId === task.id ? "Saving..." : statusLabel(task) === "Complete" ? "Unmark Complete" : "Mark Complete"}</button>}
                    </div>
                  ))}
                  {caseStudyTaskMessage && <p className="case-study-task-message" role="alert">{caseStudyTaskMessage}</p>}
                  <section className="case-study-session-details" aria-label="Case Study session details">
                    <h3>Case Study Session Details</h3>
                    {(() => {
                      const fields = ["Date", "Time", "Title"];
                      const sessionTask = categoryTasks.find((task) => task.input_values?.case_study_session);
                      const session = sessionTask?.input_values?.case_study_session as Record<string, unknown> | undefined;
                      const valueFor = (field: string) => String(session?.[field] ?? "").trim() || "Not provided";
                      return <dl>
                        {fields.map((field) => <div key={field}><dt>{field}</dt><dd>{valueFor(field)}</dd></div>)}
                        <div><dt>Speaker</dt><dd>{["Name", "Job Title", "Company"].map(valueFor).join(" - ")}</dd></div>
                        <div><dt>Speaker Email</dt><dd>{valueFor("Email")}</dd></div>
                        <div><dt>Guest Client</dt><dd>{["Guest Client Name", "Guest Client Job Title", "Guest Client Company"].map(valueFor).join(" - ")}</dd></div>
                        <div><dt>Guest Client Email</dt><dd>{valueFor("Guest Client Email")}</dd></div>
                      </dl>;
                    })()}
                  </section>
                </div>}
              </article>}
              {categoryTasks.filter((task) => {
                if (category === "Case study") return !["Confirm Case Study Speaker", "Confirm Case Study Guest Client Speaker", "Submit Case Study Title", "Submit Speaker Headshot + Bio"].includes(task.title);
                if (category === "Innovation") return !["Submit Innovation Stage Presentation Title", "Confirm Innovation Stage Speaker", "Submit Innovation Stage Presentation Slides"].includes(task.title);
                if (category === "Roundtable") return !["Confirm Roundtable Title", "Approve Roundtable Questions Submitted by the Moderator"].includes(task.title);
                if (category === "Panels") return !parsePanelTaskStorageTitle(task.title);
                return true;
              }).map((task) => (
                <article className={`admin-task-accordion ${expandedTask === task.id ? "is-expanded" : ""}`} key={task.id}>
                  <button className="admin-task-summary" type="button" onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}>
                    <span className={`task-mini-status ${statusLabel(task) === "Complete" ? "is-complete" : statusLabel(task) === "Overdue" ? "is-overdue" : ""}`} />
                    <span className="task-copy"><strong>{task.title}</strong><small>{task.title === "Confirm 10 Private Meetings" ? `${Number(task.input_values?.confirmed_meeting_count ?? 0)} / 10 confirmed` : `Quantity ${task.quantity}`}{task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</small></span>
                    <span className={`status-badge ${statusClassFor(statusLabel(task))}`}>{statusLabel(task)}</span>
                    <span className="accordion-chevron">{expandedTask === task.id ? "−" : "+"}</span>
                  </button>
                  {expandedTask === task.id && (
                    <div className="admin-task-detail">
                      {task.description && <p className="task-instructions">{task.description}</p>}
                      {task.title === "Confirm Displayed Name of Company" && <DisplayedCompanyNameEditor
                        taskId={task.id}
                        savedName={String(task.input_values?.displayed_company_name ?? "")}
                        onSaved={(name, isComplete) => setTasks((current) => current.map((item) => item.id === task.id ? {
                          ...item,
                          status: isComplete ? "Complete" : item.status,
                          input_values: { ...item.input_values, displayed_company_name: name },
                        } : item))}
                      />}
                      {["Confirm Workshop Title", "Confirm Workshop Structure, Questions, and Leader"].includes(task.title) && <WorkshopTaskEditor
                        taskId={task.id}
                        taskTitle={task.title}
                        savedDetails={String(task.input_values?.[task.title === "Confirm Workshop Title" ? "workshop_title" : "workshop_structure_questions_leader"] ?? "")}
                        isComplete={task.status === "Complete"}
                        onSaved={(details, status) => setTasks((current) => current.map((item) => item.id === task.id ? {
                          ...item,
                          status,
                          input_values: { ...item.input_values, [task.title === "Confirm Workshop Title" ? "workshop_title" : "workshop_structure_questions_leader"]: details },
                        } : item))}
                      />}
                      {task.title === "Confirm 10 Private Meetings" && <section className="confirmed-meetings-data" aria-label="Confirmed private meeting rows">
                        <p className="confirmed-meetings-count"><strong>{Number(task.input_values?.confirmed_meeting_count ?? 0)} / 10</strong> company rows confirmed</p>
                        {Array.isArray(task.input_values?.confirmed_meeting_rows) && task.input_values.confirmed_meeting_rows.length > 0
                          ? <div className="confirmed-meetings-table-wrap"><table><thead><tr>{Object.keys(task.input_values.confirmed_meeting_rows[0] as Record<string, unknown>).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{task.input_values.confirmed_meeting_rows.map((row, index) => <tr key={`confirmed-meeting-${index}`}>{Object.values(row as Record<string, unknown>).map((value, valueIndex) => <td key={`${index}-${valueIndex}`}>{String(value ?? "")}</td>)}</tr>)}</tbody></table></div>
                          : <p className="confirmed-meetings-empty">No confirmed meeting rows found for this company.</p>}
                      </section>}
                      {task.title === "Confirm Tour" && <section className="tour-selection-values" aria-label="Contracted tour selections">
                        <p className="eyebrow">Contracted tour values</p>
                        {getTourSelectionValues(sponsor?.contract_details.tours).length > 0
                          ? <ul>{getTourSelectionValues(sponsor?.contract_details.tours).map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul>
                          : <p>Not specified</p>}
                      </section>}
                      {task.category === "Networking App" && ["Complete Company Profile", "Onboard Sales Team"].includes(task.title) && <div className="networking-app-task-controls">
                        <button className={statusLabel(task) === "Complete" ? "roadmap-toggle" : "complete-button"} type="button" disabled={updatingNetworkingTaskId === task.id} onClick={() => void updateNetworkingTaskStatus(task.id, statusLabel(task) === "Complete" ? "uncomplete" : "complete")}>{updatingNetworkingTaskId === task.id ? "Saving..." : statusLabel(task) === "Complete" ? "Unmark Complete" : "Mark Complete"}</button>
                        {networkingTaskMessage && <small className="networking-app-task-message" role="alert">{networkingTaskMessage}</small>}
                      </div>}
                      {["Confirm Additional Furniture for Booth", "Confirm Booth Activations"].includes(task.title) && <BoothTaskConfirmation
                        taskId={task.id}
                        taskTitle={task.title}
                        savedDetails={String(task.input_values?.[task.title === "Confirm Additional Furniture for Booth" ? "additional_furniture" : "booth_activations"] ?? "")}
                        onSaved={(details, isComplete) => setTasks((current) => current.map((item) => item.id === task.id ? {
                          ...item,
                          status: isComplete ? "Complete" : item.status,
                          input_values: { ...item.input_values, [task.title === "Confirm Additional Furniture for Booth" ? "additional_furniture" : "booth_activations"]: details },
                        } : item))}
                      />}
                      {["Issue Team Tickets", "Issue RE Tickets", "Issue Speaker Team Ticket"].includes(task.title) && <CventTicketRegistrations
                        sponsorEventId={task.sponsor_event_id}
                        taskTitle={task.title}
                        quantity={task.quantity}
                      />}
                      {task.title === "Confirm VIP Attendees" && <VipTicketAllocation
                        taskId={task.id}
                        quantity={task.quantity}
                        savedNominees={Array.isArray(task.input_values?.nominees) ? task.input_values.nominees as Array<{ first_name: string; last_name: string; job_title: string; company: string; email: string }> : []}
                        onSaved={(nominees) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "Complete", input_values: { ...item.input_values, nominees } } : item))}
                      />}
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