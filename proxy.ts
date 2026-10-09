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
  const isRetiredSponsorPath = request.nextUrl.pathname.startsWith("/sponsor") || request.nextUrl.pathname.startsWith("/hub");
  const { data: { user } } = await supabase.auth.getUser();

  if (!isAdminPath && !isRetiredSponsorPath) return response;
  if (isRetiredSponsorPath) return redirect("/admin");
  if (!user) return redirect("/auth/sign-in", { role: "admin" });

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "ADMIN") return redirect("/auth/sign-in", { role: "admin" });
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/sponsor/:path*", "/hub/:path*"],
};
