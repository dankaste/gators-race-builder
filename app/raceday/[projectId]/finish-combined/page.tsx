import { FinishLineStation } from "@/components/raceday/FinishLineStation";

export default async function FinishCombinedPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <FinishLineStation projectId={projectId} />;
}
