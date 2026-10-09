import type { TaskStatus } from "@/lib/types";

export type SponsorSheetDetails = Record<string, unknown>;
export type SponsorContactFields = {
  contactName: string;
  contactEmail: string;
  dealContactName: string;
  dealContactEmail: string;
  accountManager: string;
  clientSuccessManager: string;
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function valueForKeys(details: SponsorSheetDetails, aliases: string[]) {
  const entries = Object.entries(details);
  for (const alias of aliases) {
    const match = entries.find(([key, value]) => normalizeKey(key) === normalizeKey(alias) && value != null && String(value).trim());
    if (match) return String(match[1]).trim();
  }
  for (const alias of aliases) {
    const suffix = normalizeKey(alias);
    const match = entries.find(([key, value]) => normalizeKey(key).endsWith(suffix) && value != null && String(value).trim());
    if (match) return String(match[1]).trim();
  }
  return "";
}

export function getSponsorContactFields(details: SponsorSheetDetails): SponsorContactFields {
  return {
    contactName: valueForKeys(details, ["contact_name", "primary_contact", "contact"]),
    contactEmail: valueForKeys(details, ["email", "contact_email", "primary_contact_email"]),
    dealContactName: valueForKeys(details, ["PoC's.deal_contact", "pocs.deal_contact", "deal_contact"]),
    dealContactEmail: valueForKeys(details, ["PoC's.deal_contact_email", "pocs.deal_contact_email", "deal_contact_email"]),
    accountManager: valueForKeys(details, ["am", "account_manager", "workshop.account_manager"]),
    clientSuccessManager: valueForKeys(details, ["cs", "client_success_manager", "customer_success_manager", "client_success"]),
  };
}

export function classifyExportTask(task: { status: TaskStatus | string; due_date: string | null }, now = new Date()) {
  if (task.status === "Complete") return "Complete" as const;
  if (task.status === "Overdue") return "Overdue" as const;
  if (task.due_date) {
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const dueUtc = Date.parse(`${task.due_date}T00:00:00Z`);
    if (Number.isFinite(dueUtc) && dueUtc < todayUtc) return "Overdue" as const;
  }
  return "Incomplete" as const;
}

export function csvCell(value: unknown) {
  const rawText = value == null ? "" : String(value);
  const text = /^[\s]*[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
  return `"${text.replace(/"/g, '""')}"`;
}