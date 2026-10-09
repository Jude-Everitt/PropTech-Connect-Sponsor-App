export type ContractTask = {
  title: string;
  description: string;
  category: string;
  quantity: number;
  action_url?: string;
  action_label?: string;
};

type ContractRow = Record<string, string>;

const taskDescriptions: Record<string, string> = {
  "Submit Booth Artwork": "Provide the final artwork for the allocated booth, including any required dimensions and brand assets.",
  "Confirm Additional Furniture for Booth": "Record any additional furniture required for the booth and mark this task complete when confirmed.",
  "Confirm Booth Activations": "Record the planned booth activations and mark this task complete when confirmed.",
  "Issue Team Tickets": "Issue the allocated team tickets to the sponsor's attendees.",
  "Issue Speaker Team Ticket": "Issue a team ticket to the sponsor's speaker.",
  "Issue RE Tickets": "Issue the allocated RE tickets to the sponsor's attendees.",
  "Confirm VIP Attendees": "Confirm the attendees using the allocated VIP tickets.",
  "Confirm Panel Speaker": "Confirm the speaker assigned to this panel.",
  "Confirm Panel that You Will Be Joining": "Confirm the panel this speaker will be joining.",
  "Submit Speaker Headshot + Bio": "Submit the speaker's headshot and biography.",
  "Confirm Roundtable Title": "Confirm the title of the roundtable session.",
  "Approve Roundtable Questions Submitted by the Moderator": "Review and approve the roundtable questions submitted by the moderator.",
  "Confirm Case Study Speaker": "Confirm the speaker who will present the case study.",
  "Confirm Case Study Guest Client Speaker": "Confirm the client speaker participating in the case study.",
  "Submit Case Study Title": "Submit the agreed title for the case study.",
  "Submit Innovation Stage Presentation Title": "Submit the title for the Innovation Stage presentation.",
  "Confirm Innovation Stage Speaker": "Confirm the speaker for the Innovation Stage presentation.",
  "Submit Innovation Stage Presentation Slides": "Submit the slides for the Innovation Stage presentation.",
  "Confirm Workshop Title": "Confirm the title for the workshop.",
  "Confirm Workshop Structure, Questions, and Leader": "Confirm the workshop structure, questions, and leader.",
  "Submit Logo + Brand Guidelines": "Submit the company logo and brand guidelines for use across your sponsor branding.",
  "Confirm Displayed Name of Company": "Confirm the company name exactly as it should appear across event branding.",
  "Submit Holding Slides for Stage Branding": "Submit holding slides for the selected stage branding.",
  "Approve logo positioning on lanyard branding": "Approve the logo positioning on the lanyard branding.",
  "Approve logo positioning on badge": "Approve the logo positioning on the badge.",
  "Submit Artwork for Registration Desk Branding": "Submit artwork for the registration desk branding.",
  "Submit Artwork for Help Desk Branding": "Submit artwork for the help desk branding.",
  "Submit Display to Be Showcased on Digital Screens": "Submit the display to be shown on digital screens.",
  "Submit Artwork for Coffee Cart Branding": "Submit artwork for the coffee cart branding.",
  "Submit Login Details for Wi-Fi Sign-In Details": "Submit the login details for Wi-Fi sign-in.",
  "Approve tallboys": "Approve the speaker lounge tallboys.",
  "Submit A5 table toppers": "Submit artwork for the speaker lounge A5 table toppers.",
  "Submit pillar branding": "Submit pillar branding artwork.",
  "Submit 30s video for mobile app": "Submit the 30-second video for the mobile app.",
  "Approve co-branded visuals for app and onsite print": "Approve the co-branded visuals for the app and onsite print.",
  "Submit AW for one side of the table toppers": "Submit artwork for one side of the table toppers.",
  "Submit Artwork for Pillar Branding": "Submit artwork for pillar branding.",
  "Submit Artwork for Elevator Branding": "Submit artwork for elevator branding.",
  "Submit Artwork for Escalator Branding": "Submit artwork for escalator branding.",
  "Submit Artwork for Stairs Branding": "Submit artwork for stairs branding.",
  "Submit Artwork for Cloakroom Branding": "Submit artwork for cloakroom branding.",
  "Submit Artwork for Coffee Cup Branding": "Submit artwork for coffee cup branding.",
  "Approve artwork for coffee bar branding": "Approve the artwork for coffee bar branding.",
  "Call Account Manager and Client Success to confirm option": "Speak with the Account Manager and Client Success team to confirm the roundtable, meeting, or tour option.",
  "Confirm Tour": "Confirm the selected tour option.",
  "Confirm 10 Private Meetings": "Ten confirmed company meeting entries are required to complete this task.",
  "Submit artwork": "Submit the final artwork for the selected venue branding item.",
  "Submit pillar artwork": "Submit the final artwork for the allocated pillars and confirm their locations.",
  "Complete Company Profile": "Complete the sponsor company profile in the networking app.",
  "Onboard Sales Team": "Onboard the sponsor's sales team in the networking app.",
};

