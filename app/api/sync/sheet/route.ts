import { google } from "googleapis";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRequestClient } from "@/lib/supabase";
import type { Database } from "@/lib/types";

export const runtime = "nodejs";

type CampaignElement = { label: string; category: string; taskTitle: string; aliases: string[]; action_url?: string; action_label?: string };

type SheetRow = Record<string, string>;
type SyncClient = SupabaseClient<Database>;

type SyncResult = {
  rows_read: number;
  sponsors_synced: number;
  tasks_created: number;
  skipped: Array<{ row: number; reason: string }>;
};

type EventConfig = {
  id: string;
  name: string;
  google_sheet_id: string | null;
  google_sheet_range: string;
};

const additionalSheetColumns: Record<string, number> = {
  "PoC’s": 0,
  Branding: 2,
  "Sponsor Panels": 0,
  "Case Study": 0,
  Innovation: 0,
  Roundtables: 0,
  Tours: 0,
  "10 Meetings": 0,
  "Meeting Room": 0,
  Workshop: 2,
  "Team Tickets": 0,
  "RE Tickets": 0,
  "VIP Tickets": 0,
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function isTruthy(value: string | undefined) {
  return !!value && ["true", "yes", "y", "1", "x", "included"].includes(value.trim().toLowerCase());
}

function getQuantity(row: SheetRow, element: CampaignElement) {
  const value = element.aliases.map((alias) => row[alias]).find((candidate) => candidate !== undefined && candidate !== "");
  if (!value) return 0;
  const quantity = Number(value.replace(/,/g, ""));
  if (Number.isFinite(quantity) && quantity > 0) return Math.floor(quantity);
  return isTruthy(value) || value.trim().length > 0 ? 1 : 0;
}

const bookingLink = "https://meetings-eu1.hubspot.com/evu";
const roundtableBookingLink = "https://meetings-eu1.hubspot.com/evu/roundtable";
type GeneratedTask = { title: string; description: string; category: string; quantity: number; input_fields?: Array<{ key: string; label: string; source_value: string }>; action_url?: string; action_label?: string };

const taskDescriptions: Record<string, string> = {
  "Submit booth artwork": "Provide the final artwork for the allocated booth, including any required dimensions and brand assets.",
  "Note additional furniture to rent": "List any furniture required beyond the standard furniture included in the booth package.",
  "Note additional equipment to rent": "List any AV, electrical, display, or other equipment that needs to be rented.",
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

function hasValue(row: SheetRow, aliases: string[]) {
  return aliases.some((alias) => getQuantity(row, { label: alias, category: "", taskTitle: "", aliases: [alias] }) > 0);
}

function getContractTasks(row: SheetRow): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  const add = (title: string, category: string, aliases: string[], action?: { url: string; label: string }) => {
    const quantity = getQuantity(row, { label: title, category, taskTitle: title, aliases });
    if (quantity > 0) tasks.push({ title, category, quantity, description: taskDescriptions[title] ?? "Provide the requested information or assets for this deliverable.", action_url: action?.url, action_label: action?.label });
  };

  if (isTruthy(row.requires_booth) || isTruthy(row.booth)) {
    add("Submit booth artwork", "Exhibition Booth", ["requires_booth"]);
    add("Note additional furniture to rent", "Exhibition Booth", ["booth_position"]);
    add("Note additional equipment to rent", "Exhibition Booth", ["booth_position"]);
    add("Approve artwork", "Exhibition Booth", ["requires_booth"]);
    add("Note booth activations", "Exhibition Booth", ["requires_booth"]);
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

function getTabTasks(row: SheetRow): GeneratedTask[] {
  const grouped = new Map<string, Array<{ key: string; label: string; source_value: string }>>();
  Object.entries(row).forEach(([key, value]) => {
    const separator = key.indexOf(".");
    if (separator < 1 || !value.trim() || key === "source_tabs") return;
    const tabName = key.slice(0, separator);
    const columnName = key.slice(separator + 1).replace(/_/g, " ");
    const fields = grouped.get(tabName) ?? [];
    fields.push({ key: `${tabName}.${key.slice(separator + 1)}`, label: columnName, source_value: value });
    grouped.set(tabName, fields);
  });
  return Array.from(grouped.entries()).map(([tabName, inputFields]) => ({
    title: `${tabName} deliverables`,
    description: `Complete the required inputs from the ${tabName} tab. Each field below represents a required part of this deliverable.`,
    category: tabName,
    quantity: 1,
    input_fields: inputFields,
  }));
}

function toRows(values: string[][]) {
  const [headerRow, ...dataRows] = values;
  if (!headerRow?.length) return [];
  const headers = headerRow.map(normalizeHeader);
  return dataRows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""])));
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

