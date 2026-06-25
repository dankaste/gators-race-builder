import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-20 text-center">
      <h1 className="text-2xl font-black text-foreground">Not found</h1>
      <p className="mt-2 text-muted">That page or project doesn&rsquo;t exist.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-brand px-5 py-2.5 font-semibold text-foreground hover:bg-brand-strong">
        Home
      </Link>
    </main>
  );
}
