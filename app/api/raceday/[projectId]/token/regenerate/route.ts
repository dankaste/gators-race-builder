import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getRaceDayDb } from "@/db/racedayDb";
import { raceDayTokens } from "@/db/schema";
import { apiRequireDirector } from "@/lib/auth-dal";

/** Rotates the project's token, invalidating every previously-shared station link. Director-only. */
export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const { projectId } = await params;
  const token = randomBytes(32).toString("base64url");

  await getRaceDayDb()
    .insert(raceDayTokens)
    .values({ projectId, token, createdByEmail: director.email })
    .onConflictDoUpdate({
      target: raceDayTokens.projectId,
      set: { token, createdByEmail: director.email, createdAt: new Date() },
    });

  return NextResponse.json({ token });
}
