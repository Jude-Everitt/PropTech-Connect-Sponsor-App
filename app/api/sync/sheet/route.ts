import { google } from "googleapis";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applyDeliverableDueDates } from "@/lib/deliverable-due-dates";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRequestClient } from "@/lib/supabase";
import { getContractRow, getContractTasks, isConfirmedTourSelection, panelTaskBaseTitles, panelTaskStorageTitle } from "@/lib/contract-tasks";
import type { Database } from "@/lib/types";

export const runtime = "nodejs";

type SheetRow = Record<string, string>;
type ConfirmedMeetingRows = Map<string, SheetRow[]>;
type CaseStudySession = Record<string, string>;
type CaseStudySessions = Map<string, CaseStudySession>;
type InnovationStageSession = Record<string, string>;
type InnovationStageSessions = Map<string, InnovationStageSession>;
type RoundtableSession = Record<string, string>;
type RoundtableSessions = Map<string, RoundtableSession>;
type PanelSession = Record<string, string>;
type PanelStageSessions = Map<string, PanelSession>;
type PanelSessionsBySponsor = Map<string, PanelStageSessions>;
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

const legacyTaskTitles: Record<string, string[]> = {
  "Issue Team Tickets": ["Confirm team ticket allocation", "Confirm team tickets"],
  "Issue RE Tickets": ["Confirm RE ticket allocation", "Confirm RE tickets"],
  "Confirm VIP Attendees": ["Confirm VIP ticket allocation", "Confirm VIP tickets"],
  "Submit Booth Artwork": ["Submit booth artwork", "Approve artwork"],
  "Confirm Additional Furniture for Booth": ["Note booth additional rentals"],
  "Confirm Booth Activations": ["Note booth activations"],
  "Submit Logo + Brand Guidelines": ["Upload Logo"],
  "Confirm 10 Private Meetings": ["Confirm 10 meetings"],
  "Submit Case Study Title": ["Submit case study"],
  "Submit Innovation Stage Presentation Title": ["Submit innovation details"],
  "Confirm Tour": ["Select a tour"],
  "Confirm Displayed Name of Company": ["Confirm Displayed Company Name"],
};

const caseStudySessionHeaders = [
  "Date",
  "Time",
  "Title",
  "Name",
  "Job Title",
  "Company",
  "Email",
  "Guest Client Name",
  "Guest Client Email",
  "Guest Client Job Title",
  "Guest Client Company",
];
const innovationStageSessionHeaders = ["Quantity", "Panel", "Slides", "Date", "Time", "Title", "Name", "Job Title", "Company", "Email"];
const innovationSponsorHeaders = ["company_name", "compnay_name", "sponsor", "sponsor_name"];
const roundtableSessionHeaders = ["Luma Link", "Day", "Room", "Time", "Title", "Sponsor", "Target List URL", "Company Type", "Asset Class", "Other Info", "Roundtable Questions", "Attendee List"];
const panelSessionHeaders = ["First Name", "Last Name", "Job Title", "Company Name", "Email", "Date", "Time", "Stage", "Panel Title"];
const panelSponsorHeaders = ["compnay_name", "company_name"];

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

function toRows(values: string[][], companyNameColumn?: number): SheetRow[] {
  const [headerRow, ...dataRows] = values;
  if (!headerRow?.length) return [];
  const headers = headerRow.map(normalizeHeader);
  return dataRows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => ({
      ...Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""])),
      ...(companyNameColumn === undefined ? {} : { company_name: row[companyNameColumn]?.trim() ?? "" }),
    }));
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
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), serviceRoleKey);
}

