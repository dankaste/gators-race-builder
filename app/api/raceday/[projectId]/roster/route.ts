import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRaceDayDb } from "@/db/racedayDb";
import { projects, races } from "@/db/schema";
import { apiRequireRaceDayAccess } from "@/lib/raceday-auth";
import { addWalkUpRider, toRaceDayRoster } from "@/lib/engine/raceDay";
import type { ProjectState } from "@/lib/engine/models";
import type { Rider } from "@/lib/engine/models";

const bodySchema = z.object({
  eventId: z.string(),
  id: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  categoryLabel: z.string().min(1),
  bib: z.union([z.string(), z.number()]).nullable().optional(),
});

/** Next available bib scoped to THIS project's already-assigned bibs only — see lib/engine/raceDay.ts's addWalkUpRider docs for why this is a deliberate narrowing on the hub. */
function nextBibFromRoster(riders: Rider[]): number {
  let max = 0;
  for (const r of riders) {
    const n =
      typeof r.bib === "number" ? r.bib : typeof r.bib === "string" && /^\d+$/.test(r.bib) ? Number(r.bib) : null;
    if (n != null && n > max) max = n;
  }
  return max + 1;
}

/** Walk-up registration at check-in — the one place a station writes to the roster itself. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await apiRequireRaceDayAccess(projectId, request);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, ...registration } = parsed.data;

  const db = getRaceDayDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [race] = await db.select().from(races).where(eq(races.slug, project.raceSlug));
  const event = race?.config.events.find((e) => e.id === eventId);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const state = (project.state ?? {}) as ProjectState;
  const eventState = state.events?.[eventId] ?? { riders: [] };
  const nextBib = nextBibFromRoster(eventState.riders);

  const rider = addWalkUpRider(registration, event, nextBib);
  const updatedState: ProjectState = {
    ...state,
    events: { ...state.events, [eventId]: { ...eventState, riders: [...eventState.riders, rider] } },
  };

  await db.update(projects).set({ state: updatedState, updatedAt: new Date() }).where(eq(projects.id, projectId));

  return NextResponse.json({ rider: toRaceDayRoster([rider])[0] });
}
