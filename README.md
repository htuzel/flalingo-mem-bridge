# @flalingo/mem-bridge

Flalingo ekibinin Claude Code session'larından öğrendiklerini takım hafızasına aktaran sync engine.

## Ne İşe Yarar?

```
Developer Claude Code ile çalışır
        ↓
claude-mem plugin otomatik olarak observation'lar yakalar
  (bug çözümleri, pattern'ler, mimari kararlar)
        ↓
Bridge periyodik olarak observation'ları okur
        ↓
LLM filtresi takım için değerli olanları seçer
        ↓
Mem0 Platform'a push eder (team-shared memory)
        ↓
Diğer developer'lar + CI/CD agent'ları bu bilgiyi kullanır
```

3-Layer mimari:
- **Layer 1**: [claude-mem](https://github.com/thedotmack/claude-mem) — kişisel session hafızası (lokal, free)
- **Layer 2**: **Bu paket** — sync engine + LLM filter
- **Layer 3**: [Mem0 Platform](https://mem0.ai) — takım hafızası (cloud)

## Quick Start

### 1. Gereksinimler

```bash
# Bun (claude-mem worker için)
curl -fsSL https://bun.sh/install | bash

# Claude Code'da claude-mem plugin
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
# → Claude Code'u restart edin
```

### 2. Bridge kurulumu

```bash
# GitHub Packages'tan
npm install -g @flalingo/mem-bridge

# Veya git'ten
npm install -g git+ssh://git@github.com:htuzel/flalingo-mem-bridge.git

# Veya lokal
git clone git@github.com:htuzel/flalingo-mem-bridge.git
cd flalingo-mem-bridge && npm install && npm run build && npm link
```

### 3. Interactive setup

```bash
flalingo-mem-bridge init
```

7 adımlık interaktif kurulum:
1. claude-mem worker kontrolü
2. Developer ID (takımdaki isminiz)
3. Mem0 credentials (API key, org ID, project ID)
4. Filter LLM provider (Anthropic / OpenAI / Google)
5. Filter model seçimi (default: `claude-sonnet-4-6`)
6. Filter API key
7. Config kaydı + Mem0 MCP kurulumu teklifi

Her adımda parametrenin ne işe yaradığı, nereden alınacağı ve formatı açıklanır.

### 4. Auto-sync

```bash
flalingo-mem-bridge install-service
launchctl load ~/Library/LaunchAgents/com.flalingo.mem-bridge.plist
```

## CLI Komutları

| Komut | Açıklama |
|-------|----------|
| `init` | Full interaktif kurulum (bridge config + Mem0 MCP) |
| `setup-mcp` | Sadece Mem0 MCP server kurulumu (Claude Code'a `search_memories` ekler) |
| `sync` | Manuel sync çalıştır |
| `status` | Mevcut konfigürasyonu göster |
| `install-service` | macOS LaunchAgent kur (otomatik sync) |
| `help` | Yardım |

## Konfigürasyon

Config dosyası: `~/.flalingo-mem-bridge/config.json`

```jsonc
{
  "claude_mem_api": "http://localhost:37777",       // claude-mem worker
  "mem0_api_key": "m0-xxx",                         // Mem0 API key
  "mem0_org_id": "org_xxx",                          // Mem0 organization
  "mem0_project_id": "proj_xxx",                     // Mem0 project
  "developer_id": "htuzel",                          // Takımdaki isminiz
  "filter_provider": "anthropic",                    // anthropic | openai | google
  "filter_model": "claude-sonnet-4-6",               // Filtreleme modeli
  "filter_api_key": "sk-ant-xxx",                    // Provider API key
  "sync_interval_minutes": 30,                       // Auto-sync aralığı
  "excluded_repos": [],                              // Atlanacak repolar
  "log_file": "~/.flalingo-mem-bridge/sync.log"
}
```

### Filter Model Seçenekleri

| Provider | Model | Aylık Maliyet | Not |
|----------|-------|--------------|-----|
| **Anthropic** | `claude-sonnet-4-6` | ~$5-8 | Önerilen — en iyi filtreleme |
| Anthropic | `claude-haiku-4-5-20251001` | ~$1-2 | Budget |
| OpenAI | `gpt-4o-mini` | ~$0.50 | En ucuz |
| Google | `gemini-2.0-flash` | ~$0.30 | En ucuz |

Model değiştirmek: config'de `filter_provider` ve `filter_model`'i değiştirin.

## Flalingo Mem0 Credentials

| Parametre | Değer |
|-----------|-------|
| `MEM0_ORG_ID` | `org_0mDzSo7k8lVCfxBHyKEwq8uW2pRd1T6BFADnvfkI` |
| `MEM0_PROJECT_ID` | `proj_zNNTimZn5wZiAVjbr5RSUqMgfOgWVpjtMYYRnqsZ` |
| `MEM0_API_KEY` | Takım liderinden alın |

## Publish (Maintainer)

### İlk kez publish

```bash
# 1. GitHub Personal Access Token (PAT) oluşturun:
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

### Versiyon güncelleme

```bash
# Patch (1.0.0 → 1.0.1)
npm version patch

# Minor (1.0.0 → 1.1.0)
npm version minor

# Build + publish
npm publish
```

### Developer'ların kurulumu için

Her developer'ın `.npmrc` dosyasına eklemesi gereken:
```
@flalingo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_THEIR_GITHUB_TOKEN
```

Sonra:
```bash
npm install -g @flalingo/mem-bridge
```

## CI/CD Entegrasyonu

4 workflow Mem0 team memory ile entegre:

| Workflow | Fetch | Store | agent_id |
|----------|-------|-------|----------|
| `ai-coding.yml` | Plan öncesi | Implementation sonrası | `ai-coder` |
| `ai-revision.yml` | Plan öncesi | PR creation sonrası | `ai-coder` |
| `codex-review.yml` | Review öncesi | Review sonrası | `code-reviewer` |
| `docs-auto-update.yml` | Docs update öncesi | Commit sonrası | `doc-updater` |

GitHub Secrets'a `MEM0_API_KEY` eklenmeli.

Detaylar: `turacoon/docs/team-memory/cicd-integration.md`

## Mimari

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
| `claude-mem not available` | Claude Code'u başlatın (worker auto-start) |
| `mem0_api_key not configured` | `flalingo-mem-bridge init` çalıştırın |
| `Filter API error` | `filter_api_key` config'e ekleyin veya `FILTER_API_KEY` env var |
| `search_memories` tool yok | `flalingo-mem-bridge setup-mcp` sonra Claude Code restart |
| Sync 0 insight | Normal — tüm observation'lar team-worthy olmayabilir |
| npm install 404 | `.npmrc`'de `@flalingo` registry ayarı var mı? |

## License

MIT — Flalingo Engineering