async function readSheet(spreadsheetId: string) {
  const auth = new google.auth.JWT({
    email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const contractResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Contracts'!A:ZZ",
  });
  const contractValues = (contractResponse.data.values ?? []) as string[][];
  const contractRows: SheetRow[] = toRows(contractValues).map((row): SheetRow => ({
    ...row,
    company_name: row.company_name || row.company || row.sponsor || row.sponsor_name || "",
  })).filter((row) => Boolean(row.company_name));
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title))" });
  const availableTabs = new Set((metadata.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter((title): title is string => Boolean(title)));
  const mergedRows = new Map<string, SheetRow>();
  const confirmedMeetingsByCompany: ConfirmedMeetingRows = new Map();
  const caseStudyByCompany: CaseStudySessions = new Map();
  const innovationStageByCompany: InnovationStageSessions = new Map();
  const roundtableByCompany: RoundtableSessions = new Map();
  const panelsBySponsor: PanelSessionsBySponsor = new Map();

  contractRows.forEach((row) => {
    const companyName = row.company_name || row.company || row.sponsor || row.sponsor_name;
    if (companyName) mergedRows.set(normalizeSponsorName(companyName), { ...row, source_tabs: "Contracts" });
  });

  const configuredTabs = new Set(Object.keys(additionalSheetColumns));
  for (const tabName of Array.from(availableTabs).filter((name) => configuredTabs.has(name))) {
    const identifierColumn = additionalSheetColumns[tabName] ?? 0;
    const tabResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tabName.replace(/'/g, "''")}'!A:ZZ` });
    const [headers, ...dataRows] = (tabResponse.data.values ?? []) as string[][];
    if (!headers?.length) continue;
    const meetingSponsorColumn = tabName === "10 Meetings"
      ? headers.findIndex((header) => normalizeHeader(header) === "meeting_accepted")
      : -1;
    const caseStudyCompanyColumn = tabName === "Case Study"
      ? headers.findIndex((header) => normalizeHeader(header) === "company")
      : -1;
    const innovationSponsorColumn = tabName === "Innovation"
      ? headers.findIndex((header) => innovationSponsorHeaders.includes(normalizeHeader(header)))
      : -1;
    const roundtableSponsorColumn = tabName === "Roundtables"
      ? headers.findIndex((header) => normalizeHeader(header) === "sponsor")
      : -1;
    const panelSponsorColumn = tabName === "Sponsor Panels"
      ? headers.findIndex((header) => panelSponsorHeaders.includes(normalizeHeader(header)))
      : -1;
    const panelStageColumn = tabName === "Sponsor Panels"
      ? headers.findIndex((header) => normalizeHeader(header) === "stage")
      : -1;
    const sponsorColumn = tabName === "10 Meetings" ? meetingSponsorColumn : tabName === "Case Study" ? caseStudyCompanyColumn : tabName === "Innovation" ? innovationSponsorColumn : tabName === "Roundtables" ? roundtableSponsorColumn : tabName === "Sponsor Panels" ? panelSponsorColumn : identifierColumn;
    if (tabName === "10 Meetings" && meetingSponsorColumn < 0) throw new Error('The "10 Meetings" tab is missing a Meeting Accepted header');
    if (tabName === "Case Study" && caseStudyCompanyColumn < 0) throw new Error('The "Case Study" tab is missing a Company header');
    if (tabName === "Innovation" && innovationSponsorColumn < 0) throw new Error('The "Innovation" tab is missing a sponsor company header');
    if (tabName === "Roundtables" && roundtableSponsorColumn < 0) throw new Error('The "Roundtables" tab is missing a Sponsor header');
    if (tabName === "Sponsor Panels" && panelSponsorColumn < 0) throw new Error('The "Sponsor Panels" tab is missing a Compnay Name header');
    if (tabName === "Sponsor Panels" && panelStageColumn < 0) throw new Error('The "Sponsor Panels" tab is missing a Stage header');
    dataRows.filter((row) => row.some((value) => value.trim())).forEach((dataRow) => {
      const sponsorName = dataRow[sponsorColumn]?.trim();
      if (!sponsorName) return;
      const key = normalizeSponsorName(sponsorName);
      if (tabName === "10 Meetings") {
        const confirmedRow = Object.fromEntries(headers.flatMap((header, index) => {
          const columnName = header.trim();
          return columnName ? [[columnName, dataRow[index]?.trim() ?? ""]] : [];
        }));
        confirmedMeetingsByCompany.set(key, [...(confirmedMeetingsByCompany.get(key) ?? []), confirmedRow]);
      }
      if (tabName === "Case Study") {
        const valuesByHeader = new Map(headers.map((header, index) => [normalizeHeader(header), dataRow[index]?.trim() ?? ""]));
        const session = Object.fromEntries(caseStudySessionHeaders.map((header) => [header, valuesByHeader.get(normalizeHeader(header)) ?? ""]));
        caseStudyByCompany.set(key, session);
      }
      if (tabName === "Innovation") {
        const valuesByHeader = new Map(headers.map((header, index) => [normalizeHeader(header), dataRow[index]?.trim() ?? ""]));
        const session = Object.fromEntries(innovationStageSessionHeaders.map((header) => [header, valuesByHeader.get(normalizeHeader(header)) ?? ""]));
        innovationStageByCompany.set(key, session);
      }
      if (tabName === "Roundtables") {
        const valuesByHeader = new Map(headers.map((header, index) => [normalizeHeader(header), dataRow[index]?.trim() ?? ""]));
        const session = Object.fromEntries(roundtableSessionHeaders.map((header) => [header, valuesByHeader.get(normalizeHeader(header)) ?? ""]));
        roundtableByCompany.set(key, session);
      }
      if (tabName === "Sponsor Panels") {
        const stage = dataRow[panelStageColumn]?.trim();
        if (!stage) return;
        const valuesByHeader = new Map(headers.map((header, index) => [normalizeHeader(header), dataRow[index]?.trim() ?? ""]));
        const session = Object.fromEntries(panelSessionHeaders.map((header) => [header, valuesByHeader.get(normalizeHeader(header)) ?? ""]));
        if (!session["Company Name"]) session["Company Name"] = sponsorName;
        session.Stage = stage;
        const sponsorPanels = panelsBySponsor.get(key) ?? new Map<string, PanelSession>();
        sponsorPanels.set(stage, session);
        panelsBySponsor.set(key, sponsorPanels);
      }
      const merged = mergedRows.get(key);
      if (!merged) return;
      headers.forEach((header, index) => {
        const value = dataRow[index]?.trim() ?? "";
        if (value && index !== sponsorColumn) merged[`${tabName}.${normalizeHeader(header)}`] = value;
      });
      merged.source_tabs = [merged.source_tabs, tabName].filter(Boolean).join(", ");
      mergedRows.set(key, merged);
    });
  }

  return { rows: Array.from(mergedRows.values()), confirmedMeetingsByCompany, caseStudyByCompany, innovationStageByCompany, roundtableByCompany, panelsBySponsor };
}

async function syncRows(client: SyncClient, rows: SheetRow[], confirmedMeetingsByCompany: ConfirmedMeetingRows, caseStudyByCompany: CaseStudySessions, innovationStageByCompany: InnovationStageSessions, roundtableByCompany: RoundtableSessions, panelsBySponsor: PanelSessionsBySponsor, eventConfig: EventConfig): Promise<SyncResult> {
  const result: SyncResult = { rows_read: rows.length, sponsors_synced: 0, tasks_created: 0, skipped: [] };
  const { data: existingSponsors, error: sponsorsError } = await client.from("sponsors").select("id, company_name, contract_details");
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
    const sponsorKey = normalizeSponsorName(companyName);
    const existingSponsor = sponsorByName.get(sponsorKey);
    const approvedOptionKeys = ["approved_option_roundtable", "approved_option_tours", "approved_option_10_meetings"];
    const preservedApprovedOptions = Object.fromEntries(approvedOptionKeys.flatMap((key) => {
      const value = existingSponsor?.contract_details[key];
      return value === undefined ? [] : [[key, value]];
    }));
    const contractDetails = { ...row, source_row: rowNumber, contract_roster: true, ...preservedApprovedOptions };

    const { data: sponsor, error: sponsorError } = existingSponsor
      ? await client.from("sponsors").update({ tier, contract_details: contractDetails }).eq("id", existingSponsor.id).select("id").single()
      : await client.from("sponsors").insert({ company_name: companyName, tier, contract_details: contractDetails }).select("id").single();
    if (sponsorError || !sponsor) throw sponsorError ?? new Error("Could not sync sponsor");
    if (!existingSponsor) sponsorByName.set(sponsorKey, { id: sponsor.id, company_name: companyName, contract_details: contractDetails });

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

    const confirmedMeetingRows = confirmedMeetingsByCompany.get(sponsorKey) ?? [];
    const caseStudySession = caseStudyByCompany.get(sponsorKey) ?? Object.fromEntries(caseStudySessionHeaders.map((header) => [header, ""]));
    const innovationStageSession = innovationStageByCompany.get(sponsorKey) ?? Object.fromEntries(innovationStageSessionHeaders.map((header) => [header, ""]));
    const roundtableSession = roundtableByCompany.get(sponsorKey) ?? Object.fromEntries(roundtableSessionHeaders.map((header) => [header, ""]));
    const panelSessions = panelsBySponsor.get(sponsorKey) ?? new Map<string, PanelSession>();
    const generatedTasks = getContractTasks(getContractRow(contractDetails)).filter((task) => !(task.category === "Sponsor Panels" && ["Book a call with Elena (Head of Content)", "Confirm panel details"].includes(task.title)));
    const taskRows: Database["public"]["Tables"]["tasks"]["Insert"][] = generatedTasks.map((task) => ({
      ...task,
      input_fields: [],
      input_values: task.title === "Confirm 10 Private Meetings"
        ? { confirmed_meeting_count: confirmedMeetingRows.length, confirmed_meeting_rows: confirmedMeetingRows }
        : task.category === "Case Study"
          ? { case_study_session: caseStudySession }
          : task.category === "Innovation"
            ? { innovation_stage_session: innovationStageSession }
          : task.category === "Roundtables"
            ? { roundtable_session: roundtableSession }
          : {},
      ...(task.title === "Confirm 10 Private Meetings" ? { status: confirmedMeetingRows.length === 10 ? "Complete" as const : "Needs You" as const } : {}),
      ...(["Confirm Case Study Speaker", "Confirm Case Study Guest Client Speaker", "Submit Case Study Title"].includes(task.title) ? {
        status: caseStudySession[task.title === "Confirm Case Study Speaker" ? "Name" : task.title === "Confirm Case Study Guest Client Speaker" ? "Guest Client Name" : "Title"]?.trim() ? "Complete" as const : "Needs You" as const,
      } : {}),
      ...(["Submit Innovation Stage Presentation Title", "Confirm Innovation Stage Speaker", "Submit Innovation Stage Presentation Slides"].includes(task.title) ? {
        status: innovationStageSession[task.title === "Submit Innovation Stage Presentation Title" ? "Title" : task.title === "Confirm Innovation Stage Speaker" ? "Name" : "Slides"]?.trim() ? "Complete" as const : "Needs You" as const,
      } : {}),
      ...(task.title === "Confirm Roundtable Title" ? { status: roundtableSession.Title?.trim() ? "Complete" as const : "Needs You" as const } : {}),
      ...(task.title === "Confirm Tour" ? { status: isConfirmedTourSelection(getContractRow(contractDetails).tours) ? "Complete" as const : "Needs You" as const } : {}),
      sponsor_event_id: sponsorEvent.id,
    }));
    for (const [stage, panelSession] of panelSessions) {
      const speakerFound = Boolean(panelSession["First Name"]?.trim() && panelSession["Last Name"]?.trim());
      const panelFound = Boolean(panelSession["Panel Title"]?.trim());
      for (const baseTitle of panelTaskBaseTitles) {
        taskRows.push({
          title: panelTaskStorageTitle(baseTitle, stage),
          category: "Sponsor Panels",
          quantity: 1,
          description: baseTitle === "Confirm Panel Speaker"
            ? `Confirm the speaker for ${stage}.`
            : baseTitle === "Confirm Panel that You Will Be Joining"
              ? `Confirm the panel the speaker will join for ${stage}.`
              : `Submit the speaker's headshot and biography for ${stage}.`,
          input_fields: [],
          input_values: { panel_stage: stage, panel_session: panelSession },
          ...(baseTitle === "Confirm Panel Speaker" ? { status: speakerFound ? "Complete" as const : "Needs You" as const } : {}),
          ...(baseTitle === "Confirm Panel that You Will Be Joining" ? { status: panelFound ? "Complete" as const : "Needs You" as const } : {}),
          sponsor_event_id: sponsorEvent.id,
        });
      }
    }
    if (taskRows.length) {
      for (const task of taskRows) {
        const { data: exactTask, error: exactTaskError } = await client
          .from("tasks")
          .select("id, input_values, status")
          .eq("sponsor_event_id", task.sponsor_event_id)
          .eq("title", task.title)
          .limit(1)
          .maybeSingle();
        if (exactTaskError) throw exactTaskError;
        let existingTask = exactTask;
        if (!existingTask && legacyTaskTitles[task.title]?.length) {
          const { data: legacyTask, error: legacyTaskError } = await client
            .from("tasks")
            .select("id, input_values, status")
            .eq("sponsor_event_id", task.sponsor_event_id)
            .in("title", legacyTaskTitles[task.title])
            .limit(1)
            .maybeSingle();
          if (legacyTaskError) throw legacyTaskError;
          existingTask = legacyTask;
        }
        if (!existingTask) {
          const { error: taskInsertError } = await client.from("tasks").insert(task);
          if (taskInsertError) throw taskInsertError;
          result.tasks_created += 1;
        } else {
          const isMeetingTask = task.title === "Confirm 10 Private Meetings";
          const isCaseStudySourceTask = ["Confirm Case Study Speaker", "Confirm Case Study Guest Client Speaker", "Submit Case Study Title"].includes(task.title);
          const isInnovationStageSourceTask = ["Submit Innovation Stage Presentation Title", "Confirm Innovation Stage Speaker", "Submit Innovation Stage Presentation Slides"].includes(task.title);
          const isRoundtableTask = ["Confirm Roundtable Title", "Approve Roundtable Questions Submitted by the Moderator"].includes(task.title);
          const isTourTask = task.title === "Confirm Tour";
          const isPanelTask = task.title.startsWith(`${panelTaskBaseTitles[0]} [`) || task.title.startsWith(`${panelTaskBaseTitles[1]} [`) || task.title.startsWith(`${panelTaskBaseTitles[2]} [`);
          const { error: taskUpdateError } = await client.from("tasks").update({
            title: task.title,
            description: task.description,
            category: task.category,
            quantity: task.quantity,
            input_fields: [],
            action_url: task.action_url ?? null,
            action_label: task.action_label ?? null,
            ...(isMeetingTask ? {
              input_values: { ...existingTask.input_values, ...task.input_values },
              status: task.status,
            } : {}),
            ...(isCaseStudySourceTask ? {
              input_values: { ...existingTask.input_values, ...task.input_values },
              status: task.status,
            } : {}),
            ...(isInnovationStageSourceTask ? {
              input_values: { ...existingTask.input_values, ...task.input_values },
              status: task.status,
            } : {}),
            ...(isRoundtableTask ? {
              input_values: { ...existingTask.input_values, ...task.input_values },
              ...(task.title === "Confirm Roundtable Title" ? { status: task.status } : {}),
            } : {}),
            ...(isTourTask ? { status: task.status } : {}),
            ...(isPanelTask ? {
              input_values: { ...existingTask.input_values, ...task.input_values },
              ...(task.status ? { status: task.status } : {}),
            } : {}),
          }).eq("id", existingTask.id);
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
      const sheetData = await readSheet(config.google_sheet_id);
      const result = await syncRows(client, sheetData.rows, sheetData.confirmedMeetingsByCompany, sheetData.caseStudyByCompany, sheetData.innovationStageByCompany, sheetData.roundtableByCompany, sheetData.panelsBySponsor, config);
      try {
        await applyDeliverableDueDates(client, config.id);
      } catch (error) {
        console.error("Applying deliverable due dates failed", error);
      }
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
