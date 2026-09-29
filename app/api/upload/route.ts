import { google } from "googleapis";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRequestClient } from "@/lib/supabase";
import { getOrCreateSponsorFolder } from "@/lib/google-drive-folders";
import type { Database } from "@/lib/types";

export const runtime = "nodejs";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function POST(request: Request) {
  let serviceClient: ReturnType<typeof createClient<Database>> | null = null;
  let attempt: { id: string; task_id: string; sponsor_id: string; status: string; file_name: string; file_size_bytes: number } | null = null;
  let uploadedDriveFile: { id: string; link: string | null } | null = null;
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });
    const client = createSupabaseRequestClient(token);
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    const taskId = String(formData.get("task_id") ?? "").trim();
    const attemptId = String(formData.get("attempt_id") ?? "").trim();

    if (!(file instanceof File) || !taskId || !attemptId) {
      return NextResponse.json({ error: "file, task_id, and attempt_id are required" }, { status: 400 });
    }

    const [{ data: profile, error: profileError }, { data: task, error: taskError }] = await Promise.all([
      client.from("user_profiles").select("role, sponsor_id").eq("id", userData.user.id).maybeSingle(),
      client.from("tasks").select("sponsor_event_id").eq("id", taskId).maybeSingle(),
    ]);
    if (profileError || !profile) return NextResponse.json({ error: "Portal profile not found" }, { status: 403 });
    if (taskError || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const { data: sponsorEvent, error: sponsorEventError } = await client
      .from("sponsor_events")
      .select("id, sponsor_id")
      .eq("id", task.sponsor_event_id)
      .maybeSingle();
    if (sponsorEventError || !sponsorEvent) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (profile.role !== "ADMIN" && (profile.role !== "SPONSOR" || profile.sponsor_id !== sponsorEvent.sponsor_id)) {
      return NextResponse.json({ error: "You cannot upload to this task" }, { status: 403 });
    }

    serviceClient = createClient<Database>(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: attemptRecord, error: attemptError } = await serviceClient
      .from("task_upload_attempts")
      .select("id, task_id, sponsor_id, status, file_name, file_size_bytes")
      .eq("id", attemptId)
      .maybeSingle();
    if (attemptError || !attemptRecord || attemptRecord.task_id !== taskId || attemptRecord.sponsor_id !== sponsorEvent.sponsor_id || attemptRecord.status !== "pending_upload" || attemptRecord.file_name !== file.name || attemptRecord.file_size_bytes !== file.size) {
      return NextResponse.json({ error: "A matching pending upload attempt is required" }, { status: 409 });
    }
    attempt = attemptRecord;

    const sponsorFolderId = await getOrCreateSponsorFolder(sponsorEvent.id);

    const auth = new google.auth.JWT({
      email: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth });
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

    if (!uploaded.data.id) throw new Error("Google Drive did not return a file ID");
    uploadedDriveFile = {
      id: uploaded.data.id,
      link: uploaded.data.webViewLink ?? `https://drive.google.com/file/d/${uploaded.data.id}/view`,
    };
    const uploadedAt = new Date().toISOString();
    const { error: attemptUpdateError } = await serviceClient
      .from("task_upload_attempts")
      .update({ status: "uploaded", drive_file_id: uploadedDriveFile.id, file_url: uploadedDriveFile.link, file_size_bytes: file.size, updated_at: uploadedAt })
      .eq("id", attempt.id);
    if (attemptUpdateError) {
      console.error(JSON.stringify({ event: "drive_upload_attempt_write_failed", task_id: taskId, attempt_id: attempt.id, drive_file_id: uploadedDriveFile.id, timestamp: uploadedAt, error: attemptUpdateError.message }));
      return NextResponse.json({ error: `File uploaded but could not save its recovery record. Drive file ID: ${uploadedDriveFile.id}`, drive_file_id: uploadedDriveFile.id, attempt_id: attempt.id, recovery_needed: true }, { status: 500 });
    }

    return NextResponse.json({
      id: uploadedDriveFile.id,
      link: uploadedDriveFile.link,
      attempt_id: attempt.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const timestamp = new Date().toISOString();
    if (uploadedDriveFile && attempt) {
      console.error(JSON.stringify({ event: "drive_upload_completed_but_processing_failed", task_id: attempt.task_id, attempt_id: attempt.id, drive_file_id: uploadedDriveFile.id, timestamp, error: message }));
    } else if (serviceClient && attempt) {
      const { error: attemptUpdateError } = await serviceClient
        .from("task_upload_attempts")
        .update({ status: "upload_failed", error_message: message.slice(0, 2000), updated_at: timestamp })
        .eq("id", attempt.id)
        .eq("status", "pending_upload");
      if (attemptUpdateError) console.error(JSON.stringify({ event: "upload_failure_record_write_failed", task_id: attempt.task_id, attempt_id: attempt.id, timestamp, error: attemptUpdateError.message, upload_error: message }));
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
