"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

function SignInForm() {
  const router = useRouter();
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
    if (normalizedRole !== "ADMIN") {
      await supabase.auth.signOut();
      setError(profileError ? `Could not read your admin profile: ${profileError.message}` : "This account is not configured for admin access.");
      setLoading(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="portal-shell auth-shell">
      <header className="portal-header"><Link href="/" className="brand-mark"><span className="brand-word-proptech">PropTech</span> <span className="brand-word-connect">Connect</span></Link><span className="header-meta">SECURE ACCESS <span className="status-dot" /></span></header>
      <section className="auth-panel">
        <p className="eyebrow">Admin operations / sign in</p>
        <h1>Welcome<br /><em>back.</em></h1>
        <p className="intro-copy">Use the email and password connected to your PropTech Connect account.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={loading} type="submit">{loading ? "Signing in..." : "Sign in"}<span>↗</span></button>
        </form>
        <p className="auth-help">Need access? Email client.success@proptechconnect.com to help you set up.</p>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return <SignInForm />;
}
