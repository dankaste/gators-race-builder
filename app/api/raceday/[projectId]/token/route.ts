import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayTokens } from "@/db/schema";
import { apiRequireDirector } from "@/lib/auth-dal";

/** Fetch (creating if absent) the one active token for a project. Director-only. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const { projectId } = await params;
  const db = getRaceDayDb();

  const [existing] = await db.select().from(raceDayTokens).where(eq(raceDayTokens.projectId, projectId));
  if (existing) return NextResponse.json({ token: existing.token });

  const token = randomBytes(32).toString("base64url");
  await db.insert(raceDayTokens).values({ projectId, token, createdByEmail: director.email });
  return NextResponse.json({ token });
}
