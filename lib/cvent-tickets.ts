import { createClient } from "@supabase/supabase-js";
import { canonicalTicketTaskTitle } from "@/lib/contract-tasks";

type CventRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const cventBaseUrl = "https://api-platform-eur.cvent.com/ea";
const retryableStatuses = new Set([429, 500, 502, 503, 504]);

export const ticketTypeToTaskTitle: Record<string, string> = {
  "sponsor ticket": "Issue Team Tickets",
  "sponsor - client ticket": "Issue RE Tickets",
  "sponsor - speaker ticket": "Issue Speaker Team Ticket",
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function cventFetch(url: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    if (!retryableStatuses.has(response.status) || attempt === 5) return response;
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  throw new Error("Cvent request retry limit exceeded");
}

async function getAccessToken() {
  const clientId = requiredEnv("CVENT_CLIENT_ID");
  const credentials = Buffer.from(`${clientId}:${requiredEnv("CVENT_CLIENT_SECRET")}`).toString("base64");
  const response = await cventFetch(`${cventBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId }),
  });
  if (!response.ok) throw new Error(`Cvent authentication failed (${response.status})`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Cvent authentication returned no access token");
  return payload.access_token;
}

async function fetchAll(firstUrl: string, token: string) {
  const records: CventRecord[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const response: Response = await cventFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Cvent request failed (${response.status}) for ${new URL(url).pathname}`);
    const payload = await response.json() as { data?: CventRecord[]; paging?: { _links?: { next?: { href?: string } } } };
    records.push(...(payload.data ?? []));
    url = payload.paging?._links?.next?.href;
  }
  return records;
}

