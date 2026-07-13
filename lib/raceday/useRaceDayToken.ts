"use client";

import { useEffect, useState } from "react";

/**
 * Resolves the station access token: `?token=` on first visit, falling back
 * to localStorage on every subsequent load — so a station never re-prompts
 * after the first open. Read via a lazy initializer (not an effect) since
 * it's a synchronous read of external state at mount time; a separate
 * effect only handles the side effect of persisting a query-param token.
 */
export function useRaceDayToken(projectId: string): string | null {
  const [token] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const fromQuery = new URLSearchParams(window.location.search).get("token");
    return fromQuery ?? window.localStorage.getItem(`raceday:token:${projectId}`);
  });

  useEffect(() => {
    if (token) window.localStorage.setItem(`raceday:token:${projectId}`, token);
  }, [projectId, token]);

  return token;
}
