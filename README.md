# @htuzel/mem-bridge

Sync engine that transfers learnings from Flalingo team's Claude Code sessions into shared team memory.

## What Does It Do?

```
Developer works with Claude Code
        ↓
claude-mem plugin automatically captures observations
  (bug fixes, patterns, architectural decisions)
        ↓
Bridge periodically reads the observations
        ↓
LLM filter selects the ones valuable for the team
        ↓
Pushes to Mem0 Platform (team-shared memory)
        ↓
Other developers + CI/CD agents use this knowledge
```

3-Layer architecture:
- **Layer 1**: [claude-mem](https://github.com/thedotmack/claude-mem) — personal session memory (local, free)
- **Layer 2**: **This package** — sync engine + LLM filter
- **Layer 3**: [Mem0 Platform](https://mem0.ai) — team memory (cloud)

## Quick Start

### 1. Prerequisites

```bash
# Bun (required for claude-mem worker)
curl -fsSL https://bun.sh/install | bash

# claude-mem plugin for Claude Code
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
# → Restart Claude Code
```

### 2. Install the Bridge

```bash
# From GitHub Packages
npm install -g @htuzel/mem-bridge

# Or from git
npm install -g git+ssh://git@github.com:htuzel/flalingo-mem-bridge.git

# Or locally
git clone git@github.com:htuzel/flalingo-mem-bridge.git
cd flalingo-mem-bridge && npm install && npm run build && npm link
```

### 3. Interactive Setup

```bash
flalingo-mem-bridge init
```

8-step interactive setup:
1. claude-mem worker check
2. Developer ID (your name in the team)
3. Mem0 credentials (API key, org ID, project ID)
4. Filter LLM provider (Anthropic / OpenAI / Google)
5. Filter model selection (default: `claude-sonnet-4-6`)
6. Filter API key
7. Repository whitelist (privacy — leave empty to sync all)
8. Config save + Mem0 MCP setup prompt

Each step explains what the parameter does, where to get it, and the expected format.

### 4. Auto-sync

```bash
flalingo-mem-bridge install-service
launchctl load ~/Library/LaunchAgents/com.flalingo.mem-bridge.plist
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Full interactive setup (bridge config + Mem0 MCP) |
| `setup-mcp` | Mem0 MCP server setup only (adds `search_memories` to Claude Code) |
| `sync` | Run manual sync |
| `status` | Show current configuration |
| `install-service` | Install macOS LaunchAgent (auto-sync) |
| `help` | Help |

## Configuration

Config file: `~/.flalingo-mem-bridge/config.json`

```jsonc
{
  "claude_mem_api": "http://localhost:37777",       // claude-mem worker
  "mem0_api_key": "m0-xxx",                         // Mem0 API key
  "mem0_org_id": "org_xxx",                          // Mem0 organization
  "mem0_project_id": "proj_xxx",                     // Mem0 project
  "developer_id": "htuzel",                          // Your name in the team
  "filter_provider": "anthropic",                    // anthropic | openai | google
  "filter_model": "claude-sonnet-4-6",               // Filter model
  "filter_api_key": "sk-ant-xxx",                    // Provider API key
  "sync_interval_minutes": 30,                       // Auto-sync interval
  "included_repos": [],                              // Whitelist (empty = all)
  "excluded_repos": [],                              // Blacklist (always applied)
  "log_file": "~/.flalingo-mem-bridge/sync.log"
}
```

### Repository Filtering

Two levels of control for privacy:

- **`included_repos`** (whitelist): If set, **only** these repos will sync. Empty = sync all.
- **`excluded_repos`** (blacklist): Always applied. These repos are never synced.

If a repo is in both lists, `excluded_repos` wins (safe by default).

```jsonc
// Example: only sync these 2 repos
"included_repos": ["flalingo-crm", "flalingo-api"],

// Example: sync all except these
"included_repos": [],
"excluded_repos": ["my-private-project"]
```

### Filter Model Options

| Provider | Model | Monthly Cost | Notes |
|----------|-------|-------------|-------|
| **Anthropic** | `claude-sonnet-4-6` | ~$5-8 | Recommended — best filtering quality |
| Anthropic | `claude-haiku-4-5-20251001` | ~$1-2 | Budget option |
| OpenAI | `gpt-4o-mini` | ~$0.50 | Cheapest |
| Google | `gemini-2.0-flash` | ~$0.30 | Cheapest |

To change model: update `filter_provider` and `filter_model` in the config.

## Flalingo Mem0 Credentials

| Parameter | Value |
|-----------|-------|
| `MEM0_ORG_ID` | `org_0mDzSo7k8lVCfxBHyKEwq8uW2pRd1T6BFADnvfkI` |
| `MEM0_PROJECT_ID` | `proj_zNNTimZn5wZiAVjbr5RSUqMgfOgWVpjtMYYRnqsZ` |
| `MEM0_API_KEY` | Get from team lead |

## Publishing (Maintainer)

### First-time publish

```bash
# 1. Create a GitHub Personal Access Token (PAT):
#    github.com → Settings → Developer settings → Personal access tokens
#    Scope: write:packages, read:packages

# 2. npm login (GitHub Packages)
npm login --registry=https://npm.pkg.github.com
# Username: github-username
# Password: ghp_YOUR_GITHUB_TOKEN
# Email: your@email.com

# 3. Build + Publish
npm run build
npm publish
```

### Version update

```bash
# Patch (1.0.0 → 1.0.1)
npm version patch

# Minor (1.0.0 → 1.1.0)
npm version minor

# Build + publish
npm publish
```

### Developer installation setup

Each developer needs to add the following to their `.npmrc`:
```
@htuzel:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_THEIR_GITHUB_TOKEN
```

Then:
```bash
npm install -g @htuzel/mem-bridge
```

## CI/CD Integration

4 workflows integrated with Mem0 team memory:

| Workflow | Fetch | Store | agent_id |
|----------|-------|-------|----------|
| `ai-coding.yml` | Before plan | After implementation | `ai-coder` |
| `ai-revision.yml` | Before plan | After PR creation | `ai-coder` |
| `codex-review.yml` | Before review | After review | `code-reviewer` |
| `docs-auto-update.yml` | Before docs update | After commit | `doc-updater` |

3 secrets must be added to GitHub repository settings:

| Secret | Value |
|--------|-------|
| `MEM0_API_KEY` | `m0-xxx...` |
| `MEM0_ORG_ID` | `org_0mDzSo7k8lVCfxBHyKEwq8uW2pRd1T6BFADnvfkI` |
| `MEM0_PROJECT_ID` | `proj_zNNTimZn5wZiAVjbr5RSUqMgfOgWVpjtMYYRnqsZ` |

Details: `turacoon/docs/team-memory/cicd-integration.md`

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Developer Workstation               │
│                                                  │
│  Claude Code ──▶ claude-mem ──▶ SQLite (local)  │
│                                    │             │
│                         flalingo-mem-bridge      │
│                         │  LLM Filter (Sonnet)  │
│                         └──────────┬─────────── │
│                                    │             │
│                      Mem0 MCP ◀────┘             │
│                     (search_memories)            │
└────────────────────────┬─────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Mem0 Platform     │
              │   (team-shared)     │
              └─────────┬───────────┘
                        │
              ┌─────────▼───────────┐
              │   CI/CD Workflows   │
              │   (fetch + store)   │
              └─────────────────────┘
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `claude-mem not available` | Start Claude Code (worker auto-starts) |
| `mem0_api_key not configured` | Run `flalingo-mem-bridge init` |
| `Filter API error` | Add `filter_api_key` to config or set `FILTER_API_KEY` env var |
| `search_memories` tool missing | Run `flalingo-mem-bridge setup-mcp` then restart Claude Code |
| Sync 0 insights | Normal — not all observations may be team-worthy |
| npm install 404 | Check if `@flalingo` registry is set in `.npmrc` |

## License

MIT — Flalingo Engineering
