/**
 * Server-side reader for SKILL.md files bundled with the app.
 * Each installed skill's SKILL.md gets injected into the Claude system prompt
 * at runtime, alongside the Brand Brain context.
 */

import fs from "fs";
import path from "path";
import { getSkill } from "./skills";

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

  // Resolve raw answer keys (question IDs) to the original question text so
  // Claude sees something like: `"How often does your team publish content?" → Weekly`
  // instead of `cadence: Weekly`.
  const skill = getSkill(skillName);
  const questionById = new Map(
    (skill?.setupQuestions || []).map((q) => [q.id, q.q])
  );

  const answerLines = Object.entries(setupAnswers)
    .filter(([, v]) => v && String(v).trim())
    .map(([key, value]) => {
      const question = questionById.get(key) || key;
      return `- Question: "${question}"\n  User's answer: ${value}\n  → Reference this context when producing output for this user.`;
    })
    .join("\n");

  const header = `=== ACTIVE SKILL: ${skill?.displayName || skillName} ===
You are operating as the skill defined below. Follow its instructions exactly.
Read the Brand Brain context (provided in the system blocks above) before producing any output.
If a required Brand Brain doc is missing, STOP and tell the user what's missing.`;

  const setupBlock = answerLines
    ? `\n\n=== USER'S SKILL CONFIGURATION ===
The user answered the following questions during setup. Treat these as ground truth about how this user works and tailor every output accordingly (cadence, tooling, funnel focus, etc.):

${answerLines}`
    : "";

  return `${header}\n\n${instructions}${setupBlock}`;
}
