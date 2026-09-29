import { supabase } from "@/lib/supabase-browser";
import type { Task } from "@/lib/types";

export type TaskSubmission = {
  response_text?: string | null;
  input_values?: Record<string, unknown>;
  file_id?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
};

async function authorizedFetch(path: string, init: RequestInit) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) throw new Error("Sign in before submitting this deliverable.");
  return fetch(path, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Authorization: `Bearer ${session.access_token}` },
  });
}

export async function createTaskUploadAttempt(taskId: string, fileName: string, fileSizeBytes: number): Promise<string> {
  const response = await authorizedFetch("/api/upload-attempt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, file_name: fileName, file_size_bytes: fileSizeBytes }),
  });
  const result = await response.json() as { error?: string; attempt?: { id: string } };
  if (!response.ok || !result.attempt) throw new Error(result.error ?? "Could not create upload record.");
  return result.attempt.id;
}

export async function markTaskUploadFailed(attemptId: string, errorMessage: string): Promise<void> {
  const response = await authorizedFetch("/api/upload-attempt", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attempt_id: attemptId, status: "upload_failed", error_message: errorMessage }),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Could not record upload failure.");
}

export async function markTaskSubmitted(taskId: string, submission: TaskSubmission, uploadAttemptId?: string): Promise<Task> {
  const response = await authorizedFetch("/api/submit-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, submission, ...(uploadAttemptId ? { upload_attempt_id: uploadAttemptId } : {}) }),
  });

  const result = await response.json() as { error?: string; task?: Task };
  if (!response.ok || !result.task) throw new Error(result.error ?? "Could not submit deliverable.");
  return result.task;
}
