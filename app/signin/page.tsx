import { SignInButton } from "@/components/SignInButton";

export const metadata = { title: "Sign in — Gators Race Director" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  // Auth.js sends `AccessDenied` when the `signIn` callback rejects a non-allowlisted account.
  const denied = error === "AccessDenied";

  return (
    <main className="flex-1 grid place-items-center px-6 py-16">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 text-center">
        <h1 className="text-2xl font-black text-foreground">Gators Race Director</h1>
        <p className="mt-2 text-sm text-muted">
          Director access only. Sign in with your Google account.
        </p>

        {error && (
          <p className="mt-6 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
            {denied
              ? "That account isn’t on the director allowlist. Ask an existing director to add you."
              : "Sign-in failed. Please try again."}
          </p>
        )}

        <div className="mt-8 flex justify-center">
          <SignInButton callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
