export type StepType =
  | "ai_generation"
  | "search_knowledge_base"
  | "web_research"
  | "deep_research"
  | "human_review";

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  prompt: string;
  model?: string;
}

export type AgentCategory = "content_marketing" | "product_marketing" | "event_marketing" | "sales_enablement";

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  system_prompt: string;
  steps: WorkflowStep[];
  tools: string[];
  output_format: string;
  reference_examples: string;
  model: string;
  is_shared: boolean;
  run_count: number;
  is_builtin?: boolean;
  workspace_id?: string | null;
  category?: AgentCategory;
}

export const AGENT_CATEGORIES: Record<AgentCategory, { label: string; icon: string; color: string }> = {
  content_marketing: { label: "Content Marketing", icon: "✍️", color: "bg-purple-100 text-purple-700" },
  product_marketing: { label: "Product Marketing", icon: "🚀", color: "bg-amber-100 text-amber-700" },
  event_marketing: { label: "Event Marketing", icon: "🎪", color: "bg-blue-100 text-blue-700" },
  sales_enablement: { label: "Sales Enablement", icon: "💼", color: "bg-emerald-100 text-emerald-700" },
};

export const STEP_TYPE_META: Record<
  StepType,
  { label: string; color: string; icon: string }
> = {
  ai_generation: {
    label: "AI Generation",
    color: "indigo",
    icon: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z",
  },
  search_knowledge_base: {
    label: "Search Knowledge Base",
    color: "emerald",
    icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  },
  web_research: {
    label: "Web Research",
    color: "amber",
    icon: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
  },
  deep_research: {
    label: "Deep Research (Perplexity)",
    color: "cyan",
    icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6",
  },
  human_review: {
    label: "Human Review",
    color: "violet",
    icon: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  },
};

const BASE_SYSTEM = `You are an AI agent built into the Sequel Brand Brain. You have access to Sequel's brand guidelines, content library, competitive intelligence, and customer insights. Always follow the brand voice and tone guidelines. Be specific — use real data from the knowledge base when available. When you don't have specific data, say so clearly rather than making things up.`;

function agent(
  id: string,
  name: string,
  icon: string,
  category: AgentCategory,
  description: string,
  systemExtra: string,
  steps: WorkflowStep[],
  tools: string[],
  outputFormat: string,
  model = "claude-sonnet-4-6",
): Agent {
  return {
    id,
    name,
    description,
    icon,
    system_prompt: BASE_SYSTEM + "\n\n" + systemExtra,
    steps,
    tools,
    output_format: outputFormat,
    reference_examples: "",
    model,
    is_shared: false,
    run_count: 0,
    is_builtin: true,
    workspace_id: CATEGORY_TO_WORKSPACE[category] || null,
    category,
  };
}

// Map each agent category to its workspace ID
const CATEGORY_TO_WORKSPACE: Record<AgentCategory, string> = {
  content_marketing: "ws-content-marketing",
  product_marketing: "ws-product-marketing",
  event_marketing: "ws-event-marketing",
  sales_enablement: "ws-sales-enablement",
};

// ═══════════════════════════════════════════════════
// 12 BUILT-IN AGENTS
// ═══════════════════════════════════════════════════

