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
    const body = {
      messages: [
        {
          role: "user",
          content: `Team insight from ${config.developer_id}: ${insight.content}`,
        },
        {
          role: "assistant",
          content: `Noted. ${insight.content}`,
        },
      ],
      user_id: "team-shared",
      org_id: config.mem0_org_id,
      project_id: config.mem0_project_id,
      app_id: project,
      async_mode: false,
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
      body: JSON.stringify(body),
    });

    const resBody = await res.text();
    if (!res.ok) {
      console.error(`Mem0 API error for insight: ${res.status} ${resBody}`);
      continue;
    }

    console.log(`  Mem0 response: ${resBody.slice(0, 200)}`);
    pushed++;
  }

  return pushed;
}

export async function searchMem0(
  query: string,
  config: BridgeConfig,
  options?: { app_id?: string; agent_id?: string; limit?: number }
): Promise<any[]> {
  const reqBody: Record<string, any> = {
    query,
    user_id: "team-shared",
    org_id: config.mem0_org_id,
    project_id: config.mem0_project_id,
    limit: options?.limit || 10,
  };
  if (options?.app_id) reqBody.app_id = options.app_id;
  if (options?.agent_id) reqBody.agent_id = options.agent_id;

  const res = await fetch(`${MEM0_API_BASE}/memories/search/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.mem0_api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.results || [];
}
