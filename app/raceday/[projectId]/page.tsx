import { PickerClient } from "./picker-client";

// Deliberately public — no requireDirector. The station token IS the auth here.
export default async function RaceDayPickerPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <PickerClient projectId={projectId} />;
}
