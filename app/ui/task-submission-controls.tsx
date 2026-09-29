"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import type { Task } from "@/lib/types";

type Props = { task: Task; eventName: string; sponsorName: string; viewingAsAdmin?: boolean; onUpdated: (task: Task) => void };

export default function TaskSubmissionControls({ task, eventName, sponsorName, viewingAsAdmin = false, onUpdated }: Props) {
  const [response, setResponse] = useState(task.response_text ?? "");
  const [inputValues, setInputValues] = useState<Record<string, string>>(task.input_values ?? {});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  async function saveText() {
    setBusy(true); setMessage(null);
    const { data, error } = await supabase.from("tasks").update({ response_text: response, input_values: inputValues }).eq("id", task.id).select("*").single();
    if (error || !data) setMessage(error?.message ?? "Could not save response.");
    else onUpdated(data);
    setBusy(false);
  }

  async function markComplete() {
    setBusy(true); setMessage(null);
    const { data, error } = await supabase.from("tasks").update({ status: "Complete" }).eq("id", task.id).select("*").single();
    if (error || !data) setMessage(error?.message ?? "Could not mark complete.");
    else onUpdated(data);
    setBusy(false);
  }

  async function upload(file: File) {
    setBusy(true); setMessage(null);
    const formData = new FormData();
    formData.append("file", file); formData.append("task_id", task.id); formData.append("eventName", eventName); formData.append("sponsorName", sponsorName);
    const session = (await supabase.auth.getSession()).data.session;
    const responseResult = await fetch("/api/upload", { method: "POST", body: formData, headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined });
    const result = (await responseResult.json()) as { error?: string; id?: string; link?: string };
    if (!responseResult.ok) setMessage(result.error ?? "Upload failed.");
    else {
      const { data, error } = await supabase.from("tasks").update({ file_id: result.id ?? null, file_url: result.link ?? null, file_name: file.name, ...(viewingAsAdmin ? { status: "Complete" as const } : {}) }).eq("id", task.id).select("*").single();
      if (error || !data) setMessage(error?.message ?? "Could not save upload.");
      else onUpdated(data);
    }
    setBusy(false);
  }

  async function reviewWithGemini() {
    setReviewing(true); setMessage(null);
    const session = (await supabase.auth.getSession()).data.session;
    const responseResult = await fetch("/api/review-task", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ task_id: task.id }),
    });
    const result = (await responseResult.json()) as { error?: string; recommendation?: "COMPLETE" | "NEEDS_CHANGES"; feedback?: string };
    if (!responseResult.ok) setMessage(result.error ?? "Gemini review failed.");
    else onUpdated({ ...task, ai_recommendation: result.recommendation ?? null, ai_feedback: result.feedback ?? null, ai_reviewed_at: new Date().toISOString() });
    setReviewing(false);
  }

  return (
    <div className="submission-controls">
      {task.description && <details className="task-requirements"><summary>What this task requires</summary><p>{task.description}</p></details>}
      {task.input_fields?.map((field) => <label className="task-input-field" key={field.key}>{field.label}<input value={inputValues[field.key] ?? ""} placeholder={`Enter ${field.label}`} onChange={(event) => setInputValues((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}
      <textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Enter sponsor submission details" />
      <div className="task-actions">
        <button className="roadmap-toggle" disabled={busy} onClick={() => void saveText()} type="button">Save details</button>
        <label className="upload-button">{busy ? "Working..." : task.file_name ? "Replace file" : "Upload file"}<input type="file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
        {viewingAsAdmin && <>
          <button className="complete-button" disabled={busy || task.status === "Complete"} onClick={() => void markComplete()} type="button">{task.status === "Complete" ? "Complete" : "Mark Task Complete"}</button>
          <button className="roadmap-toggle" disabled={busy || reviewing} onClick={() => void reviewWithGemini()} type="button">{reviewing ? "Reviewing..." : "Review with Gemini"}</button>
        </>}
      </div>
      {task.ai_feedback && <div className={`ai-feedback ${task.ai_recommendation === "COMPLETE" ? "is-positive" : "is-warning"}`}><strong>Gemini: {task.ai_recommendation === "COMPLETE" ? "Looks complete" : "Needs changes"}</strong><span>{task.ai_feedback}</span></div>}
      {task.response_text && <small>Submitted details: {task.response_text}</small>}
      {task.file_url && <a className="task-action-link" href={task.file_url} target="_blank" rel="noreferrer">Submitted file: {task.file_name ?? "Open file"} ↗</a>}
      {message && <small className="auth-error">{message}</small>}
    </div>
  );
}