export const networkingAppTasks: ContractTask[] = [
  { title: "Complete Company Profile", category: "Networking App", quantity: 1, description: taskDescriptions["Complete Company Profile"] },
  { title: "Onboard Sales Team", category: "Networking App", quantity: 1, description: taskDescriptions["Onboard Sales Team"] },
];

export const companyBrandingTasks: ContractTask[] = [
  { title: "Submit Logo + Brand Guidelines", category: "Company Branding", quantity: 1, description: taskDescriptions["Submit Logo + Brand Guidelines"] },
  { title: "Confirm Displayed Name of Company", category: "Company Branding", quantity: 1, description: taskDescriptions["Confirm Displayed Name of Company"] },
];

export function brandingTaskStorageTitle(title: string, category: string) {
  return title === "Submit pillar branding" ? `${title} [${category}]` : title;
}

export function parseBrandingTaskStorageTitle(title: string) {
  const duplicateSuffix = title.match(/^Submit pillar branding \[(Speaker Lounge Branding|Networking App & Area Branding)\]$/);
  return duplicateSuffix ? { title: "Submit pillar branding", category: duplicateSuffix[1] } : null;
}

const stageBrandingLabels: Record<string, string> = {
  "BANIYAS STAGE": "Baniyas",
  "AL AMEERA STAGE": "Al Ameera",
  "COMMERCIAL STAGE": "Commercial",
  "RESIDENTIAL STAGE": "Residential",
  "INNOVATION STAGE": "Innovation",
  "CASE STUDY STAGE": "Case Study",
};
const actionableBrandingMappings: Array<{ matches: string[]; category: string; taskTitles: string[] }> = [
  { matches: ["LANYARD"], category: "Lanyard Branding", taskTitles: ["Approve logo positioning on lanyard branding"] },
  { matches: ["BADGE"], category: "Badge Branding", taskTitles: ["Approve logo positioning on badge"] },
  { matches: ["REGISTRATION DESK"], category: "Registration Desk Branding", taskTitles: ["Submit Artwork for Registration Desk Branding"] },
  { matches: ["HELP DESK"], category: "Help Desk Branding", taskTitles: ["Submit Artwork for Help Desk Branding"] },
  { matches: ["DIGITAL SCREENS", "DIGITAL SCREEN"], category: "Digital Screen Branding", taskTitles: ["Submit Display to Be Showcased on Digital Screens"] },
  { matches: ["COFFE CARTS", "COFFEE CARTS"], category: "Coffee Cart Sponsor", taskTitles: ["Submit Artwork for Coffee Cart Branding"] },
  { matches: ["WIFI", "WI-FI"], category: "WiFi Sponsor", taskTitles: ["Submit Login Details for Wi-Fi Sign-In Details"] },
  { matches: ["SPEAKER LOUNGE"], category: "Speaker Lounge Branding", taskTitles: ["Approve tallboys", "Submit A5 table toppers", "Submit pillar branding"] },
  { matches: ["NETWORKING APP & AREA", "NETWORKING APP AND AREA"], category: "Networking App & Area Branding", taskTitles: ["Submit pillar branding", "Submit 30s video for mobile app", "Approve co-branded visuals for app and onsite print", "Submit AW for one side of the table toppers"] },
  { matches: ["PILLAR BRANDING"], category: "Pillar Branding", taskTitles: ["Submit Artwork for Pillar Branding"] },
  { matches: ["ELEVATOR BRANDING"], category: "Elevator Branding", taskTitles: ["Submit Artwork for Elevator Branding"] },
  { matches: ["ESCALATOR BRANDING"], category: "Escalator Branding", taskTitles: ["Submit Artwork for Escalator Branding"] },
  { matches: ["STAIRS BRANDING"], category: "Stairs Branding", taskTitles: ["Submit Artwork for Stairs Branding"] },
  { matches: ["CLOAKROOM BRANDING"], category: "Cloakroom Branding", taskTitles: ["Submit Artwork for Cloakroom Branding"] },
  { matches: ["COFFEE STATION BRANDING"], category: "Coffee Station Branding", taskTitles: ["Submit Artwork for Coffee Cup Branding"] },
  { matches: ["COFFEE BAR BRANDING"], category: "Coffee Bar Branding", taskTitles: ["Approve artwork for coffee bar branding"] },
];

