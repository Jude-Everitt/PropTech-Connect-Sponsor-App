import { canonicalTicketTaskTitle, getContractRow, getContractTasks, parseBrandingTaskStorageTitle, parsePanelTaskStorageTitle } from "@/lib/contract-tasks";
import { csvCell } from "@/lib/sponsor-contact-export";

export type EmailTask = { title: string; category: string; status: string; due_date: string | null; quantity: number; input_values: Record<string, unknown> | null };
export type EmailContact = { name: string; email: string };
type Entry = { text: string; done: boolean; review: boolean };

const ticketTitles = new Set(["Issue Team Tickets", "Issue Speaker Team Ticket", "Issue RE Tickets"]);

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function describeTask(task: EmailTask, title: string, confirmedTickets: Map<string, number>): Entry {
  const complete = task.status === "Complete";
  const review = task.status === "pending_review";
  let text = title;
  if (ticketTitles.has(title)) {
    const count = Math.min(task.quantity, confirmedTickets.get(title) ?? 0);
    text += complete ? ` (${count} of ${task.quantity} registered)` : ` (${count} of ${task.quantity} registered, ${Math.max(0, task.quantity - count)} remaining)`;
  } else if (title === "Confirm VIP Attendees") {
    const nominees = Array.isArray(task.input_values?.nominees) ? task.input_values.nominees.length : 0;
    text += ` (${Math.min(task.quantity, nominees)} of ${task.quantity} confirmed)`;
  } else if (title === "Confirm 10 Private Meetings") {
    text += ` (${Number(task.input_values?.confirmed_meeting_count ?? 0)} of 10 confirmed)`;
  }
  if (!complete && !review && task.due_date) text += ` (due ${formatDate(task.due_date)})`;
  return { text, done: complete, review };
}

export function buildStatusEmail(input: {
  companyName: string;
  tier: string;
  eventName: string;
  contacts: EmailContact[];
  groups: Array<{ name: string; tasks: Array<EmailTask & { displayTitle: string }> }>;
  confirmedTickets: Map<string, number>;
}) {
  const subject = `${input.eventName}: Your Campaign Status`;
  const firstName = input.contacts[0]?.name.trim().split(/\s+/)[0];
  const lines = [
    `Hi ${firstName || "there"},`,
    "",
    `Thank you for being ${input.tier ? `a ${input.tier} Sponsor` : "a Sponsor"} of ${input.eventName}. Here is where each part of your campaign stands.`,
    "",
  ];
  for (const group of input.groups) {
    const entries = group.tasks.map((task) => describeTask(task, task.displayTitle, input.confirmedTickets));
    const done = entries.filter((entry) => entry.done).map((entry) => entry.text);
    const review = entries.filter((entry) => entry.review).map((entry) => entry.text);
    const todo = entries.filter((entry) => !entry.done && !entry.review).map((entry) => entry.text);
    lines.push(group.name);
    lines.push(`Completed: ${done.length ? done.join("; ") : "Nothing yet"}.`);
    if (review.length) lines.push(`With our team for review: ${review.join("; ")}.`);
    lines.push(`To do: ${todo.length ? todo.join("; ") : "Nothing outstanding"}.`, "");
  }
  lines.push(
    "If you would like to go through anything together, just reply and we can arrange a call.",
    "",
    "Kind regards,",
    "The PropTech Connect Team",
  );
  return { subject, body: lines.join("\n") };
}

export function categoryLabel(category: string) {
  const value = category.toLowerCase();
  if (value === "branding") return "Branding";
  if (value.includes("branding")) return category;
  if (value.includes("roundtable/meeting/tour options")) return "Roundtable/Meeting/Tour Options";
  if (value.includes("private meeting room")) return "Private Meeting Room";
  if (value.includes("10 meetings")) return "10 Meetings";
  if (value.includes("booth")) return "Booth";
  if (value.includes("panel")) return "Panels";
  if (value.includes("roundtable")) return "Roundtable";
  if (value.includes("case study")) return "Case study";
  if (value.includes("pillar")) return "Branding";
  if (value.includes("ticket")) return "Tickets";
  if (value.includes("meeting")) return "Meetings";
  if (value.includes("tour")) return "Tours";
  if (value.includes("workshop")) return "Workshops";
  if (value.includes("innovation")) return "Innovation";
  if (value.includes("networking")) return "Networking";
  return category;
}

type NormalizableTask = { title: string; category: string; description: string | null; status: string; quantity: number; action_url: string | null; action_label: string | null; input_values: Record<string, unknown> | null };

