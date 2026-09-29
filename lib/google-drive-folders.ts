import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function createServiceClient() {
  return createClient<Database>(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

function createDriveClient() {
  const auth = new google.auth.JWT({
    email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function findFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedParent = parentId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const response = await drive.files.list({
    q: `name = '${escapedName}' and '${escapedParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 10,
    spaces: "drive",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return response.data.files?.[0]?.id ?? null;
}

async function createFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  const existingId = await findFolder(drive, name, parentId);
  if (existingId) return existingId;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Google Drive did not return an ID for folder ${name}`);
  return created.data.id;
}

async function pause(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readClaim(client: ReturnType<typeof createServiceClient>, key: { event_id: string } | { sponsor_event_id: string }) {
  const query = client.from("drive_folder_creation_claims").select("id, drive_folder_id");
  return "event_id" in key
    ? query.eq("event_id", key.event_id).maybeSingle()
    : query.eq("sponsor_event_id", key.sponsor_event_id).maybeSingle();
}

async function saveClaimFolderId(client: ReturnType<typeof createServiceClient>, claimId: string, folderId: string) {
  const { error } = await client.from("drive_folder_creation_claims").update({ drive_folder_id: folderId }).eq("id", claimId).is("drive_folder_id", null);
  if (error) throw error;
  const { data, error: readError } = await client.from("drive_folder_creation_claims").select("drive_folder_id").eq("id", claimId).single();
  if (readError) throw readError;
  if (data.drive_folder_id !== folderId) throw new Error("Folder creation claim was assigned a different Drive folder");
}

async function saveEventFolderId(client: ReturnType<typeof createServiceClient>, eventId: string, folderId: string) {
  const { error } = await client.from("events").update({ drive_folder_id: folderId }).eq("id", eventId).is("drive_folder_id", null);
  if (error) throw error;
  const { data, error: readError } = await client.from("events").select("drive_folder_id").eq("id", eventId).single();
  if (readError) throw readError;
  return data.drive_folder_id ?? folderId;
}

async function saveSponsorEventFolderId(client: ReturnType<typeof createServiceClient>, linkId: string, folderId: string) {
  const { error } = await client.from("sponsor_events").update({ drive_folder_id: folderId }).eq("id", linkId).is("drive_folder_id", null);
  if (error) throw error;
  const { data, error: readError } = await client.from("sponsor_events").select("drive_folder_id").eq("id", linkId).single();
  if (readError) throw readError;
  return data.drive_folder_id ?? folderId;
}

async function waitForClaimedFolder(
  client: ReturnType<typeof createServiceClient>,
  drive: ReturnType<typeof google.drive>,
  key: { event_id: string } | { sponsor_event_id: string },
  folderName: string,
  parentFolderId: string,
  saveTarget: (folderId: string) => Promise<string>,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { data: claim, error } = await readClaim(client, key);
    if (error) throw error;
    if (claim?.drive_folder_id) return saveTarget(claim.drive_folder_id);

    const existingDriveFolderId = await findFolder(drive, folderName, parentFolderId);
    if (existingDriveFolderId && claim) {
      await saveClaimFolderId(client, claim.id, existingDriveFolderId);
      return saveTarget(existingDriveFolderId);
    }
    await pause(250);
  }
  throw new Error("Folder creation is already in progress. Retry this upload shortly; no duplicate folder was created.");
}

/** Returns or creates the Drive folder directly beneath GOOGLE_DRIVE_PTC_ROOT_ID for an event. */
export async function getOrCreateEventFolder(eventId: string): Promise<string> {
  const client = createServiceClient();
  const { data: event, error: eventError } = await client.from("events").select("id, name, drive_folder_id").eq("id", eventId).single();
  if (eventError) throw eventError;
  if (event.drive_folder_id) return event.drive_folder_id;

  const drive = createDriveClient();
  const rootId = requiredEnv("GOOGLE_DRIVE_PTC_ROOT_ID");
  const claimInsert = await client.from("drive_folder_creation_claims").insert({ event_id: event.id }).select("id, drive_folder_id").single();
  if (claimInsert.error?.code === "23505") {
    const { data: claim, error } = await readClaim(client, { event_id: event.id });
    if (error) throw error;
    if (!claim) throw new Error("Event folder creation claim conflicted but could not be re-read");
    if (claim.drive_folder_id) return saveEventFolderId(client, event.id, claim.drive_folder_id);
    return waitForClaimedFolder(client, drive, { event_id: event.id }, event.name, rootId, (id) => saveEventFolderId(client, event.id, id));
  }
  if (claimInsert.error || !claimInsert.data) throw claimInsert.error ?? new Error("Could not claim event folder creation");

  let createdFolderId: string | null = null;
  try {
    const latest = await client.from("events").select("drive_folder_id").eq("id", event.id).single();
    if (latest.error) throw latest.error;
    if (latest.data.drive_folder_id) return latest.data.drive_folder_id;

    createdFolderId = await createFolder(drive, event.name, rootId);
    await saveClaimFolderId(client, claimInsert.data.id, createdFolderId);
    return await saveEventFolderId(client, event.id, createdFolderId);
  } catch (error) {
    if (!createdFolderId) {
      await client.from("drive_folder_creation_claims").delete().eq("id", claimInsert.data.id).is("drive_folder_id", null);
    } else {
      console.error(JSON.stringify({ event: "event_drive_folder_target_write_failed", event_id: event.id, drive_folder_id: createdFolderId, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
    }
    throw error;
  }
}

/** Returns or creates the Drive folder for one sponsor-event link inside that event's folder. */
export async function getOrCreateSponsorFolder(sponsorEventLinkId: string): Promise<string> {
  const client = createServiceClient();
  const { data: link, error: linkError } = await client.from("sponsor_events").select("id, event_id, sponsor_id, drive_folder_id").eq("id", sponsorEventLinkId).single();
  if (linkError) throw linkError;
  if (link.drive_folder_id) return link.drive_folder_id;

  const [{ data: sponsor, error: sponsorError }, eventFolderId] = await Promise.all([
    client.from("sponsors").select("company_name").eq("id", link.sponsor_id).single(),
    getOrCreateEventFolder(link.event_id),
  ]);
  if (sponsorError) throw sponsorError;
  const drive = createDriveClient();
  const claimInsert = await client.from("drive_folder_creation_claims").insert({ sponsor_event_id: link.id }).select("id, drive_folder_id").single();
  if (claimInsert.error?.code === "23505") {
    const { data: claim, error } = await readClaim(client, { sponsor_event_id: link.id });
    if (error) throw error;
    if (!claim) throw new Error("Sponsor folder creation claim conflicted but could not be re-read");
    if (claim.drive_folder_id) return saveSponsorEventFolderId(client, link.id, claim.drive_folder_id);
    return waitForClaimedFolder(client, drive, { sponsor_event_id: link.id }, sponsor.company_name, eventFolderId, (id) => saveSponsorEventFolderId(client, link.id, id));
  }
  if (claimInsert.error || !claimInsert.data) throw claimInsert.error ?? new Error("Could not claim sponsor folder creation");

  let createdFolderId: string | null = null;
  try {
    const latest = await client.from("sponsor_events").select("drive_folder_id").eq("id", link.id).single();
    if (latest.error) throw latest.error;
    if (latest.data.drive_folder_id) return latest.data.drive_folder_id;

    createdFolderId = await createFolder(drive, sponsor.company_name, eventFolderId);
    await saveClaimFolderId(client, claimInsert.data.id, createdFolderId);
    return await saveSponsorEventFolderId(client, link.id, createdFolderId);
  } catch (error) {
    if (!createdFolderId) {
      await client.from("drive_folder_creation_claims").delete().eq("id", claimInsert.data.id).is("drive_folder_id", null);
    } else {
      console.error(JSON.stringify({ event: "sponsor_drive_folder_target_write_failed", sponsor_event_link_id: link.id, event_id: link.event_id, drive_folder_id: createdFolderId, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
    }
    throw error;
  }
}
