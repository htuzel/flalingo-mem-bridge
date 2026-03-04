export { runSync } from "./sync.js";
export { loadConfig, saveConfig } from "./config.js";
export { fetchNewObservations, checkHealth } from "./claude-mem-client.js";
export { filterTeamWorthy } from "./filter.js";
export { pushInsightsToMem0, searchMem0 } from "./mem0-client.js";
export type { BridgeConfig } from "./config.js";
export type { Observation } from "./claude-mem-client.js";
export type { TeamInsight } from "./filter.js";
