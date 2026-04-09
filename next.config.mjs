/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure `.claude/skills/*/SKILL.md` files are included in the Vercel
  // serverless function bundle — they're read at runtime by the Skills feature.
  outputFileTracingIncludes: {
    "/api/skills/system-prompt": [".claude/skills/**/*.md"],
  },
};

export default nextConfig;
