import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseRequestClient } from "@/lib/supabase";
import type { Database } from "@/lib/types";

const taskTitle = "Confirm Displayed Name of Company";
const inputKey = "displayed_company_name";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });

  const authClient = createSupabaseRequestClient(token);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  const { data: profile, error: profileError } = await authClient.from("user_profiles").select("role").eq("id", user.id).single();
  if (profileError || profile?.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let body: { task_id?: unknown; displayed_name?: unknown; action?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (typeof body.task_id !== "string" || !body.task_id.trim() || (body.action !== "save" && body.action !== "complete") || typeof body.displayed_name !== "string") {
    return NextResponse.json({ error: "task_id, displayed_name, and action are required" }, { status: 400 });
  }

  const displayedName = body.displayed_name.trim();
  if (!displayedName) return NextResponse.json({ error: "Enter the displayed company name." }, { status: 400 });
  if (displayedName.length > 160) return NextResponse.json({ error: "Displayed company name must be 160 characters or fewer." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server Supabase service-role configuration is missing" }, { status: 503 });
  const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: task, error: taskError } = await serviceClient.from("tasks").select("id, title, status, input_values").eq("id", body.task_id).single();
  if (taskError || !task) return NextResponse.json({ error: taskError?.message ?? "Task not found" }, { status: 404 });
  if (task.title !== taskTitle) return NextResponse.json({ error: `This action only applies to ${taskTitle}.` }, { status: 400 });

  const currentValues = task.input_values && typeof task.input_values === "object" && !Array.isArray(task.input_values) ? task.input_values : {};
  const status = body.action === "complete" ? "Complete" : task.status;
  const { error: updateError } = await serviceClient.from("tasks").update({
    input_values: { ...currentValues, [inputKey]: displayedName },
    status,
  }).eq("id", task.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ task_id: task.id, status, displayed_name: displayedName });
}
