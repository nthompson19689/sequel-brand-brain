import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/** POST /api/agent/outputs — Save an agent output */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = await request.json();

  const row: Record<string, unknown> = {
    agent_id: body.agent_id || null,
    input_text: body.input_text || null,
    output_content: body.output_content,
    status: body.status || "draft",
  };

  if (body.id) {
    // Update existing
    const { data, error } = await supabase
      .from("agent_outputs")
      .update({ output_content: body.output_content, status: body.status || "draft" })
      .eq("id", body.id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ output: data });
  }

  // Create new
  const { data, error } = await supabase
    .from("agent_outputs")
    .insert(row)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ output: data });
}
