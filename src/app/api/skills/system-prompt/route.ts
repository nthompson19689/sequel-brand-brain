import { NextResponse } from "next/server";
import { buildSkillSystemPrompt } from "@/lib/skill-instructions";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Return the assembled system prompt for an installed skill so the browser
 * can pass it to /api/chat as `systemPrompt`. The prompt pulls the skill's
 * SKILL.md off disk and appends the user's setup answers.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const skillName = searchParams.get("skill_name");
  if (!skillName) return NextResponse.json({ error: "skill_name required" }, { status: 400 });

  // Pull setup answers for this user if available
  let setupAnswers: Record<string, string> = {};
  try {
    const auth = createSupabaseServerAuthClient();
    const { data: userData } = await auth.auth.getUser();
    const userId = userData.user?.id;
    const supabase = getSupabaseServerClient();
    if (userId && supabase) {
      const { data } = await supabase
        .from("installed_skills")
        .select("setup_answers")
        .eq("user_id", userId)
        .eq("skill_name", skillName)
        .maybeSingle();
      if (data?.setup_answers) setupAnswers = data.setup_answers as Record<string, string>;
    }
  } catch {
    // fall through with empty answers
  }

  const systemPrompt = buildSkillSystemPrompt(skillName, setupAnswers);
  return NextResponse.json({ systemPrompt });
}
