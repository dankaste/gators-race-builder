"use client";

// Global error boundary. Deliberately does not render error details (which could
// contain rider data) — just a recovery action.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-20 text-center">
      <h1 className="text-2xl font-black text-foreground">Something went wrong</h1>
      <p className="mt-2 text-muted">An unexpected error occurred. Your saved work is unaffected.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong"
      >
        Try again
      </button>
    </main>
  );
}
