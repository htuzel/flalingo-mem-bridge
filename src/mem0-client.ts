import type { BridgeConfig } from "./config.js";
import type { TeamInsight } from "./filter.js";

const MEM0_API_BASE = "https://api.mem0.ai/v1";
const MEM0_INTERNAL_BASE = "https://api.mem0.ai";

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

type CategoryEntry = Record<string, string>;

function projectUrl(config: BridgeConfig): string {
  return `${MEM0_INTERNAL_BASE}/api/v1/orgs/organizations/${config.mem0_org_id}/projects/${config.mem0_project_id}/`;
}

async function getProjectCategories(
  config: BridgeConfig
): Promise<CategoryEntry[]> {
  const res = await fetch(projectUrl(config), {
    method: "GET",
    headers: {
      Authorization: `Token ${config.mem0_api_key}`,
    },
  });

  if (!res.ok) {
    console.error(`Failed to fetch project categories: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.custom_categories || [];
}

export async function ensureCategories(
  config: BridgeConfig,
  repos: string[],
  developers: string[]
): Promise<void> {
  const existing = await getProjectCategories(config);
  const existingKeys = new Set(existing.flatMap((entry) => Object.keys(entry)));

  const newEntries: CategoryEntry[] = [];

  for (const repo of repos) {
    const key = `repo_${repo.replace(/-/g, "_")}`;
    if (!existingKeys.has(key)) {
      newEntries.push({ [key]: `Insights from the ${repo} repository` });
    }
  }

  for (const dev of developers) {
    const key = `developer_${dev.replace(/-/g, "_")}`;
    if (!existingKeys.has(key)) {
      newEntries.push({ [key]: `Insights authored by developer ${dev}` });
    }
  }

  if (newEntries.length === 0) {
    return;
  }

  const merged = [...existing, ...newEntries];

  const res = await fetch(projectUrl(config), {
    method: "PATCH",
    headers: {
      Authorization: `Token ${config.mem0_api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ custom_categories: merged }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Failed to update categories: ${res.status} ${body}`);
    return;
  }

  const added = newEntries.map((e) => Object.keys(e)[0]).join(", ");
  console.log(`[INFO] Updated Mem0 categories: added ${added}`);
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
