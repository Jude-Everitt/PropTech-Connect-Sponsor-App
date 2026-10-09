"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-browser";

type Props = { taskId: string; savedName: string; onSaved: (name: string, complete: boolean) => void };

export default function DisplayedCompanyNameEditor({ taskId, savedName, onSaved }: Props) {
  const [displayedName, setDisplayedName] = useState(savedName);
  const [currentSavedName, setCurrentSavedName] = useState(savedName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(action: "save" | "complete") {
    setSaving(true);
    setMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/admin/update-displayed-company-name", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: taskId, displayed_name: displayedName, action }),
      });
      const result = await response.json() as { error?: string; displayed_name?: string; status?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not save displayed company name.");
        return;
      }
      const saved = result.displayed_name ?? displayedName.trim();
      setDisplayedName(saved);
      setCurrentSavedName(saved);
      onSaved(saved, result.status === "Complete");
      setMessage(action === "complete" ? "Displayed name saved and task marked complete." : "Displayed name saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save displayed company name.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="displayed-name-editor" aria-label="Displayed event name">
      <label>Displayed Event Name<input maxLength={160} value={displayedName} onChange={(event) => setDisplayedName(event.target.value)} placeholder="Enter the company name as it should appear at the event" /></label>
      {currentSavedName && <p className="displayed-name-saved">Saved displayed name: <strong>{currentSavedName}</strong></p>}
      <div className="displayed-name-actions">
        <button className="roadmap-toggle" type="button" disabled={saving || !displayedName.trim()} onClick={() => void save("save")}>{saving ? "Saving..." : "Save name"}</button>
        <button className="complete-button" type="button" disabled={saving || !displayedName.trim()} onClick={() => void save("complete")}>Mark complete</button>
      </div>
      {message && <small className="displayed-name-message" role="status">{message}</small>}
    </section>
  );
}
