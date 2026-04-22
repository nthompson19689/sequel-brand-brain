/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/skills/system-prompt": [".claude/skills/**/*.md"],
    },
  },
};

export default nextConfig;
