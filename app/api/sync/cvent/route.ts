import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300;

type CventRecord = Record<string, unknown>;
type CventCollection = { data?: CventRecord[]; paging?: { currentToken?: string | null } };
type PortalStatus = "Needs You" | "With Our Team" | "Complete" | "Overdue" | "pending_review";

const cventBaseUrl = "https://api-platform-eur.cvent.com/ea";
const retryableStatuses = new Set([429, 500, 502, 503, 504]);

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function normalizeMatch(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function mapCventStatus(status: string): PortalStatus | null {
  const normalized = status.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (["complete", "completed", "approved", "done"].includes(normalized)) return "Complete";
  if (["with our team", "in review", "under review", "submitted", "pending review"].includes(normalized)) return "pending_review";
  if (["overdue", "past due"].includes(normalized)) return "Overdue";
  if (["needs you", "not started", "open", "action required", "pending"].includes(normalized)) return "Needs You";
  if (["in progress", "processing"].includes(normalized)) return "With Our Team";
  return null;
}

async function requestWithRetry(url: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    if (!retryableStatuses.has(response.status) || attempt === 3) return response;
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  throw new Error("Cvent request retry limit exceeded");
}

async function getAccessToken() {
  const clientId = requiredEnv("CVENT_CLIENT_ID");
  const clientSecret = requiredEnv("CVENT_CLIENT_SECRET");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await requestWithRetry(`${cventBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId }),
  });
  if (!response.ok) throw new Error(`Cvent authentication failed (${response.status})`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Cvent authentication returned no access token");
  return payload.access_token;
}

async function fetchCollection(url: string, token: string) {
  const records: CventRecord[] = [];
  let nextUrl: URL | null = new URL(url);
  const seen = new Set<string>();

  while (nextUrl && !seen.has(nextUrl.toString())) {
    const currentUrl = nextUrl.toString();
    seen.add(currentUrl);
    const response = await requestWithRetry(currentUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (response.status === 404) return records;
    if (!response.ok) throw new Error(`Cvent request failed (${response.status}) for ${new URL(currentUrl).pathname}`);
    const payload = await response.json() as CventCollection | CventRecord[];
    if (Array.isArray(payload)) {
      records.push(...payload);
      nextUrl = null;
    } else {
      records.push(...(payload.data ?? []));
      const currentToken = payload.paging?.currentToken;
      if (currentToken) {
        nextUrl = new URL(currentUrl);
        nextUrl.searchParams.set("token", currentToken);
      } else {
        nextUrl = null;
      }
    }
  }

  return records;
}

async function runSync() {
  const eventId = requiredEnv("CVENT_EVENT_ID");
  const eventName = requiredEnv("CVENT_EVENT_NAME");
  const portalEventName = process.env.CVENT_APP_EVENT_NAME || eventName;
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const token = await getAccessToken();
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const syncedAt = new Date().toISOString();

  const { data: appEvent, error: appEventError } = await client
    .from("events")
    .select("id")
    .eq("name", portalEventName)
    .maybeSingle();
  if (appEventError) throw appEventError;
  if (!appEvent) throw new Error(`No portal event exactly matches CVENT_APP_EVENT_NAME (${portalEventName})`);

  const { data: sponsorEvents, error: sponsorEventsError } = await client
    .from("sponsor_events")
    .select("id, sponsor_id")
    .eq("event_id", appEvent.id);
  if (sponsorEventsError) throw sponsorEventsError;
  const sponsorIds = [...new Set((sponsorEvents ?? []).map((link) => link.sponsor_id))];
  const { data: sponsors, error: sponsorsError } = sponsorIds.length
    ? await client.from("sponsors").select("id, company_name").in("id", sponsorIds)
    : { data: [], error: null };
  if (sponsorsError) throw sponsorsError;

  const sponsorById = new Map((sponsors ?? []).map((sponsor) => [sponsor.id, sponsor.company_name]));
  const linkBySponsorName = new Map<string, string>();
  for (const link of sponsorEvents ?? []) {
    const companyName = sponsorById.get(link.sponsor_id);
    if (companyName) linkBySponsorName.set(normalizeMatch(companyName), link.id);
  }
  const sponsorEventIds = (sponsorEvents ?? []).map((link) => link.id);
  const { data: portalTasks, error: portalTasksError } = sponsorEventIds.length
    ? await client.from("tasks").select("id, sponsor_event_id, title").in("sponsor_event_id", sponsorEventIds)
    : { data: [], error: null };
  if (portalTasksError) throw portalTasksError;
  const portalTaskByKey = new Map((portalTasks ?? []).map((task) => {
    const companyName = (sponsorEvents ?? []).find((link) => link.id === task.sponsor_event_id);
    const sponsorName = companyName ? sponsorById.get(companyName.sponsor_id) : undefined;
    return [`${normalizeMatch(sponsorName ?? "")}::${normalizeMatch(task.title)}`, task];
  }));

  const { error: eventUpsertError } = await client.from("cvent_events").upsert(
    { event_id: eventId, event_name: eventName, synced_at: syncedAt },
    { onConflict: "event_id" },
  );
  if (eventUpsertError) throw eventUpsertError;

  const exhibitors = await fetchCollection(`${cventBaseUrl}/events/${encodeURIComponent(eventId)}/exhibitors`, token);
  let tasksSynced = 0;
  let portalTasksUpdated = 0;
  let unmatchedExhibitors = 0;
  const unknownStatuses = new Set<string>();

  for (const exhibitor of exhibitors) {
    const exhibitorId = stringValue(exhibitor.id);
    if (!exhibitorId) continue;
    const exhibitorName = stringValue(exhibitor.name || exhibitor.companyName) || "Unknown Exhibitor";
    const { error: exhibitorUpsertError } = await client.from("cvent_exhibitors").upsert({
      event_id: eventId,
      exhibitor_id: exhibitorId,
      exhibitor_name: exhibitorName,
      synced_at: syncedAt,
    }, { onConflict: "event_id,exhibitor_id" });
    if (exhibitorUpsertError) throw exhibitorUpsertError;

    const sponsorEventId = linkBySponsorName.get(normalizeMatch(exhibitorName));
    const deliverables = await fetchCollection(
      `${cventBaseUrl}/events/${encodeURIComponent(eventId)}/exhibitors/${encodeURIComponent(exhibitorId)}/deliverables`,
      token,
    );
    if (!sponsorEventId) unmatchedExhibitors += 1;
    if (!deliverables.length) continue;

    for (const deliverable of deliverables) {
      const deliverableId = stringValue(deliverable.id || deliverable.deliverableId) || "general";
      const deliverableName = stringValue(deliverable.name || deliverable.deliverableName) || "General";
      const { error: deliverableUpsertError } = await client.from("cvent_deliverables").upsert({
        event_id: eventId,
        exhibitor_id: exhibitorId,
        deliverable_id: deliverableId,
        deliverable_name: deliverableName,
        synced_at: syncedAt,
      }, { onConflict: "event_id,exhibitor_id,deliverable_id" });
      if (deliverableUpsertError) throw deliverableUpsertError;

      const cventTasks = await fetchCollection(
        `${cventBaseUrl}/events/${encodeURIComponent(eventId)}/exhibitors/${encodeURIComponent(exhibitorId)}/deliverables/${encodeURIComponent(deliverableId)}/tasks`,
        token,
      );
      for (const cventTask of cventTasks) {
        const taskId = stringValue(cventTask.id || cventTask.taskId) || JSON.stringify(cventTask);
        const taskName = stringValue(cventTask.name || cventTask.title || cventTask.taskName) || "Untitled task";
        const sourceStatus = stringValue(cventTask.status);
        const { error: taskUpsertError } = await client.from("cvent_tasks").upsert({
          event_id: eventId,
          exhibitor_id: exhibitorId,
          deliverable_id: deliverableId,
          task_id: taskId,
          task_name: taskName,
          task_status: sourceStatus || null,
          task_payload: cventTask,
          synced_at: syncedAt,
        }, { onConflict: "event_id,exhibitor_id,deliverable_id,task_id" });
        if (taskUpsertError) throw taskUpsertError;
        tasksSynced += 1;

        const portalTask = portalTaskByKey.get(`${normalizeMatch(exhibitorName)}::${normalizeMatch(taskName)}`);
        const portalStatus = mapCventStatus(sourceStatus);
        if (sourceStatus && !portalStatus) unknownStatuses.add(sourceStatus);
        if (portalTask && portalStatus) {
          const { error } = await client.from("tasks").update({ status: portalStatus }).eq("id", portalTask.id);
          if (error) throw error;
          portalTasksUpdated += 1;
        }
      }
    }
  }

  return {
    event_id: eventId,
    exhibitors_synced: exhibitors.length,
    cvent_tasks_synced: tasksSynced,
    portal_tasks_updated: portalTasksUpdated,
    unmatched_exhibitors: unmatchedExhibitors,
    unknown_statuses: [...unknownStatuses],
    warnings: tasksSynced === 0 ? ["No task records were returned by the configured Cvent endpoints; portal task statuses were not updated."] : [],
    synced_at: syncedAt,
  };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await runSync());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cvent sync failed";
    console.error("Cvent sync failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}