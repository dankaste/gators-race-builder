import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayFinishVideos } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";

/**
 * Registers a finished recording: the video bytes are written straight to
 * the hub's local disk under RACEDAY_DATA_DIR/videos/ (never a DB blob, never
 * synced to the cloud — see RACEDAY.md). Only meaningful when running as the
 * hub; there's no reason to record/store finish-line video in cloud mode.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const dataDir = process.env.RACEDAY_DATA_DIR;
  if (!dataDir) {
    return NextResponse.json({ error: "Video storage is only available on the race-day hub." }, { status: 400 });
  }

  const form = await request.formData();
  const eventId = form.get("eventId");
  const device = form.get("device");
  const startedAt = form.get("startedAt");
  const durationSeconds = form.get("durationSeconds");
  const file = form.get("file");

  if (
    typeof eventId !== "string" ||
    typeof startedAt !== "string" ||
    typeof durationSeconds !== "string" ||
    !(file instanceof Blob)
  ) {
    return NextResponse.json({ error: "eventId, startedAt, durationSeconds, and file are required" }, { status: 400 });
  }

  const videosDir = path.join(dataDir, "videos");
  await mkdir(videosDir, { recursive: true });
  const fileName = `${randomUUID()}.webm`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(videosDir, fileName), bytes);

  const [row] = await getRaceDayDb()
    .insert(raceDayFinishVideos)
    .values({
      projectId,
      eventId,
      device: typeof device === "string" ? device : undefined,
      startedAt: new Date(startedAt),
      durationSeconds: Number(durationSeconds),
      filePath: fileName,
      fileSizeBytes: bytes.byteLength,
    })
    .returning();

  return NextResponse.json({ ok: true, id: row.id });
}

/** Lists saved clip metadata for an event — used by reconciliation's "check against camera" affordance. */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  const rows = await getRaceDayDb()
    .select()
    .from(raceDayFinishVideos)
    .where(and(eq(raceDayFinishVideos.projectId, projectId), eq(raceDayFinishVideos.eventId, eventId)));

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      durationSeconds: r.durationSeconds,
    })),
  );
}
