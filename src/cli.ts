import { saveConfig, loadConfig, ensureConfigDir, CONFIG_PATH } from "./config.js";
import { checkHealth } from "./claude-mem-client.js";
import { runSync } from "./sync.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { createInterface } from "readline";

const args = process.argv.slice(2);
const command = args[0] || "help";

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function init(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║    Flalingo Mem Bridge — Interactive Setup       ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  ensureConfigDir();

  // Check claude-mem
  console.log("[1/8] Checking claude-mem worker...");
  const health = await checkHealth("http://localhost:37777");
  if (health.ok) {
    console.log(`  OK — claude-mem v${health.version} running\n`);
  } else {
    console.log("  WARNING — claude-mem not running.");
    console.log("  Start Claude Code first, then re-run init.\n");
  }

  // Developer ID
  console.log("[2/8] Developer Identity");
  console.log("  Your unique developer ID. Used as 'author' when sharing");
  console.log("  insights with the team. Example: htuzel, ali, mehmet\n");
  const developerId = await prompt("  Developer ID: ");

  // Mem0 credentials
  console.log("\n[3/8] Mem0 Platform Credentials");
  console.log("  Get these from https://app.mem0.ai → Settings → API Keys");
  console.log("  These connect the bridge to your team's shared memory.\n");

  console.log("  API Key — authenticates requests to Mem0 (starts with m0-)");
  const mem0ApiKey = await prompt("  Mem0 API Key: ");

  console.log("\n  Org ID — your Mem0 organization (starts with org_)");
  const mem0OrgId = await prompt("  Mem0 Org ID: ");

  console.log("\n  Project ID — the project to store memories in (starts with proj_)");
  const mem0ProjectId = await prompt("  Mem0 Project ID: ");

  // Filter provider
  console.log("\n[4/8] Filter LLM Provider");
  console.log("  The bridge uses an LLM to decide which observations are");
  console.log("  worth sharing with the team. Choose a provider:\n");
  console.log("  anthropic  — Haiku 4.5 (default, fast, ~$1-2/mo)");
  console.log("  openai     — GPT-4o mini (cheapest, ~$0.50/mo)");
  console.log("  google     — Gemini 2.0 Flash (very cheap, ~$0.30/mo)\n");
  const filterProvider = (await prompt(
    "  Provider [anthropic]: "
  )) as any || "anthropic";

  // Filter model
  console.log("\n[5/8] Filter Model");
  const defaultModels: Record<string, string> = {
    anthropic: "claude-haiku-4-5-20251001",
    openai: "gpt-4o-mini",
    google: "gemini-2.0-flash",
  };
  const defaultModel = defaultModels[filterProvider] || "claude-haiku-4-5-20251001";
  console.log(`  Model ID for ${filterProvider}. Default: ${defaultModel}\n`);
  const filterModel = (await prompt(
    `  Model [${defaultModel}]: `
  )) || defaultModel;

  // Filter API key
  console.log("\n[6/8] Filter API Key");
  console.log(`  API key for ${filterProvider} to run the filter LLM.`);
  if (filterProvider === "anthropic") {
    console.log("  For Anthropic: starts with sk-ant-");
    console.log("  Get it from: https://console.anthropic.com/settings/keys");
  } else if (filterProvider === "openai") {
    console.log("  For OpenAI: starts with sk-");
    console.log("  Get it from: https://platform.openai.com/api-keys");
  } else if (filterProvider === "google") {
    console.log("  For Google: starts with AIza");
    console.log("  Get it from: https://aistudio.google.com/apikey");
  }
  console.log("  You can also set FILTER_API_KEY env var instead.\n");
  const filterApiKey = await prompt(
    "  Filter API Key: "
  );

  if (!filterApiKey && !process.env.FILTER_API_KEY) {
    console.log("\n  WARNING — No filter API key provided.");
    console.log("  Bridge sync will fail without it.");
    console.log("  Set it later in config or as FILTER_API_KEY env var.");
  }

  // Repository whitelist
  console.log("\n[7/8] Repository Whitelist (Privacy)");
  console.log("  If you want to sync ONLY specific repos, list them here.");
  console.log("  Leave empty to sync all repos (default).");
  console.log("  Comma-separated. Example: flalingo-crm, flalingo-api\n");
  const includedReposInput = await prompt("  Included repos (empty = all): ");
  const includedRepos = includedReposInput
    ? includedReposInput.split(",").map((r) => r.trim()).filter(Boolean)
    : [];

  saveConfig({
    developer_id: developerId,
    mem0_api_key: mem0ApiKey,
    mem0_org_id: mem0OrgId,
    mem0_project_id: mem0ProjectId,
    filter_provider: filterProvider,
    filter_model: filterModel,
    filter_api_key: filterApiKey,
    included_repos: includedRepos,
  });

  console.log(`\n[8/8] Config saved to ${CONFIG_PATH}`);

  // Offer to setup Mem0 MCP
  console.log("\n────────────────────────────────────────────────");
  const setupMcp = await prompt(
    "Also set up Mem0 MCP for Claude Code? (Y/n): "
  );
  if (!setupMcp || setupMcp.toLowerCase() === "y" || setupMcp.toLowerCase() === "yes") {
    await setupMem0Mcp(mem0ApiKey, mem0OrgId, mem0ProjectId, developerId);
  }

  console.log("\n────────────────────────────────────────────────");
  console.log("Setup complete! Next steps:\n");
  console.log("  1. Test sync:         flalingo-mem-bridge sync");
  console.log("  2. Auto-sync (cron):  flalingo-mem-bridge install-service");
  console.log("  3. Check status:      flalingo-mem-bridge status");
}

