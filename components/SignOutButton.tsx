"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/signin" })}
      className="text-sm text-muted hover:text-foreground"
      title="Sign out"
    >
      Sign out
    </button>
  );
}
