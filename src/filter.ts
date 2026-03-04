import type { BridgeConfig } from "./config.js";
import type { Observation } from "./claude-mem-client.js";

export interface TeamInsight {
  content: string;
  type: "discovery" | "pattern" | "decision" | "bugfix" | "gotcha";
  related_files: string[];
  source_observation_ids: number[];
}

const FILTER_PROMPT = `You are analyzing coding session observations from a developer.
Return ONLY insights valuable to OTHER team members as a JSON array.

INCLUDE:
- Bug root causes + fixes (saves others hours)
- Architecture patterns/decisions (team alignment)
- Cross-service gotchas (timeouts, auth, API patterns)
- Convention discoveries (consistency)
- Performance findings (patterns to follow/avoid)

EXCLUDE:
- Personal preferences (editor settings, formatting)
- Temporary debug info (console.log, test data)
- Standard/obvious implementations (basic CRUD)
- Incomplete or speculative observations

For each team-worthy insight, return:
{
  "content": "Concise, actionable description of the insight",
  "type": "discovery|pattern|decision|bugfix|gotcha",
  "related_files": ["file/paths/mentioned"]
}

Return a JSON array. If nothing is team-worthy, return [].
Do NOT wrap in markdown code blocks. Return raw JSON only.`;

export async function filterTeamWorthy(
  observations: Observation[],
  config: BridgeConfig
): Promise<TeamInsight[]> {
  if (observations.length === 0) return [];

  const obsText = observations
    .map((o) => {
      const parts = [`[${o.type}] ${o.title || "Untitled"}`];
      if (o.narrative) parts.push(`Narrative: ${o.narrative}`);
      if (o.facts) parts.push(`Facts: ${o.facts}`);
      if (o.concepts) parts.push(`Concepts: ${o.concepts}`);
      if (o.files_modified) parts.push(`Files modified: ${o.files_modified}`);
      if (o.files_read) parts.push(`Files read: ${o.files_read}`);
      parts.push(`Project: ${o.project}`);
      return parts.join("\n");
    })
    .join("\n---\n");

  const userMessage = `Here are ${observations.length} observations from a coding session:\n\n${obsText}`;

  const responseText = await callFilterModel(config, userMessage);

  try {
    const parsed = JSON.parse(responseText.trim());
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => ({
      content: item.content || "",
      type: item.type || "discovery",
      related_files: Array.isArray(item.related_files)
        ? item.related_files
        : [],
      source_observation_ids: observations.map((o) => o.id),
    }));
  } catch {
    console.error("Failed to parse filter response:", responseText.slice(0, 200));
    return [];
  }
}

async function callFilterModel(
  config: BridgeConfig,
  userMessage: string
): Promise<string> {
  const apiKey =
    config.filter_api_key || process.env.FILTER_API_KEY || "";

  switch (config.filter_provider) {
    case "anthropic":
      return callAnthropic(
        apiKey || process.env.ANTHROPIC_API_KEY || "",
        config.filter_model,
        userMessage
      );
    case "openai":
      return callOpenAI(
        apiKey || process.env.OPENAI_API_KEY || "",
        config.filter_model,
        userMessage
      );
    case "google":
      return callGoogle(
        apiKey || process.env.GOOGLE_API_KEY || "",
        config.filter_model,
        userMessage
      );
    default:
      throw new Error(`Unknown filter provider: ${config.filter_provider}`);
  }
}

async function callAnthropic(
  apiKey: string,
  model: string,
  userMessage: string
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: FILTER_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

async function callOpenAI(
  apiKey: string,
  model: string,
  userMessage: string
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: FILTER_PROMPT },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2048,
  });
  return response.choices[0]?.message?.content || "";
}

async function callGoogle(
  apiKey: string,
  model: string,
  userMessage: string
): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: FILTER_PROMPT,
  });
  const result = await genModel.generateContent(userMessage);
  return result.response.text();
}
