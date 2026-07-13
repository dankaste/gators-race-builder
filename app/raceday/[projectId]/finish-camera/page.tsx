import { FinishCameraStation } from "@/components/raceday/FinishCameraStation";

export default async function FinishCameraPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <FinishCameraStation projectId={projectId} />;
}
