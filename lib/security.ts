/**
 * Deploy-readiness helper. Auth is enforced at runtime (see `auth.ts`,
 * `proxy.ts`, and `lib/auth-dal.ts`); this reports whether the production auth
 * env is configured, for setup checks/diagnostics. Without these vars Google
 * sign-in cannot work and no one can sign in.
 */
export function authConfigured(): boolean {
  return Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID);
}
