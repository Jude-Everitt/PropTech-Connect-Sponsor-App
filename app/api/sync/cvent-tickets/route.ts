import { NextResponse } from "next/server";
import { createSupabaseRequestClient } from "@/lib/supabase";
import { syncCventTickets } from "@/lib/cvent-tickets";

export const runtime = "nodejs";
export const maxDuration = 300;

async function isAuthorized(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return false;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) return true;
  const client = createSupabaseRequestClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile } = await client.from("user_profiles").select("role").eq("id", data.user.id).single();
  return profile?.role === "ADMIN";
}

async function handle(request: Request) {
  if (!(await isAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await syncCventTickets());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cvent ticket sync failed";
    console.error("Cvent ticket sync failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
