import { NextResponse } from "next/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

interface InstalledSkillRow {
  id: string;
  user_id: string;
  skill_name: string;
  setup_answers: Record<string, string>;
  installed_at: string;
}

async function getUserId(): Promise<string | null> {
  const auth = createSupabaseServerAuthClient();
  const { data } = await auth.auth.getUser();
  return data.user?.id || null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ installed: [] });

  const { data, error } = await supabase
    .from("installed_skills")
    .select("id, user_id, skill_name, setup_answers, installed_at")
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ installed: (data || []) as InstalledSkillRow[] });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    skill_name: string;
    setup_answers?: Record<string, string>;
  };

  if (!body.skill_name) {
    return NextResponse.json({ error: "skill_name required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("installed_skills")
    .upsert(
      {
        user_id: userId,
        skill_name: body.skill_name,
        setup_answers: body.setup_answers || {},
      },
      { onConflict: "user_id,skill_name" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ installed: data });
}

export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const skillName = searchParams.get("skill_name");
  if (!skillName) return NextResponse.json({ error: "skill_name required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { error } = await supabase
    .from("installed_skills")
    .delete()
    .eq("user_id", userId)
    .eq("skill_name", skillName);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
