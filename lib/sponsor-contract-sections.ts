type ContractValues = Record<string, unknown>;
export type ContractDisplayField = { key: string; label: string; value: string };

const accountLabels: Record<string, string> = {
  am: "Account manager",
  cs: "Client success",
  tier: "Tier",
  email: "Account email",
  contact_name: "Account contact",
  deal_size: "Deal size",
  contract: "Contract",
  close_date: "Close date",
  contract_notes: "Contract notes",
};

const deliverableFields: Array<[string, string, string[]?]> = [
  ["company", "Company"],
  ["requires_booth", "Booth included"],
  ["booth_position", "Booth position"],
  ["team_tickets", "Team tickets"],
  ["re_tickets", "RE tickets"],
  ["vip_tickets", "VIP tickets"],
  ["sponsor_panels", "Panels"],
  ["specified_panel", "Specified panel"],
  ["roundtable", "Roundtable", ["Roundtables.quantity"]],
  ["case_study", "Case study", ["Case Study.quantity"]],
  ["innovation", "Innovation", ["Innovation.quantity"]],
  ["workshop", "Workshop", ["Workshop.quantity"]],
  ["private_meeting_room", "Private meeting room"],
  ["choose_rt_tour_meetings", "RT / tour / meetings option"],
  ["tours", "Tours"],
  ["10_meetings", "10 meetings"],
  ["t1_branding", "Branding: Tier 1", ["Branding.tier_1"]],
  ["t2_branding", "Branding: Tier 2", ["Branding.tier_2"]],
  ["t3_branding", "Branding: Tier 3", ["Branding.tier_3"]],
  ["t4_branding", "Branding: Tier 4", ["Branding.tier_4"]],
  ["pillars", "Pillars", ["Branding.pillars"]],
  ["pillar_location", "Pillar location", ["Branding.pillar_location"]],
  ["networking_app_profile", "Networking app profile"],
];
const approvedQuantityFields: Record<string, string> = {
  roundtable: "approved_option_roundtable",
  tours: "approved_option_tours",
  "10_meetings": "approved_option_10_meetings",
};

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function pickValue(details: ContractValues, key: string, fallbacks: string[] = []) {
  const direct = displayValue(details[key]);
  if (direct) return direct;
  for (const fallback of fallbacks) {
    const value = displayValue(details[fallback]);
    if (value) return value;
  }
  return "";
}

function contractQuantity(value: string) {
  const normalized = value.replace(/,/g, "");
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return Math.max(0, Math.floor(numeric));
  return ["false", "no", "n", "none", "not included", "na", "n/a", "-"].includes(value.toLowerCase()) ? 0 : 1;
}

export function splitSponsorContractDetails(details: ContractValues) {
  const accountDetails = Object.entries(accountLabels).flatMap(([key, label]) => {
    const value = pickValue(details, key);
    return value ? [{ key, label, value }] : [];
  });
  const deliverables = deliverableFields.flatMap(([key, label, fallbacks]) => {
    const baseValue = pickValue(details, key, fallbacks);
    const approvedKey = approvedQuantityFields[key];
    const approvedValue = approvedKey ? contractQuantity(displayValue(details[approvedKey])) : 0;
    const value = approvedValue ? String(contractQuantity(baseValue) + approvedValue) : baseValue;
    return value ? [{ key, label, value }] : [];
  });
  return { accountDetails, deliverables };
}
