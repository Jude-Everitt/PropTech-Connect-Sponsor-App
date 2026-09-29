import { google } from "googleapis";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRequestClient } from "@/lib/supabase";
import { getContractTasks } from "@/lib/contract-tasks";
import type { Database } from "@/lib/types";

export const runtime = "nodejs";

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

function normalizeSponsorName(value: string) {
  return value.trim().toLowerCase();
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
    if (companyName) mergedRows.set(normalizeSponsorName(companyName), { ...row, source_tabs: "Contracts" });
  });

  for (const tabName of Array.from(availableTabs).filter((name) => name !== "Contracts")) {
    const identifierColumn = additionalSheetColumns[tabName] ?? 0;
    const tabResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tabName.replace(/'/g, "''")}'!A:ZZ` });
    const [headers, ...dataRows] = (tabResponse.data.values ?? []) as string[][];
    if (!headers?.length) continue;
    dataRows.filter((row) => row.some((value) => value.trim())).forEach((dataRow) => {
      const companyName = dataRow[identifierColumn]?.trim();
      if (!companyName) return;
      const key = normalizeSponsorName(companyName);
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
  const { data: existingSponsors, error: sponsorsError } = await client.from("sponsors").select("id, company_name");
  if (sponsorsError) throw sponsorsError;
  const sponsorByName = new Map((existingSponsors ?? []).map((sponsor) => [normalizeSponsorName(sponsor.company_name), sponsor]));

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
    const sponsorKey = normalizeSponsorName(companyName);
    const existingSponsor = sponsorByName.get(sponsorKey);

    const { data: sponsor, error: sponsorError } = existingSponsor
      ? await client.from("sponsors").update({ tier, contract_details: contractDetails }).eq("id", existingSponsor.id).select("id").single()
      : await client.from("sponsors").insert({ company_name: companyName, tier, contract_details: contractDetails }).select("id").single();
    if (sponsorError || !sponsor) throw sponsorError ?? new Error("Could not sync sponsor");
    if (!existingSponsor) sponsorByName.set(sponsorKey, { id: sponsor.id, company_name: companyName });

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

    const taskRows = getContractTasks(row).map((task) => ({ ...task, input_fields: [], input_values: {}, sponsor_event_id: sponsorEvent.id }));
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
          const { error: taskUpdateError } = await client.from("tasks").update({ description: task.description, category: task.category, quantity: task.quantity, input_fields: [], action_url: task.action_url ?? null, action_label: task.action_label ?? null }).eq("id", existingTask.id);
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
