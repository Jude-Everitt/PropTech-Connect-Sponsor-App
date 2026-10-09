import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseRequestClient } from "@/lib/supabase";
import type { Database } from "@/lib/types";

type Nominee = {
  first_name: string;
  last_name: string;
  job_title: string;
  company: string;
  email: string;
};

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

function parseNominees(value: unknown): Nominee[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const nominees: Nominee[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    const nominee = {
      first_name: typeof record.first_name === "string" ? record.first_name.trim() : "",
      last_name: typeof record.last_name === "string" ? record.last_name.trim() : "",
      job_title: typeof record.job_title === "string" ? record.job_title.trim() : "",
      company: typeof record.company === "string" ? record.company.trim() : "",
      email: typeof record.email === "string" ? record.email.trim() : "",
    };
    if (!nominee.first_name || !nominee.last_name || !nominee.job_title || !nominee.company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nominee.email)) return null;
    nominees.push(nominee);
  }
  return nominees;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });

  const authClient = createSupabaseRequestClient(token);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  const { data: profile, error: profileError } = await authClient.from("user_profiles").select("role").eq("id", user.id).single();
  if (profileError || profile?.role !== "ADMIN") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let body: { task_id?: unknown; nominees?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (typeof body.task_id !== "string" || !body.task_id.trim()) return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  const nominees = parseNominees(body.nominees);
  if (!nominees) return NextResponse.json({ error: "Add at least one nominee with name, job title, company, and a valid email." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server Supabase service-role configuration is missing" }, { status: 503 });
  const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: task, error: taskError } = await serviceClient.from("tasks").select("id, title, quantity, input_values").eq("id", body.task_id).single();
  if (taskError || !task) return NextResponse.json({ error: taskError?.message ?? "Task not found" }, { status: 404 });
  if (task.title !== "Confirm VIP Attendees") return NextResponse.json({ error: "This action only applies to Confirm VIP Attendees." }, { status: 400 });
  if (nominees.length > task.quantity) return NextResponse.json({ error: `This task allows up to ${task.quantity} nominees.` }, { status: 400 });

  const currentValues = task.input_values && typeof task.input_values === "object" && !Array.isArray(task.input_values) ? task.input_values : {};
  const { data: updatedTask, error: updateError } = await serviceClient.from("tasks")
    .update({ input_values: { ...currentValues, nominees }, status: "Complete" })
    .eq("id", task.id)
    .select("id, status, input_values")
    .single();
  if (updateError || !updatedTask) return NextResponse.json({ error: updateError?.message ?? "Could not save VIP allocation" }, { status: 500 });
  return NextResponse.json({ task: updatedTask });
}
