import { NextResponse } from "next/server";
import { apiRequireDirector } from "@/lib/auth-dal";
import { syncDown, syncUp } from "@/lib/raceday/sync";
import { getSyncStatus } from "@/lib/raceday/syncLoop";

/** Current sync status for the Sync panel's badge. Director-only. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const { projectId } = await params;
  return NextResponse.json(getSyncStatus(projectId));
}

/** "Sync now" — forces an immediate push+pull rather than waiting for the next background tick. */
export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const { projectId } = await params;
  try {
    await syncUp(projectId);
    await syncDown(projectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
