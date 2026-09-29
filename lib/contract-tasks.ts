export type ContractTask = {
  title: string;
  description: string;
  category: string;
  quantity: number;
  action_url?: string;
  action_label?: string;
};

type ContractRow = Record<string, string>;

const bookingLink = "https://meetings-eu1.hubspot.com/evu";
const roundtableBookingLink = "https://meetings-eu1.hubspot.com/evu/roundtable";

const taskDescriptions: Record<string, string> = {
  "Submit booth artwork": "Provide the final artwork for the allocated booth, including any required dimensions and brand assets.",
  "Approve artwork": "Review and approve the final artwork before production.",
  "Note booth additional rentals": "List any additional rentals required for your booth beyond the standard package.",
  "Note booth activations": "Describe the planned booth activations, visitor experience, and staffing requirements.",
  "Confirm team ticket allocation": "Confirm the number of team tickets allocated and provide attendee details when available.",
  "Confirm RE ticket allocation": "Confirm the number of RE tickets allocated and provide attendee details when available.",
  "Confirm VIP ticket allocation": "Confirm the number of VIP tickets allocated and provide attendee details when available.",
  "Confirm panel details": "Confirm the panel date, time, stage, title, panellists, and moderator details.",
  "Book a call with Elena (Head of Content)": "Use the supplied booking link to arrange a call with Elena, Head of Content.",
  "Submit case study": "Submit the agreed case study content and supporting assets.",
  "Submit innovation details": "Provide the innovation details and supporting information for review.",
  "Confirm workshop details": "Confirm the workshop format, title, speakers, timings, and requirements.",
  "Submit branding artwork": "Submit general branding artwork for use across your sponsor presence.",
  "Upload Logo": "Upload the company logo for use across your sponsor branding.",
  "Confirm Displayed Company Name": "Confirm the company name exactly as it should appear across event branding.",
  "Call Account Manager and Client Success to confirm option": "Speak with the Account Manager and Client Success team to confirm the roundtable, meeting, or tour option.",
  "Select a tour": "Select the preferred tour option and provide any attendee or access requirements.",
  "Confirm 10 meetings": "",
  "Submit artwork": "Submit the final artwork for the selected venue branding item.",
  "Submit pillar artwork": "Submit the final artwork for the allocated pillars and confirm their locations.",
  "Create company profile on the networking app": "Create or update the company profile in the networking app using the supplied link.",
};

const boothTaskOrder = [
  "Submit booth artwork",
  "Approve artwork",
  "Note booth additional rentals",
  "Note booth activations",
];

export function orderBoothTasks<T extends { title: string }>(tasks: T[]) {
  const order = new Map(boothTaskOrder.map((title, index) => [title, index]));
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => (order.get(a.task.title) ?? boothTaskOrder.length) - (order.get(b.task.title) ?? boothTaskOrder.length) || a.index - b.index)
    .map(({ task }) => task);
}

function isTruthy(value: string | undefined) {
  return !!value && ["true", "yes", "y", "1", "x", "included"].includes(value.trim().toLowerCase());
}

function getQuantity(row: ContractRow, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias]?.trim();
    if (!value) continue;
    const numeric = Number(value.replace(/,/g, ""));
    if (Number.isFinite(numeric)) {
      if (numeric > 0) return Math.floor(numeric);
      continue;
    }
    if (["false", "no", "n", "none", "not included", "na", "n/a", "-"].includes(value.toLowerCase())) continue;
    if (isTruthy(value) || value.length > 0) return 1;
  }
  return 0;
}

function hasValue(row: ContractRow, aliases: string[]) {
  return aliases.some((alias) => getQuantity(row, [alias]) > 0);
}

function meetingRoomAssignment(row: ContractRow) {
  const fields = [
    { label: "Date", aliases: ["date", "assigned_date", "meeting_date", "room_date", "scheduled_date"] },
    { label: "Time", aliases: ["time", "assigned_time", "meeting_time", "room_time", "scheduled_time", "time_slot"] },
    { label: "Room location", aliases: ["location", "assigned_location", "assigned_room", "room", "room_location", "room_name", "room_number", "venue"] },
  ];
  const values = fields.map(({ label, aliases }) => {
    const value = Object.entries(row).find(([key, fieldValue]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const prefix = ["meeting_room_", "private_meeting_room_"].find((candidate) => normalizedKey.startsWith(candidate));
      if (!prefix || !fieldValue.trim()) return false;
      const fieldName = normalizedKey.slice(prefix.length);
      return aliases.some((alias) => fieldName === alias || fieldName.endsWith(`_${alias}`));
    })?.[1];
    return `${label}: ${value?.trim() || "To be confirmed"}`;
  });
  return values.join("\n");
}

