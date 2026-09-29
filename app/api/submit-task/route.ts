import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRequestClient } from "@/lib/supabase";
import { getTaskInputSchema, validateTaskInputValues } from "@/lib/task-input-schema";
import type { TaskSubmission } from "@/lib/task-submission";
import type { Database } from "@/lib/types";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });

    const client = createSupabaseRequestClient(token);
    const { data: userData, error: authError } = await client.auth.getUser(token);
    if (authError || !userData.user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });

    const body = await request.json() as { task_id?: unknown; submission?: unknown; upload_attempt_id?: unknown };
    if (typeof body.task_id !== "string" || !body.task_id.trim() || !isRecord(body.submission)) {
      return NextResponse.json({ error: "task_id and submission are required" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await client
      .from("user_profiles")
      .select("role, sponsor_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError || !profile || (profile.role !== "ADMIN" && profile.role !== "SPONSOR")) {
      return NextResponse.json({ error: "Portal profile not found" }, { status: 403 });
    }

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("id, sponsor_event_id, title, quantity, input_values")
      .eq("id", body.task_id)
      .maybeSingle();
    if (taskError || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const { data: sponsorEvent, error: linkError } = await client
      .from("sponsor_events")
      .select("sponsor_id")
      .eq("id", task.sponsor_event_id)
      .maybeSingle();
    if (linkError || !sponsorEvent) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (profile.role === "SPONSOR" && (!profile.sponsor_id || sponsorEvent.sponsor_id !== profile.sponsor_id)) {
      return NextResponse.json({ error: "You cannot submit to this task" }, { status: 403 });
    }

    const submission = body.submission;
    const allowedKeys = new Set(["response_text", "input_values", "file_id", "file_url", "file_name", "file_size_bytes"]);
    if (Object.keys(submission).some((key) => !allowedKeys.has(key))) {
      return NextResponse.json({ error: "Submission includes unsupported fields" }, { status: 400 });
    }

    const values: TaskSubmission = {};
    if ("response_text" in submission) {
      if (submission.response_text !== null && typeof submission.response_text !== "string") return NextResponse.json({ error: "response_text must be text" }, { status: 400 });
      values.response_text = submission.response_text;
    }
    if ("input_values" in submission) {
      if (!isRecord(submission.input_values)) return NextResponse.json({ error: "input_values must be an object" }, { status: 400 });
      values.input_values = submission.input_values;
    }
    for (const key of ["file_id", "file_url", "file_name"] as const) {
      if (key in submission) {
        if (submission[key] !== null && typeof submission[key] !== "string") return NextResponse.json({ error: `${key} must be text` }, { status: 400 });
        values[key] = submission[key] as string | null;
      }
    }
    if ("file_size_bytes" in submission) {
      if (submission.file_size_bytes !== null && (typeof submission.file_size_bytes !== "number" || !Number.isSafeInteger(submission.file_size_bytes) || submission.file_size_bytes < 0)) {
        return NextResponse.json({ error: "file_size_bytes must be a non-negative integer" }, { status: 400 });
      }
      values.file_size_bytes = submission.file_size_bytes as number | null;
    }
    if (!Object.keys(values).length) return NextResponse.json({ error: "At least one submission field is required" }, { status: 400 });

    const schema = getTaskInputSchema(task.title, task.quantity);
    if (!schema.sponsorEditable) return NextResponse.json({ error: "This deliverable is managed by the event team" }, { status: 403 });
    const hasFile = Boolean(values.file_id || values.file_url || values.file_name);
    if (hasFile && !schema.allowFile) return NextResponse.json({ error: "This deliverable does not accept file uploads" }, { status: 400 });
    const mergedInputValues = {
      ...(isRecord(task.input_values) ? task.input_values : {}),
      ...(values.input_values ?? {}),
    };
    const validationError = validateTaskInputValues(schema, mergedInputValues);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    if (values.input_values) values.input_values = mergedInputValues;

    if (hasFile && (typeof body.upload_attempt_id !== "string" || !body.upload_attempt_id)) {
      return NextResponse.json({ error: "A completed Drive upload attempt is required" }, { status: 400 });
    }
    if (!hasFile && body.upload_attempt_id !== undefined) {
      return NextResponse.json({ error: "upload_attempt_id is only valid for a file submission" }, { status: 400 });
    }

    const serviceClient = body.upload_attempt_id
      ? createClient<Database>(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"))
      : null;
    let uploadAttempt: { id: string; task_id: string; sponsor_id: string; status: string; drive_file_id: string | null } | null = null;
    if (serviceClient && typeof body.upload_attempt_id === "string") {
      const { data, error } = await serviceClient
        .from("task_upload_attempts")
        .select("id, task_id, sponsor_id, status, drive_file_id, file_size_bytes")
        .eq("id", body.upload_attempt_id)
        .maybeSingle();
      if (error || !data || data.task_id !== task.id || data.sponsor_id !== sponsorEvent.sponsor_id || data.status !== "uploaded") {
        return NextResponse.json({ error: "The upload attempt is not ready to submit" }, { status: 409 });
      }
      if (values.file_id !== data.drive_file_id) return NextResponse.json({ error: "The file ID does not match the upload attempt" }, { status: 400 });
      if (values.file_size_bytes !== data.file_size_bytes) return NextResponse.json({ error: "The file size does not match the upload attempt" }, { status: 400 });
      uploadAttempt = data;
    }

    const { data: updatedTask, error: updateError } = await client
      .from("tasks")
      .update({
        ...values,
        status: "pending_review",
        submitted_at: new Date().toISOString(),
        admin_review_note: null,
      })
      .eq("id", task.id)
      .select("*")
      .single();
    if (updateError || !updatedTask) {
      if (serviceClient && uploadAttempt) {
        const timestamp = new Date().toISOString();
        const failure = updateError?.message ?? "Could not submit deliverable";
        const { error: recoveryError } = await serviceClient.from("task_upload_attempts")
          .update({ status: "recovery_needed", error_message: failure.slice(0, 2000), updated_at: timestamp })
          .eq("id", uploadAttempt.id);
        console.error(JSON.stringify({ event: "uploaded_file_task_link_failed", task_id: task.id, attempt_id: uploadAttempt.id, drive_file_id: uploadAttempt.drive_file_id, timestamp, error: failure, recovery_record_error: recoveryError?.message ?? null }));
        return NextResponse.json({ error: `File uploaded but could not be linked to the task. Drive file ID: ${uploadAttempt.drive_file_id}`, recovery_needed: true }, { status: 500 });
      }
      return NextResponse.json({ error: updateError?.message ?? "Could not submit deliverable" }, { status: 500 });
    }

    if (serviceClient && uploadAttempt) {
      const { error: completeError } = await serviceClient.from("task_upload_attempts")
        .update({ status: "completed", error_message: null, updated_at: new Date().toISOString() })
        .eq("id", uploadAttempt.id);
      if (completeError) {
        console.error(JSON.stringify({ event: "upload_attempt_completion_write_failed", task_id: task.id, attempt_id: uploadAttempt.id, drive_file_id: uploadAttempt.drive_file_id, timestamp: new Date().toISOString(), error: completeError.message }));
      }
    }

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit deliverable" }, { status: 500 });
  }
}
