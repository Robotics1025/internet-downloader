import { useCallback, useEffect, useState } from "react";

import { getApiBase } from "../api-port";

export type Theme = "light" | "dark" | "system";
export type Quality = "best" | "1080p" | "720p" | "480p" | "audio";

export type Settings = {
  download_dir: string;
  max_parallel: number;
  default_quality: Quality;
  theme: Theme;
  language: string;
  auto_start_downloads: boolean;
};

export type SettingsPatch = Partial<Settings>;

type State = {
  data: Settings | null;
  loading: boolean;
  error: Error | null;
};

export function useSettings() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  const fetchOnce = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(`${getApiBase()}/api/settings`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as Settings;
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: err as Error });
    }
  }, []);

  useEffect(() => { void fetchOnce(); }, [fetchOnce]);

  const update = useCallback(
    async (patch: SettingsPatch): Promise<Settings | null> => {
      try {
        const r = await fetch(`${getApiBase()}/api/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Settings;
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        setState((s) => ({ ...s, error: err as Error }));
        return null;
      }
    },
    [],
  );

  return { ...state, update, refetch: fetchOnce };
}
