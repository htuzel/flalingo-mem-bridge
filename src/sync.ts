import {
  loadConfig,
  getLastSyncTime,
  setLastSyncTime,
} from "./config.js";
import { fetchNewObservations, checkHealth } from "./claude-mem-client.js";
import { filterTeamWorthy } from "./filter.js";
import { pushInsightsToMem0 } from "./mem0-client.js";
import { appendFileSync } from "fs";

function log(config: { log_file: string }, level: string, msg: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(config.log_file, line + "\n");
  } catch {
    // ignore log write errors
  }
}

export async function runSync(): Promise<{
  observations: number;
  insights: number;
  pushed: number;
}> {
  const config = loadConfig();

  // 1. Check claude-mem health
  const health = await checkHealth(config.claude_mem_api);
  if (!health.ok) {
    log(
      config,
      "ERROR",
      `claude-mem not available: ${health.error}. Is Claude Code running?`
    );
    return { observations: 0, insights: 0, pushed: 0 };
  }
  log(config, "INFO", `claude-mem v${health.version} connected`);

  // 2. Validate Mem0 config
  if (!config.mem0_api_key) {
    log(config, "ERROR", "mem0_api_key not configured");
    return { observations: 0, insights: 0, pushed: 0 };
  }

  // 3. Get last sync time
  const lastSync = getLastSyncTime();
  log(config, "INFO", `Last sync: ${lastSync.toISOString()}`);

  // 4. Fetch new observations since last sync
  const observations = await fetchNewObservations(config, lastSync);
  log(config, "INFO", `Found ${observations.length} new observations`);

  if (observations.length === 0) {
    setLastSyncTime(new Date());
    return { observations: 0, insights: 0, pushed: 0 };
  }

  // 5. Group by project
  const byProject = new Map<string, typeof observations>();
  for (const obs of observations) {
    const project = obs.project || "unknown";
    if (!byProject.has(project)) byProject.set(project, []);
    byProject.get(project)!.push(obs);
  }

  let totalInsights = 0;
  let totalPushed = 0;

  // 6. Filter and push per project
  for (const [project, projectObs] of byProject) {
    log(
      config,
      "INFO",
      `Processing ${projectObs.length} observations for project: ${project}`
    );

    // Batch observations (max 20 per filter call to stay within token limits)
    const batchSize = 20;
    for (let i = 0; i < projectObs.length; i += batchSize) {
      const batch = projectObs.slice(i, i + batchSize);

      try {
        const insights = await filterTeamWorthy(batch, config);
        totalInsights += insights.length;

        if (insights.length > 0) {
          const pushed = await pushInsightsToMem0(insights, project, config);
          totalPushed += pushed;
          log(
            config,
            "INFO",
            `Project ${project}: ${insights.length} insights extracted, ${pushed} pushed to Mem0`
          );
        }
      } catch (err: any) {
        log(
          config,
          "ERROR",
          `Filter/push failed for ${project}: ${err.message}`
        );
      }
    }
  }

  // 7. Update sync time
  setLastSyncTime(new Date());

  log(
    config,
    "INFO",
    `Sync complete: ${observations.length} observations → ${totalInsights} insights → ${totalPushed} pushed to Mem0`
  );

  return {
    observations: observations.length,
    insights: totalInsights,
    pushed: totalPushed,
  };
}
