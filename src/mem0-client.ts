import type { BridgeConfig } from "./config.js";
import type { TeamInsight } from "./filter.js";

const MEM0_API_BASE = "https://api.mem0.ai/v1";

interface Mem0Memory {
  messages: { role: string; content: string }[];
  user_id?: string;
  agent_id?: string;
  app_id?: string;
  run_id?: string;
  metadata?: Record<string, any>;
}

export async function pushInsightsToMem0(
  insights: TeamInsight[],
  project: string,
  config: BridgeConfig
): Promise<number> {
  let pushed = 0;

  for (const insight of insights) {
    const memory: Mem0Memory = {
      messages: [
        {
          role: "assistant",
          content: insight.content,
        },
      ],
      user_id: "team-shared",
      app_id: project,
      metadata: {
        author: config.developer_id,
        source: "claude-mem-bridge",
        type: insight.type,
        files: insight.related_files.join(", "),
        source_observation_ids: insight.source_observation_ids.join(","),
      },
    };

    const res = await fetch(`${MEM0_API_BASE}/memories/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${config.mem0_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(memory),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Mem0 API error for insight: ${res.status} ${body}`);
      continue;
    }

    pushed++;
  }

  return pushed;
}

export async function searchMem0(
  query: string,
  config: BridgeConfig,
  options?: { app_id?: string; agent_id?: string; limit?: number }
): Promise<any[]> {
  const body: Record<string, any> = {
    query,
    user_id: "team-shared",
    limit: options?.limit || 10,
  };
  if (options?.app_id) body.app_id = options.app_id;
  if (options?.agent_id) body.agent_id = options.agent_id;

  const res = await fetch(`${MEM0_API_BASE}/memories/search/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.mem0_api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.results || [];
}
