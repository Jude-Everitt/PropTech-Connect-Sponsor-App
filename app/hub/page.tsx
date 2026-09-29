"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import type { Event, Role } from "@/lib/types";
import SignOutButton from "@/app/ui/sign-out-button";

export default function HubPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [companyName, setCompanyName] = useState("Your sponsor workspace");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHub() {
      const notice = new URLSearchParams(window.location.search).get("notice");
      const noticeMessages: Record<string, string> = {
        "admin-required": "The admin portal is available to staff accounts only.",
        "sponsor-required": "This sponsor portal requires a sponsor account.",
        "sponsor-unlinked": "Your sponsor account is not linked to a company yet. Contact the portal administrator.",
        "event-unlinked": "That event is not linked to your sponsor account.",
      };
      if (notice && noticeMessages[notice]) {
        setError(noticeMessages[notice]);
        setLoading(false);
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setError("Sign in to view your event hub.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("role, sponsor_id")
        .eq("id", userData.user.id)
        .single();
      if (profileError || !profile) {
        setError("Your portal profile is not configured yet.");
        setLoading(false);
        return;
      }

      const currentRole = profile.role as Role;
      setRole(currentRole);

      if (currentRole === "ADMIN") {
        const { data, error: eventsError } = await supabase
          .from("events")
          .select("id, name, start_date, location")
          .gte("start_date", new Date().toISOString().slice(0, 10))
          .order("start_date");
        if (eventsError) setError(eventsError.message);
        setEvents(data ?? []);
      } else if (!profile.sponsor_id) {
        setError("Your sponsor account is not linked to a company yet. Contact the portal administrator.");
        setLoading(false);
        return;
      } else {
        const { data: sponsor } = await supabase
          .from("sponsors")
          .select("company_name")
          .eq("id", profile.sponsor_id)
          .single();
        setCompanyName(sponsor?.company_name ?? "Your sponsor workspace");

        const { data: links, error: linksError } = await supabase
          .from("sponsor_events")
          .select("event_id")
          .eq("sponsor_id", profile.sponsor_id);
        if (linksError) {
          setError(linksError.message);
        } else if (links?.length) {
          const { data, error: eventsError } = await supabase
            .from("events")
            .select("id, name, start_date, location")
            .in("id", links.map((link) => link.event_id))
            .order("start_date");
          if (eventsError) setError(eventsError.message);
          setEvents(data ?? []);
        }
      }
      setLoading(false);
    }

    void loadHub();
  }, []);

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <Link href="/" className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link>
        <div className="header-actions"><div className="header-meta"><span className="status-dot" /> {role === "ADMIN" ? "Admin operations" : companyName}</div><SignOutButton /></div>
      </header>
      <section className="hub-intro">
        <p className="eyebrow">{role === "ADMIN" ? "Operations command centre" : "Your sponsor workspace"}</p>
        <h1>Choose an event<br /><em>to get moving.</em></h1>
        <p className="intro-copy">Keep every promise visible, every handoff clear, and every deadline in reach.</p>
      </section>
      <section className="event-grid" aria-live="polite">
        {loading && <div className="empty-state">Loading your events...</div>}
        {error && <div className="empty-state error-state">{error}</div>}
        {!loading && !error && events.length === 0 && <div className="empty-state">No active events are linked to this profile.</div>}
        {events.map((event, index) => (
          <Link
            className={`event-card event-card-${index % 3}`}
            href={role === "ADMIN" ? `/admin/${event.id}/deliverables` : `/sponsor/${event.id}`}
            key={event.id}
          >
            <div className="card-index">0{index + 1}</div>
            <div>
              <p className="card-kicker">{new Date(event.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>
              <h2>{event.name}</h2>
              <p className="card-location">{event.location ?? "Location to be announced"}</p>
            </div>
            <span className="card-arrow" aria-hidden="true">↗</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
