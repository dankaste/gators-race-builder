import { NextResponse } from "next/server";
import { removeDirector } from "@/lib/directors";
import { apiRequireDirector } from "@/lib/auth-dal";

export async function DELETE(_req: Request, { params }: { params: Promise<{ email: string }> }) {
  const director = await apiRequireDirector();
  if (director instanceof NextResponse) return director;

  const { email } = await params;
  try {
    await removeDirector(decodeURIComponent(email));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
