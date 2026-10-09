import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRequestClient } from "@/lib/supabase";
import { companyBrandingTasks, networkingAppTasks } from "@/lib/contract-tasks";
import type { Database, TaskStatus } from "@/lib/types";

type SyncPayload = {
  company_name?: string;
  tier?: string;
  event_id?: string;
  entitlements?: string[];
};

const entitlementTasks: Record<string, Array<{ title: string; category: string }>> = {
  panel: [
    { title: "Submit Speaker Name", category: "Sponsor Panels" },
    { title: "Upload Headshot", category: "Sponsor Panels" },
  ],
  roundtable: [
    { title: "Confirm Roundtable Topic", category: "Roundtables" },
    { title: "Submit Moderator Details", category: "Roundtables" },
  ],
  booth: [
    { title: "Submit Booth Artwork", category: "Exhibition Booth" },
    { title: "Confirm Booth Staff", category: "Exhibition Booth" },
  ],
};

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });
  }

  const supabase = createSupabaseRequestClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "Admin sync requires service-role Supabase configuration" }, { status: 503 });
  }
  const writeClient = createClient<Database>(supabaseUrl, serviceRoleKey);

  let payload: SyncPayload;
  try {
    payload = (await request.json()) as SyncPayload;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const companyName = payload.company_name?.trim();
  const tier = payload.tier?.trim();
  const eventId = payload.event_id?.trim();
  const entitlements = Array.isArray(payload.entitlements) ? payload.entitlements : [];

  if (!companyName || !tier || !eventId) {
    return NextResponse.json(
      { error: "company_name, tier, and event_id are required" },
      { status: 400 },
    );
  }

  const sponsor: Database["public"]["Tables"]["sponsors"]["Insert"] = {
    company_name: companyName,
    tier,
  };
  const { data: sponsorData, error: sponsorError } = await writeClient
    .from("sponsors")
    .upsert(sponsor, { onConflict: "company_name" })
    .select("id, company_name, tier")
    .single();

  if (sponsorError || !sponsorData) {
    return NextResponse.json({ error: sponsorError?.message ?? "Could not create sponsor" }, { status: 500 });
  }

  const { data: sponsorEvent, error: linkError } = await writeClient
    .from("sponsor_events")
    .upsert({ sponsor_id: sponsorData.id, event_id: eventId }, { onConflict: "sponsor_id,event_id" })
    .select("id")
    .single();

  if (linkError || !sponsorEvent) {
    return NextResponse.json({ error: linkError?.message ?? "Could not link sponsor to event" }, { status: 500 });
  }

  const taskRows = entitlements.flatMap((entitlement) =>
    (entitlementTasks[entitlement.toLowerCase()] ?? []).map((task) => ({
      ...task,
      sponsor_event_id: sponsorEvent.id,
      status: "Needs You" as TaskStatus,
    })),
  );

  if (taskRows.length > 0) {
    const { error: taskError } = await writeClient
      .from("tasks")
      .upsert(taskRows, { onConflict: "sponsor_event_id,title" });
    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }
  }

  const universalTaskRows = [...companyBrandingTasks, ...networkingAppTasks].map((task) => ({
    ...task,
    sponsor_event_id: sponsorEvent.id,
    status: "Needs You" as TaskStatus,
  }));
  const { error: universalTaskError } = await writeClient.from("tasks").upsert(universalTaskRows, {
    onConflict: "sponsor_event_id,title",
    ignoreDuplicates: true,
  });
  if (universalTaskError) return NextResponse.json({ error: universalTaskError.message }, { status: 500 });

  return NextResponse.json({ sponsor: sponsorData, sponsor_event: sponsorEvent, tasks_created: taskRows.length + universalTaskRows.length });
}
