import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedDirector } from "@/lib/directors";

export type CurrentDirector = { email: string; name: string | null };

/** The signed-in director, or null. Does NOT re-check the allowlist. */
export async function getCurrentDirector(): Promise<CurrentDirector | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return { email, name: session.user?.name ?? null };
}

/**
 * Page gate: require a signed-in, still-allowlisted director (re-checking the DB
 * enforces revocation). Redirects to /signin otherwise. Use at the top of every
 * protected server page — defense-in-depth behind the proxy redirect.
 */
export async function requireDirector(): Promise<CurrentDirector> {
  const director = await getCurrentDirector();
  if (!director || !(await isAllowedDirector(director.email))) {
    redirect("/signin");
  }
  return director;
}

/**
 * Route-handler gate. Returns the current director, or a 401 `NextResponse` to
 * return directly. Usage:
 *   const director = await apiRequireDirector();
 *   if (director instanceof NextResponse) return director;
 */
export async function apiRequireDirector(): Promise<CurrentDirector | NextResponse> {
  const director = await getCurrentDirector();
  if (!director || !(await isAllowedDirector(director.email))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return director;
}
