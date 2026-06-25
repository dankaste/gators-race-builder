import Link from "next/link";
import { getCurrentDirector } from "@/lib/auth-dal";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Top navigation, shown only to a signed-in director. Hidden on the sign-in
 * page (where there is no session), so the layout stays clean for sign-in.
 */
export async function AppHeader() {
  const director = await getCurrentDirector();
  if (!director) return null;

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="font-bold text-foreground">
            Gators
          </Link>
          <Link href="/projects" className="text-muted hover:text-foreground">
            Projects
          </Link>
          <Link href="/config" className="text-muted hover:text-foreground">
            Races
          </Link>
          <Link href="/directors" className="text-muted hover:text-foreground">
            Directors
          </Link>
          <Link href="/guide" className="text-muted hover:text-foreground">
            Guide
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">{director.name ?? director.email}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
