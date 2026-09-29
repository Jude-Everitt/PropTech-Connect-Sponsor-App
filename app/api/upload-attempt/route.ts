import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseRequestClient } from "@/lib/supabase";
import { getOrCreateSponsorFolder } from "@/lib/google-drive-folders";
import type { Database } from "@/lib/types";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function getToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function POST(request: Request) {
  try {
    const token = getToken(request);
    if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });
    const client = createSupabaseRequestClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });

    const body = await request.json() as { task_id?: unknown; file_name?: unknown; file_size_bytes?: unknown };
    if (typeof body.task_id !== "string" || !body.task_id.trim() || typeof body.file_name !== "string" || !body.file_name.trim() || typeof body.file_size_bytes !== "number" || !Number.isSafeInteger(body.file_size_bytes) || body.file_size_bytes < 0) {
      return NextResponse.json({ error: "task_id, file_name, and valid file_size_bytes are required" }, { status: 400 });
    }

    const [{ data: profile, error: profileError }, { data: task, error: taskError }] = await Promise.all([
      client.from("user_profiles").select("role, sponsor_id").eq("id", user.id).maybeSingle(),
      client.from("tasks").select("sponsor_event_id").eq("id", body.task_id).maybeSingle(),
    ]);
    if (profileError || !profile || (profile.role !== "ADMIN" && profile.role !== "SPONSOR")) {
      return NextResponse.json({ error: "Portal profile not found" }, { status: 403 });
    }
    if (taskError || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const { data: sponsorEvent, error: linkError } = await client
      .from("sponsor_events")
      .select("id, sponsor_id")
      .eq("id", task.sponsor_event_id)
      .maybeSingle();
    if (linkError || !sponsorEvent) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (profile.role === "SPONSOR" && (!profile.sponsor_id || profile.sponsor_id !== sponsorEvent.sponsor_id)) {
      return NextResponse.json({ error: "You cannot upload to this task" }, { status: 403 });
    }

    await getOrCreateSponsorFolder(sponsorEvent.id);

    const serviceClient = createClient<Database>(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: attempt, error: insertError } = await serviceClient
      .from("task_upload_attempts")
      .insert({ task_id: body.task_id, sponsor_id: sponsorEvent.sponsor_id, file_name: body.file_name.trim(), file_size_bytes: body.file_size_bytes, status: "pending_upload" })
      .select("id, task_id, sponsor_id, status, file_name, file_size_bytes, created_at")
      .single();
    if (insertError || !attempt) return NextResponse.json({ error: insertError?.message ?? "Could not create upload attempt" }, { status: 500 });
    return NextResponse.json({ attempt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create upload attempt" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = getToken(request);
    if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });
    const client = createSupabaseRequestClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });

    const body = await request.json() as { attempt_id?: unknown; status?: unknown; error_message?: unknown };
    if (typeof body.attempt_id !== "string" || !["upload_failed", "recovery_needed"].includes(String(body.status))) {
      return NextResponse.json({ error: "attempt_id and a valid failure status are required" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await client.from("user_profiles").select("role, sponsor_id").eq("id", user.id).maybeSingle();
    if (profileError || !profile || (profile.role !== "ADMIN" && profile.role !== "SPONSOR")) {
      return NextResponse.json({ error: "Portal profile not found" }, { status: 403 });
    }
    const serviceClient = createClient<Database>(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: attempt, error: attemptError } = await serviceClient
      .from("task_upload_attempts")
      .select("id, task_id, sponsor_id, status, drive_file_id")
      .eq("id", body.attempt_id)
      .maybeSingle();
    if (attemptError || !attempt) return NextResponse.json({ error: "Upload attempt not found" }, { status: 404 });
    if (profile.role === "SPONSOR" && profile.sponsor_id !== attempt.sponsor_id) {
      return NextResponse.json({ error: "You cannot update this upload attempt" }, { status: 403 });
    }
    const nextStatus = body.status as "upload_failed" | "recovery_needed";
    const validPriorStates = nextStatus === "upload_failed" ? ["pending_upload"] : ["uploaded"];
    if (!validPriorStates.includes(attempt.status)) return NextResponse.json({ error: "Upload attempt is not in a recoverable state" }, { status: 409 });

    const errorMessage = typeof body.error_message === "string" ? body.error_message.slice(0, 2000) : null;
    const { error: updateError } = await serviceClient.from("task_upload_attempts").update({ status: nextStatus, error_message: errorMessage, updated_at: new Date().toISOString() }).eq("id", attempt.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (nextStatus === "recovery_needed") {
      console.error(JSON.stringify({ event: "drive_upload_needs_recovery", task_id: attempt.task_id, attempt_id: attempt.id, drive_file_id: attempt.drive_file_id, timestamp: new Date().toISOString(), error: errorMessage }));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update upload attempt" }, { status: 500 });
  }
}
