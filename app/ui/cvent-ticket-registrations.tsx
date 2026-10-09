"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";

type Registration = {
  attendee_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  company: string | null;
  email: string | null;
  status: string;
  registered_at: string | null;
};
type Props = { sponsorEventId: string; taskTitle: string; quantity: number };

export default function CventTicketRegistrations({ sponsorEventId, taskTitle, quantity }: Props) {
  const [registrations, setRegistrations] = useState<Registration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from("cvent_ticket_registrations")
      .select("attendee_id, first_name, last_name, job_title, company, email, status, registered_at")
      .eq("sponsor_event_id", sponsorEventId)
      .eq("task_title", taskTitle)
      .order("registered_at")
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(queryError.message);
        else setRegistrations((data ?? []) as Registration[]);
      });
    return () => { active = false; };
  }, [sponsorEventId, taskTitle]);

  if (error) return <p className="vip-allocation-message" role="status">Could not load Cvent registrations: {error}</p>;
  if (!registrations) return <p className="vip-allocation-message" role="status">Loading Cvent registrations…</p>;

  const confirmed = registrations.filter((registration) => registration.status.toLowerCase() === "accepted");
  const remaining = Math.max(0, quantity - confirmed.length);

  return (
    <section className="vip-allocation-editor" aria-label={`${taskTitle} Cvent registrations`}>
      <p className="eyebrow">Confirmed Cvent registrations</p>
      <small>{confirmed.length} of {quantity} registered · {remaining} remaining{confirmed.length > quantity ? ` · ${confirmed.length - quantity} over allocation` : ""}</small>
      {confirmed.length > 0
        ? <div className="vip-saved-nominees">{confirmed.map((registration) => <div className="vip-saved-nominee" key={registration.attendee_id}>
            <strong>{registration.first_name} {registration.last_name}</strong>
            <span>{[registration.job_title, registration.company].filter(Boolean).join(" · ")}</span>
            {registration.email && <a href={`mailto:${registration.email}`}>{registration.email}</a>}
          </div>)}</div>
        : <p>No confirmed registrations yet.</p>}
    </section>
  );
}
