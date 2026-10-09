"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-browser";

type Props = {
  taskId: string;
  taskTitle: string;
  savedDetails: string;
  isComplete: boolean;
  onSaved: (details: string, status: "Complete" | "Needs You") => void;
};

export default function WorkshopTaskEditor({ taskId, taskTitle, savedDetails, isComplete, onSaved }: Props) {
  const [details, setDetails] = useState(savedDetails);
  const [currentSavedDetails, setCurrentSavedDetails] = useState(savedDetails);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(action: "save" | "complete" | "uncomplete") {
    setSaving(true);
    setMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/admin/update-workshop-task", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: taskId, details, action }),
      });
      const result = await response.json() as { error?: string; details?: string; status?: "Complete" | "Needs You" };
      if (!response.ok) {
        setMessage(result.error ?? "Could not save workshop details.");
        return;
      }
      const saved = result.details ?? details.trim();
      const status = result.status ?? (action === "complete" ? "Complete" : action === "uncomplete" ? "Needs You" : isComplete ? "Complete" : "Needs You");
      setDetails(saved);
      setCurrentSavedDetails(saved);
      onSaved(saved, status);
      setMessage(action === "save" ? "Details saved." : status === "Complete" ? "Details saved and task marked complete." : "Task marked incomplete.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save workshop details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="workshop-task-editor" aria-label={taskTitle}>
      <label>{taskTitle}<textarea rows={4} maxLength={5000} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
      <div className="booth-task-actions">
        <button className="roadmap-toggle" type="button" disabled={saving} onClick={() => void save("save")}>{saving ? "Saving..." : "Save details"}</button>
        <button className={isComplete ? "roadmap-toggle" : "complete-button"} type="button" disabled={saving || (!details.trim() && !isComplete)} onClick={() => void save(isComplete ? "uncomplete" : "complete")}>{saving ? "Saving..." : isComplete ? "Unmark Complete" : "Mark Complete"}</button>
      </div>
      {currentSavedDetails && <div className="workshop-task-saved-details"><strong>Saved details</strong><p>{currentSavedDetails}</p></div>}
      {message && <small className="booth-task-confirmation-message" role="status">{message}</small>}
    </section>
  );
}
