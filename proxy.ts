import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/types";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  function redirect(path: string, query?: Record<string, string>) {
    const destination = request.nextUrl.clone();
    destination.pathname = path;
    destination.search = "";
    Object.entries(query ?? {}).forEach(([key, value]) => destination.searchParams.set(key, value));
    const redirectResponse = NextResponse.redirect(destination);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  const isAdminPath = request.nextUrl.pathname.startsWith("/admin");
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/auth/sign-in", { role: isAdminPath ? "admin" : "sponsor" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, sponsor_id")
    .eq("id", user.id)
    .maybeSingle();

  if (isAdminPath) {
    if (profileError || profile?.role !== "ADMIN") {
      return redirect("/hub", { notice: "admin-required" });
    }
    return response;
  }

  if (profileError || profile?.role !== "SPONSOR") {
    return redirect("/hub", { notice: "sponsor-required" });
  }
  if (!profile.sponsor_id) {
    return redirect("/hub", { notice: "sponsor-unlinked" });
  }

  const eventId = request.nextUrl.pathname.split("/")[2];
  const { data: sponsorEvent, error: sponsorEventError } = await supabase
    .from("sponsor_events")
    .select("id")
    .eq("event_id", eventId)
    .eq("sponsor_id", profile.sponsor_id)
    .maybeSingle();
  if (sponsorEventError || !sponsorEvent) {
    return redirect("/hub", { notice: "event-unlinked" });
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/sponsor/:path*"],
};
