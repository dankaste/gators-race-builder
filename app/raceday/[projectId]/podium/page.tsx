import { PodiumBoard } from "@/components/raceday/PodiumBoard";

export default async function PodiumPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <PodiumBoard projectId={projectId} />;
}
