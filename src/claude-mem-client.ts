import type { BridgeConfig } from "./config.js";

export interface Observation {
  id: number;
  memory_session_id: string;
  project: string;
  text: string | null;
  type: string;
  title: string | null;
  subtitle: string | null;
  facts: string | null;
  narrative: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  created_at: string;
  created_at_epoch: number;
}

export interface ObservationsResponse {
  items: Observation[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export async function fetchNewObservations(
  config: BridgeConfig,
  since: Date
): Promise<Observation[]> {
  const allItems: Observation[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`${config.claude_mem_api}/api/observations`);
    url.searchParams.set("since", since.toISOString());
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(
        `claude-mem API error: ${res.status} ${await res.text()}`
      );
    }

    const data: ObservationsResponse = await res.json();
    allItems.push(...data.items);
    hasMore = data.hasMore;
    offset += limit;
  }

  // Filter repos: whitelist (included) then blacklist (excluded)
  return allItems.filter((obs) => {
    if (config.included_repos.length > 0) {
      if (!config.included_repos.includes(obs.project)) return false;
    }
    return !config.excluded_repos.includes(obs.project);
  });
}

export async function checkHealth(
  apiUrl: string
): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const res = await fetch(`${apiUrl}/api/health`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: data.status === "ok", version: data.version };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
