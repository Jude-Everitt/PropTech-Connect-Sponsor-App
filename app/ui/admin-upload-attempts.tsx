"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";

type UploadAttempt = {
  id: string;
  task_id: string;
  status: "pending_upload" | "upload_failed" | "uploaded" | "recovery_needed" | "completed";
  file_name: string;
  file_size_bytes: number;
  drive_file_id: string | null;
  file_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type Props = { sponsorId: string };

const statusLabel: Record<UploadAttempt["status"], string> = {
  pending_upload: "Upload started",
  upload_failed: "Upload failed",
  uploaded: "Uploaded, linking pending",
  recovery_needed: "Manual recovery needed",
  completed: "Completed",
};

export default function AdminUploadAttempts({ sponsorId }: Props) {
  const [attempts, setAttempts] = useState<UploadAttempt[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadAttempts() {
      const { data, error } = await supabase
        .from("task_upload_attempts")
        .select("id, task_id, status, file_name, file_size_bytes, drive_file_id, file_url, error_message, created_at, updated_at")
        .eq("sponsor_id", sponsorId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) setMessage(error.message);
      else setAttempts(data ?? []);
    }
    void loadAttempts();
  }, [sponsorId]);

  if (message) return <div className="notice">Could not load upload history: {message}</div>;
  if (!attempts.length) return null;

  return (
    <section className="admin-submissions-page" aria-label="Upload attempt history">
      <h2>Upload history</h2>
      {attempts.map((attempt) => (
        <article className="admin-submission-card" key={attempt.id}>
          <div>
            <strong>{attempt.file_name} · {attempt.file_size_bytes < 1024 ? `${attempt.file_size_bytes} B` : `${(attempt.file_size_bytes / 1024).toFixed(1)} KB`}</strong>
            <p>{statusLabel[attempt.status]} · Task {attempt.task_id} · {new Date(attempt.created_at).toLocaleString()}</p>
            {attempt.drive_file_id && <p>Drive file ID: <code>{attempt.drive_file_id}</code></p>}
            {attempt.file_url && <a className="task-action-link" href={attempt.file_url} target="_blank" rel="noreferrer">Open Drive file ↗</a>}
            {attempt.error_message && <p className="auth-error">{attempt.error_message}</p>}
          </div>
        </article>
      ))}
    </section>
  );
}
