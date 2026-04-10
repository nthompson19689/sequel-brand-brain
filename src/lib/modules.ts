/**
 * Module registry — every feature in the app is a toggleable module.
 *
 * The sidebar, modules page, and onboarding all read from this single source
 * of truth. Each module maps to a top-level route and a sidebar entry.
 *
 * CORE modules (Chat, Agent Builder, Voice Input, LinkedIn Ghost Writer)
 * are enabled for ALL roles by default and come standard with every account.
 */

export type UserRole = "marketing" | "sales" | "leadership" | "custom";

const ALL_ROLES: UserRole[] = ["marketing", "sales", "leadership", "custom"];

export interface AppModule {
  id: string;
  displayName: string;
  description: string;
  /** Route path in Next.js (matches sidebar href) */
  path: string;
  /** SVG icon key — matches what the sidebar currently renders */
  iconKey: string;
  /** Which roles get this module enabled by default */
  defaultRoles: UserRole[];
  /** Section in sidebar: "workspace" or "shared" */
  section: "workspace" | "shared";
  /** If true, this module is a core feature and always included */
  core?: boolean;
  /** If true, only users with is_admin see this module */
  adminOnly?: boolean;
}

export const MODULES: AppModule[] = [
  // ── Core modules (standard in every account) ──
  {
    id: "chat",
    displayName: "Chat",
    description: "Ask the Brand Brain anything — grounded in your company data",
    path: "/chat",
    iconKey: "Chat",
    defaultRoles: ALL_ROLES,
    section: "workspace",
    core: true,
  },
  {
    id: "agents",
    displayName: "Agent Builder",
    description: "Create and run AI agents that inherit your brand brain",
    path: "/agents",
    iconKey: "Agents",
    defaultRoles: ALL_ROLES,
    section: "workspace",
    core: true,
  },
  {
    id: "dictate",
    displayName: "Voice Input",
    description: "Dictate notes, ideas, and content with voice",
    path: "/dictate",
    iconKey: "Dictate",
    defaultRoles: ALL_ROLES,
    section: "workspace",
    core: true,
  },
  {
    id: "linkedin",
    displayName: "LinkedIn Ghost Writer",
    description: "Write and publish LinkedIn content in your voice",
    path: "/linkedin",
    iconKey: "LinkedIn",
    defaultRoles: ALL_ROLES,
    section: "workspace",
    core: true,
  },

  // ── Additional workspace modules ──
  {
    id: "outbound",
    displayName: "Outbound",
    description: "Prospect research, sequences, and daily action center",
    path: "/outbound",
    iconKey: "Outbound",
    defaultRoles: ["sales"],
    section: "workspace",
  },
  {
    id: "decks",
    displayName: "Deck Builder",
    description: "Generate branded slide decks from your content and data",
    path: "/decks",
    iconKey: "Decks",
    defaultRoles: ["sales", "marketing"],
    section: "workspace",
  },
  {
    id: "skills",
    displayName: "Skills",
    description: "GTM skill marketplace — install tools that connect to your Brain",
    path: "/skills",
    iconKey: "Skills",
    defaultRoles: ALL_ROLES,
    section: "workspace",
  },
  {
    id: "outputs",
    displayName: "Outputs",
    description: "Browse all saved AI outputs and exports",
    path: "/outputs",
    iconKey: "Outputs",
    defaultRoles: ALL_ROLES,
    section: "workspace",
  },

  // ── Shared modules ──
  {
    id: "content",
    displayName: "Content Brain",
    description: "Content pipeline: import, brief, write, edit, publish",
    path: "/content",
    iconKey: "Content",
    defaultRoles: ["marketing"],
    section: "shared",
  },
  {
    id: "seo",
    displayName: "SEO Dashboard",
    description: "Keyword tracking, page metrics, and content gap analysis",
    path: "/seo",
    iconKey: "SEO",
    defaultRoles: ["marketing", "leadership"],
    section: "shared",
  },
  {
    id: "competitors",
    displayName: "Competitive Intel",
    description: "Monitor competitors, auto-generate battlecards",
    path: "/competitors",
    iconKey: "Competitors",
    defaultRoles: ["sales", "marketing"],
    section: "shared",
  },
  {
    id: "refresh",
    displayName: "Refresh / Audit",
    description: "Audit and refresh existing content for SEO and voice",
    path: "/refresh",
    iconKey: "Refresh",
    defaultRoles: ["marketing"],
    section: "shared",
  },
  {
    id: "abm",
    displayName: "ABM",
    description: "Account-based marketing — research, monitor, and engage target accounts",
    path: "/abm",
    iconKey: "ABM",
    defaultRoles: ["sales", "marketing"],
    section: "shared",
  },
  {
    id: "todos",
    displayName: "To-Do's",
    description: "Talk through your day — AI creates a checkable to-do list",
    path: "/todos",
    iconKey: "Todos",
    defaultRoles: ALL_ROLES,
    section: "shared",
  },
  {
    id: "requests",
    displayName: "Requests",
    description: "Track and manage content requests from the team",
    path: "/requests",
    iconKey: "Requests",
    defaultRoles: ["marketing", "leadership"],
    section: "shared",
  },
  {
    id: "modules",
    displayName: "Modules",
    description: "Toggle which tools appear in your sidebar",
    path: "/modules",
    iconKey: "Modules",
    defaultRoles: ALL_ROLES,
    section: "shared",
  },
  {
    id: "brain",
    displayName: "Brain",
    description: "View and manage brand docs, voice, and governance layer",
    path: "/brain",
    iconKey: "Brain",
    defaultRoles: ALL_ROLES,
    section: "shared",
    adminOnly: true,
  },
];

/**
 * Return the default enabled module IDs for a given role.
 */
export function getDefaultModules(role: UserRole): string[] {
  return MODULES.filter((m) => m.defaultRoles.includes(role)).map((m) => m.id);
}

/**
 * Get a module by ID.
 */
export function getModule(id: string): AppModule | undefined {
  return MODULES.find((m) => m.id === id);
}

/**
 * Map of iconKey → sidebar nav position (used to maintain sidebar order).
 */
export const MODULE_PATH_MAP: Record<string, string> = Object.fromEntries(
  MODULES.map((m) => [m.id, m.path])
);
