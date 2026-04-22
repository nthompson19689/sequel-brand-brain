import { getClaudeClient } from "@/lib/claude";
import { WRITER_SYSTEM_PROMPT } from "@/lib/content/writer-prompt";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const GENERATE_PROMPT = `You are an expert outbound sales copywriter. Generate personalized messages for each step in the sequence.

RULES — follow these exactly:
- First email: Lead with the personal hook or timing trigger, NOT the product. Show you did your homework. Soft ask — curiosity, not a meeting.
- Second email: Lead with value. Share a relevant insight, case study, or framework. Connect to their specific pain. Slightly firmer ask.
- Third/breakup email: Be human. Acknowledge you're following up. Offer a genuinely useful resource with no strings. Clear final ask with calendar link.
- LinkedIn connection note: Under 300 characters. Reference something specific about them. No pitch.
- LinkedIn InMail: Can include one value prop, but lead with personalization.
- SMS: Max 160 characters. Casual, direct, one clear ask. Only after email contact.
- Call talking points: Opening line with personal hook, 2-3 discovery questions, one relevant value prop, suggested next step.
- ALL email subjects: lowercase, 3-6 words, feel human. Never salesy, never clickbait.
- NO: "I hope this email finds you well", "I'd love to pick your brain", "Just circling back", "In today's fast-paced world", "synergy", "leverage", "loop back"

Use the brand voice from the Brand Brain context above, but sound like a REAL PERSON having a conversation — not a marketing department.

Return ONLY valid JSON:
{
  "messages": [
    {
      "step_number": 1,
      "channel": "email|linkedin_connect|linkedin_inmail|sms|call",
      "subject_line": "lowercase subject for emails, null for others",
      "body": "the full message text",
      "purpose": "what this step is trying to accomplish"
    }
  ]
}`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { prospect_id, sequence_id } = await request.json();
  if (!prospect_id || !sequence_id) {
    return Response.json({ error: "prospect_id and sequence_id required" }, { status: 400 });
  }

  // Load prospect + research + sequence in parallel
  const [prospectRes, researchRes, sequenceRes] = await Promise.all([
    supabase.from("prospects").select("*").eq("id", prospect_id).single(),
    supabase.from("prospect_research").select("*").eq("prospect_id", prospect_id).maybeSingle(),
    supabase.from("sequences").select("*").eq("id", sequence_id).single(),
  ]);

  const prospect = prospectRes.data;
  const research = researchRes.data;
  const sequence = sequenceRes.data;

  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });
  if (!sequence) return Response.json({ error: "Sequence not found" }, { status: 404 });

  const prospectContext = `
=== PROSPECT ===
Name: ${prospect.first_name} ${prospect.last_name}
Title: ${prospect.title || "Unknown"}
Company: ${prospect.company_name || "Unknown"}
Domain: ${prospect.company_domain || "Unknown"}
LinkedIn: ${prospect.linkedin_url || "Not provided"}
Seniority: ${prospect.seniority_level || "Unknown"}
Industry: ${prospect.industry || "Unknown"}
Company Size: ${prospect.employee_count || "Unknown"}

=== RESEARCH ===
${research ? `
Company: ${research.company_summary || "No summary"}
Role Analysis: ${research.role_analysis || "None"}
Personal Hooks: ${JSON.stringify(research.personal_hooks || [])}
Pain Points: ${JSON.stringify(research.pain_points || [])}
Timing Triggers: ${JSON.stringify(research.timing_triggers || [])}
Recommended Opening: ${research.recommended_opening || "None"}
Product Angle: ${research.recommended_product_angle || "None"}
Proof Points: ${JSON.stringify(research.relevant_proof_points || [])}
Recent Activity: ${JSON.stringify(research.recent_activity || [])}
` : "No research available — use role-based personalization only."}

=== SEQUENCE ===
Name: ${sequence.sequence_name}
Target Persona: ${sequence.target_persona || "General"}
Steps:
${JSON.stringify(sequence.steps, null, 2)}

Generate a personalized message for EACH step in this sequence. Replace all {{merge_variables}} with actual personalized content based on the research above.`;

  try {
    const claude = getClaudeClient();
    const { blocks } = await buildSystemBlocks({
      additionalContext: WRITER_SYSTEM_PROMPT + "\n\n" + GENERATE_PROMPT + "\n\n" + prospectContext,
    });

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: blocks,
      messages: [{
        role: "user",
        content: `Generate fully personalized outreach messages for ${prospect.first_name} ${prospect.last_name} (${prospect.title} at ${prospect.company_name}) using the "${sequence.sequence_name}" sequence. Use our brand voice. Make every message feel like a real human wrote it.`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    let generated;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      generated = JSON.parse(cleaned);
    } catch {
      return Response.json({ prospect_id, raw: rawText, parsed: false });
    }

    // Save messages to prospect_messages
    if (generated.messages && Array.isArray(generated.messages)) {
      const rows = generated.messages.map((m: { step_number: number; channel: string; subject_line: string | null; body: string }) => ({
        prospect_id,
        sequence_id,
        step_number: m.step_number,
        channel: m.channel,
        subject_line: m.subject_line || null,
        body: m.body,
        status: "draft",
      }));

      await supabase.from("prospect_messages").insert(rows);

      // Update prospect status to sequenced
      await supabase.from("prospects").update({
        prospect_status: "sequenced",
        updated_at: new Date().toISOString(),
      }).eq("id", prospect_id).eq("prospect_status", "researching");
    }

    return Response.json({ prospect_id, generated, parsed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    console.error("[Outbound Generate]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
