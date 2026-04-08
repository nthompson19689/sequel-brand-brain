/**
 * POST /api/voice/process — Whispr-Flow-style voice processing layer.
 *
 * Takes a raw transcript from the browser's SpeechRecognition API and
 * processes it through Claude in one of two modes:
 *
 *   1. DICTATE MODE (default)
 *      - Cleans up the transcript: punctuation, sentence boundaries, casing.
 *      - Removes filler words ("um", "uh", "like", "you know").
 *      - Preserves the speaker's voice and intent — does NOT paraphrase.
 *      - Output is formatted for the `context` the user is dictating into
 *        (chat, content editor, email, search input, etc.).
 *
 *   2. COMMAND MODE
 *      - Treats the transcript as an INSTRUCTION, not content.
 *      - Uses the `selectedText` / `contextText` as the subject to transform.
 *      - Applies the spoken instruction ("make this more formal",
 *        "summarize this", "turn this into bullet points").
 *      - Returns ONLY the transformed text so the caller can swap it in
 *        with an undo handle.
 *
 * Both modes pull Sequel brand guidelines from the shared brand-context
 * loader so output always sounds like Sequel.
 *
 * Request body:
 *   {
 *     mode: "dictate" | "command",
 *     transcript: string,                  // raw speech-to-text output
 *     context?: "chat" | "content" | "email" | "generic",  // where the user is dictating
 *     selectedText?: string,               // for command mode: the text to transform
 *   }
 *
 * Response:
 *   { text: string }  // the processed / transformed text
 *   or { error: string }
 */
import { getClaudeClient } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 30;

type VoiceMode = "dictate" | "command";
type VoiceContext = "chat" | "content" | "email" | "generic";

interface VoiceProcessRequest {
  mode: VoiceMode;
  transcript: string;
  context?: VoiceContext;
  selectedText?: string;
}

const CONTEXT_TONE: Record<VoiceContext, string> = {
  chat: "Conversational and direct. This text will appear in a chat / agent interface — match the tone of a Slack message or a quick note to a teammate. Keep contractions. Short paragraphs. No headers.",
  content:
    "Polished blog copy. This text will become part of a published article — match the Sequel editorial voice (third-person plural 'we/our', essay style not listicle, no filler, no kill-list phrases). Fix grammar aggressively but keep the speaker's rhythm and ideas intact.",
  email:
    "Professional but warm. This text will become an email or business message — greeting, clear body, sign-off if the speaker implied one. Keep it concise and respectful. Match executive communication tone.",
  generic:
    "Clean, direct written English. Match the register the speaker used — casual stays casual, formal stays formal. Just fix the mechanics.",
};

function buildDictateUserMessage(
  transcript: string,
  context: VoiceContext
): string {
  return `Clean up this raw voice transcript. It was captured from a live microphone and has typical speech artifacts — missing punctuation, run-on sentences, filler words, false starts.

🎯 DESTINATION CONTEXT: ${context.toUpperCase()}
${CONTEXT_TONE[context]}

RULES FOR CLEANUP:
1. Add correct punctuation, capitalization, and sentence boundaries.
2. Split into paragraphs where the speaker paused on a new thought.
3. Remove filler: "um", "uh", "like", "you know", "I mean", "sort of", "kind of" (when used as filler, not as meaningful qualifiers).
4. Remove false starts and self-corrections. If the speaker said "we should, wait, we need to" → write "we need to".
5. PRESERVE the speaker's word choices, tone, and ideas. Do NOT paraphrase. Do NOT add content the speaker didn't say. Do NOT insert facts or examples.
6. If the speaker used a contraction, keep the contraction. If they didn't, don't add one.
7. Never change proper nouns, product names, or numbers.
8. Do NOT add greetings, sign-offs, headers, or meta commentary. Just return the cleaned prose.
9. Do NOT wrap the output in quotes or markdown. Return plain text.
10. Align terminology and voice with the Sequel brand guidelines in your system context where applicable — but only through word choice, not by adding new ideas.

Output ONLY the cleaned-up text. No preamble, no explanation, no quotes.

RAW TRANSCRIPT:
${transcript}`;
}

function buildCommandUserMessage(
  instruction: string,
  selectedText: string,
  context: VoiceContext
): string {
  return `The user issued a spoken command to transform the SUBJECT TEXT below. Execute the command and return ONLY the transformed text.

🎯 DESTINATION CONTEXT: ${context.toUpperCase()}
${CONTEXT_TONE[context]}

RULES:
1. Treat the INSTRUCTION as a command, not content. Do NOT put the instruction into the output.
2. Apply the instruction to the SUBJECT TEXT and return the result.
3. Align the output with the Sequel brand guidelines in your system context — voice, terminology, kill-list avoidance.
4. If the instruction is ambiguous, pick the most literal interpretation.
5. NEVER use "it's not X, it's Y" constructions. State what things are, not what they aren't.
6. Preserve any URLs, proper nouns, numbers, or technical terms from the subject text unless the instruction explicitly says to change them.
7. Return ONLY the transformed text. No preamble, no commentary, no quotes, no markdown fences.

INSTRUCTION (from voice):
${instruction}

SUBJECT TEXT:
${selectedText}`;
}

export async function POST(request: Request) {
  let body: VoiceProcessRequest;
  try {
    body = (await request.json()) as VoiceProcessRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode: VoiceMode = body.mode === "command" ? "command" : "dictate";
  const context: VoiceContext = body.context || "generic";
  const transcript = (body.transcript || "").trim();
  const selectedText = (body.selectedText || "").trim();

  if (!transcript) {
    return Response.json(
      { error: "Empty transcript" },
      { status: 400 }
    );
  }

  if (mode === "command" && !selectedText) {
    return Response.json(
      {
        error:
          "Command mode requires selectedText — the subject to transform.",
      },
      { status: 400 }
    );
  }

  // Shared brand docs (cached). Same Block 1 every other route uses,
  // so voice processing inherits voice, kill list, governance rules.
  const { blocks: systemBlocks } = await buildSystemBlocks({
    additionalContext: `You are the Sequel voice processing layer. Your job is to take raw voice input from a live microphone and produce clean, brand-aligned written output. You are a transcription cleaner, not a writer. You do not invent content. You do not paraphrase. You follow instructions literally in command mode and preserve speaker intent in dictate mode.`,
  });

  const userMessage =
    mode === "dictate"
      ? buildDictateUserMessage(transcript, context)
      : buildCommandUserMessage(transcript, selectedText, context);

  const claude = getClaudeClient();

  try {
    const response = await claude.messages.create({
      // Per spec: use claude-sonnet-4-20250514 for the voice layer.
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
    });

    logCachePerformance(`/api/voice/process[${mode}]`, response.usage);

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }

    // Strip common wrapper artifacts the model sometimes adds.
    text = text.trim();
    // Remove surrounding quotes if the model wrapped the output.
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1).trim();
    }
    // Remove accidental markdown fences.
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");

    return Response.json({
      text,
      mode,
      context,
      inputLength: transcript.length,
      outputLength: text.length,
    });
  } catch (err) {
    console.error("[api/voice/process] Claude call failed:", err);
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Voice processing failed",
      },
      { status: 500 }
    );
  }
}
