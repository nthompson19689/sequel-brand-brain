import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TABLE = "agent_outputs";

// ── Ensure table exists (best-effort, idempotent) ──
let tableChecked = false;
async function ensureTable(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>) {
  if (tableChecked) return;
  // Just try a SELECT — if it fails, table doesn't exist and we can't create it via REST
  const { error } = await supabase.from(TABLE).select("id").limit(1);
  if (error && error.code === "42P01") {
    console.warn(
      `[Outputs] Table "${TABLE}" does not exist. Please create it in Supabase SQL Editor:\n` +
      `CREATE TABLE IF NOT EXISTS agent_outputs (\n` +
      `  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n` +
      `  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,\n` +
      `  agent_name TEXT,\n` +
      `  agent_icon TEXT DEFAULT '🤖',\n` +
      `  input_query TEXT,\n` +
      `  output_content TEXT NOT NULL,\n` +
      `  output_html TEXT,\n` +
      `  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'exported')),\n` +
      `  created_at TIMESTAMPTZ DEFAULT NOW(),\n` +
      `  updated_at TIMESTAMPTZ DEFAULT NOW()\n` +
      `);`
    );
  }
  tableChecked = true;
}

/**
 * GET /api/outputs — List all outputs, optionally filtered by agent_id
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ outputs: [] });
  }

  await ensureTable(supabase);

  const agentId = request.nextUrl.searchParams.get("agent_id");
  const search = request.nextUrl.searchParams.get("search");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "100", 10);

  let query = supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  if (search) {
    query = query.or(
      `agent_name.ilike.%${search}%,input_query.ilike.%${search}%,output_content.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Outputs] Fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ outputs: data || [] });
}

/**
 * POST /api/outputs — Create or update an output
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  await ensureTable(supabase);

  const body = await request.json();

  const row: Record<string, unknown> = {
    agent_id: body.agent_id,
    agent_name: body.agent_name || null,
    agent_icon: body.agent_icon || "🤖",
    input_query: body.input_query || body.input_text || "",
    output_content: body.output_content,
    output_html: body.output_html || body.output_content,
    status: body.status || "draft",
    updated_at: new Date().toISOString(),
  };

  // Update existing
  if (body.id) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      console.error("[Outputs] Update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ output: data });
  }

  // Create new
  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[Outputs] Insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ output: data });
}

/**
 * DELETE /api/outputs?id=xxx — Delete an output
 */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase.from(TABLE).delete().eq("id", id);

  if (error) {
    console.error("[Outputs] Delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
