// Next.js 16 renamed `middleware` → `proxy` (Node.js runtime by default).
// This is the OPTIMISTIC gate: it redirects unauthenticated visitors to /signin
// using the JWT only (no DB). The authoritative allowlist + revocation check
// runs in the Data Access Layer on every protected page and route handler
// (see lib/auth-dal.ts). Auth.js's `authorized` callback decides; an
// unauthenticated request is redirected to `pages.signIn` with a callbackUrl.
export { auth as proxy } from "@/auth";

export const config = {
  // Run on pages only. ALL of /api is excluded so route handlers return a clean
  // JSON 401 (via apiRequireDirector) instead of an HTML redirect — `fetch`
  // clients expect JSON. The sign-in page, Next internals, and static metadata
  // files are also excluded. `/raceday` and `/results` are deliberately
  // excluded too: those pages are public — `/raceday` stations are gated by
  // their own bearer token (`apiRequireRaceDayAccess`, checked client-side
  // against the API), and `/results` is genuinely unauthenticated (no token
  // at all) — this proxy would otherwise bounce every volunteer's device, or
  // every parent looking up results, to /signin first.
  matcher: ["/((?!api|signin|raceday|results|_next/static|_next/image|favicon.ico).*)"],
};