export const BUILTIN_AGENTS: Agent[] = [
  // ───── CONTENT MARKETING ─────
  agent(
    "00000000-0000-4000-a000-100000000001",
    "Content Idea Generator", "💡", "content_marketing",
    "Enter a topic or business goal. I'll check what you've already published, what prospects are asking about, and what's trending — then give you 10 ranked content ideas.",
    "You generate ranked content ideas grounded in real data. Prioritize ideas that fill gaps in existing coverage.",
    [
      { id: "s1", name: "Search existing content & call insights", type: "search_knowledge_base",
        prompt: "Search the articles table for existing coverage on {{input}} and related topics. Also search call_insights for questions prospects and customers are asking about this topic." },
      { id: "s2", name: "Research trending content", type: "web_research",
        prompt: "Research trending topics and top-performing content related to {{input}}. Look at what competitors are publishing, what keywords are gaining traction, and what angles are underserved." },
      { id: "s3", name: "Generate 10 ranked ideas", type: "ai_generation",
        prompt: `Produce 10 content ideas ranked by potential impact. For each idea include:
1. **Suggested title**
2. **Angle/hook** — what makes this different
3. **Target keyword**
4. **Recommended format** (blog post, comparison guide, how-to, listicle)
5. **Estimated word count**
6. **Why this matters** — grounded in call insights or search trends
7. **Gap indicator** — does this fill a gap in our existing coverage?

Our existing content:\n{{step_1}}\n\nTrending/competitive landscape:\n{{step_2}}` },
    ],
    ["articles", "call_insights", "brand_docs"],
    "10 ranked content ideas with titles, keywords, and rationale",
  ),

  agent(
    "00000000-0000-4000-a000-100000000002",
    "LinkedIn Post Writer", "💼", "content_marketing",
    "Give me a topic, insight, or article link. I'll write 3 LinkedIn post variants in your brand voice — a hot take, a story, and a data-led post.",
    "You write LinkedIn posts that stop the scroll. Strong first lines are critical. Match brand voice exactly.",
    [
      { id: "s1", name: "Load brand voice & source content", type: "search_knowledge_base",
        prompt: "Load brand docs for voice and tone. If an article URL or title is provided in '{{input}}', search the articles table for its full content. Also load executive voice guidelines if available." },
      { id: "s2", name: "Write 3 post variants", type: "ai_generation",
        prompt: `Produce 3 LinkedIn post variants about {{input}}:

**(a) Hot Take** — Opinion-led, punchy, contrarian or bold. Opens with a one-line hook that stops the scroll. 150-200 words.

**(b) Story-Driven** — Narrative hook that draws the reader in, builds to an insight, ends with a takeaway. 150-200 words.

**(c) Data-Led** — Opens with a surprising stat or data point, provides context, draws an implication. 150-200 words.

Rules for ALL posts:
- Strong first line (this IS the hook — most important sentence)
- Short paragraphs (1-2 sentences per line)
- End with a clear point or CTA
- Match brand voice from docs
- Avoid all banned phrases from editorial guidelines
- Do NOT use hashtags unless the user asks

Brand context:\n{{step_1}}` },
    ],
    ["brand_docs", "articles"],
    "3 LinkedIn post variants: hot take, story, data-led",
  ),

  agent(
    "00000000-0000-4000-a000-100000000003",
    "Content Repurposer", "♻️", "content_marketing",
    "Paste an article, transcript, or case study. I'll turn it into a LinkedIn post, email section, social snippets, and a blog summary.",
    "You repurpose content into multiple formats. Each output should feel native to its format, not just shortened.",
    [
      { id: "s1", name: "Load brand voice", type: "search_knowledge_base",
        prompt: "Load brand docs for voice and tone guidelines." },
      { id: "s2", name: "Repurpose into 5 formats", type: "ai_generation",
        prompt: `Read the source content and produce 5 outputs:

**(a) LinkedIn Post** — Hook + key insight + CTA, 150-200 words, strong opening line.

**(b) Email Newsletter Section** — 3-4 paragraphs with a compelling subject line and link-back CTA.

**(c) 5 Social Snippets** — Each under 280 characters, each highlighting a DIFFERENT insight (not 5 versions of the same point).

**(d) Short-Form Blog Summary** — 300-500 words, standalone quick-read version.

**(e) 3 Pull Quotes** — Sentences from the source that work as standalone graphics or callouts.

All outputs must match brand voice. Each should feel native to its format.

Brand voice:\n{{step_1}}\n\nSource content:\n{{input}}` },
    ],
    ["brand_docs"],
    "5 repurposed formats: LinkedIn, email, social, blog summary, pull quotes",
  ),

  // ───── PRODUCT MARKETING ─────
  agent(
    "00000000-0000-4000-a000-200000000001",
    "Launch Messaging Generator", "🚀", "product_marketing",
    "Enter a product or feature name. I'll generate positioning, persona-specific messaging, proof points, and a one-pager outline.",
    "You create launch messaging that's specific and differentiated. Ground everything in competitive context.",
    [
      { id: "s1", name: "Search brand context & competitive intel", type: "search_knowledge_base",
        prompt: "Search brand docs for current positioning. Search battle cards for competitive landscape. Search articles for related content. Search call insights for what prospects say about {{input}}." },
      { id: "s2", name: "Research market landscape", type: "web_research",
        prompt: "Research what competitors say about features similar to {{input}}. What's the category narrative right now?" },
      { id: "s3", name: "Generate launch messaging", type: "ai_generation",
        prompt: `Produce launch messaging for {{input}}:

**(a) Core positioning** — One sentence: what this is, who it's for, why it matters.

**(b) 3 persona messaging variants:**
- CMO/executive buyer: ROI and strategic impact
- Practitioner/end user: ease of use and daily workflow
- Technical evaluator: integration, security, architecture

**(c) One-pager outline** — Recommended sections and key points for each.

**(d) 3-5 proof points** — From case studies, call insights, or product data.

**(e) 5 email subject lines** for launch announcement.

Brand context:\n{{step_1}}\n\nMarket landscape:\n{{step_2}}` },
    ],
    ["brand_docs", "battle_cards", "articles", "call_insights"],
    "Positioning, persona messaging, one-pager outline, proof points",
  ),

  agent(
    "00000000-0000-4000-a000-200000000002",
    "Competitive Battle Card", "⚔️", "product_marketing",
    "Name a competitor. I'll research their positioning, pull our win/loss data, and build a complete battle card.",
    "You build honest, tactical battle cards. Be direct about competitor strengths — sales reps need truth, not spin.",
    [
      { id: "s1", name: "Research competitor online", type: "web_research",
        prompt: "Research {{input}} — their website, pricing page, recent product announcements, G2/Capterra reviews, analyst mentions. Focus on facts that matter for competitive positioning." },
      { id: "s2", name: "Pull internal competitive intel", type: "search_knowledge_base",
        prompt: "Search battle_cards for existing intel on {{input}}. Search call_insights for deals where {{input}} was mentioned — won and lost. Search articles for competitive content." },
      { id: "s3", name: "Build battle card", type: "ai_generation",
        prompt: `Build a structured battle card for {{input}}:

**(a) Competitor Overview** — What they do, who they target, positioning.
**(b) Their Strengths** — Be honest. Sales reps need to know what they'll hear.
**(c) Their Weaknesses** — Where they fall short vs us.
**(d) Common Objections & Responses** — Pull from real won-deal call insights.
**(e) Why We Win** — 3-4 differentiators that actually close deals.
**(f) Landmines to Set** — Questions a rep can ask early to expose competitor weakness.
**(g) Key Talking Points** — 5 things to say in a competitive deal.

Web research:\n{{step_1}}\n\nInternal intel:\n{{step_2}}` },
    ],
    ["battle_cards", "call_insights", "articles"],
    "Structured battle card with strengths, weaknesses, talk tracks",
  ),

  agent(
    "00000000-0000-4000-a000-200000000003",
    "Customer Story Drafter", "📖", "product_marketing",
    "Enter a customer name. I'll find relevant call data, research their company, and draft a case study.",
    "You draft case studies grounded in real call data. Flag where real metrics are needed with [INSERT METRIC].",
    [
      { id: "s1", name: "Search customer call data", type: "search_knowledge_base",
        prompt: "Search call_insights for all calls with {{input}} — especially positive sentiment calls. Search articles for any existing case study or customer mention." },
      { id: "s2", name: "Research customer company", type: "web_research",
        prompt: "Research {{input}} — what they do, size, industry, recent news." },
      { id: "s3", name: "Draft case study", type: "ai_generation", model: "claude-opus-4-6",
        prompt: `Draft a case study for {{input}}:

**(a) Customer Snapshot** — One paragraph on who they are.
**(b) The Challenge** — What problem they faced. Use language from their actual calls if available.
**(c) The Solution** — How they use our product, which features matter most.
**(d) The Results** — Specific metrics. Use real numbers from calls. If unavailable, note [INSERT METRIC].
**(e) Pull Quote Suggestion** — A sentence based on their call sentiment.
**(f) Key Stats Sidebar** — 3-4 metrics for a visual callout.

Call data:\n{{step_1}}\n\nCompany research:\n{{step_2}}` },
      { id: "s4", name: "Review draft", type: "human_review",
        prompt: "Review the case study draft. Verify facts and fill in any [INSERT METRIC] placeholders with real data." },
    ],
    ["call_insights", "articles", "brand_docs"],
    "Case study draft with customer snapshot, challenge, solution, results",
    "claude-sonnet-4-6",
  ),

  // ───── EVENT MARKETING ─────
  agent(
    "00000000-0000-4000-a000-300000000001",
    "Webinar Brief Generator", "🎤", "event_marketing",
    "Enter a webinar topic and audience. I'll create the session description, talking points, poll questions, and email drafts.",
    "You create complete webinar briefs. Session descriptions should be benefit-driven. Poll questions should drive engagement.",
    [
      { id: "s1", name: "Search related content & insights", type: "search_knowledge_base",
        prompt: "Search articles for related content on {{input}}. Search call_insights for what prospects ask about this topic — what excites them, what confuses them." },
      { id: "s2", name: "Generate webinar brief", type: "ai_generation",
        prompt: `Produce a complete webinar brief for {{input}}:

**(a) Session Title** — 3 options, each compelling and specific.
**(b) Session Description** — 150 words, benefit-driven, answers "why should I attend?"
**(c) Speaker Talking Points** — 5-7 key points with supporting data.
**(d) 5 Audience Poll Questions** — Interactive, designed to drive engagement and useful data.
**(e) Pre-Event Email** — Subject line + body, creates urgency without being salesy.
**(f) Post-Event Follow-Up Email** — Subject line + body, references key insights, includes CTA.

All outputs match brand voice.

Related content & insights:\n{{step_1}}` },
    ],
    ["articles", "call_insights", "brand_docs"],
    "Webinar brief with titles, description, talking points, polls, emails",
  ),

  agent(
    "00000000-0000-4000-a000-300000000002",
    "Transcript Repurposer", "🔄", "event_marketing",
    "Paste a webinar transcript. I'll extract key insights and turn them into a blog post, social clips, summary, and recap email.",
    "You extract value from transcripts. Blog posts should stand alone, not just summarize.",
    [
      { id: "s1", name: "Load brand voice & find related articles", type: "search_knowledge_base",
        prompt: "Load brand docs for voice guidelines. Search articles for existing content on similar topics for internal linking." },
      { id: "s2", name: "Repurpose transcript", type: "ai_generation",
        prompt: `Read the transcript and produce:

**(a) Key Insights Summary** — 5 most important takeaways, 2-3 sentences each.
**(b) Blog Post Draft** — 800-1200 words, standalone article (not just a summary), unique angle, internal links.
**(c) 5 Social Clips** — Each a standalone insight with approximate timestamp, formatted for social.
**(d) One-Page Summary** — Bullet-point quick reference.
**(e) Attendee Recap Email** — Thanks, 3 key takeaways, links to related resources.

Brand voice:\n{{step_1}}\n\nTranscript:\n{{input}}` },
    ],
    ["brand_docs", "articles"],
    "5 repurposed outputs from transcript: insights, blog, social, summary, email",
  ),

  agent(
    "00000000-0000-4000-a000-300000000003",
    "Event Follow-Up Sequencer", "📧", "event_marketing",
    "Enter an event name and attendee segment. I'll write a 3-email follow-up sequence personalized to engagement level.",
    "You write event follow-up sequences. Tone varies by segment. High-engagement attendees get premium content.",
    [
      { id: "s1", name: "Load brand voice & related content", type: "search_knowledge_base",
        prompt: "Load brand docs for voice. Search articles for content relevant to the event topic that can be shared in follow-ups." },
      { id: "s2", name: "Write 3-email sequence", type: "ai_generation",
        prompt: `The user specifies an event and one of three segments: (a) Registered but didn't attend, (b) Attended low engagement, (c) Highly engaged.

Write a 3-email sequence for the segment specified in {{input}}:

**Email 1 (Day 1)** — For no-shows: share replay + key insight. Low engagement: highlight what they missed. High engagement: go deeper.
**Email 2 (Day 3-4)** — Share a related resource from content library, connect to an event insight.
**Email 3 (Day 7)** — Soft CTA. No-shows: second chance. Low: specific use case. High: demo/conversation.

Each email: subject line, preview text, body, CTA. All match brand voice.

Brand voice & content:\n{{step_1}}` },
    ],
    ["brand_docs", "articles"],
    "3-email follow-up sequence tailored to attendee segment",
  ),

  // ───── SALES ENABLEMENT ─────
  agent(
    "00000000-0000-4000-a000-400000000001",
    "Meeting Prep Agent", "🎯", "sales_enablement",
    "Enter a company name and contact. I'll pull call history, find relevant content, check competitive context, and build a one-page prep doc.",
    "You build meeting prep docs for sales reps. Be specific — use real call data when available.",
    [
      { id: "s1", name: "Search call history & competitive intel", type: "search_knowledge_base",
        prompt: "Search call_insights for any previous interactions with {{input}}. Search battle_cards for competitors likely in this deal. Search articles for content relevant to their industry." },
      { id: "s2", name: "Research the company", type: "web_research",
        prompt: "Research {{input}} — recent news, funding, job postings that signal priorities, tech stack." },
      { id: "s3", name: "Build meeting prep doc", type: "ai_generation",
        prompt: `Build a one-page meeting prep doc for {{input}}:

**(a) Company Snapshot** — What they do, size, industry, recent news.
**(b) Previous Interactions** — Summary of past calls. If no history, say so clearly.
**(c) Likely Pain Points** — Based on industry and profile.
**(d) Competitive Context** — Competitors mentioned or likely in the deal.
**(e) Talking Points** — 5 specific things to bring up, grounded in data.
**(f) Content to Share** — 2-3 articles or case studies to send.
**(g) Questions to Ask** — 3-5 discovery questions tailored to this prospect.

Call history & intel:\n{{step_1}}\n\nCompany research:\n{{step_2}}` },
    ],
    ["call_insights", "articles", "battle_cards"],
    "One-page meeting prep doc with company context, talking points, questions",
  ),

  agent(
    "00000000-0000-4000-a000-400000000002",
    "Objection Response Generator", "🛡️", "sales_enablement",
    "Enter an objection you're hearing. I'll find how top reps have handled it and give you 3 response strategies.",
    "You help reps handle objections with real evidence. Provide exact words they can use.",
    [
      { id: "s1", name: "Search call insights for this objection", type: "search_knowledge_base",
        prompt: "Search call_insights for past calls where the objection '{{input}}' came up — especially in deals that were won. Search battle_cards for relevant competitive positioning. Load brand docs for messaging." },
      { id: "s2", name: "Generate 3 response strategies", type: "ai_generation",
        prompt: `Produce 3 response approaches for the objection: "{{input}}"

**(a) Direct Response** — Acknowledge head-on and counter with evidence. Include a specific proof point from call insights if available. Provide exact words in quotes.

**(b) Reframe** — Shift the conversation to a criterion where we're stronger. Include a bridge phrase. Provide exact words in quotes.

**(c) Story Response** — Brief narrative from a customer who had the same concern. Base on real call insights or create a plausible composite. Provide exact words in quotes.

For each: the exact words to say, when this approach works best, and a follow-up question.

Call insights & battle cards:\n{{step_1}}` },
    ],
    ["call_insights", "battle_cards", "brand_docs"],
    "3 objection response strategies with exact talk tracks",
  ),

  agent(
    "00000000-0000-4000-a000-400000000003",
    "Prospect Research Brief", "🔎", "sales_enablement",
    "Enter a company name. I'll research them, find connections to our product, and recommend an outreach strategy.",
    "You research prospects and recommend specific, personalized outreach — not generic templates.",
    [
      { id: "s1", name: "Research the prospect", type: "web_research",
        prompt: "Research {{input}} — website, recent news, funding, leadership team, job postings, tech stack, event activity, LinkedIn presence." },
      { id: "s2", name: "Search for existing connections", type: "search_knowledge_base",
        prompt: "Search articles for content relevant to their industry. Search call_insights for any interactions. Search battle_cards for competitors they might use." },
      { id: "s3", name: "Build prospect brief & outreach", type: "ai_generation",
        prompt: `Build a prospect research brief for {{input}}:

**(a) Company Overview** — What they do, size, funding, key people.
**(b) Why They're a Fit** — 3 specific reasons based on their profile.
**(c) Potential Pain Points** — Challenges they likely face that we solve.
**(d) Competitive Landscape** — Tools they might use, based on job postings or tech signals.
**(e) Recommended Content** — 2-3 articles or case studies for outreach.
**(f) Outreach Angle** — A specific, personalized reason to reach out.
**(g) Suggested First Message** — 3-4 sentence email or LinkedIn message ready to personalize.

Company research:\n{{step_1}}\n\nInternal data:\n{{step_2}}` },
    ],
    ["articles", "call_insights", "battle_cards"],
    "Prospect brief with outreach strategy and suggested first message",
  ),

  // ───── LINKEDIN GHOSTWRITER ─────
  agent(
    "00000000-0000-4000-a000-500000000001",
    "LinkedIn Ghostwriter", "✍️", "content_marketing",
    "Write LinkedIn posts in YOUR voice. Give me a topic and I'll generate 3 post variants matching your analyzed LinkedIn style.",
    `You are a LinkedIn ghostwriter. Your job is to write posts that match the user's authentic LinkedIn voice.

Before generating, you need the user's voice profile from the profiles table (linkedin_voice field). If no voice profile exists, tell the user to set one up in Settings first.

When generating posts:
1. First, search the knowledge base for relevant brand content, data points, and insights related to the topic
2. Then generate 3 variants, each using a different hook style from the user's voice profile
3. Match their exact formatting style, tone, vocabulary, post length, emoji usage, and closing style
4. Each variant should feel like THEY wrote it, not a generic AI post

Output format: 3 variants separated by ---VARIANT--- markers. Each starts with a label line.`,
    [
      { id: "s1", name: "Search knowledge base for relevant content", type: "search_knowledge_base",
        prompt: "Search the knowledge base for content, data points, case studies, and insights related to: {{input}}. Look in articles, call_insights, and brand_docs for anything that could strengthen a LinkedIn post on this topic." },
      { id: "s2", name: "Generate 3 LinkedIn post variants", type: "ai_generation",
        prompt: `Using the relevant content from the knowledge base, write 3 LinkedIn post variants about: {{input}}

Each variant should:
- Use a different hook style
- Match the user's voice profile (tone, formatting, length, closing style)
- Incorporate specific data or insights from the knowledge base when available
- Feel authentic and personal, not corporate or generic

Variant A: Bold/contrarian hook style
Variant B: Story or personal experience hook
Variant C: A different angle or format than they usually use

Separate with ---VARIANT--- markers. Start each with **Variant X: [Style]** label.

Knowledge base context:
{{step_1}}` },
    ],
    ["brand_docs", "articles", "call_insights"],
    "3 LinkedIn post variants in the user's authentic voice",
  ),
];

export function makeStepId(): string {
  return "s" + Math.random().toString(36).slice(2, 8);
}
