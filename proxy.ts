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
  // clients expect JSON. API auth is enforced in each handler, not here. The
  // sign-in page, Next internals, and static metadata files are also excluded.
  matcher: ["/((?!api|signin|_next/static|_next/image|favicon.ico).*)"],
};
