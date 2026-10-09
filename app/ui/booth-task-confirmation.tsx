"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-browser";

type Props = { taskId: string; taskTitle: string; savedDetails: string; onSaved: (details: string, isComplete: boolean) => void };

export default function BoothTaskConfirmation({ taskId, taskTitle, savedDetails, onSaved }: Props) {
  const [details, setDetails] = useState(savedDetails);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(action: "save" | "complete") {
    setSaving(true);
    setMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/admin/complete-booth-task", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: taskId, details, action }),
      });
      const result = await response.json() as { error?: string; details?: string; status?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not save task details.");
        return;
      }
      const saved = result.details ?? details.trim();
      setDetails(saved);
      onSaved(saved, result.status === "Complete");
      setMessage(action === "complete" ? "Details saved and task marked complete." : "Details saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save task details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="booth-task-confirmation" aria-label={taskTitle}>
      <label>{taskTitle}<textarea rows={4} maxLength={4000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder={taskTitle === "Confirm Additional Furniture for Booth" ? "List any additional furniture needed for the booth." : "Describe the planned booth activations."} /></label>
      <div className="booth-task-actions">
        <button className="roadmap-toggle" type="button" disabled={saving} onClick={() => void save("save")}>{saving ? "Saving..." : "Save details"}</button>
        <button className="complete-button" type="button" disabled={saving} onClick={() => void save("complete")}>Mark complete</button>
      </div>
      {message && <small className="booth-task-confirmation-message" role="status">{message}</small>}
    </section>
  );
}