async function setupMem0Mcp(
  apiKey?: string,
  orgId?: string,
  projectId?: string,
  userId?: string
): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║    Mem0 MCP Server — Claude Code Integration     ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log("This step adds the 'search_memories' tool to Claude Code.");
  console.log("This allows you to search and use team memory");
  console.log("during your Claude Code sessions.\n");

  // Try to load existing config for defaults
  let existingConfig: ReturnType<typeof loadConfig> | null = null;
  try {
    existingConfig = loadConfig();
  } catch {
    // No existing config, use params or ask
  }

  // API Key
  const defaultApiKey = apiKey || existingConfig?.mem0_api_key || "";
  if (!defaultApiKey) {
    console.log("[1/4] Mem0 API Key");
    console.log("  API key required to access Mem0 Platform.");
    console.log("  https://app.mem0.ai → Settings → API Keys");
    console.log("  Format: m0-xxxxxxxxxxxx\n");
  }
  const finalApiKey = defaultApiKey || await prompt("  Mem0 API Key (m0-...): ");

  // Org ID
  const defaultOrgId = orgId || existingConfig?.mem0_org_id || "";
  if (!defaultOrgId) {
    console.log("\n[2/4] Mem0 Organization ID");
    console.log("  Your team's organization ID on Mem0.");
    console.log("  https://app.mem0.ai → Organization → Settings");
    console.log("  Format: org_xxxxxxxxxxxx\n");
  }
  const finalOrgId = defaultOrgId || await prompt("  Mem0 Org ID (org_...): ");

  // Project ID
  const defaultProjectId = projectId || existingConfig?.mem0_project_id || "";
  if (!defaultProjectId) {
    console.log("\n[3/4] Mem0 Project ID");
    console.log("  The project ID where memories are stored.");
    console.log("  https://app.mem0.ai → Project → Settings");
    console.log("  Format: proj_xxxxxxxxxxxx\n");
  }
  const finalProjectId = defaultProjectId || await prompt("  Mem0 Project ID (proj_...): ");

  // User ID
  const defaultUserId = userId || existingConfig?.developer_id || "";
  if (!defaultUserId) {
    console.log("\n[4/4] User ID");
    console.log("  Your identity in Claude Code.");
    console.log("  Example: htuzel, ali, mehmet\n");
  }
  const finalUserId = defaultUserId || await prompt("  User ID: ");

  // Validate inputs
  if (!finalApiKey || !finalOrgId || !finalProjectId || !finalUserId) {
    console.error("\n  ERROR — All fields are required.");
    process.exit(1);
  }

  // Check if claude CLI is available
  try {
    execSync("which claude", { stdio: "pipe" });
  } catch {
    console.error("\n  ERROR — 'claude' CLI not found.");
    console.error("  Make sure Claude Code is installed and available in PATH.");
    process.exit(1);
  }

  // Remove existing mem0 MCP if present
  console.log("\n  Checking existing mem0 MCP configuration...");
  try {
    execSync("claude mcp remove mem0 -s user 2>/dev/null", { stdio: "pipe" });
    console.log("  Previous configuration removed.");
  } catch {
    // No existing config to remove
  }

  // Add Mem0 MCP server
  console.log("  Adding Mem0 MCP server...\n");

  const mcpCmd = [
    "claude", "mcp", "add", "--scope", "user", "mem0",
    "-e", `MEM0_API_KEY=${finalApiKey}`,
    "-e", `MEM0_ORG_ID=${finalOrgId}`,
    "-e", `MEM0_PROJECT_ID=${finalProjectId}`,
    "-e", `USER_ID=${finalUserId}`,
    "--", "npx", "-y", "@mem0/mcp-server",
  ].join(" ");

  try {
    execSync(mcpCmd, { stdio: "inherit" });
    console.log("\n  Mem0 MCP server added successfully!");
  } catch (err: any) {
    console.error(`\n  ERROR — Failed to add MCP: ${err.message}`);
    console.error("  To add manually:");
    console.error(`  ${mcpCmd}`);
    process.exit(1);
  }

  // Verify
  console.log("\n  Verifying...");
  try {
    const verifyOutput = execSync("claude mcp get mem0", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (verifyOutput.includes("mem0")) {
      console.log("  OK — Mem0 MCP configuration verified.");
    }
  } catch {
    console.log("  WARNING — Verification failed. Restart Claude Code.");
  }

  console.log("\n  Usage:");
  console.log("  Use the 'search_memories' tool in your Claude Code sessions");
  console.log("  to search team memory. Examples:");
  console.log("    - 'What does the team know about this repo?'");
  console.log("    - 'Similar bug fixes'");
  console.log("    - 'Payment service API patterns'");
}

