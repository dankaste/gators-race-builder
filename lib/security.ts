/**
 * Whether production authentication is configured. Until this is true, the app
 * has NO access control — it must not be deployed publicly with real rider data.
 * See README "Before production" for the Auth.js (Google + director allowlist)
 * setup. Auth is intentionally not enforced in local development.
 */
export function authConfigured(): boolean {
  return Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID);
}
