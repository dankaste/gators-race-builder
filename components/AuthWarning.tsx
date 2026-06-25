import { authConfigured } from "@/lib/security";

/**
 * Loud reminder, shown on PII-bearing pages, that the app has no access control
 * configured yet. Renders nothing once Auth.js is set up.
 */
export function AuthWarning() {
  if (authConfigured()) return null;
  return (
    <div className="mt-4 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning">
      ⚠ <strong>No authentication configured.</strong> This app stores minors&rsquo; personal
      information. Do not deploy it publicly until Auth.js (Google + director allowlist) is set up —
      see the README &ldquo;Before production&rdquo; section. Local development is unaffected.
    </div>
  );
}
