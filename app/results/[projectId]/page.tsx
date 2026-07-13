import { ResultsClient } from "./results-client";

// Deliberately public — no auth of any kind, per the plan's privacy posture
// (no PII beyond name/bib/category, same as every other race-day surface).
export default async function PublicResultsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ResultsClient projectId={projectId} />;
}
