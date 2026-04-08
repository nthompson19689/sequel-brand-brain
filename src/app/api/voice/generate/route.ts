/**
 * POST /api/voice/generate — Short-form content generator for the Dictate
 * page's Command mode.
 *
 * Takes raw voice-transcribed source material and produces a finished
 * piece in one of the short-form content types: external email, internal
 * memo, Slack message, newsletter, press release, or campaign brief.
 *
 * This is the short-form cousin of /api/voice/generate-longform — that
 * route handles thought leadership posts and SEO blog posts by running
 * the writer + editor pipeline. This one does a single Claude call for
 * formats that don't need the full article treatment.
 *
 * Request body:
 *   {
 *     contentType: "external_email" | "internal_memo" | "slack_message"
 *                  | "newsletter" | "press_release" | "campaign_brief",
 *     transcript: string,   // raw voice notes / source material
 *   }
 *
 * Response: { text: string } — the finished piece in the selected format.
 */
import { getClaudeClient } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 60;

type ShortFormType =
  | "external_email"
  | "internal_memo"
  | "slack_message"
  | "newsletter"
  | "press_release"
  | "campaign_brief";

interface GenerateRequest {
  contentType: ShortFormType;
  transcript: string;
}

const SHORT_FORM_TYPES: ShortFormType[] = [
  "external_email",
  "internal_memo",
  "slack_message",
  "newsletter",
  "press_release",
  "campaign_brief",
];

interface FormatSpec {
  label: string;
  targetWords: string;
  instructions: string;
}

