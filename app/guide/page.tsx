import Link from "next/link";

export const metadata = { title: "Guide — Gators Race Director" };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-deep text-sm font-bold text-foreground">{n}</span>
      <span className="text-foreground">{children}</span>
    </li>
  );
}

export default function GuidePage() {
  return (
    <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-muted hover:text-foreground">← Home</Link>
      <h1 className="mt-2 text-3xl font-black text-foreground">Guide</h1>
      <p className="mt-2 text-muted">
        How to get the registration exports out of PlayMetrics and how to upload the start list
        to WebScorer.
      </p>

      <section id="exports" className="mt-10">
        <h2 className="text-xl font-bold text-foreground">Getting the PlayMetrics exports</h2>

        <h3 className="mt-5 font-semibold text-foreground">Registration export (required)</h3>
        <ol className="mt-3 space-y-2">
          <Step n={1}>In PlayMetrics, click <strong>Programs</strong>, then open the race (e.g. &ldquo;Swamp Dash 2026&rdquo;).</Step>
          <Step n={2}>Click <strong>Export Responses → Download CSV</strong>.</Step>
          <Step n={3}>That CSV is the <strong>registration file</strong> you upload when you create a project here.</Step>
        </ol>

        <h3 className="mt-6 font-semibold text-foreground">Player export — for bib numbers (optional but recommended)</h3>
        <ol className="mt-3 space-y-2">
          <Step n={1}>Go to <strong>Players → Rostered Players</strong>.</Step>
          <Step n={2}>Click <strong>More Actions → Export players</strong> and download the CSV.</Step>
          <Step n={3}>The <strong>Number</strong> column is each rider&rsquo;s bib/plate. Upload this as the player export so bibs and team-based seeding fill in automatically. Non-GBP riders use the 9000+ series.</Step>
        </ol>
      </section>

      <section id="webscorer" className="mt-12">
        <h2 className="text-xl font-bold text-foreground">Uploading to WebScorer</h2>
        <ol className="mt-3 space-y-2">
          <Step n={1}>In a project here, review the riders and waves, then click <strong>Export WebScorer CSV</strong>.</Step>
          <Step n={2}>Sign in to your <strong>WebScorer</strong> account.</Step>
          <Step n={3}>Go to <strong>My Start Lists</strong>, open last year&rsquo;s race, and choose <strong>&ldquo;Use as Template&rdquo;</strong>.</Step>
          <Step n={4}>Upload the file you exported and work through any <strong>warning messages</strong>.</Step>
          <Step n={5}>
            <strong>Sanity check:</strong> confirm the rider counts match, spot-check a handful of bib
            numbers (including your own kids), and have someone else double-check before finalizing.
          </Step>
        </ol>
        <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          WebScorer has no upload API, so this step is a manual file upload through their website.
          Use your own WebScorer login — credentials are intentionally not stored in this app.
        </p>
      </section>
    </main>
  );
}
