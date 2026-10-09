"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase-browser";

type Nominee = { first_name: string; last_name: string; job_title: string; company: string; email: string };
type Props = {
  taskId: string;
  quantity: number;
  savedNominees: Nominee[];
  onSaved: (nominees: Nominee[]) => void;
};

const emptyNominee = (): Nominee => ({ first_name: "", last_name: "", job_title: "", company: "", email: "" });

export default function VipTicketAllocation({ taskId, quantity, savedNominees, onSaved }: Props) {
  const [nominees, setNominees] = useState<Nominee[]>(savedNominees.length ? savedNominees : [emptyNominee()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateNominee(index: number, key: keyof Nominee, value: string) {
    setNominees((current) => current.map((nominee, nomineeIndex) => nomineeIndex === index ? { ...nominee, [key]: value } : nominee));
  }

  async function saveAndComplete() {
    setSaving(true);
    setMessage(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch("/api/admin/complete-vip-allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: taskId, nominees }),
      });
      const result = await response.json() as { error?: string; task?: { input_values?: Record<string, unknown> } };
      if (!response.ok) {
        setMessage(result.error ?? "Could not save VIP allocation.");
        setSaving(false);
        return;
      }
      const saved = result.task?.input_values?.nominees;
      if (Array.isArray(saved)) onSaved(saved as Nominee[]);
      setMessage("Nominees saved and task marked complete.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save VIP allocation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="vip-allocation-editor" aria-label="VIP ticket nominees">
      <p className="eyebrow">VIP ticket nominees</p>
      {savedNominees.length > 0 && <div className="vip-saved-nominees"><strong>Saved nominees</strong>{savedNominees.map((nominee, index) => <div className="vip-saved-nominee" key={`${nominee.email}-${index}`}><strong>{nominee.first_name} {nominee.last_name}</strong><span>{nominee.job_title} · {nominee.company}</span><a href={`mailto:${nominee.email}`}>{nominee.email}</a></div>)}</div>}
      <div className="vip-nominee-editor-list">
        {nominees.map((nominee, index) => <fieldset className="vip-nominee-editor" key={`nominee-${index}`}>
          <legend>Person {index + 1}</legend>
          <label>First name<input required autoComplete="given-name" value={nominee.first_name} onChange={(event) => updateNominee(index, "first_name", event.target.value)} /></label>
          <label>Last name<input required autoComplete="family-name" value={nominee.last_name} onChange={(event) => updateNominee(index, "last_name", event.target.value)} /></label>
          <label>Job title<input required autoComplete="organization-title" value={nominee.job_title} onChange={(event) => updateNominee(index, "job_title", event.target.value)} /></label>
          <label>Company<input required autoComplete="organization" value={nominee.company} onChange={(event) => updateNominee(index, "company", event.target.value)} /></label>
          <label>Email<input required type="email" autoComplete="email" value={nominee.email} onChange={(event) => updateNominee(index, "email", event.target.value)} /></label>
          {nominees.length > 1 && <button className="roadmap-toggle" type="button" onClick={() => setNominees((current) => current.filter((_, nomineeIndex) => nomineeIndex !== index))}>Remove</button>}
        </fieldset>)}
      </div>
      <div className="vip-nominee-actions">
        <button className="roadmap-toggle" type="button" disabled={nominees.length >= quantity} onClick={() => setNominees((current) => [...current, emptyNominee()])}>Add another person</button>
        <button className="complete-button" type="button" disabled={saving || !nominees.length || nominees.length > quantity} onClick={() => void saveAndComplete()}>{saving ? "Saving..." : "Save nominees & mark complete"}</button>
      </div>
      <small>{nominees.length} of {quantity} allocated tickets</small>
      {message && <p className="vip-allocation-message" role="status">{message}</p>}
    </section>
  );
}