async function sync(): Promise<void> {
  try {
    const result = await runSync();
    if (
      result.observations === 0 &&
      result.insights === 0 &&
      result.pushed === 0
    ) {
      console.log("Nothing to sync.");
    }
  } catch (err: any) {
    console.error(`Sync failed: ${err.message}`);
    process.exit(1);
  }
}

function status(): void {
  try {
    const config = loadConfig();
    console.log("Flalingo Mem Bridge — Status\n");
    console.log(`Config: ${CONFIG_PATH}`);
    console.log(`Developer: ${config.developer_id}`);
    console.log(`Filter: ${config.filter_provider}/${config.filter_model}`);
    console.log(`claude-mem API: ${config.claude_mem_api}`);
    console.log(`Mem0 API key: ${config.mem0_api_key ? "***configured***" : "NOT SET"}`);
    console.log(`Included repos: ${config.included_repos.length > 0 ? config.included_repos.join(", ") : "(all)"}`);
    console.log(`Excluded repos: ${config.excluded_repos.length > 0 ? config.excluded_repos.join(", ") : "(none)"}`);
    console.log(`Log: ${config.log_file}`);
  } catch (err: any) {
    console.error(err.message);
  }
}

function installService(): void {
  const plistName = "com.flalingo.mem-bridge";
  const plistPath = join(
    homedir(),
    "Library",
    "LaunchAgents",
    `${plistName}.plist`
  );

  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch {
    console.error("Run 'flalingo-mem-bridge init' first.");
    process.exit(1);
    return;
  }

  const interval = config.sync_interval_minutes * 60;

  // Resolve compiled cli.js path
  const cliPath = join(import.meta.dirname || ".", "cli.js");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistName}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${cliPath}</string>
    <string>sync</string>
  </array>
  <key>StartInterval</key>
  <integer>${interval}</integer>
  <key>StandardOutPath</key>
  <string>${config.log_file}</string>
  <key>StandardErrorPath</key>
  <string>${config.log_file}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>`;

  writeFileSync(plistPath, plist);
  console.log(`LaunchAgent plist written to: ${plistPath}`);
  console.log(`\nTo activate:`);
  console.log(`  launchctl load ${plistPath}`);
  console.log(`\nTo deactivate:`);
  console.log(`  launchctl unload ${plistPath}`);
  console.log(`\nSync interval: every ${config.sync_interval_minutes} minutes`);
}

function help(): void {
  console.log(`
Flalingo Mem Bridge — Sync claude-mem observations to Mem0 team memory

Commands:
  init              Interactive setup (bridge config + optional MCP setup)
  setup-mcp         Set up Mem0 MCP server for Claude Code (interactive)
  sync              Run sync now (fetch observations → filter → push to Mem0)
  status            Show current configuration
  install-service   Install macOS LaunchAgent for automatic sync
  help              Show this help

Examples:
  flalingo-mem-bridge init          # Full setup (bridge + MCP)
  flalingo-mem-bridge setup-mcp     # Only Mem0 MCP for Claude Code
  flalingo-mem-bridge sync          # Manual sync
  flalingo-mem-bridge install-service   # Auto-sync every 30 min
`);
}

// Route commands
switch (command) {
  case "init":
    init();
    break;
  case "setup-mcp":
    setupMem0Mcp();
    break;
  case "sync":
    sync();
    break;
  case "status":
    status();
    break;
  case "install-service":
    installService();
    break;
  case "help":
  default:
    help();
    break;
}
