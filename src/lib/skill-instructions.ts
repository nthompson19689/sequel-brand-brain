/**
 * Server-side reader for SKILL.md files bundled with the app.
 * Each installed skill's SKILL.md gets injected into the Claude system prompt
 * at runtime, alongside the Brand Brain context.
 */

import fs from "fs";
import path from "path";

const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills");

// Cache file contents in-memory — SKILL.md files are bundled with the build
const cache = new Map<string, string>();

/**
 * Read a skill's SKILL.md file. Returns empty string if missing.
 */
export function getSkillInstructions(skillName: string): string {
  if (cache.has(skillName)) return cache.get(skillName)!;

  const filePath = path.join(SKILLS_DIR, skillName, "SKILL.md");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    cache.set(skillName, content);
    return content;
  } catch {
    cache.set(skillName, "");
    return "";
  }
}

/**
 * Build a system prompt addition for a skill + its setup answers.
 * This text is passed to the existing /api/chat route as `systemPrompt`,
 * so it stacks on top of the cached Brand Brain blocks.
 */
export function buildSkillSystemPrompt(
  skillName: string,
  setupAnswers: Record<string, string> = {}
): string {
  const instructions = getSkillInstructions(skillName);
  if (!instructions) {
    return `You are the ${skillName} skill. SKILL.md instructions were not found — operate in safe mode and tell the user the skill file is missing.`;
  }

  const answerLines = Object.entries(setupAnswers)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const header = `=== ACTIVE SKILL: ${skillName} ===
You are operating as the skill defined below. Follow its instructions exactly.
Read the Brand Brain context (provided in the system blocks above) before producing any output.
If a required Brand Brain doc is missing, STOP and tell the user what's missing.`;

  const setupBlock = answerLines
    ? `\n\n=== SKILL SETUP ANSWERS ===\nThe user configured this skill with:\n${answerLines}`
    : "";

  return `${header}\n\n${instructions}${setupBlock}`;
}
