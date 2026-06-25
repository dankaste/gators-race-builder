import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedDirector } from "@/lib/directors";

/**
 * Auth.js (NextAuth v5) — Google sign-in gated by the director allowlist.
 *
 * Sessions are stateless JWTs (no adapter tables): the only persisted auth state
 * is our own `directors` table. The allowlist is enforced here in `signIn` (at
 * login) and again in the DAL on every protected request (`lib/auth-dal.ts`), so
 * revoking a director takes effect even with a still-valid JWT.
 *
 * Provider credentials are read from the env vars Auth.js infers by convention:
 * AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET, plus AUTH_SECRET.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [Google],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // Login-time gate: reject any Google account not on the allowlist.
    async signIn({ user }) {
      return await isAllowedDirector(user.email);
    },
    // Drives the proxy (optimistic redirect). Reads the JWT only — no DB.
    authorized({ auth: session }) {
      return Boolean(session?.user);
    },
  },
});
