import { CourseWatchStation } from "@/components/raceday/CourseWatchStation";

export default async function CoursePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <CourseWatchStation projectId={projectId} />;
}
