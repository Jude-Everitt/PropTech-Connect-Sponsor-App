import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createSupabaseRequestClient } from "@/lib/supabase";

export const runtime = "nodejs";

type ReviewPayload = {
  task_id?: string;
};

type GeminiReview = {
  recommendation: "COMPLETE" | "NEEDS_CHANGES";
  feedback: string;
};

function getToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

function parseGeminiText(value: string): GeminiReview {
  const cleaned = value.replace(/^```json\s*|```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<GeminiReview>;
  return {
    recommendation: parsed.recommendation === "COMPLETE" ? "COMPLETE" : "NEEDS_CHANGES",
    feedback: String(parsed.feedback ?? "Gemini could not provide detailed feedback."),
  };
}

async function getFilePart(fileId: string | null, fileName: string | null) {
  if (!fileId) return null;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) return null;
  const auth = new google.auth.JWT({ email, key: key.replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = google.drive({ version: "v3", auth });
  const metadata = await drive.files.get({ fileId, fields: "mimeType, name" });
  const content = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return { inlineData: { mimeType: metadata.data.mimeType ?? "application/octet-stream", data: Buffer.from(content.data as ArrayBuffer).toString("base64") }, name: fileName ?? metadata.data.name ?? "uploaded file" };
}

export async function POST(request: Request) {
  try {
    const token = getToken(request);
    if (!token) return NextResponse.json({ error: "Authorization bearer token required" }, { status: 401 });
    const payload = (await request.json()) as ReviewPayload;
    if (!payload.task_id) return NextResponse.json({ error: "task_id is required" }, { status: 400 });

    const client = createSupabaseRequestClient(token);
    const { data: userData, error: authError } = await client.auth.getUser(token);
    if (authError || !userData.user) return NextResponse.json({ error: "Invalid access token" }, { status: 401 });

    const { data: profile, error: profileError } = await client
      .from("user_profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError || profile?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("id, title, category, status, response_text, file_name, file_id, sponsor_event_id")
      .eq("id", payload.task_id)
      .single();
    if (taskError || !task) return NextResponse.json({ error: taskError?.message ?? "Task not found" }, { status: 404 });

    const responseText = task.response_text?.trim() || "No text response supplied.";
    const fileName = task.file_name || "No file supplied.";
    const filePart = await getFilePart(task.file_id, fileName);
    const prompt = `You review sponsor event deliverables. Decide whether this submission is sufficient for the task. Inspect the attached file when present. Do not invent missing evidence. Return ONLY valid JSON with exactly these keys: recommendation (COMPLETE or NEEDS_CHANGES) and feedback (short, actionable string). Task: ${task.title}. Category: ${task.category}. Sponsor text response: ${responseText}. Uploaded file name: ${fileName}. Current status: ${task.status}.`;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, ...(filePart ? [filePart.inlineData] : [])] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
    });
    const geminiJson = (await geminiResponse.json()) as { error?: { message?: string }; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    if (!geminiResponse.ok) return NextResponse.json({ error: geminiJson.error?.message ?? "Gemini review failed" }, { status: 502 });
    const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return NextResponse.json({ error: "Gemini returned no review" }, { status: 502 });
    const review = parseGeminiText(text);
    const { error: updateError } = await client.from("tasks").update({ ai_recommendation: review.recommendation, ai_feedback: review.feedback, ai_reviewed_at: new Date().toISOString() }).eq("id", task.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json(review);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gemini review failed" }, { status: 500 });
  }
}
