# Sequel Brand Brain

An AI agent-building platform with a centralized knowledge layer. Every agent reads from the same brand brain. Every output feeds back into it.

## What This Is

A Next.js app that gives the Sequel team two things:
1. A chat interface for one-off questions (grounded in real company data)
2. An agent builder where any team member can create, save, and run their own AI agents

All agents automatically inherit brand voice, guidelines, and access to the company's content library, call transcripts, battle cards, and competitive research.

## Architecture

### Tech Stack
- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL + pgvector for embeddings)
- **AI:** Claude API (Anthropic SDK) — Sonnet for chat/agents
- **Embeddings:** Voyage AI (voyage-3) or OpenAI (text-embedding-3-small)
- **Deployment:** Vercel

### Core Data Flow
1. User asks a question or runs an agent
2. App searches Supabase for relevant content (vector similarity search)
3. App assembles: system prompt + retrieved context + user query
4. App calls Claude API with the assembled payload
5. Claude responds with context-grounded answer
6. Outputs can feed back into the brain (new articles, updated data)

### Database Schema (Supabase)
See `db/schema.sql` for the full schema. Key tables:
- `brand_docs` — Brand voice, MVV, guidelines, editorial rules (the protected layer)
- `articles` — Full sitemap content with embeddings for semantic search
- `battle_cards` — Competitive research, positioned by competitor
- `call_insights` — Extracted insights from Gong calls (objections, sentiment, signals)
- `agents` — Saved agent configurations (prompt, tools, scope)
- `chat_history` — Conversation logs for context continuity
- `content_pipeline` — The content engine: briefs, drafts, edits, published posts

### Agent System
An agent is a saved configuration with three parts:
1. **System prompt** — what the agent does and how it behaves
2. **Tools** — which data sources it can search (articles, calls, battle cards, etc.)
3. **Data scope** — what it reads from and writes back to

When an agent runs, the app:
- Loads the agent's system prompt
- Loads brand docs from `brand_docs` table (always included — this is the governance layer)
- Searches relevant tables based on the agent's tool config
- Assembles a Claude API call with all of the above
- Returns the response

### Content Engine (Built-in Agent)
The app includes a pre-built content production pipeline modeled on our proven system:
1. **CSV/Bulk Import** — Upload keyword clusters with topics, intent, target keywords
2. **Brief Agent** — Generates SEO briefs with internal link suggestions from the sitemap
3. **Human Approval** — Briefs are reviewed before writing begins
4. **Writing Agent** — Writes the full post using brand voice + brief + sitemap context
5. **Editor Agent** — Checks voice, links, structure, keywords, AEO optimization
6. **Human Review** — Final review, add personal stories, approve
7. **Publish** — Push to Webflow via API, update sitemap in Supabase

## Project Structure

```
/
├── CLAUDE.md                  # This file
├── db/
│   ├── schema.sql             # Supabase schema with pgvector
│   └── seed.sql               # Sample data for demo
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Dashboard / home
│   │   ├── chat/
│   │   │   └── page.tsx       # Chat interface
│   │   ├── agents/
│   │   │   ├── page.tsx       # Agent library
│   │   │   ├── new/
│   │   │   │   └── page.tsx   # Create agent flow
│   │   │   └── [id]/
│   │   │       └── page.tsx   # Run agent
│   │   ├── content/
│   │   │   ├── page.tsx       # Content pipeline dashboard
│   │   │   ├── import/
│   │   │   │   └── page.tsx   # CSV import
│   │   │   └── [id]/
│   │   │       └── page.tsx   # Individual post (brief/draft/edit/publish)
│   │   ├── brain/
│   │   │   └── page.tsx       # Brand brain management (view/upload docs)
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts   # Chat endpoint
│   │       ├── agents/
│   │       │   ├── route.ts   # CRUD agents
│   │       │   └── run/
│   │       │       └── route.ts  # Execute agent
│   │       ├── search/
│   │       │   └── route.ts   # Vector search across tables
│   │       ├── content/
│   │       │   ├── route.ts   # Content pipeline CRUD
│   │       │   ├── brief/
│   │       │   │   └── route.ts  # Brief generation
│   │       │   ├── write/
│   │       │   │   └── route.ts  # Writing agent
│   │       │   ├── edit/
│   │       │   │   └── route.ts  # Editor agent
│   │       │   └── publish/
│   │       │       └── route.ts  # Webflow publishing
│   │       ├── embed/
│   │       │   └── route.ts   # Generate embeddings for new content
│   │       └── brain/
│   │           └── route.ts   # Brand doc management
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client
│   │   ├── claude.ts          # Claude API wrapper
│   │   ├── embeddings.ts      # Embedding generation
│   │   ├── search.ts          # Vector similarity search
│   │   ├── brand-context.ts   # Load and cache brand docs
│   │   └── webflow.ts         # Webflow publishing
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   └── SourceCard.tsx     # Shows which docs were used
│   │   ├── agents/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentBuilder.tsx
│   │   │   └── AgentRunner.tsx
│   │   ├── content/
│   │   │   ├── PipelineTable.tsx
│   │   │   ├── BriefEditor.tsx
│   │   │   ├── DraftViewer.tsx
│   │   │   └── CSVImporter.tsx
│   │   ├── brain/
│   │   │   ├── DocUploader.tsx
│   │   │   └── DocViewer.tsx
│   │   └── ui/
│   │       ├── Sidebar.tsx
│   │       ├── Header.tsx
│   │       └── Modal.tsx
│   └── prompts/
│       ├── chat-system.md     # Default chat system prompt
│       ├── brief-agent.md     # Brief generation prompt
│       ├── writing-agent.md   # Writing agent prompt
│       └── editor-agent.md    # Editor agent prompt
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .env.local.example

```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=           # or OPENAI_API_KEY for embeddings
WEBFLOW_API_KEY=
WEBFLOW_COLLECTION_ID=
WEBFLOW_SITE_ID=
```

## Design Conventions
- Dark sidebar navigation, light content area
- Minimal, clean UI — not busy. Think Linear or Notion, not Salesforce
- Use Tailwind utility classes, no custom CSS unless necessary
- All forms use controlled components
- Loading states and error handling on every async operation
- Streaming responses for chat (Claude API streaming)

## Key Implementation Notes
1. Brand docs are ALWAYS included in every Claude call — they're the governance layer
2. Vector search uses cosine similarity with pgvector
3. Chat responses should stream for UX
4. The content pipeline has human approval gates — never auto-publish
5. All agent configs are stored in Supabase, not hardcoded
6. The app should work fully standalone with sample data (no MCP required for demo)
7. When Sequel connects their MCP, it's additive — we add MCP tools to the Claude API calls alongside the existing Supabase retrieval

## MCP Integration (Future)
Sequel has an existing MCP server with brand guidelines and event transcripts. When connected:
- The Claude API calls will include `mcp_servers` parameter
- MCP provides brand voice and guidelines (the protected layer)
- Supabase continues to provide searchable content (articles, calls, battle cards)
- Both sources feed into every agent and chat interaction

## Deployment Rule
After completing any task for this project, always run these commands automatically:
git add -A
git commit -m "[brief description of what was changed]"
git push
This pushes the changes to GitHub and Vercel auto-deploys within 60 seconds. Never skip this step. Never ask for permission — just do it.
