/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/skills/system-prompt": [".claude/skills/**/*.md"],
      "/api/campaigns/**": ["src/prompts/campaign-agents/**/*.md"],
    },
  },
};

export default nextConfig;
