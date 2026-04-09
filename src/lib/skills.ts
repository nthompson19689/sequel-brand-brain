/**
 * GTM Skills registry — the marketplace catalog.
 *
 * Each skill is a pre-built workflow package that plugs into the Brand Brain.
 * At runtime the skill's SKILL.md instructions are injected into the chat
 * system prompt alongside the brand context so responses are grounded.
 */

export type SkillStatus = "ready" | "planned";

export type BrainContextType =
  | "voice"
  | "style_guide"
  | "icp_profiles"
  | "messaging"
  | "tone"
  | "sitemap"
  | "product_pages"
  | "case_studies"
  | "competitor_data"
  | "call_transcripts"
  | "keyword_targets"
  | "editorial_guidelines"
  | "executive_voices"
  | "customer_data"
  | "analytics_kpis";

export interface SkillSetupQuestion {
  id: string;
  q: string;
  /** If null, this is an open text question */
  options: string[] | null;
}

export interface Skill {
  name: string;
  displayName: string;
  category: string;
  tagline: string;
  /** lucide-react icon name */
  icon: string;
  priority: number;
  setupTime: string;
  status: SkillStatus;
  contextRequired: BrainContextType[];
  contextOptional: BrainContextType[];
  outputs: string[];
  workflows: string[];
  setupQuestions: SkillSetupQuestion[];
}

export const SKILL_CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready Now" },
  { id: "seo", label: "SEO" },
  { id: "copywriting", label: "Copywriting" },
  { id: "competitive-intel", label: "Competitive Intel" },
  { id: "content", label: "Content" },
  { id: "email-marketing", label: "Email" },
  { id: "social-media", label: "Social" },
  { id: "product-launch", label: "Product Launch" },
  { id: "sales-prospecting", label: "Sales" },
  { id: "customer-success", label: "Customer Success" },
  { id: "analytics", label: "Analytics" },
];

export const QUICK_INSTALL_BUNDLES = [
  {
    id: "skeleton-crew",
    name: "Skeleton Crew Starter",
    tagline: "All 10 skills — the full GTM team",
    setupTime: "~20 min setup",
    skills: "all" as const,
  },
  {
    id: "marketing-core",
    name: "Marketing Core",
    tagline: "SEO, Copywriting, Content Pipeline, Social",
    setupTime: "~10 min setup",
    skills: ["seo-content-engine", "copywriting-engine", "content-pipeline", "social-distribution"],
  },
  {
    id: "sales-core",
    name: "Sales Core",
    tagline: "Competitive Intel, Sales Prospecting, Email",
    setupTime: "~10 min setup",
    skills: ["competitive-intel", "sales-prospecting", "email-sequences"],
  },
];

