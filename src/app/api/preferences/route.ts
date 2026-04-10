import { NextResponse } from "next/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

async function getUserId(): Promise<string | null> {
  const auth = createSupabaseServerAuthClient();
  const { data } = await auth.auth.getUser();
  return data.user?.id || null;
}

/** GET — return user's preferences row (or null if not set up yet) */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ preferences: null });

  const { data } = await supabase
    .from("user_preferences")
    .select("enabled_modules, module_order")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({ preferences: data || null });
}

/** POST — update enabled_modules */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { enabled_modules: string[] };
  if (!Array.isArray(body.enabled_modules)) {
    return NextResponse.json({ error: "enabled_modules must be an array" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        enabled_modules: body.enabled_modules,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
