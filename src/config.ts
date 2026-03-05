import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface BridgeConfig {
  claude_mem_api: string;
  claude_mem_sqlite: string;
  mem0_api_key: string;
  mem0_org_id: string;
  mem0_project_id: string;
  developer_id: string;
  filter_provider: "anthropic" | "openai" | "google";
  filter_model: string;
  filter_api_key: string;
  sync_interval_minutes: number;
  included_repos: string[];
  excluded_repos: string[];
  log_file: string;
}

const CONFIG_DIR = join(homedir(), ".flalingo-mem-bridge");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const SYNC_STATE_PATH = join(CONFIG_DIR, "sync-state.json");

const DEFAULTS: BridgeConfig = {
  claude_mem_api: "http://localhost:37777",
  claude_mem_sqlite: join(homedir(), ".claude-mem", "claude-mem.db"),
  mem0_api_key: "",
  mem0_org_id: "",
  mem0_project_id: "",
  developer_id: "",
  filter_provider: "anthropic",
  filter_model: "claude-haiku-4-5-20251001",
  filter_api_key: "",
  sync_interval_minutes: 30,
  included_repos: [],
  excluded_repos: [],
  log_file: join(CONFIG_DIR, "sync.log"),
};

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): BridgeConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config not found at ${CONFIG_PATH}. Run 'flalingo-mem-bridge init' first.`
    );
  }

  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  return { ...DEFAULTS, ...raw };
}

export function saveConfig(config: Partial<BridgeConfig>): void {
  ensureConfigDir();
  const existing = existsSync(CONFIG_PATH)
    ? JSON.parse(readFileSync(CONFIG_PATH, "utf-8"))
    : {};
  const merged = { ...DEFAULTS, ...existing, ...config };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

export function getLastSyncTime(): Date {
  ensureConfigDir();
  if (!existsSync(SYNC_STATE_PATH)) {
    return new Date(0);
  }
  const state = JSON.parse(readFileSync(SYNC_STATE_PATH, "utf-8"));
  return new Date(state.last_sync || 0);
}

export function setLastSyncTime(time: Date): void {
  ensureConfigDir();
  writeFileSync(
    SYNC_STATE_PATH,
    JSON.stringify({ last_sync: time.toISOString() })
  );
}

export { CONFIG_DIR, CONFIG_PATH };
