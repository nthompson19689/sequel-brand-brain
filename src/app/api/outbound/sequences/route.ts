import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

const SEED_TEMPLATES = [
  {
    sequence_name: "Cold Outbound — Executive",
    description: "Multi-channel sequence for VP+ targets. Lead with personalization, close with value.",
    target_persona: "VP, C-suite, SVP",
    status: "active",
    steps: [
      { step_number: 1, channel: "linkedin_connect", delay_days: 0, subject_line: null, purpose: "Open the door — personalized connection request referencing their content or background", template_content: "Hi {{first_name}}, {{personal_hook}}. Would love to connect." },
      { step_number: 2, channel: "email", delay_days: 1, subject_line: "{{personal_hook_short}}", purpose: "First touch — lead with their world, not your product", template_content: "Hi {{first_name}},\n\n{{personal_hook_expanded}}\n\n{{timing_trigger_or_pain_point}}\n\nCurious if this resonates — happy to share how we've seen teams like yours approach it.\n\n{{sender_name}}" },
      { step_number: 3, channel: "email", delay_days: 4, subject_line: "{{relevant_case_study_teaser}}", purpose: "Value-add — share proof that you understand their problem", template_content: "Hi {{first_name}},\n\n{{case_study_or_insight}}\n\n{{connect_to_their_situation}}\n\nWorth a 15-min look? {{calendar_link}}\n\n{{sender_name}}" },
      { step_number: 4, channel: "sms", delay_days: 6, subject_line: null, purpose: "Quick touchpoint — casual, direct, one ask", template_content: "Hey {{first_name}}, {{sender_name}} here. Sent you a note about {{topic}}. Worth a quick chat? {{calendar_link}}" },
      { step_number: 5, channel: "email", delay_days: 9, subject_line: "worth a look either way", purpose: "Breakup — be human, offer value with no strings", template_content: "Hi {{first_name}},\n\nI'll keep this short — I know your inbox is a warzone.\n\n{{useful_resource_or_insight}}\n\nNo strings. If the timing's ever right, I'm here.\n\n{{sender_name}}" },
    ],
  },
  {
    sequence_name: "Cold Outbound — Practitioner",
    description: "Email-first sequence for Manager/Director targets. Lead with their pain, not your pitch.",
    target_persona: "Manager, Director",
    status: "active",
    steps: [
      { step_number: 1, channel: "email", delay_days: 0, subject_line: "{{pain_point_short}}", purpose: "Open with their pain — show you understand their Tuesday", template_content: "Hi {{first_name}},\n\n{{pain_point_expanded}}\n\n{{how_others_solve_it}}\n\nCurious if this is on your radar?\n\n{{sender_name}}" },
      { step_number: 2, channel: "linkedin_connect", delay_days: 1, subject_line: null, purpose: "Parallel channel — connect while email is fresh", template_content: "Hi {{first_name}} — just sent you a note about {{topic}}. Would love to connect here too." },
      { step_number: 3, channel: "email", delay_days: 3, subject_line: "how {{similar_company}} handled this", purpose: "Follow-up with specific example", template_content: "Hi {{first_name}},\n\n{{specific_example_or_case_study}}\n\n{{connect_to_their_situation}}\n\nHappy to walk through it — {{calendar_link}}\n\n{{sender_name}}" },
      { step_number: 4, channel: "email", delay_days: 7, subject_line: "closing the loop", purpose: "Breakup — friendly, low-pressure", template_content: "Hi {{first_name}},\n\nTotally understand if the timing's off. Here's {{useful_resource}} in case it's helpful down the road.\n\nAll the best,\n{{sender_name}}" },
    ],
  },
  {
    sequence_name: "Warm Inbound Follow-up",
    description: "For leads who downloaded content, attended a webinar, or filled out a form. Strike while warm.",
    target_persona: "Any inbound lead",
    status: "active",
    steps: [
      { step_number: 1, channel: "email", delay_days: 0, subject_line: "re: {{content_or_event_name}}", purpose: "Immediate — reference exactly what they engaged with", template_content: "Hi {{first_name}},\n\nSaw you {{action_taken}}. {{relevant_followup_based_on_content}}.\n\nWould love to hear what prompted the interest — happy to share more context.\n\n{{sender_name}}" },
      { step_number: 2, channel: "call", delay_days: 1, subject_line: null, purpose: "Call attempt with voicemail script", template_content: "VOICEMAIL: Hi {{first_name}}, {{sender_name}} from {{company}}. Noticed you {{action_taken}} — wanted to see if I can help with {{relevant_topic}}. I'll shoot you a quick email. Talk soon." },
      { step_number: 3, channel: "email", delay_days: 3, subject_line: "thought this might help", purpose: "Value-add — additional resource related to their interest", template_content: "Hi {{first_name}},\n\n{{additional_resource_related_to_interest}}\n\nHappy to walk through how this applies to {{their_company}}.\n\n{{sender_name}}" },
      { step_number: 4, channel: "sms", delay_days: 5, subject_line: null, purpose: "Quick meeting ask via text", template_content: "Hi {{first_name}}, {{sender_name}} here. Following up on {{content_or_event}}. Quick 15 min this week? {{calendar_link}}" },
      { step_number: 5, channel: "email", delay_days: 7, subject_line: "last one from me", purpose: "Final touch — calendar link, no pressure", template_content: "Hi {{first_name}},\n\nLast note from me on this. If you'd like to chat about {{topic}}, here's my calendar: {{calendar_link}}\n\nEither way, hope {{resource}} was useful.\n\n{{sender_name}}" },
    ],
  },
  {
    sequence_name: "Event / Webinar Follow-up",
    description: "For prospects met at events or who attended your webinar. Reference the shared experience.",
    target_persona: "Event attendee",
    status: "active",
    steps: [
      { step_number: 1, channel: "email", delay_days: 1, subject_line: "good to connect at {{event_name}}", purpose: "Reference the specific event and any conversation", template_content: "Hi {{first_name}},\n\n{{event_reference_or_session_mention}}\n\n{{connect_to_their_role_or_challenge}}\n\nWould love to continue the conversation — {{calendar_link}}\n\n{{sender_name}}" },
      { step_number: 2, channel: "linkedin_connect", delay_days: 2, subject_line: null, purpose: "Connect on LinkedIn mentioning the event", template_content: "Great connecting at {{event_name}}, {{first_name}}. Enjoyed {{specific_detail}}. Let's stay in touch." },
      { step_number: 3, channel: "email", delay_days: 5, subject_line: "related to what we discussed", purpose: "Value-add content related to event topic", template_content: "Hi {{first_name}},\n\n{{relevant_content_or_insight_from_event_topic}}\n\nThought of our conversation when I saw this.\n\n{{sender_name}}" },
      { step_number: 4, channel: "email", delay_days: 8, subject_line: "quick question", purpose: "Meeting ask with calendar link", template_content: "Hi {{first_name}},\n\nWould you be open to a quick call to explore {{specific_topic_from_event}}?\n\nHere's my calendar if easier: {{calendar_link}}\n\n{{sender_name}}" },
    ],
  },
];

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ sequences: [] });

  const { data, error } = await supabase
    .from("sequences")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sequences: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Seed templates
  if (body.seed_templates) {
    const { data, error } = await supabase
      .from("sequences")
      .upsert(SEED_TEMPLATES.map((t) => ({ ...t, created_by: "system" })), { onConflict: "sequence_name", ignoreDuplicates: true })
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sequences: data, seeded: true });
  }

  // Create custom sequence
  const { data, error } = await supabase
    .from("sequences")
    .insert({
      sequence_name: body.sequence_name,
      description: body.description || null,
      steps: body.steps || [],
      target_persona: body.target_persona || null,
      status: body.status || "draft",
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sequence: data });
}
