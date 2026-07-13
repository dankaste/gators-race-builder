import { StartLineStation } from "@/components/raceday/StartLineStation";

export default async function StartLinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <StartLineStation projectId={projectId} />;
}
