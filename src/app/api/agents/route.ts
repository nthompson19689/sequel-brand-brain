import { getSupabaseServerClient } from "@/lib/supabase";
import { BUILTIN_AGENTS } from "@/lib/agents";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Detect which columns actually exist in the agents table (cached)
let knownColumns: Set<string> | null = null;

async function getAgentColumns(supabase: ReturnType<typeof getSupabaseServerClient>) {
  if (knownColumns) return knownColumns;
  if (!supabase) return new Set<string>();

  // Fetch a single row to see what columns come back
  const { data, error } = await supabase.from("agents").select("*").limit(1);
  if (error || !data) return new Set<string>();

  if (data.length > 0) {
    knownColumns = new Set(Object.keys(data[0]));
  } else {
    // Table empty — try inserting with all columns; if a column is missing the error tells us
    knownColumns = new Set([
      "id", "name", "description", "icon", "created_by", "system_prompt",
      "tools", "is_shared", "run_count", "created_at", "updated_at",
      "steps", "output_format", "is_builtin",
      // These may or may not exist:
      "model", "reference_examples",
    ]);
  }
  return knownColumns;
}

/** Strip keys from an object that don't exist as columns */
function stripMissingColumns(row: Record<string, unknown>, cols: Set<string>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    if (cols.has(key)) cleaned[key] = val;
  }
  return cleaned;
}

/**
 * GET /api/agents — List all agents from Supabase.
 * Seeds built-in agents on first call if they don't exist.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    // Fallback: return builtins + localStorage hint
    return Response.json({ agents: BUILTIN_AGENTS, source: "local" });
  }

  // Detect available columns
  const cols = await getAgentColumns(supabase);

  // Seed builtins — only INSERT if they don't already exist (never overwrite edits)
  try {
    const builtinIds = BUILTIN_AGENTS.map((a) => a.id);
    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .in("id", builtinIds);

    const existingIds = new Set((existing || []).map((a: { id: string }) => a.id));
    const toSeed = BUILTIN_AGENTS.filter((a) => !existingIds.has(a.id));

    if (toSeed.length > 0) {
      const rows = toSeed.map((a) => stripMissingColumns({
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        system_prompt: a.system_prompt,
        tools: a.tools,
        steps: a.steps,
        output_format: a.output_format,
        reference_examples: a.reference_examples || "",
        model: a.model || "claude-sonnet-4-20250514",
        is_shared: a.is_shared,
        run_count: 0,
        is_builtin: true,
        workspace_id: a.workspace_id || null,
        category: a.category || null,
      }, cols));
      const { error: seedError } = await supabase
        .from("agents")
        .insert(rows);
      if (seedError) {
        console.error("[Supabase] Seed error:", seedError.message, seedError);
      } else {
        console.log(`[Supabase] Seeded ${toSeed.length} built-in agents`);
      }
    }
  } catch (err) {
    console.error("[Supabase] Failed to seed built-in agents:", err);
  }

  // Fetch agents — filter by workspace_id if provided
  const workspaceId = request.nextUrl.searchParams.get("workspace_id");

  let query = supabase
    .from("agents")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("created_at", { ascending: true });

  if (workspaceId) {
    // Show agents belonging to this workspace OR shared agents (is_shared = true)
    query = query.or(`workspace_id.eq.${workspaceId},is_shared.eq.true`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Supabase] Failed to fetch agents:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Normalize: ensure steps is always an array
  const agents = (data || []).map((a: Record<string, unknown>) => ({
    ...a,
    steps: Array.isArray(a.steps) ? a.steps : [],
    tools: Array.isArray(a.tools) ? a.tools : [],
    output_format: a.output_format || "",
    reference_examples: a.reference_examples || "",
    model: a.model || "claude-sonnet-4-6",
    category: a.category || null,
  }));

  return Response.json({ agents, source: "supabase" });
}

/**
 * POST /api/agents — Create or update an agent in Supabase.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  const cols = await getAgentColumns(supabase);

  // Build row, only include is_builtin if explicitly provided
  const row: Record<string, unknown> = stripMissingColumns({
    id: body.id || undefined,
    name: body.name,
    description: body.description,
    icon: body.icon || "🤖",
    system_prompt: body.system_prompt,
    tools: body.tools || [],
    steps: body.steps || [],
    output_format: body.output_format || "",
    reference_examples: body.reference_examples || "",
    model: body.model || "claude-sonnet-4-20250514",
    is_shared: body.is_shared || false,
    run_count: body.run_count || 0,
    workspace_id: body.workspace_id || null,
  }, cols);

  // Only set is_builtin when explicitly passed (seeding sets true, don't overwrite on edits)
  if (typeof body.is_builtin === "boolean") {
    row.is_builtin = body.is_builtin;
  }

  const { data, error } = await supabase
    .from("agents")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("[Supabase] Failed to save agent:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ agent: data });
}

/**
 * DELETE /api/agents?id=xxx — Delete an agent.
 */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Missing agent id" }, { status: 400 });
  }

  const { error } = await supabase.from("agents").delete().eq("id", id);
  if (error) {
    console.error("[Supabase] Failed to delete agent:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
