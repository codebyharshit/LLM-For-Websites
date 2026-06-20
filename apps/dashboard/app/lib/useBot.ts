"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface Bot {
  id: string;
  name: string;
  persona: string | null;
  greeting: string | null;
  languages: string[];
  theme: Record<string, unknown>;
}

/** Loads the tenant's bot once so pages never ask the user for a Bot ID. */
export function useBot(): { bot: Bot | null; loading: boolean; error: string | null; reload: () => void } {
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    api<Bot[]>("/bot")
      .then((bots) => {
        setBot(bots[0] ?? null);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load your bot."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);
  return { bot, loading, error, reload };
}
