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
  "Note booth activations": "Describe the planned booth activations, visitor experience, and staffing requirements.",
  "Confirm team ticket allocation": "Confirm the number of team tickets allocated and provide attendee details when available.",
  "Confirm RE ticket allocation": "Confirm the number of RE tickets allocated and provide attendee details when available.",
  "Confirm VIP ticket allocation": "Confirm the number of VIP tickets allocated and provide attendee details when available.",
  "Confirm panel details": "Confirm the panel date, time, stage, title, panellists, and moderator details.",
  "Book a call with Elena (Head of Content)": "Use the supplied booking link to arrange a call with Elena, Head of Content.",
  "Submit case study": "Submit the agreed case study content and supporting assets.",
  "Submit innovation details": "Provide the innovation details and supporting information for review.",
  "Confirm workshop details": "Confirm the workshop format, title, speakers, timings, and requirements.",
  "Confirm private meeting room": "Confirm the private meeting room requirements, timings, and attendee details.",
  "Call Account Manager and Client Success to confirm option": "Speak with the Account Manager and Client Success team to confirm the RT, tour, or meetings option.",
  "Select a tour": "Select the preferred tour option and provide any attendee or access requirements.",
  "Confirm 10 meetings": "Confirm the 10-meeting allocation and provide meeting preferences or attendee details.",
  "Submit artwork": "Submit the final artwork for the selected venue branding item.",
  "Submit pillar artwork": "Submit the final artwork for the allocated pillars and confirm their locations.",
  "Create company profile on the networking app": "Create or update the company profile in the networking app using the supplied link.",
};

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

export function getContractTasks(row: ContractRow): ContractTask[] {
  const tasks: ContractTask[] = [];
  const add = (title: string, category: string, aliases: string[], action?: { url: string; label: string }) => {
    const quantity = getQuantity(row, aliases);
    if (quantity > 0) tasks.push({
      title,
      category,
      quantity,
      description: taskDescriptions[title] ?? "Provide the requested information or assets for this deliverable.",
      action_url: action?.url,
      action_label: action?.label,
    });
  };

  if (isTruthy(row.requires_booth) || isTruthy(row.booth)) {
    add("Submit booth artwork", "Exhibition Booth", ["requires_booth", "booth"]);
    add("Approve artwork", "Exhibition Booth", ["requires_booth", "booth"]);
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
  add("Confirm private meeting room", "Meetings", ["private_meeting_room"]);
  add("Call Account Manager and Client Success to confirm option", "Meetings", ["choose_rt_tour_meetings"]);
  add("Book a call with Elena (Head of Content)", "Roundtables", ["roundtable"], { url: roundtableBookingLink, label: "Booking Link" });
  add("Select a tour", "Tours", ["tours"]);
  add("Confirm 10 meetings", "Meetings", ["10_meetings"]);
  if (hasValue(row, ["t1_branding", "t2_branding", "t3_branding", "t4_branding"])) add("Submit artwork", "Venue Branding", ["t1_branding", "t2_branding", "t3_branding", "t4_branding"]);
  if (hasValue(row, ["pillars", "pillar_location"])) add("Submit pillar artwork", "Pillars", ["pillars", "pillar_location"]);
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