// The tasks a sponsor is actually entitled to, deduplicated and renamed exactly as the company page shows them.
export function normalizeRoadmapTasks<T extends NormalizableTask>(rawTasks: T[], contractDetails: Record<string, unknown>): T[] {
  const entitledTasks = getContractTasks(getContractRow(contractDetails));
  const entitledTitles = new Set(entitledTasks.map((task) => task.title));
  const visibleTaskMap = new Map<string, T>();
  for (const task of rawTasks) {
    const parsedBrandingTitle = parseBrandingTaskStorageTitle(task.title);
    const title = parsedBrandingTitle?.title ?? canonicalTicketTaskTitle(task.title);
    const entitlementTitle = parsedBrandingTitle ? task.title : title;
    const panelTask = parsePanelTaskStorageTitle(title);
    const isPanelStageTask = Boolean(panelTask && task.category === "Sponsor Panels");
    if (!entitledTitles.has(entitlementTitle) && !isPanelStageTask) continue;
    const entitlement: { category: string; quantity: number; description: string; action_url?: string | null; action_label?: string | null } | undefined = isPanelStageTask
      ? { category: "Sponsor Panels", quantity: task.quantity, description: task.description ?? "" }
      : entitledTasks.find((item) => item.title === entitlementTitle && item.category === task.category)
        ?? entitledTasks.find((item) => item.title === entitlementTitle);
    if (!entitlement) continue;
    const normalizedTask: T = {
      ...task,
      title,
      category: entitlement.category,
      quantity: entitlement.quantity,
      description: ["Confirm private meeting room", "Confirm 10 Private Meetings"].includes(title) ? entitlement.description : task.description ?? entitlement.description,
      action_url: task.action_url ?? entitlement.action_url ?? null,
      action_label: task.action_label ?? entitlement.action_label ?? null,
    };
    const key = `${normalizedTask.category}:${normalizedTask.title}`;
    const existingTask = visibleTaskMap.get(key);
    if (!existingTask) {
      visibleTaskMap.set(key, normalizedTask);
      continue;
    }
    const existingNominees = Array.isArray(existingTask.input_values?.nominees) ? existingTask.input_values.nominees : [];
    const candidateNominees = Array.isArray(normalizedTask.input_values?.nominees) ? normalizedTask.input_values.nominees : [];
    if (candidateNominees.length > existingNominees.length || (candidateNominees.length === existingNominees.length && normalizedTask.status === "Complete" && existingTask.status !== "Complete")) {
      visibleTaskMap.set(key, normalizedTask);
    }
  }
  return [...visibleTaskMap.values()];
}

export function composeStatusEmail(input: {
  companyName: string;
  tier: string;
  eventName: string;
  contacts: EmailContact[];
  tasks: EmailTask[];
  confirmedTickets: Map<string, number>;
}) {
  const byCategory = new Map<string, Array<EmailTask & { displayTitle: string }>>();
  for (const task of input.tasks) {
    const panel = parsePanelTaskStorageTitle(task.title);
    const category = categoryLabel(task.category);
    byCategory.set(category, [...(byCategory.get(category) ?? []), { ...task, displayTitle: panel ? `${panel.baseTitle} (${panel.stage})` : task.title }]);
  }
  return buildStatusEmail({
    companyName: input.companyName,
    tier: input.tier,
    eventName: input.eventName,
    contacts: input.contacts,
    groups: [...byCategory.entries()].map(([name, tasks]) => ({ name, tasks })),
    confirmedTickets: input.confirmedTickets,
  });
}

export function confirmedTicketCounts(registrations: Array<{ task_title: string; status: string }>) {
  const counts = new Map<string, number>();
  for (const registration of registrations) {
    if (registration.status.toLowerCase() === "accepted") counts.set(registration.task_title, (counts.get(registration.task_title) ?? 0) + 1);
  }
  return counts;
}

type StatusEmailRow = { companyName: string; contacts: EmailContact[]; email: { subject: string; body: string } };

// One row per company; contact columns are added as needed for whichever company has the most contacts.
export function statusEmailsCsv(rows: StatusEmailRow[]) {
  const contactColumns = Math.max(1, ...rows.map((row) => row.contacts.length));
  const headers = ["Company Name", ...Array.from({ length: contactColumns }, (_, index) => `Campaign Point of Contact ${index + 1}`), "Email Subject", "Email Body"];
  const lines = rows.map((row) => [row.companyName, ...Array.from({ length: contactColumns }, (_, index) => row.contacts[index] ? `${row.contacts[index].name} <${row.contacts[index].email}>` : ""), row.email.subject, row.email.body]);
  return `\uFEFF${[headers, ...lines].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function statusEmailCsv(companyName: string, contacts: EmailContact[], email: { subject: string; body: string }) {
  return statusEmailsCsv([{ companyName, contacts, email }]);
}

export function pendingTaskList(tasks: EmailTask[]) {
  return tasks
    .filter((task) => task.status !== "Complete")
    .map((task) => {
      const panel = parsePanelTaskStorageTitle(task.title);
      return { title: panel ? `${panel.baseTitle} (${panel.stage})` : task.title, dueDate: task.due_date };
    })
    // Earliest deadline first; tasks without a deadline go last.
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"))
    .map((task) => `• ${task.title}${task.dueDate ? ` (Deadline: ${formatDate(task.dueDate)})` : ""}`)
    .join("\n");
}

type PendingItemsRow = { companyName: string; contacts: EmailContact[]; pendingTasks: string };

// One row per point of contact; the company's pending tasks repeat on each of its rows.
export function pendingItemsCsv(rows: PendingItemsRow[]) {
  const headers = ["Company Name", "First Name", "Last Name", "Email", "Pending Tasks"];
  const lines = rows.flatMap((row) => {
    const contacts = row.contacts.length ? row.contacts : [{ name: "", email: "" }];
    return contacts.map((contact) => {
      const [firstName = "", ...rest] = contact.name.trim().split(/\s+/);
      return [row.companyName, firstName, rest.join(" "), contact.email, row.pendingTasks];
    });
  });
  return `\uFEFF${[headers, ...lines].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
