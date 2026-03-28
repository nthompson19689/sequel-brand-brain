import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/migrate — Runs pending schema migrations against Supabase
 * using the PostgreSQL connection via the Management API.
 * Since we can't run DDL through the REST API, this uses fetch to
 * the Supabase SQL endpoint with the service role key.
 */
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  // Extract project ref from URL
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

  const migrations = [
    `ALTER TABLE agents ADD COLUMN IF NOT EXISTS model TEXT DEFAULT 'claude-sonnet-4-20250514';`,
    `ALTER TABLE agents ADD COLUMN IF NOT EXISTS reference_examples TEXT DEFAULT '';`,
    `CREATE TABLE IF NOT EXISTS agent_outputs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      session_id UUID REFERENCES chat_sessions(id),
      output_content TEXT NOT NULL,
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'exported')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'blog';`,
  ];

  const results: { sql: string; ok: boolean; error?: string }[] = [];

  // Try running migrations through the PostgREST RPC
  // If that fails, we'll try a direct pg connection
  for (const sql of migrations) {
    try {
      // Use the Supabase Management API query endpoint
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      });

      if (res.ok) {
        results.push({ sql: sql.substring(0, 60) + "...", ok: true });
      } else {
        const text = await res.text();
        results.push({ sql: sql.substring(0, 60) + "...", ok: false, error: text });
      }
    } catch (err) {
      results.push({
        sql: sql.substring(0, 60) + "...",
        ok: false,
        error: String(err),
      });
    }
  }

  return NextResponse.json({
    message: "Migration attempted. If columns still missing, run these SQL statements in the Supabase SQL Editor (Dashboard > SQL Editor):",
    manual_sql: migrations,
    results,
    projectRef,
    dashboard_url: `https://supabase.com/dashboard/project/${projectRef}/sql/new`,
  });
}