export async function syncCventTickets() {
  const eventId = requiredEnv("CVENT_EVENT_ID");
  const portalEventName = process.env.CVENT_APP_EVENT_NAME || requiredEnv("CVENT_EVENT_NAME");
  const client = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const syncedAt = new Date().toISOString();

  const { data: appEvent, error: appEventError } = await client.from("events").select("id").eq("name", portalEventName).maybeSingle();
  if (appEventError) throw appEventError;
  if (!appEvent) throw new Error(`No portal event exactly matches ${portalEventName}`);

  const { data: links, error: linksError } = await client.from("sponsor_events").select("id, sponsor_id, cvent_exhibitor_id").eq("event_id", appEvent.id);
  if (linksError) throw linksError;
  const sponsorIds = (links ?? []).map((link) => link.sponsor_id);
  const { data: sponsors, error: sponsorsError } = sponsorIds.length ? await client.from("sponsors").select("id, company_name").in("id", sponsorIds) : { data: [], error: null };
  if (sponsorsError) throw sponsorsError;
  const nameBySponsor = new Map((sponsors ?? []).map((sponsor) => [sponsor.id, sponsor.company_name as string]));
  const linkByName = new Map<string, string>();
  const storedExhibitorIdByLink = new Map<string, string>();
  for (const link of links ?? []) {
    const name = nameBySponsor.get(link.sponsor_id);
    if (name) linkByName.set(normalize(name), link.id);
    if (link.cvent_exhibitor_id) storedExhibitorIdByLink.set(link.id, link.cvent_exhibitor_id);
  }
  const linkByStoredExhibitorId = new Map([...storedExhibitorIdByLink].map(([link, exhibitorId]) => [exhibitorId, link]));

  const token = await getAccessToken();
  const exhibitors = (await fetchAll(`${cventBaseUrl}/events/${encodeURIComponent(eventId)}/exhibitors?limit=200`, token)).filter((e) => !e.deleted);
  const attendees = (await fetchAll(`${cventBaseUrl}/attendees?limit=200&filter=${encodeURIComponent(`event.id eq '${eventId}'`)}`, token)).filter((a) => !a.testRecord);

  // Portal company <-> Cvent exhibitor: the stored ID wins, otherwise the company name; newly found IDs are saved back.
  type ExhibitorMatch = { link: string | null; id: string; name: string };
  const exhibitorById = new Map<string, ExhibitorMatch>();
    const idsToStore: Array<{ link: string; exhibitorId: string }> = [];
  for (const exhibitor of exhibitors) {
    const id = String(exhibitor.id);
    const link = linkByStoredExhibitorId.get(id) ?? linkByName.get(normalize(exhibitor.name)) ?? null;
    if (link && !storedExhibitorIdByLink.has(link)) {
      storedExhibitorIdByLink.set(link, id);
      idsToStore.push({ link, exhibitorId: id });
    }
    const match: ExhibitorMatch = { link: link && storedExhibitorIdByLink.get(link) === id ? link : null, id, name: String(exhibitor.name) };
    exhibitorById.set(id.toLowerCase(), match);
  }
  for (const { link, exhibitorId } of idsToStore) {
    const { error } = await client.from("sponsor_events").update({ cvent_exhibitor_id: exhibitorId }).eq("id", link).is("cvent_exhibitor_id", null);
    if (error) throw error;
  }

  // Booth staff (Exhibitors > Exhibitor > Staff > Booth staff) is the source of truth for who belongs to which exhibitor.
  // Each entry only holds an attendee ID, which is joined to the attendee list for ticket type and details.
  const attendeeById = new Map(attendees.map((attendee) => [String(attendee.id), attendee]));
  const rows: Array<Record<string, string | boolean | null>> = [];
  for (const exhibitor of exhibitorById.values()) {
    if (!exhibitor.link) continue;
    const boothStaff = await fetchAll(`${cventBaseUrl}/events/${encodeURIComponent(eventId)}/exhibitors/${encodeURIComponent(exhibitor.id)}/booth-staff?limit=100`, token);
    for (const staff of boothStaff) {
      const attendee = attendeeById.get(String(staff.attendee?.id));
      const taskTitle = attendee ? ticketTypeToTaskTitle[String(attendee.registrationType?.name ?? "").trim().toLowerCase()] : undefined;
      if (!attendee || !taskTitle) continue;
      const contact = attendee.contact ?? {};
      rows.push({
        attendee_id: String(attendee.id),
        cvent_event_id: eventId,
        sponsor_event_id: exhibitor.link,
        exhibitor_id: exhibitor.id,
        exhibitor_name: exhibitor.name,
        inviting_sponsor: null,
        task_title: taskTitle,
        registration_type: String(attendee.registrationType.name),
        status: String(attendee.status ?? ""),
        first_name: contact.firstName ?? null,
        last_name: contact.lastName ?? null,
        email: contact.email ?? null,
        company: contact.company ?? null,
        job_title: contact.title ?? null,
        registered_at: attendee.registeredAt ?? null,
        checked_in: Boolean(attendee.checkedIn),
        synced_at: syncedAt,
      });
    }
  }

  if (rows.length) {
    const { error } = await client.from("cvent_ticket_registrations").upsert(rows, { onConflict: "attendee_id" });
    if (error) throw error;
  }
  // Registrations that disappeared from Cvent (deleted) should not linger.
  const { error: pruneError } = await client.from("cvent_ticket_registrations").delete().eq("cvent_event_id", eventId).lt("synced_at", syncedAt);
  if (pruneError) throw pruneError;

  const confirmed = new Map<string, number>();
  for (const row of rows) {
    if (row.sponsor_event_id && String(row.status).toLowerCase() === "accepted") {
      const key = `${row.sponsor_event_id}::${row.task_title}`;
      confirmed.set(key, (confirmed.get(key) ?? 0) + 1);
    }
  }

  const sponsorEventIds = (links ?? []).map((link) => link.id);
  const { data: tasks, error: tasksError } = sponsorEventIds.length
    ? await client.from("tasks").select("id, sponsor_event_id, title, quantity, status, input_values").in("sponsor_event_id", sponsorEventIds)
    : { data: [], error: null };
  if (tasksError) throw tasksError;

  const changes: Array<{ sponsor_event_id: string; task: string; change: string }> = [];
  let tasksCompleted = 0;
  let tasksReverted = 0;
  for (const task of tasks ?? []) {
    const title = canonicalTicketTaskTitle(task.title);
    if (!Object.values(ticketTypeToTaskTitle).includes(title) || task.quantity <= 0) continue;
    const isFull = (confirmed.get(`${task.sponsor_event_id}::${title}`) ?? 0) >= task.quantity;
    const values = task.input_values && typeof task.input_values === "object" && !Array.isArray(task.input_values) ? task.input_values as Record<string, unknown> : {};
    if (isFull && task.status !== "Complete") {
      const { error } = await client.from("tasks").update({ status: "Complete", input_values: { ...values, cvent_auto_completed: true } }).eq("id", task.id);
      if (error) throw error;
      tasksCompleted += 1;
      changes.push({ sponsor_event_id: task.sponsor_event_id, task: title, change: "Complete" });
    } else if (!isFull && task.status === "Complete") {
      // Cvent is the source of truth for ticket tasks, so any Complete task without enough confirmed registrations is reopened.
      const { cvent_auto_completed: _flag, ...rest } = values; // eslint-disable-line @typescript-eslint/no-unused-vars
      const { error } = await client.from("tasks").update({ status: "Needs You", input_values: rest }).eq("id", task.id);
      if (error) throw error;
      tasksReverted += 1;
      changes.push({ sponsor_event_id: task.sponsor_event_id, task: title, change: "Needs You" });
    }
  }

  return {
    event_id: eventId,
    registrations_synced: rows.length,
    exhibitors_checked: [...exhibitorById.values()].filter((exhibitor) => exhibitor.link).length,
    tasks_completed: tasksCompleted,
    task_changes: changes,
    tasks_reverted: tasksReverted,
    synced_at: syncedAt,
  };
}