const FORMAT_SPECS: Record<ShortFormType, FormatSpec> = {
  external_email: {
    label: "External Email",
    targetWords: "150-350 words",
    instructions: `Write a polished outbound business email suitable for sending to a customer, partner, prospect, or external stakeholder.

Structure:
- Subject line on its own line at the top, prefixed with "Subject: "
- Greeting ("Hi [Name]," — use a placeholder if the speaker didn't name a recipient)
- 1-3 short body paragraphs that cover the substance
- A clear closing line (call to action, next step, or wrap)
- Sign-off ("Best," / "Thanks," etc. — match the tone the speaker implied)
- Signature placeholder on its own line: "[Your name]"

Tone: Professional but warm. Clear. Concise. Respectful of the reader's time. Match the register the speaker used (casual stays casual, formal stays formal). Prefer contractions unless the speaker was clearly formal.`,
  },
  internal_memo: {
    label: "Internal Memo",
    targetWords: "100-300 words",
    instructions: `Write an internal memo / FYI-style message for teammates inside the company.

Structure:
- Subject line on its own line at the top, prefixed with "Subject: "
- A one-sentence TL;DR at the top (bold with **)
- 2-5 short paragraphs OR a bulleted list of the key points — whichever fits the substance better
- A closing line with the ask or next step if the speaker implied one

Tone: Direct, collegial, no fluff. Assume the reader is a peer who already has context on the company. Skip greetings/sign-offs — this is internal. Prefer bullets over prose when the speaker listed items or made multiple distinct points.`,
  },
  slack_message: {
    label: "Slack Message",
    targetWords: "20-150 words",
    instructions: `Write a Slack message. This will be pasted directly into a Slack channel or DM.

Rules:
- Keep it SHORT. Slack is not an email — if it's over 150 words, it's too long.
- Use Slack markdown where helpful: *bold* (single asterisks, not double), _italic_, \`code\`, bullet points with •
- No greeting line unless it's a DM to one specific person
- No sign-off
- Use line breaks generously — Slack messages read better with whitespace
- If the speaker mentioned multiple items, use bullets
- Emoji use is fine but sparing — only if the speaker's tone implied it

Tone: Casual, direct, human. How you'd talk to a colleague in a hallway.`,
  },
  newsletter: {
    label: "Newsletter",
    targetWords: "300-600 words",
    instructions: `Write a newsletter section suitable for an email or marketing newsletter.

Structure:
- A punchy headline on its own line at the top (title case, no "Subject:" prefix)
- An opening hook (1-2 sentences that make the reader want to keep going)
- 2-4 short paragraphs of body content, each advancing the story
- Optional subheadings if the piece has distinct sections
- A closing line that ties back to the hook or points to an action

Tone: Editorial but warm. Voice-forward — it should sound like a real person wrote it, not a marketing bot. Match the Sequel editorial voice from the system context. Short paragraphs. No corporate jargon. Active voice.`,
  },
  press_release: {
    label: "Press Release",
    targetWords: "300-600 words",
    instructions: `Write a press release following standard PR format.

Structure:
- "FOR IMMEDIATE RELEASE" on its own line at the top
- A compelling headline in title case
- Optional subheadline (one line summarizing the "why it matters")
- Dateline: "[CITY, State] — [Month Day, Year] —" (use placeholders if the speaker didn't specify)
- Lead paragraph answering who/what/when/where/why in 2-3 sentences
- 2-3 body paragraphs with supporting detail and quotes (use placeholder quotes if the speaker described a sentiment but didn't give exact words: e.g., '"[Quote from CEO Name]," said [Name], [Title].')
- A boilerplate paragraph about the company (use a placeholder if one wasn't provided: "About [Company]: [placeholder].")
- Contact info placeholder at the bottom

Tone: Third person, factual, neutral. No marketing fluff. Match AP style where possible.`,
  },
  campaign_brief: {
    label: "Campaign Brief",
    targetWords: "250-500 words",
    instructions: `Write a marketing campaign brief formatted as a structured document.

Structure (use these exact section headers as **bold** lines):
- **Campaign name** — short working title
- **Objective** — one sentence, measurable if possible
- **Target audience** — who this is for, 1-2 sentences
- **Key message** — the one thing the audience should take away
- **Channels** — where the campaign runs (bulleted)
- **Deliverables** — what needs to be produced (bulleted)
- **Success metrics** — how we'll measure it (bulleted)
- **Timeline** — rough dates or phases
- **Owner** — who's accountable (use a placeholder if not specified)
- **Open questions** — anything the speaker flagged as TBD

Tone: Crisp, operational, no fluff. Use placeholders in brackets where the speaker didn't provide a value — don't invent details.`,
  },
};

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contentType = body.contentType;
  const transcript = (body.transcript || "").trim();

  if (!contentType || !SHORT_FORM_TYPES.includes(contentType)) {
    return Response.json(
      {
        error: `contentType must be one of: ${SHORT_FORM_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (!transcript) {
    return Response.json({ error: "Empty transcript" }, { status: 400 });
  }

  const spec = FORMAT_SPECS[contentType];

  // Shared brand docs (cached). Same Block 1 every other route uses, so
  // short-form content inherits voice, kill list, governance rules.
  const { blocks: systemBlocks } = await buildSystemBlocks({
    additionalContext: `You are the Sequel voice-to-content generator. You take raw voice-dictated source material and produce a finished piece in a specific short-form content type. You follow the format spec literally. You preserve the speaker's facts and tone. You do not invent details — if the speaker did not say something, use a bracketed placeholder. You apply Sequel brand voice through word choice, not by adding new ideas.`,
  });

  const userMessage = `The speaker dictated raw source material through a microphone. Clean it up and transform it into a finished ${spec.label} following the format below.

🎯 CONTENT TYPE: ${spec.label}
🎯 TARGET LENGTH: ${spec.targetWords}

FORMAT & STRUCTURE:
${spec.instructions}

HARD RULES:
1. Preserve the speaker's facts, names, numbers, and proper nouns exactly.
2. Do NOT invent details the speaker didn't mention. Use placeholders like [Name], [Company], [Date], [Quote from X] where information is missing.
3. Remove filler words, false starts, and self-corrections from the transcript before formatting.
4. Align word choice with the Sequel brand voice from your system context — kill list avoidance, no "it's not X, it's Y" constructions, positive framing, no forbidden competitor citations.
5. Return ONLY the finished piece. No preamble, no explanation, no "Here is the..." intro line, no markdown fences.
6. Do NOT wrap the output in quotes.

RAW VOICE SOURCE MATERIAL:
${transcript}`;

  const claude = getClaudeClient();

  try {
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
    });

    logCachePerformance(
      `/api/voice/generate[${contentType}]`,
      response.usage,
    );

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }

    text = text.trim();
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1).trim();
    }
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");

    return Response.json({
      text,
      contentType,
      label: spec.label,
      inputLength: transcript.length,
      outputLength: text.length,
    });
  } catch (err) {
    console.error("[api/voice/generate] Claude call failed:", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Content generation failed",
      },
      { status: 500 },
    );
  }
}
