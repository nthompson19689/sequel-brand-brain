/**
 * Campaign Engine — agent prompt loader.
 *
 * Loads specialist writer prompts from src/prompts/campaign-agents/*.md
 * at runtime and caches them in-memory.
 */

import fs from "node:fs/promises";
import path from "node:path";

export type CampaignAgent =
  | "orchestrator-parse"
  | "orchestrator-context"
  | "blog-writer"
  | "email-writer"
  | "linkedin-writer"
  | "sales-enablement-writer"
  | "website-writer"
  | "faq-writer"
  | "video-script-writer"
  | "slack-internal-writer"
  | "thought-leadership-writer"
  | "social-writer";

export type AssetType =
  | "blog"
  | "email"
  | "linkedin"
  | "sales_enablement"
  | "website"
  | "faq"
  | "video_script"
  | "slack_internal"
  | "thought_leadership"
  | "social";

// Asset type -> default agent name
export const AGENT_FOR_ASSET: Record<AssetType, CampaignAgent> = {
  blog: "blog-writer",
  email: "email-writer",
  linkedin: "linkedin-writer",
  sales_enablement: "sales-enablement-writer",
  website: "website-writer",
  faq: "faq-writer",
  video_script: "video-script-writer",
  slack_internal: "slack-internal-writer",
  thought_leadership: "thought-leadership-writer",
  social: "social-writer",
};

const cache = new Map<string, string>();

export async function loadAgentPrompt(agent: string): Promise<string> {
  if (cache.has(agent)) return cache.get(agent)!;
  const filePath = path.join(
    process.cwd(),
    "src",
    "prompts",
    "campaign-agents",
    `${agent}.md`,
  );
  const text = await fs.readFile(filePath, "utf8");
  cache.set(agent, text);
  return text;
}