export function getContractTasks(row: ContractRow): ContractTask[] {
  const tasks: ContractTask[] = [];
  const add = (title: string, category: string, aliases: string[], action?: { url: string; label: string }, additiveAliases: string[] = []) => {
    const quantity = getQuantity(row, aliases) + additiveAliases.reduce((total, alias) => total + getQuantity(row, [alias]), 0);
    if (quantity > 0) tasks.push({
      title,
      category,
      quantity,
      description: title === "Confirm private meeting room"
        ? meetingRoomAssignment(row)
        : taskDescriptions[title] ?? "Provide the requested information or assets for this deliverable.",
      action_url: action?.url,
      action_label: action?.label,
    });
  };
  const addBrandingArtwork = (title: string, aliases: string[], placement: string) => {
    const quantity = getQuantity(row, aliases);
    if (!quantity) return;
    const sheetValue = aliases.map((alias) => row[alias]?.trim()).find(Boolean);
    const valueDescription = sheetValue ? ` The sheet lists this placement as ${sheetValue}.` : "";
    tasks.push({
      title,
      category: "Branding",
      quantity,
      description: `Submit artwork for ${placement}.${valueDescription}`,
    });
  };

  const addBaselineBrandingTask = (title: string) => {
    tasks.push({ title, category: "Branding", quantity: 1, description: taskDescriptions[title] });
  };
  addBaselineBrandingTask("Upload Logo");
  addBaselineBrandingTask("Confirm Displayed Company Name");
  if (isTruthy(row.requires_booth) || isTruthy(row.booth)) {
    add("Submit booth artwork", "Exhibition Booth", ["requires_booth", "booth"]);
    add("Approve artwork", "Exhibition Booth", ["requires_booth", "booth"]);
    add("Note booth additional rentals", "Exhibition Booth", ["requires_booth", "booth"]);
    add("Note booth activations", "Exhibition Booth", ["requires_booth", "booth"]);
  }
  add("Confirm team ticket allocation", "Tickets", ["team_tickets"]);
  add("Confirm RE ticket allocation", "Tickets", ["re_tickets"]);
  add("Confirm VIP ticket allocation", "Tickets", ["vip_tickets"]);
  if (hasValue(row, ["sponsor_panels", "specified_panel"])) {
    add("Book a call with Elena (Head of Content)", "Sponsor Panels", ["sponsor_panels", "specified_panel"], { url: bookingLink, label: "Booking Link" });
    add("Confirm panel details", "Sponsor Panels", ["sponsor_panels", "specified_panel"]);
  }
  add("Submit case study", "Case Study", ["case_study"]);
  add("Submit innovation details", "Innovation", ["innovation"]);
  add("Confirm workshop details", "Workshop", ["workshop"]);
  add("Confirm private meeting room", "Private Meeting Room", ["private_meeting_room"]);
  add("Call Account Manager and Client Success to confirm option", "Roundtable/Meeting/Tour Options", ["choose_rt_tour_meetings"]);
  add("Book a call with Elena (Head of Content)", "Roundtables", ["roundtable"], { url: roundtableBookingLink, label: "Booking Link" }, ["approved_option_roundtable"]);
  add("Select a tour", "Tours", ["tours"], undefined, ["approved_option_tours"]);
  add("Confirm 10 meetings", "10 Meetings", ["10_meetings"], undefined, ["approved_option_10_meetings"]);
  addBrandingArtwork("Submit Tier 1 Branding Artwork", ["t1_branding", "Branding.tier_1"], "the Tier 1 branding placement");
  addBrandingArtwork("Submit Tier 2 Branding Artwork", ["t2_branding", "Branding.tier_2"], "the Tier 2 branding placement");
  addBrandingArtwork("Submit Tier 3 Branding Artwork", ["t3_branding", "Branding.tier_3"], "the Tier 3 branding placement");
  addBrandingArtwork("Submit Tier 4 Branding Artwork", ["t4_branding", "Branding.tier_4"], "the Tier 4 branding placement");
  if (hasValue(row, ["pillars", "Branding.pillars", "pillar_location", "Branding.pillar_location"])) {
    addBrandingArtwork("Submit Pillar Branding Artwork", ["pillars", "Branding.pillars", "pillar_location", "Branding.pillar_location"], "the pillar branding placement");
  }
  add("Create company profile on the networking app", "Networking", ["networking_app_profile"], { url: "https://sponsor.brella.io/events", label: "Edit Company Profile" });
  return tasks;
}

export function getContractRow(value: unknown): ContractRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, field == null ? "" : String(field)]));
}

export function contractTaskKey(task: Pick<ContractTask, "title" | "category">) {
  return `${task.category}:${task.title}`;
}