function normalizeBrandingSourceText(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const boothTaskOrder = [
  "Submit Booth Artwork",
  "Confirm Additional Furniture for Booth",
  "Confirm Booth Activations",
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
  tasks.push(...companyBrandingTasks);
  tasks.push(...networkingAppTasks);
  if (isTruthy(row.requires_booth) || isTruthy(row.booth)) {
    tasks.push({ title: "Submit Booth Artwork", category: "Exhibition Booth", quantity: 1, description: taskDescriptions["Submit Booth Artwork"] });
    tasks.push({ title: "Confirm Additional Furniture for Booth", category: "Exhibition Booth", quantity: 1, description: taskDescriptions["Confirm Additional Furniture for Booth"] });
    tasks.push({ title: "Confirm Booth Activations", category: "Exhibition Booth", quantity: 1, description: taskDescriptions["Confirm Booth Activations"] });
  }
  const speakerTicketAliases = ["speaker_team_tickets", "speaker_tickets", "Sponsor Panels.speaker_tix_issued"];
  const explicitSpeakerTicketValue = speakerTicketAliases.some((alias) => Boolean(row[alias]?.trim()));
  const speakerTicketQuantity = explicitSpeakerTicketValue
    ? getQuantity(row, speakerTicketAliases)
    : hasValue(row, ["sponsor_panels", "specified_panel"]) ? 1 : 0;
  const teamTicketQuantity = Math.max(0, getQuantity(row, ["team_tickets"]) - speakerTicketQuantity);
  if (teamTicketQuantity > 0) {
    tasks.push({ title: "Issue Team Tickets", category: "Tickets", quantity: teamTicketQuantity, description: taskDescriptions["Issue Team Tickets"] });
  }
  if (speakerTicketQuantity > 0) {
    tasks.push({ title: "Issue Speaker Team Ticket", category: "Tickets", quantity: speakerTicketQuantity, description: taskDescriptions["Issue Speaker Team Ticket"] });
  }
  add("Issue RE Tickets", "Tickets", ["re_tickets"]);
  add("Confirm VIP Attendees", "Tickets", ["vip_tickets"]);
  if (hasValue(row, ["case_study", "Case Study.quantity"])) {
    for (const title of [
      "Confirm Case Study Speaker",
      "Confirm Case Study Guest Client Speaker",
      "Submit Case Study Title",
      "Submit Speaker Headshot + Bio",
    ]) {
      tasks.push({ title, category: "Case Study", quantity: 1, description: taskDescriptions[title] });
    }
  }
  if (hasValue(row, ["innovation", "Innovation.quantity"])) {
    for (const title of [
      "Submit Innovation Stage Presentation Title",
      "Confirm Innovation Stage Speaker",
      "Submit Innovation Stage Presentation Slides",
    ]) {
      tasks.push({ title, category: "Innovation", quantity: 1, description: taskDescriptions[title] });
    }
  }
  if (hasValue(row, ["workshop", "Workshop.quantity"])) {
    tasks.push({ title: "Confirm Workshop Title", category: "Workshop", quantity: 1, description: taskDescriptions["Confirm Workshop Title"] });
    tasks.push({ title: "Confirm Workshop Structure, Questions, and Leader", category: "Workshop", quantity: 1, description: taskDescriptions["Confirm Workshop Structure, Questions, and Leader"] });
  }
  add("Confirm private meeting room", "Private Meeting Room", ["private_meeting_room"]);
  add("Call Account Manager and Client Success to confirm option", "Roundtable/Meeting/Tour Options", ["choose_rt_tour_meetings"]);
  if (hasValue(row, ["roundtable", "Roundtables.quantity"]) || hasValue(row, ["approved_option_roundtable"])) {
    tasks.push({ title: "Confirm Roundtable Title", category: "Roundtables", quantity: 1, description: taskDescriptions["Confirm Roundtable Title"] });
    tasks.push({ title: "Approve Roundtable Questions Submitted by the Moderator", category: "Roundtables", quantity: 1, description: taskDescriptions["Approve Roundtable Questions Submitted by the Moderator"] });
  }
  add("Confirm Tour", "Tours", ["tours"], undefined, ["approved_option_tours"]);
  add("Confirm 10 Private Meetings", "10 Meetings", ["10_meetings"], undefined, ["approved_option_10_meetings"]);
  const ignoredBrandingSourceKeys = new Set(["company_name", "company", "sponsor", "sponsor_name", "tier", "sponsorship_tier", "source_row", "source_tabs", "contract_roster"]);
  const brandingSourceEntries = Object.entries(row).filter(([key]) => !ignoredBrandingSourceKeys.has(key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")));
  const sourceValues = brandingSourceEntries.flatMap(([key, value]) => [key, value]).map(normalizeBrandingSourceText).filter(Boolean);
  const matchedRules = new Set<string>();
  const matchedStages = new Set<string>();
  for (const sourceValue of sourceValues) {
    for (const [stageKey, stageLabel] of Object.entries(stageBrandingLabels)) {
      if (sourceValue.includes(normalizeBrandingSourceText(stageKey))) matchedStages.add(stageLabel);
    }
    for (const mapping of actionableBrandingMappings) {
      if (mapping.matches.some((match) => sourceValue.includes(normalizeBrandingSourceText(match)))) matchedRules.add(mapping.category);
    }
  }
  for (const stage of matchedStages) {
    const title = `Submit Holding Slides for ${stage} Stage Branding`;
    tasks.push({ title, category: "Stage Branding", quantity: 1, description: `Submit holding slides for ${stage} Stage Branding.` });
  }
  for (const mapping of actionableBrandingMappings) {
    if (!matchedRules.has(mapping.category)) continue;
    for (const title of mapping.taskTitles) {
      const storageTitle = brandingTaskStorageTitle(title, mapping.category);
      tasks.push({ title: storageTitle, category: mapping.category, quantity: 1, description: taskDescriptions[title] });
    }
  }
  return tasks;
}

export function getContractRow(value: unknown): ContractRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, field == null ? "" : String(field)]));
}

