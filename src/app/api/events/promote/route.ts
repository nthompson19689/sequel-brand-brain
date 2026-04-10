import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, getArticleLinkReference } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const PROMOTE_PROMPT = `You are an expert event marketing strategist. Generate a FULL promotional content package for the event described below.

Use the brand voice and guidelines from the Brand Brain context above. All content must sound like it comes from this brand.

Generate ALL of these in a single JSON response:

{
  "landing_page": {
    "headline": "...",
    "subheadline": "...",
    "bullet_points": ["what attendees will learn 1", "2", "3", "4"],
    "speaker_bios_html": "formatted speaker bios",
    "cta_text": "Register Now"
  },
  "email_announcement": {
    "subject_line": "specific, curiosity-driven subject",
    "body": "full email — what it is, why it matters, who's speaking, register CTA"
  },
  "email_reminder": {
    "subject_line": "...",
    "body": "new angle on why to attend, urgency framing, register CTA"
  },
  "email_day_of": {
    "subject_line": "...",
    "body": "short, simple, happening today with join link"
  },
  "linkedin_post": {
    "body": "hook with surprising insight, speaker mention, key takeaways with → arrows, registration link, hashtags at bottom (not inline)"
  },
  "internal_announcement": {
    "body": "short Slack/email for sales team — what it covers, why it matters to prospects, suggested forwarding message"
  }
}

RULES:
- All subject lines must be specific and curiosity-driven, NEVER generic like "You're Invited to Our Webinar"
- LinkedIn hashtags go at the very bottom after a line break, not inline
- Landing page copy should be HTML-ready
- Internal announcement should explain how sales can use the event in prospecting`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { event_id } = await request.json();
  if (!event_id) return Response.json({ error: "event_id required" }, { status: 400 });

  const { data: event, error: evtErr } = await supabase
    .from("events")
    .select("*")
    .eq("id", event_id)
    .single();

  if (evtErr || !event) return Response.json({ error: "Event not found" }, { status: 404 });

  const articleRef = await getArticleLinkReference();

  const eventContext = `
=== EVENT DETAILS ===
Name: ${event.event_name}
Type: ${event.event_type}
Date: ${event.event_date ? new Date(event.event_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "TBD"}
Duration: ${event.duration_minutes} minutes
Target Audience: ${event.target_audience || "General"}
Topics: ${JSON.stringify(event.topic_tags || [])}
Description: ${event.description || ""}
Registration URL: ${event.registration_url || "[REGISTRATION_LINK]"}

Speakers:
${(event.speaker_names || []).map((s: { name: string; title?: string; company?: string; bio?: string }) =>
  `- ${s.name}, ${s.title || ""} at ${s.company || ""}\n  Bio: ${s.bio || "N/A"}`
).join("\n")}

${articleRef ? `\nRelevant content to reference/link:\n${articleRef}` : ""}
`;

  try {
    const claude = getClaudeClient();
    const { blocks } = await buildSystemBlocks({
      additionalContext: PROMOTE_PROMPT + "\n\n" + eventContext,
    });

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: blocks,
      messages: [{
        role: "user",
        content: `Generate the full promotional content package for "${event.event_name}". Use our brand voice. Make every piece compelling enough to drive registrations.`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    let promo;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      promo = JSON.parse(cleaned);
    } catch {
      return Response.json({ event_id, raw: rawText, parsed: false });
    }

    // Save each content piece
    const contentRows = [];
    const map: Record<string, { type: string; titleField?: string; subjectField?: string; bodyField: string }> = {
      landing_page: { type: "landing_page", bodyField: "landing_page" },
      email_announcement: { type: "email_announcement", subjectField: "subject_line", bodyField: "body" },
      email_reminder: { type: "email_reminder", subjectField: "subject_line", bodyField: "body" },
      email_day_of: { type: "email_day_of", subjectField: "subject_line", bodyField: "body" },
      linkedin_post: { type: "linkedin_post", bodyField: "body" },
      internal_announcement: { type: "internal_announcement", bodyField: "body" },
    };

    for (const [key, config] of Object.entries(map)) {
      const data = promo[key];
      if (!data) continue;
      contentRows.push({
        event_id,
        content_type: config.type,
        title: data.headline || data.subject_line || config.type.replace(/_/g, " "),
        subject_line: data.subject_line || null,
        body: typeof data === "string" ? data : (data.body || JSON.stringify(data, null, 2)),
        status: "draft",
      });
    }

    if (contentRows.length > 0) {
      await supabase.from("event_content").insert(contentRows);
    }

    // Update event status to promoting
    await supabase.from("events").update({
      status: "promoting",
      updated_at: new Date().toISOString(),
    }).eq("id", event_id).eq("status", "planning");

    return Response.json({ event_id, promo, content_count: contentRows.length, parsed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Promotion generation failed";
    console.error("[Events Promote]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
