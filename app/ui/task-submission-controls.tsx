"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { createTaskUploadAttempt, markTaskSubmitted, markTaskUploadFailed } from "@/lib/task-submission";
import { getTaskInputSchema, personFieldLabels, type PeopleInputField, type PersonFieldKey, type TaskInputField } from "@/lib/task-input-schema";
import type { Task } from "@/lib/types";

type Props = { task: Task; eventName: string; sponsorName: string; viewingAsAdmin?: boolean; onUpdated: (task: Task) => void };

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TaskSubmissionControls({ task, eventName, sponsorName, viewingAsAdmin = false, onUpdated }: Props) {
  const inputFile = useRef<HTMLInputElement>(null);
  const schema = getTaskInputSchema(task.title, task.quantity);
  const [inputValues, setInputValues] = useState<Record<string, unknown>>(() => ({ ...(task.input_values ?? {}) }));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  function updateValue(key: string, value: unknown) {
    setInputValues((current) => ({ ...current, [key]: value }));
  }

  function updatePerson(field: PeopleInputField, index: number, personKey: PersonFieldKey, value: string) {
    const people = Array.isArray(inputValues[field.key]) ? [...inputValues[field.key] as Array<Record<string, string>>] : [];
    people[index] = { ...(people[index] ?? {}), [personKey]: value };
    updateValue(field.key, people);
  }

  function addPerson(field: PeopleInputField) {
    const people = Array.isArray(inputValues[field.key]) ? [...inputValues[field.key] as Array<Record<string, string>>] : [];
    if (field.maxEntries && people.length >= field.maxEntries) return;
    people.push({});
    updateValue(field.key, people);
  }

  function removePerson(field: PeopleInputField, index: number) {
    const people = Array.isArray(inputValues[field.key]) ? [...inputValues[field.key] as Array<Record<string, string>>] : [];
    people.splice(index, 1);
    updateValue(field.key, people);
  }

  function renderField(field: TaskInputField) {
    const value = inputValues[field.key];
    if (field.type === "textarea") {
      return <label className="task-input-field" key={field.key}>{field.label}<textarea required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => updateValue(field.key, event.target.value)} /></label>;
    }
    if (field.type === "select") {
      return <label className="task-input-field" key={field.key}>{field.label}<select required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => updateValue(field.key, event.target.value)}><option value="">Choose an option</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
    }
    const people = Array.isArray(value) ? value as Array<Record<string, string>> : [];
    return (
      <fieldset className="people-input-group" key={field.key}>
        <legend>{field.label}</legend>
        {people.map((person, index) => (
          <div className="person-input-row" key={`${field.key}-${index}`}>
            {field.personFields.map((personKey) => <label className="task-input-field" key={personKey}>{personFieldLabels[personKey]}<input type={personKey === "email" ? "email" : "text"} required value={person[personKey] ?? ""} onChange={(event) => updatePerson(field, index, personKey, event.target.value)} /></label>)}
            <button className="roadmap-toggle" type="button" onClick={() => removePerson(field, index)}>Remove</button>
          </div>
        ))}
        <button className="roadmap-toggle" type="button" disabled={Boolean(field.maxEntries && people.length >= field.maxEntries)} onClick={() => addPerson(field)}>
          {field.type === "ticket_nominees" ? "Add nominee" : "Add person"}
        </button>
        {field.maxEntries && <small>{people.length} of {field.maxEntries} allocated tickets</small>}
      </fieldset>
    );
  }

  async function saveText() {
    setBusy(true); setMessage(null);
    try {
      onUpdated(await markTaskSubmitted(task.id, { input_values: inputValues }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit response.");
    }
    setBusy(false);
  }

  async function upload(file: File) {
    setBusy(true); setMessage(null);
    let attemptId: string;
    try {
      attemptId = await createTaskUploadAttempt(task.id, file.name, file.size);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create upload record.");
      setBusy(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", file); formData.append("task_id", task.id); formData.append("attempt_id", attemptId); formData.append("eventName", eventName); formData.append("sponsorName", sponsorName);
    const session = (await supabase.auth.getSession()).data.session;
    let responseResult: Response;
    try {
      responseResult = await fetch("/api/upload", { method: "POST", body: formData, headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined });
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Network error while uploading file.";
      try {
        await markTaskUploadFailed(attemptId, failure);
      } catch {
        // Keep the pending attempt as a visible recovery trail if the browser cannot report the failure.
      }
      setMessage(`Upload failed. Please try again. ${failure}`);
      setBusy(false);
      return;
    }

    let result: { error?: string; id?: string; link?: string; recovery_needed?: boolean };
    try {
      result = await responseResult.json() as { error?: string; id?: string; link?: string; recovery_needed?: boolean };
    } catch {
      const failure = "Upload failed because the server returned an unreadable response.";
      try {
        await markTaskUploadFailed(attemptId, failure);
      } catch {
        // Keep the pending attempt available to admins if the failure update also fails.
      }
      setMessage(`${failure} Please try again.`);
      setBusy(false);
      return;
    }
    if (!responseResult.ok) {
      if (!result.recovery_needed) {
        try {
          await markTaskUploadFailed(attemptId, result.error ?? "Drive upload failed.");
        } catch {
          // The pending attempt remains available to admins if the failure update also fails.
        }
      }
      setMessage(result.recovery_needed
        ? result.error ?? "The file reached Drive but needs manual recovery. Contact an administrator."
        : result.error ? `Upload failed. Please try again. ${result.error}` : "Upload failed. Please try again.");
    } else {
      try {
        const updatedTask = await markTaskSubmitted(task.id, { input_values: inputValues, file_id: result.id ?? null, file_url: result.link ?? null, file_name: file.name, file_size_bytes: file.size }, attemptId);
        onUpdated(updatedTask);
        setSelectedFile(null);
        if (inputFile.current) inputFile.current.value = "";
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `File uploaded but could not be linked. Upload attempt: ${attemptId}`);
      }
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
      {task.action_url && <a className="task-action-link" href={task.action_url} target="_blank" rel="noreferrer">{task.action_label ?? "Open link"} ↗</a>}
      {!schema.sponsorEditable && <p className="read-only-deliverable">This item is managed by the event team.</p>}
      {schema.sponsorEditable && <>
      <div className="task-input-grid">{schema.fields.map(renderField)}</div>
      {schema.allowFile && <>
        {task.file_name && !selectedFile && <div className="uploaded-file"><a className="task-action-link" href={task.file_url ?? undefined} target="_blank" rel="noreferrer">Current file: {task.file_name} · {formatFileSize(task.file_size_bytes ?? 0)} ↗</a><button className="roadmap-toggle" type="button" disabled={busy} onClick={() => inputFile.current?.click()}>Replace file</button></div>}
        <input ref={inputFile} className="visually-hidden-file-input" type="file" tabIndex={-1} aria-hidden="true" disabled={busy} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
        <div className={`file-dropzone ${draggingFile ? "is-dragging" : ""}`} role="button" tabIndex={0} onClick={() => inputFile.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputFile.current?.click(); } }} onDragOver={(event) => { event.preventDefault(); setDraggingFile(true); }} onDragLeave={() => setDraggingFile(false)} onDrop={(event) => { event.preventDefault(); setDraggingFile(false); setSelectedFile(event.dataTransfer.files?.[0] ?? null); }}>
          <strong>{selectedFile ? selectedFile.name : task.file_name ? "Drop a replacement file here" : "Drop a file here"}</strong>
          <span>{selectedFile ? `${formatFileSize(selectedFile.size)} · Ready to upload` : "or click to browse"}</span>
        </div>
        {selectedFile && <button className="upload-button" disabled={busy} type="button" onClick={() => void upload(selectedFile)}>{busy ? "Uploading..." : `Upload ${selectedFile.name}`}</button>}
      </>}
      <div className="task-actions">
        {schema.fields.length > 0 && <button className="roadmap-toggle" disabled={busy} onClick={() => void saveText()} type="button">Submit details</button>}
        {viewingAsAdmin && <>
          <button className="roadmap-toggle" disabled={busy || reviewing} onClick={() => void reviewWithGemini()} type="button">{reviewing ? "Reviewing..." : "Review with Gemini"}</button>
        </>}
      </div>
      </>}
      {task.ai_feedback && <div className={`ai-feedback ${task.ai_recommendation === "COMPLETE" ? "is-positive" : "is-warning"}`}><strong>Gemini: {task.ai_recommendation === "COMPLETE" ? "Looks complete" : "Needs changes"}</strong><span>{task.ai_feedback}</span></div>}
      {task.response_text && <small>Submitted details: {task.response_text}</small>}
      {task.file_url && <a className="task-action-link" href={task.file_url} target="_blank" rel="noreferrer">Submitted file: {task.file_name ?? "Open file"} ↗</a>}
      {message && <small className="auth-error">{message}</small>}
    </div>
  );
}
