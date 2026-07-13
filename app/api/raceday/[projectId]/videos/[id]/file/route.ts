import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayFinishVideos } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

/** Streams a recorded clip's bytes for playback in the reconciliation video-review panel. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; id: string }> },
) {
  const { projectId, id } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const dataDir = process.env.RACEDAY_DATA_DIR;
  if (!dataDir) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [row] = await getRaceDayDb()
    .select()
    .from(raceDayFinishVideos)
    .where(and(eq(raceDayFinishVideos.projectId, projectId), eq(raceDayFinishVideos.id, id)));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = path.join(dataDir, "videos", row.filePath);
  const stats = await stat(filePath).catch(() => null);
  if (!stats) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stream = createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(webStream, {
    headers: { "Content-Type": "video/webm", "Content-Length": String(stats.size) },
  });
}
