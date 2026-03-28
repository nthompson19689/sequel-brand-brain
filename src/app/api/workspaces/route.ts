import { getSupabaseServerClient } from "@/lib/supabase";
import { DEMO_WORKSPACES, DEMO_MEMBERS } from "@/lib/workspaces";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

let seeded = false;

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id") || "";
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    // Fallback: demo data
    const memberWsIds = new Set(DEMO_MEMBERS.filter((m) => m.user_id === userId).map((m) => m.workspace_id));
    const ws = DEMO_WORKSPACES.filter((w) => memberWsIds.has(w.id)).map((w) => ({ ...w, created_at: new Date().toISOString() }));
    return NextResponse.json({ workspaces: ws, source: "local" });
  }

  // Seed demo data if needed
  if (!seeded) {
    try {
      const { data: existing } = await supabase.from("workspaces").select("id").limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from("workspaces").insert(DEMO_WORKSPACES.map((w) => ({ ...w })));
        await supabase.from("workspace_members").insert(DEMO_MEMBERS.map((m) => ({ ...m })));
        console.log("[Workspaces] Seeded demo workspaces and members");
      }
    } catch (err) {
      console.warn("[Workspaces] Seed failed (table may not exist):", String(err).slice(0, 100));
    }
    seeded = true;
  }

  // Fetch workspaces user belongs to
  try {
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId);

    if (!memberships || memberships.length === 0) {
      // Fallback to demo
      const memberWsIds = new Set(DEMO_MEMBERS.filter((m) => m.user_id === userId).map((m) => m.workspace_id));
      const ws = DEMO_WORKSPACES.filter((w) => memberWsIds.has(w.id)).map((w) => ({ ...w, created_at: new Date().toISOString() }));
      return NextResponse.json({ workspaces: ws, source: "demo-fallback" });
    }

    const wsIds = memberships.map((m: { workspace_id: string }) => m.workspace_id);
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("*")
      .in("id", wsIds)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    return NextResponse.json({ workspaces: workspaces || [], source: "supabase" });
  } catch {
    // Fallback
    const memberWsIds = new Set(DEMO_MEMBERS.filter((m) => m.user_id === userId).map((m) => m.workspace_id));
    const ws = DEMO_WORKSPACES.filter((w) => memberWsIds.has(w.id)).map((w) => ({ ...w, created_at: new Date().toISOString() }));
    return NextResponse.json({ workspaces: ws, source: "demo-fallback" });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  const body = await request.json();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const row = {
    name: body.name,
    type: body.type || "team",
    description: body.description || null,
    icon: body.icon || "🏠",
    color: body.color || "#7C3AED",
    created_by: body.created_by || null,
  };

  if (body.id) {
    const { data, error } = await supabase.from("workspaces").update(row).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ workspace: data });
  }

  const { data, error } = await supabase.from("workspaces").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add creator as owner
  if (data && body.created_by) {
    await supabase.from("workspace_members").insert({
      workspace_id: data.id,
      user_id: body.created_by,
      role: "owner",
    });
  }

  // Add additional members
  if (data && Array.isArray(body.members)) {
    const rows = body.members
      .filter((uid: string) => uid !== body.created_by)
      .map((uid: string) => ({
        workspace_id: data.id,
        user_id: uid,
        role: "member",
      }));
    if (rows.length > 0) {
      await supabase.from("workspace_members").insert(rows);
    }
  }

  return NextResponse.json({ workspace: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("workspaces").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