export const SKILLS: Skill[] = [
  {
    name: "seo-content-engine",
    displayName: "SEO Content Engine",
    category: "seo",
    tagline: "Research, write, and optimize SEO content that sounds like you",
    icon: "Search",
    priority: 1,
    setupTime: "3 min",
    status: "ready",
    contextRequired: ["voice", "style_guide", "icp_profiles"],
    contextOptional: ["sitemap", "product_pages", "keyword_targets", "competitor_data", "case_studies"],
    outputs: ["Keyword Cluster Map", "Content Brief", "Draft Article", "SEO Checklist"],
    workflows: [
      "Keyword Research & Clustering",
      "Content Brief Generation",
      "Draft Article Writing",
      "Content Refresh & Optimization",
      "Pre-Publish SEO Checklist",
    ],
    setupQuestions: [
      {
        id: "cadence",
        q: "How often does your team publish content?",
        options: ["Daily", "2-3x/week", "Weekly", "Biweekly", "Whenever we can"],
      },
      {
        id: "tool",
        q: "What SEO tool do you use?",
        options: ["SEMrush", "Ahrefs", "Moz", "GSC only", "None yet"],
      },
      {
        id: "funnel",
        q: "Where do you need the most help?",
        options: ["Top of funnel", "Middle of funnel", "Bottom of funnel", "All of it"],
      },
    ],
  },
  {
    name: "copywriting-engine",
    displayName: "Copywriting Engine",
    category: "copywriting",
    tagline: "On-brand copy that converts — without a copywriter on staff",
    icon: "PenTool",
    priority: 1,
    setupTime: "2 min",
    status: "ready",
    contextRequired: ["voice", "messaging", "icp_profiles"],
    contextOptional: ["style_guide", "tone", "executive_voices", "case_studies", "product_pages"],
    outputs: ["Page Copy", "Ad Copy Variants", "Copy Audit"],
    workflows: [
      "Full Page Copy",
      "Copy Rewrite & Improvement",
      "Ad Copy Variants",
      "CTA Optimization",
      "Copy Audit",
    ],
    setupQuestions: [
      {
        id: "needs",
        q: "What do you write most often?",
        options: ["Website pages", "Landing pages", "Ad copy", "Email copy", "Sales collateral"],
      },
      {
        id: "maturity",
        q: "How established is your brand voice?",
        options: ["Very established", "Somewhat", "Still finding it"],
      },
      {
        id: "speed",
        q: "How fast does copy need to ship?",
        options: ["Same day", "2-3 day review", "Full review chain"],
      },
    ],
  },
  {
    name: "competitive-intel",
    displayName: "Competitive Intel",
    category: "competitive-intel",
    tagline: "Know what competitors are doing before your sales team asks",
    icon: "Target",
    priority: 2,
    setupTime: "4 min",
    status: "ready",
    contextRequired: ["messaging", "icp_profiles"],
    contextOptional: ["competitor_data", "product_pages", "call_transcripts", "case_studies"],
    outputs: ["Competitor Profile", "Sales Battlecard", "Executive Briefing", "Feature Matrix"],
    workflows: [
      "Competitor Deep Dive",
      "Sales Battlecard",
      "Executive Briefing",
      "Feature Comparison Matrix",
      "Competitor Monitoring Digest",
    ],
    setupQuestions: [
      { id: "competitors", q: "Who are your top 3-5 competitors?", options: null },
      {
        id: "frequency",
        q: "How often do competitors come up in deals?",
        options: ["Almost every deal", "About half", "Occasionally", "Rarely"],
      },
      {
        id: "consumers",
        q: "Who uses competitive intel?",
        options: ["Sales reps", "Marketing", "Product", "Executives"],
      },
    ],
  },
  {
    name: "content-pipeline",
    displayName: "Content Pipeline",
    category: "content",
    tagline: "Brief → Write → Edit → Publish — your content workflow automated",
    icon: "GitBranch",
    priority: 2,
    setupTime: "5 min",
    status: "planned",
    contextRequired: ["voice", "style_guide", "editorial_guidelines"],
    contextOptional: ["sitemap", "icp_profiles"],
    outputs: ["Editorial Calendar", "Content Brief", "Edited Draft", "Distribution Plan"],
    workflows: ["Editorial Planning", "Brief Generation", "Write/Edit Chain", "Distribution"],
    setupQuestions: [],
  },
  {
    name: "email-sequences",
    displayName: "Email Sequences",
    category: "email-marketing",
    tagline: "Nurture sequences, cold outreach, and lifecycle emails in your voice",
    icon: "Mail",
    priority: 3,
    setupTime: "3 min",
    status: "planned",
    contextRequired: ["voice", "messaging", "icp_profiles"],
    contextOptional: ["case_studies", "product_pages"],
    outputs: ["Drip Sequence", "Cold Outreach Cadence", "Lifecycle Emails", "A/B Variants"],
    workflows: ["Nurture Drip", "Cold Outreach", "Lifecycle Automation", "A/B Testing"],
    setupQuestions: [],
  },
  {
    name: "social-distribution",
    displayName: "Social Distribution",
    category: "social-media",
    tagline: "Turn one piece of content into a week of platform-native posts",
    icon: "Share2",
    priority: 3,
    setupTime: "3 min",
    status: "planned",
    contextRequired: ["voice", "tone"],
    contextOptional: ["icp_profiles", "messaging"],
    outputs: ["LinkedIn Posts", "Twitter/X Threads", "Platform Calendar", "Repurposed Snippets"],
    workflows: ["Content Repurposing", "Platform-Native Writing", "Social Calendar", "Engagement Hooks"],
    setupQuestions: [],
  },
  {
    name: "product-launch",
    displayName: "Product Launch",
    category: "product-launch",
    tagline: "Launch playbook: messaging, assets, channels, and timeline",
    icon: "Rocket",
    priority: 4,
    setupTime: "5 min",
    status: "planned",
    contextRequired: ["messaging", "icp_profiles", "product_pages"],
    contextOptional: ["competitor_data", "case_studies"],
    outputs: ["Launch Brief", "Messaging Matrix", "Channel Plan", "Timeline"],
    workflows: ["Launch Tiering", "Messaging Development", "Asset Creation", "War Room Ops"],
    setupQuestions: [],
  },
  {
    name: "sales-prospecting",
    displayName: "Sales Prospecting",
    category: "sales-prospecting",
    tagline: "Personalized outreach using your actual value props",
    icon: "Users",
    priority: 3,
    setupTime: "4 min",
    status: "planned",
    contextRequired: ["messaging", "icp_profiles", "case_studies"],
    contextOptional: ["competitor_data", "call_transcripts"],
    outputs: ["Prospect Research", "Outreach Sequence", "Objection Handlers", "Discovery Questions"],
    workflows: ["Lead Research", "Personalized Outreach", "Objection Prep", "Discovery Framework"],
    setupQuestions: [],
  },
  {
    name: "customer-success",
    displayName: "Customer Success",
    category: "customer-success",
    tagline: "Churn signals, health scores, and retention playbooks",
    icon: "HeartHandshake",
    priority: 5,
    setupTime: "4 min",
    status: "planned",
    contextRequired: ["messaging", "customer_data"],
    contextOptional: ["call_transcripts", "product_pages"],
    outputs: ["Health Dashboard", "Churn Playbook", "QBR Template", "Expansion Signals"],
    workflows: ["Health Scoring", "Churn Prevention", "QBR Prep", "Expansion Identification"],
    setupQuestions: [],
  },
  {
    name: "analytics-reporting",
    displayName: "Analytics & Reporting",
    category: "analytics",
    tagline: "Consistent reports your VP can trust without manual dashboards",
    icon: "BarChart3",
    priority: 5,
    setupTime: "5 min",
    status: "planned",
    contextRequired: ["analytics_kpis"],
    contextOptional: ["icp_profiles", "messaging"],
    outputs: ["Weekly Report", "Monthly Exec Summary", "Channel Performance", "Attribution Report"],
    workflows: ["Weekly Reporting", "Monthly Rollup", "Channel Analysis", "Attribution Modeling"],
    setupQuestions: [],
  },
];

export function getSkill(name: string): Skill | undefined {
  return SKILLS.find((s) => s.name === name);
}

export const BRAIN_CONTEXT_LABELS: Record<BrainContextType, string> = {
  voice: "Voice",
  style_guide: "Style Guide",
  icp_profiles: "ICP Profiles",
  messaging: "Messaging",
  tone: "Tone",
  sitemap: "Sitemap",
  product_pages: "Product Pages",
  case_studies: "Case Studies",
  competitor_data: "Competitor Data",
  call_transcripts: "Call Transcripts",
  keyword_targets: "Keyword Targets",
  editorial_guidelines: "Editorial Guidelines",
  executive_voices: "Executive Voices",
  customer_data: "Customer Data",
  analytics_kpis: "Analytics & KPIs",
};
