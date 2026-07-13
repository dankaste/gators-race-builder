import { CheckInStation } from "@/components/raceday/CheckInStation";

export default async function CheckInPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <CheckInStation projectId={projectId} />;
}
