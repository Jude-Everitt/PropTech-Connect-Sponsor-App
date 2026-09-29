import { google } from "googleapis";
import { NextResponse } from "next/server";
import { createSupabaseRequestClient } from "@/lib/supabase";

export const runtime = "nodejs";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
) {
  const escapedName = name.replace(/'/g, "\\'");
  const response = await drive.files.list({
    q: `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 1,
    spaces: "drive",
  });

  const existing = response.data.files?.[0];
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  if (!created.data.id) throw new Error(`Could not create Drive folder: ${name}`);
  return created.data.id;
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });
    const { data: userData, error: userError } = await createSupabaseRequestClient(token).auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    const eventName = String(formData.get("eventName") ?? "").trim();
    const sponsorName = String(formData.get("sponsorName") ?? "").trim();

    if (!(file instanceof File) || !eventName || !sponsorName) {
      return NextResponse.json({ error: "file, eventName, and sponsorName are required" }, { status: 400 });
    }

    const auth = new google.auth.JWT({
      email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth });
    const rootId = requiredEnv("GOOGLE_DRIVE_PTC_ROOT_ID");
    const eventFolderId = await findOrCreateFolder(drive, eventName, rootId);
    const sponsorFolderId = await findOrCreateFolder(drive, sponsorName, eventFolderId);

    const uploaded = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [sponsorFolderId],
      },
      media: {
        mimeType: file.type || "application/octet-stream",
        body: Buffer.from(await file.arrayBuffer()),
      },
      fields: "id, webViewLink",
    });

    return NextResponse.json({
      id: uploaded.data.id,
      link: uploaded.data.webViewLink ?? (uploaded.data.id ? `https://drive.google.com/file/d/${uploaded.data.id}/view` : null),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
