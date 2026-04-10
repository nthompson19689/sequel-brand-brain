import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, getArticleLinkReference } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const FOLLOWUP_PROMPT = `You are an expert event follow-up strategist. Generate a post-event content package.

Use the brand voice from the Brand Brain context above.

Generate ALL of these in a single JSON response:

{
  "follow_up_email": {
    "subject_line": "specific subject",
    "body": "thank attendees, share 2-3 key takeaways, link to recording, relevant next step CTA"
  },
  "follow_up_noshow": {
    "subject_line": "specific subject — no guilt",
    "body": "acknowledge they couldn't make it, share recording link, one compelling quote to create FOMO, same CTA"
  },
  "follow_up_linkedin": {
    "body": "'Here's what we covered' framing, 3-5 key insights with → arrows, one strong speaker quote, link to recording, hashtags at bottom"
  },
  "recap_blog": {
    "title": "blog post title",
    "body": "800-1200 word summary with key quotes, structured by theme, internal links, meta title, meta description, CTA to register for next event"
  }
}

RULES:
- Attendee email should be warm and grateful, not salesy
- No-show email should be empathetic — they missed out but no guilt
- LinkedIn recap should make people wish they'd attended
- Recap blog should use actual quotes as blockquotes with attribution
- All subject lines: specific, curiosity-driven, never generic`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { event_id, include_recap_blog } = await request.json();
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
Date: ${event.event_date ? new Date(event.event_date).toLocaleDateString() : "N/A"}
Recording URL: ${event.recording_url || "[RECORDING_LINK]"}

Speakers:
${(event.speaker_names || []).map((s: { name: string; title?: string; company?: string }) =>
  `- ${s.name}, ${s.title || ""} at ${s.company || ""}`
).join("\n")}

${event.transcript ? `\nEvent Transcript (use for quotes and insights):\n${event.transcript.slice(0, 15000)}` : "\nNo transcript available — generate content based on event description and topics."}

Topics: ${JSON.stringify(event.topic_tags || [])}
Description: ${event.description || ""}
${articleRef ? `\nRelated content for internal links:\n${articleRef}` : ""}
`;

  try {
    const claude = getClaudeClient();
    const { blocks } = await buildSystemBlocks({
      includeWritingStandards: !!include_recap_blog,
      additionalContext: FOLLOWUP_PROMPT + "\n\n" + eventContext,
    });

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: blocks,
      messages: [{
        role: "user",
        content: `Generate post-event follow-up content for "${event.event_name}". ${include_recap_blog ? "Include a recap blog post." : "Skip the recap blog."} Use our brand voice.`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    let followUp;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      followUp = JSON.parse(cleaned);
    } catch {
      return Response.json({ event_id, raw: rawText, parsed: false });
    }

    const contentRows = [];
    if (followUp.follow_up_email) {
      contentRows.push({ event_id, content_type: "follow_up_email", title: "Attendee Follow-up", subject_line: followUp.follow_up_email.subject_line, body: followUp.follow_up_email.body, status: "draft" });
    }
    if (followUp.follow_up_noshow) {
      contentRows.push({ event_id, content_type: "follow_up_noshow", title: "No-Show Follow-up", subject_line: followUp.follow_up_noshow.subject_line, body: followUp.follow_up_noshow.body, status: "draft" });
    }
    if (followUp.follow_up_linkedin) {
      contentRows.push({ event_id, content_type: "follow_up_linkedin", title: "LinkedIn Recap", subject_line: null, body: followUp.follow_up_linkedin.body, status: "draft" });
    }
    if (followUp.recap_blog && include_recap_blog) {
      contentRows.push({ event_id, content_type: "recap_blog", title: followUp.recap_blog.title || "Event Recap", subject_line: null, body: followUp.recap_blog.body, status: "draft" });
    }

    if (contentRows.length > 0) {
      await supabase.from("event_content").insert(contentRows);
    }

    return Response.json({ event_id, followUp, content_count: contentRows.length, parsed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Follow-up generation failed";
    console.error("[Events Follow-up]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