async function getAuthorizedClient(request: Request): Promise<SyncClient> {
  const token = getBearerToken(request);
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && token === cronSecret;

  if (isCron) {
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    return createClient<Database>(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), serviceRoleKey);
  }

  if (!token) throw new Error("Authorization bearer token required");
  const client = createSupabaseRequestClient(token);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Invalid access token");
  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || profile?.role !== "ADMIN") throw new Error("Admin access required");
  return client as unknown as SyncClient;
}

async function readSheet(spreadsheetId: string, range: string) {
  const auth = new google.auth.JWT({
    email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const contractResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const contractRows = toRows((contractResponse.data.values ?? []) as string[][]);
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title))" });
  const availableTabs = new Set((metadata.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter((title): title is string => Boolean(title)));
  const mergedRows = new Map<string, SheetRow>();

  contractRows.forEach((row) => {
    const companyName = row.company_name || row.company || row.sponsor || row.sponsor_name;
    if (companyName) mergedRows.set(companyName.trim().toLowerCase(), { ...row, source_tabs: "Contracts" });
  });

  for (const tabName of Array.from(availableTabs).filter((name) => name !== "Contracts")) {
    const identifierColumn = additionalSheetColumns[tabName] ?? 0;
    const tabResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tabName.replace(/'/g, "''")}'!A:ZZ` });
    const [headers, ...dataRows] = (tabResponse.data.values ?? []) as string[][];
    if (!headers?.length) continue;
    dataRows.filter((row) => row.some((value) => value.trim())).forEach((dataRow) => {
      const companyName = dataRow[identifierColumn]?.trim();
      if (!companyName) return;
      const key = companyName.toLowerCase();
      const merged = mergedRows.get(key) ?? { company_name: companyName, source_tabs: "" };
      headers.forEach((header, index) => {
        const value = dataRow[index]?.trim() ?? "";
        if (value && index !== identifierColumn) merged[`${tabName}.${normalizeHeader(header)}`] = value;
      });
      merged.source_tabs = [merged.source_tabs, tabName].filter(Boolean).join(", ");
      mergedRows.set(key, merged);
    });
  }

  return Array.from(mergedRows.values());
}

async function syncRows(client: SyncClient, rows: SheetRow[], eventConfig: EventConfig): Promise<SyncResult> {
  const result: SyncResult = { rows_read: rows.length, sponsors_synced: 0, tasks_created: 0, skipped: [] };

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const companyName = row.company_name || row.company || row.sponsor || row.sponsor_name;
    const tier = row.tier || row.sponsorship_tier || "Unspecified";
    const eventId = eventConfig.id;

    if (!companyName) {
      result.skipped.push({ row: rowNumber, reason: "Missing company_name" });
      continue;
    }
    const contractDetails = { ...row, source_row: rowNumber };
    const { data: existingSponsor, error: sponsorLookupError } = await client
      .from("sponsors")
      .select("id")
      .eq("company_name", companyName)
      .limit(1)
      .maybeSingle();
    if (sponsorLookupError) throw sponsorLookupError;

    const { data: sponsor, error: sponsorError } = existingSponsor
      ? await client.from("sponsors").update({ tier, contract_details: contractDetails }).eq("id", existingSponsor.id).select("id").single()
      : await client.from("sponsors").insert({ company_name: companyName, tier, contract_details: contractDetails }).select("id").single();
    if (sponsorError || !sponsor) throw sponsorError ?? new Error("Could not sync sponsor");

    const { data: existingSponsorEvent, error: linkLookupError } = await client
      .from("sponsor_events")
      .select("id")
      .eq("sponsor_id", sponsor.id)
      .eq("event_id", eventId)
      .limit(1)
      .maybeSingle();
    if (linkLookupError) throw linkLookupError;
    const { data: sponsorEvent, error: linkError } = existingSponsorEvent
      ? { data: existingSponsorEvent, error: null }
      : await client.from("sponsor_events").insert({ sponsor_id: sponsor.id, event_id: eventId }).select("id").single();
    if (linkError || !sponsorEvent) throw linkError ?? new Error("Could not link sponsor to event");

    const taskRows = [...getContractTasks(row), ...getTabTasks(row)].map((task) => ({ ...task, input_fields: task.input_fields ?? [], input_values: {}, sponsor_event_id: sponsorEvent.id }));
    if (taskRows.length) {
      for (const task of taskRows) {
        const { data: existingTask, error: taskLookupError } = await client
          .from("tasks")
          .select("id")
          .eq("sponsor_event_id", task.sponsor_event_id)
          .eq("title", task.title)
          .limit(1)
          .maybeSingle();
        if (taskLookupError) throw taskLookupError;
        if (!existingTask) {
          const { error: taskInsertError } = await client.from("tasks").insert(task);
          if (taskInsertError) throw taskInsertError;
          result.tasks_created += 1;
        } else {
          const { error: taskUpdateError } = await client.from("tasks").update({ description: task.description, quantity: task.quantity, input_fields: task.input_fields ?? [], action_url: task.action_url ?? null, action_label: task.action_label ?? null }).eq("id", existingTask.id);
          if (taskUpdateError) throw taskUpdateError;
        }
      }
    }
    result.sponsors_synced += 1;
  }

  return result;
}

async function handle(request: Request) {
  try {
    const client = await getAuthorizedClient(request);
    let requestedEventId = new URL(request.url).searchParams.get("event_id");
    if (request.method === "POST") {
      try {
        const body = (await request.clone().json()) as { event_id?: string };
        requestedEventId = body.event_id ?? requestedEventId;
      } catch {
        // Empty POST bodies are valid for scheduled syncs.
      }
    }

    let eventQuery = client
      .from("events")
      .select("id, name, google_sheet_id, google_sheet_range")
      .not("google_sheet_id", "is", null);
    if (requestedEventId) eventQuery = eventQuery.eq("id", requestedEventId);
    const { data: events, error: eventError } = await eventQuery;
    if (eventError) throw eventError;
    if (!events?.length) return NextResponse.json({ error: "No configured event sheet found" }, { status: 404 });

    const totals: SyncResult & { events_synced: number } = {
      rows_read: 0,
      sponsors_synced: 0,
      tasks_created: 0,
      skipped: [],
      events_synced: events.length,
    };
    for (const event of events) {
      const config = event as EventConfig;
      if (!config.google_sheet_id) continue;
      const rows = await readSheet(config.google_sheet_id, config.google_sheet_range || "Sheet1!A:Z");
      const result = await syncRows(client, rows, config);
      totals.rows_read += result.rows_read;
      totals.sponsors_synced += result.sponsors_synced;
      totals.tasks_created += result.tasks_created;
      totals.skipped.push(...result.skipped);
    }
    return NextResponse.json(totals);
  } catch (error) {
    console.error("Sheet sync failed", error);
    const errorWithResponse = error as { response?: { data?: { error?: { message?: string } } } };
    const message = error instanceof Error
      ? error.message
      : errorWithResponse.response?.data?.error?.message ?? JSON.stringify(error) ?? "Sheet sync failed";
    const status = message.includes("required") || message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
