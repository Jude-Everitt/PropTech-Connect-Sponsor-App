"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return <button className="sign-out-button" onClick={() => void signOut()} type="button">Sign out</button>;
}
