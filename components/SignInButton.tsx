"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function SignInButton({ callbackUrl }: { callbackUrl?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={() => {
        setBusy(true);
        signIn("google", { callbackUrl: callbackUrl || "/" });
      }}
      disabled={busy}
      className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground transition-colors hover:bg-brand-strong disabled:opacity-50"
    >
      {busy ? "Redirecting…" : "Sign in with Google"}
    </button>
  );
}
