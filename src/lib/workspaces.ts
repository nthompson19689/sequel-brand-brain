// ── Workspace types and demo data ──

export interface Workspace {
  id: string;
  name: string;
  type: "personal" | "team";
  description: string | null;
  icon: string;
  color: string;
  created_by: string | null;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
}

export const DEMO_USERS: DemoUser[] = [
  { id: "nathan", name: "Nathan", email: "nathan@sequel.io", avatar: "NT", role: "Founder" },
  { id: "allie", name: "Allie", email: "allie@sequel.io", avatar: "AK", role: "Head of Marketing" },
  { id: "kathleen", name: "Kathleen", email: "kathleen@sequel.io", avatar: "KM", role: "Content Lead" },
  { id: "alex", name: "Alex", email: "alex@sequel.io", avatar: "AJ", role: "Sales Lead" },
];

export const DEMO_WORKSPACES: Omit<Workspace, "created_at">[] = [
  // Personal workspaces
  { id: "ws-nathan", name: "Nathan's Workspace", type: "personal", description: null, icon: "🏠", color: "#7C3AED", created_by: "nathan" },
  { id: "ws-allie", name: "Allie's Workspace", type: "personal", description: null, icon: "🏠", color: "#EC4899", created_by: "allie" },
  // 4 default team workspaces
  { id: "ws-content-marketing", name: "Content Marketing", type: "team", description: "Blog posts, SEO content, thought leadership", icon: "✍️", color: "#8B5CF6", created_by: "nathan" },
  { id: "ws-event-marketing", name: "Event Marketing", type: "team", description: "Webinars, virtual events, event promotion", icon: "🎪", color: "#0EA5E9", created_by: "nathan" },
  { id: "ws-product-marketing", name: "Product Marketing", type: "team", description: "Positioning, messaging, launches, competitive intel", icon: "🚀", color: "#F59E0B", created_by: "nathan" },
  { id: "ws-sales-enablement", name: "Sales Enablement", type: "team", description: "Battle cards, sales decks, objection handling", icon: "💼", color: "#059669", created_by: "nathan" },
];

export const DEMO_MEMBERS: Omit<WorkspaceMember, "id" | "created_at">[] = [
  // Personal
  { workspace_id: "ws-nathan", user_id: "nathan", role: "owner" },
  { workspace_id: "ws-allie", user_id: "allie", role: "owner" },
  // Content Marketing — Kathleen (lead), Allie, Nathan
  { workspace_id: "ws-content-marketing", user_id: "kathleen", role: "owner" },
  { workspace_id: "ws-content-marketing", user_id: "allie", role: "admin" },
  { workspace_id: "ws-content-marketing", user_id: "nathan", role: "member" },
  // Event Marketing — Allie (lead), Nathan, Kathleen
  { workspace_id: "ws-event-marketing", user_id: "allie", role: "owner" },
  { workspace_id: "ws-event-marketing", user_id: "nathan", role: "admin" },
  { workspace_id: "ws-event-marketing", user_id: "kathleen", role: "member" },
  // Product Marketing — Nathan (lead), Allie
  { workspace_id: "ws-product-marketing", user_id: "nathan", role: "owner" },
  { workspace_id: "ws-product-marketing", user_id: "allie", role: "admin" },
  // Sales Enablement — Alex (lead), Nathan
  { workspace_id: "ws-sales-enablement", user_id: "alex", role: "owner" },
  { workspace_id: "ws-sales-enablement", user_id: "nathan", role: "admin" },
];
