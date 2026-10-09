import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseRequestClient } from "@/lib/supabase";
import type { Database } from "@/lib/types";

const taskTitle = "Submit Speaker Headshot + Bio";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });

  const authClient = createSupabaseRequestClient(token);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  const { data: profile, error: profileError } = await authClient.from("user_profiles").select("role").eq("id", user.id).single();
  if (profileError || profile?.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let body: { task_id?: unknown; action?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (typeof body.task_id !== "string" || !body.task_id.trim() || (body.action !== "complete" && body.action !== "uncomplete")) {
    return NextResponse.json({ error: "task_id and a valid action are required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server Supabase service-role configuration is missing" }, { status: 503 });
  const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: task, error: taskError } = await serviceClient.from("tasks").select("id, title").eq("id", body.task_id).single();
  if (taskError || !task) return NextResponse.json({ error: taskError?.message ?? "Task not found" }, { status: 404 });
  if (task.title !== taskTitle) return NextResponse.json({ error: `This action only applies to ${taskTitle}.` }, { status: 400 });

  const status = body.action === "complete" ? "Complete" : "Needs You";
  const { data: updatedTask, error: updateError } = await serviceClient.from("tasks").update({ status }).eq("id", task.id).select("id, status").single();
  if (updateError || !updatedTask) return NextResponse.json({ error: updateError?.message ?? "Could not update the task status." }, { status: 500 });
  return NextResponse.json({ task: updatedTask });
}