export function contractTaskKey(task: Pick<ContractTask, "title" | "category">) {
  return `${task.category}:${task.title}`;
}

export const panelTaskBaseTitles = [
  "Confirm Panel Speaker",
  "Confirm Panel that You Will Be Joining",
  "Submit Speaker Headshot + Bio",
] as const;

export function panelTaskStorageTitle(baseTitle: string, stage: string) {
  return `${baseTitle} [${stage}]`;
}

export function parsePanelTaskStorageTitle(title: string) {
  for (const baseTitle of panelTaskBaseTitles) {
    const prefix = `${baseTitle} [`;
    if (!title.startsWith(prefix) || !title.endsWith("]")) continue;
    const stage = title.slice(prefix.length, -1).trim();
    if (stage) return { baseTitle, stage };
  }
  return null;
}

const legacyTicketTaskTitles: Record<string, string> = {
  "confirm team ticket allocation": "Issue Team Tickets",
  "confirm team tickets": "Issue Team Tickets",
  "issue team tickets": "Issue Team Tickets",
  "confirm re ticket allocation": "Issue RE Tickets",
  "confirm re tickets": "Issue RE Tickets",
  "issue re tickets": "Issue RE Tickets",
  "confirm vip ticket allocation": "Confirm VIP Attendees",
  "confirm vip tickets": "Confirm VIP Attendees",
};

const legacyBoothTaskTitles: Record<string, string> = {
  "submit booth artwork": "Submit Booth Artwork",
  "approve artwork": "Submit Booth Artwork",
  "note booth additional rentals": "Confirm Additional Furniture for Booth",
  "confirm additional furniture for booth": "Confirm Additional Furniture for Booth",
  "note booth activations": "Confirm Booth Activations",
  "upload logo": "Submit Logo + Brand Guidelines",
  "confirm 10 meetings": "Confirm 10 Private Meetings",
  "submit case study": "Submit Case Study Title",
  "submit innovation details": "Submit Innovation Stage Presentation Title",
  "select a tour": "Confirm Tour",
  "create company profile on the networking app": "Complete Company Profile",
};

export function canonicalTicketTaskTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  if (normalized.startsWith("submit pillar branding [") && normalized.endsWith("]")) return "Submit pillar branding";
  if (normalized === "confirm displayed company name") return "Confirm Displayed Name of Company";
  return legacyTicketTaskTitles[normalized] ?? legacyBoothTaskTitles[normalized] ?? title;
}

const confirmedTourLabels: Record<string, string> = {
  "asset manager": "Asset Manager",
  developer: "Developer",
  residential: "Residential",
};

export function getTourSelectionValues(value: unknown) {
  return String(value ?? "").split(/[,;\n]+/).map((entry) => entry.trim()).filter(Boolean).map((entry) => confirmedTourLabels[entry.toLowerCase()] ?? entry);
}

export function isConfirmedTourSelection(value: unknown) {
  const values = getTourSelectionValues(value);
  return values.length > 0 && values.every((entry) => Object.values(confirmedTourLabels).includes(entry));
}