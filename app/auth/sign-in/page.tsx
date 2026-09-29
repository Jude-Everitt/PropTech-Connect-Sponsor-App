"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = searchParams.get("role");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile, error: profileError } = userData.user
      ? await supabase.from("user_profiles").select("role").eq("id", userData.user.id).single()
      : { data: null, error: null };
    const normalizedRole = typeof profile?.role === "string" ? profile.role.trim().toUpperCase() : null;
    if (requestedRole === "sponsor" && normalizedRole === "ADMIN") {
      router.push("/admin");
      router.refresh();
      return;
    }
    if (requestedRole === "admin" && normalizedRole !== "ADMIN") {
      await supabase.auth.signOut();
      setError(profileError ? `Could not read your portal profile: ${profileError.message}` : "This account is not configured as an admin. Ask an administrator to set your profile role to ADMIN.");
      setLoading(false);
      return;
    }
    router.push(normalizedRole === "ADMIN" ? "/admin" : "/hub");
    router.refresh();
  }

  return (
    <main className="portal-shell auth-shell">
      <header className="portal-header"><Link href="/" className="brand-mark"><span>PTC</span> / CONNECT</Link><span className="header-meta">SECURE ACCESS <span className="status-dot" /></span></header>
      <section className="auth-panel">
        <p className="eyebrow">{requestedRole === "admin" ? "Admin operations / sign in" : "Sponsor portal / sign in"}</p>
        <h1>Welcome<br /><em>back.</em></h1>
        <p className="intro-copy">Use the email and password connected to your PropTech Connect account.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={loading} type="submit">{loading ? "Signing in..." : "Sign in"}<span>↗</span></button>
        </form>
        <p className="auth-help">Need access? Ask the portal administrator to create your Supabase account.</p>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return <Suspense fallback={<main className="portal-shell auth-shell" />}><SignInForm /></Suspense>;
}
