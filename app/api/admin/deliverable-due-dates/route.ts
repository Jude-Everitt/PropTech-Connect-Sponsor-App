import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseRequestClient } from "@/lib/supabase";
import { applyDeliverableDueDates } from "@/lib/deliverable-due-dates";
import type { Database } from "@/lib/types";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });
  const authClient = createSupabaseRequestClient(token);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  const { data: profile } = await authClient.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let body: { event_id?: unknown; category?: unknown; due_date?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const { event_id: eventId, category, due_date: dueDate } = body;
  if (typeof eventId !== "string" || typeof category !== "string" || !category.trim()) return NextResponse.json({ error: "event_id and category are required" }, { status: 400 });
  if (dueDate !== null && (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))) {
    return NextResponse.json({ error: "due_date must be a YYYY-MM-DD date or null" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server Supabase service-role configuration is missing" }, { status: 503 });
  const service = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const result = dueDate === null
    ? await service.from("deliverable_due_dates").delete().eq("event_id", eventId).eq("category", category)
    : await service.from("deliverable_due_dates").upsert({ event_id: eventId, category, due_date: dueDate, updated_at: new Date().toISOString() }, { onConflict: "event_id,category" });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  try {
    const updated = await applyDeliverableDueDates(service, eventId, category);
    return NextResponse.json({ category, due_date: dueDate, tasks_updated: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update task due dates" }, { status: 500 });
  }
}
