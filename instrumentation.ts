export async function register() {
  // The background sync loop touches the DB and uses setInterval — Node only,
  // and it's a no-op anyway unless RACEDAY_MODE=local (checked internally).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSyncLoop } = await import("@/lib/raceday/syncLoop");
    startSyncLoop();
  }
}
