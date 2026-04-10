import { NextResponse } from "next/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

async function getUser() {
  const auth = createSupabaseServerAuthClient();
  const { data } = await auth.auth.getUser();
  return data.user;
}

/** GET — return workspace API key config (masked) */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspace_id");
  if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ config: null });

  const { data } = await supabase
    .from("workspace_api_keys")
    .select("anthropic_api_key, mcp_server_urls")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // Mask the API key — only show last 8 chars
  const masked = data?.anthropic_api_key
    ? "sk-ant-•••••" + data.anthropic_api_key.slice(-8)
    : null;

  return NextResponse.json({
    config: data
      ? {
          has_key: !!data.anthropic_api_key,
          masked_key: masked,
          mcp_server_urls: data.mcp_server_urls || [],
        }
      : null,
  });
}

/** POST — save workspace API key and/or MCP server URLs */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    workspace_id: string;
    anthropic_api_key?: string | null;
    mcp_server_urls?: string[];
  };

  if (!body.workspace_id) {
    return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  // Check the user is admin — only admins can set API keys
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Only workspace admins can manage API keys" }, { status: 403 });
  }

  const upsertData: Record<string, unknown> = {
    workspace_id: body.workspace_id,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  if (body.anthropic_api_key !== undefined) {
    upsertData.anthropic_api_key = body.anthropic_api_key;
  }
  if (body.mcp_server_urls !== undefined) {
    upsertData.mcp_server_urls = body.mcp_server_urls;
  }

  const { error } = await supabase
    .from("workspace_api_keys")
    .upsert(upsertData, { onConflict: "workspace_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** DELETE — remove the workspace API key */
export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspace_id");
  if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { error } = await supabase
    .from("workspace_api_keys")
    .update({ anthropic_api_key: null, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
