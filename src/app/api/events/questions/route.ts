import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const QUESTIONS_PROMPT = `Generate 3-4 registration questions for the event described below.

Each question should serve DUAL purpose:
1. Help the attendee get more value from the event (personalization)
2. Qualify the registrant for sales follow-up (qualification)

Prefer multiple choice where possible (easier to analyze).

Examples of good dual-purpose questions:
- "What's your biggest challenge with [topic]?" → personalizes content + reveals pain
- "How is your team currently handling [problem]?" → shows intent + reveals current solution
- "What would success look like for you in [area]?" → identifies goals + qualifies budget/priority
- "How many people on your team work on [function]?" → qualifies company size

Return JSON:
{
  "questions": [
    {
      "question_text": "...",
      "question_type": "multiple_choice|open_ended",
      "options": ["option 1", "option 2", "option 3", "option 4"] or null for open_ended,
      "purpose": "qualification|personalization|content_planning"
    }
  ]
}`;

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ questions: [] });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  if (!eventId) return Response.json({ error: "event_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("event_questions")
    .select("*")
    .eq("event_id", eventId)
    .order("display_order");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ questions: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Generate questions via AI
  if (body.generate && body.event_id) {
    const { data: event } = await supabase
      .from("events")
      .select("event_name, event_type, description, target_audience, topic_tags")
      .eq("id", body.event_id)
      .single();

    if (!event) return Response.json({ error: "Event not found" }, { status: 404 });

    const claude = getClaudeClient();
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: [{ type: "text", text: QUESTIONS_PROMPT }],
      messages: [{
        role: "user",
        content: `Generate registration questions for:\nEvent: ${event.event_name}\nType: ${event.event_type}\nTopics: ${JSON.stringify(event.topic_tags)}\nAudience: ${event.target_audience || "General"}\nDescription: ${event.description || ""}`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.questions) {
        const rows = parsed.questions.map((q: { question_text: string; question_type: string; options: string[] | null; purpose: string }, i: number) => ({
          event_id: body.event_id,
          question_text: q.question_text,
          question_type: q.question_type || "multiple_choice",
          options: q.options || null,
          purpose: q.purpose || "qualification",
          display_order: i,
        }));

        const { data } = await supabase.from("event_questions").insert(rows).select();
        return Response.json({ questions: data || [] });
      }
    } catch {
      return Response.json({ raw: rawText, parsed: false });
    }
  }

  return Response.json({ error: "Invalid request" }, { status: 400 });
}
