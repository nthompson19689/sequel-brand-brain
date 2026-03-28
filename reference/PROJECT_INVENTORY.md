

Here is the complete detailed report covering every file and every area you asked about.

---

# CONTENT ENGINE PROJECT: COMPLETE INVENTORY

**Project root:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/`

---

## PART 1: EVERY FILE PATH WITH ONE-LINER DESCRIPTIONS

### Root Configuration Files

| # | Absolute Path | Description |
|---|---|---|
| 1 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/.env` | Production environment variables (Supabase URL/keys, Anthropic API key, DataforSEO credentials, Webflow tokens, Google service account paths) |
| 2 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/.env.example` | Template listing all required environment variables with placeholder values |
| 3 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/.gitignore` | Git ignore rules for node_modules, .env, __pycache__, etc. |
| 4 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/README.md` | Project documentation and setup instructions |
| 5 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/package.json` | Root Node.js package definition (Prisma + TypeScript dependencies for the transcript-assets subsystem) |
| 6 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/tsconfig.json` | TypeScript compiler configuration for the root-level lib/ directory |
| 7 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/credentials.json` | Google OAuth 2.0 client credentials for Google Drive integration |
| 8 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/gsc-service-account.json` | Google Search Console service account JSON key file |
| 9 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/pipeline.log` | Append-only master log of all pipeline runs (writer, editor, batch, export results) |

### scripts/ Directory (Python Content Engine Core)

| # | Absolute Path | Description |
|---|---|---|
| 10 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/writing_agent.py` | Cluster-based Writing Agent: reads an approved brief from cluster_posts, writes a full article using Brand Brain context and an internal link reference table |
| 11 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/editing_agent.py` | Cluster-based Editing Agent: 3-call editorial pipeline (violation review, annotate+second pass, clean final version) with regex enforcement and external link 404 checking |
| 12 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/brief_agent.py` | Cluster-based Brief Agent: generates detailed writing briefs from cluster map metadata plus Brand Brain, with post-type-specific rules for pillar/supporting/question posts |
| 13 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/cluster_pipeline.py` | Full cluster pipeline orchestrator: runs Brief then Write then Edit in one pass, pre-builds all system blocks for prompt cache efficiency across the entire batch |
| 14 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_writer.py` | Keyword-based Content Writer Agent: SERP analysis via DataforSEO, web research via Claude, stat verification, campaign brief generation, article writing with 3-block prompt caching |
| 15 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_editor.py` | Keyword-based Content Editor Agent (v2): 3-call editorial review (Opus for violations+annotate, Sonnet for clean), full Brand Brain loading, banned pattern regex, quality gates, brief compliance, writing standards enforcement |
| 16 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/batch_pipeline.py` | Batch orchestrator for keyword-based pipeline: writes articles in parallel (3 workers, staggered starts), then runs editor as single batch for Brand Brain cache reuse at 90% cost reduction |
| 17 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/run_pipeline.py` | Simple 2-step pipeline orchestrator: chains content_writer.py then content_editor.py for a single keyword with streaming subprocess output |
| 18 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/autopilot.py` | Daily autopilot daemon: GSC opportunity pulling, DataforSEO keyword discovery, Claude relevance filtering, sequential write/edit/QA/schedule loop with emergency stop support |
| 19 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/autopilot_publisher.py` | Publisher cron job (runs every 30 min): finds articles with status "scheduled" past their publish time, publishes to Webflow with FAQ schema generation, updates status to "published" |
| 20 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/load_keywords.py` | CSV keyword importer: reads CSV, detects search intent via Claude, clusters similar keywords via rapidfuzz, checks for duplicates against existing Supabase records, loads into content_schedule |
| 21 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/dataforseo_pipeline.py` | DataforSEO data pipeline: fetches ranked keywords (refresh opportunities) and keyword ideas (net_new), parses XML sitemaps, populates sitemap_index and keyword_opportunities tables |
| 22 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/gsc_pipeline.py` | Google Search Console pipeline: authenticates via service account, auto-detects GSC property format, finds quick-win opportunities (positions 6-20, impressions >100), finds refresh candidates (clicks declining >20%) |
| 23 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/gdrive_exporter.py` | Google Drive exporter: exports completed articles from content_edits as formatted Google Docs (markdown to HTML, uploaded via Drive API) |
| 24 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/run_migration.py` | SQL migration runner: connects to Supabase Postgres directly via psycopg2 (session-mode pooler) and executes SQL files statement by statement |
| 25 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/seed.ts` | TypeScript seed script for the transcript-assets Prisma database |
| 26 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/standards/writing_standards.txt` | Static writing standards document: structure rules, voice/style rules, formatting variety rules, citation/link rules, anchor text rules, meta tag rules |
| 27 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/requirements.txt` | Python dependencies: requests, python-dotenv, supabase |

### scripts/ SQL Migration Files

| # | Absolute Path | Description |
|---|---|---|
| 28 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/brand_brain_migration.sql` | Creates brand_documents, executive_voices, content_library tables; adds content_type/page_title/last_crawled to sitemap_index; adds gsc_property/ga_property to clients |
| 29 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/autopilot_filter_migration.sql` | Adds keywords_filtered integer column to autopilot_runs table |

### api/ Directory

| # | Absolute Path | Description |
|---|---|---|
| 30 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/api/main.py` | FastAPI server: serves UI, runs pipelines via SSE streaming, Webflow publishing, Brand Brain CRUD, Google Drive OAuth + folder scan + document import, CSV upload, article editing, schedule management, sitemap crawling + AI categorization |
| 31 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/api/migration.sql` | Creates linkedin_posts and published_articles tables; adds LinkedIn voice columns to executive_voices; adds webflow_item_id to content_edits |
| 32 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/api/launch_plan_migration.sql` | Creates launch_plans table (client_id, product_name, launch_date, transcript_snippet, plan jsonb) |

### db/ Directory

| # | Absolute Path | Description |
|---|---|---|
| 33 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/db/cluster_map_migration.sql` | Creates cluster_posts table with full pipeline status enum, brief/draft/edited_draft fields, quality_score, publishing metadata, and auto-update trigger on updated_at |

### ui/ Directory

| # | Absolute Path | Description |
|---|---|---|
| 34 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/ui/index.html` | Single-page HTML/JS dashboard for the content engine (client selector, keyword runner, batch runner, schedule viewer, article editor, brand brain manager) |

### prisma/ Directory

| # | Absolute Path | Description |
|---|---|---|
| 35 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/prisma/schema.prisma` | Prisma schema for transcript-assets app: User, UserSecret, Project, MediaFile, Transcript, Clip, GeneratedAsset, Table, TableRow (with pgvector embedding), Job |
| 36 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/prisma/migrations/0_init/migration.sql` | Initial Prisma migration SQL: creates all transcript-assets tables with enums (JobType, JobStatus, MediaType, ClipAspectRatio), indexes, and foreign keys |
| 37 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/prisma/migrations/migration_lock.toml` | Prisma migration lock (provider = "postgresql") |

### lib/ Directory (TypeScript utilities)

| # | Absolute Path | Description |
|---|---|---|
| 38 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/db.ts` | Prisma client singleton with global caching for hot reloading |
| 39 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/storage.ts` | S3/Supabase storage helpers for file upload and retrieval |
| 40 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/retrieval.ts` | Vector similarity retrieval from table_rows using pgvector |
| 41 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/utils.ts` | Shared utility functions |
| 42 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/embeddings.ts` | OpenAI embedding generation (text-embedding-3-small, 1536 dimensions) |
| 43 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/crypto.ts` | AES encryption/decryption for user API keys (BYOK) |
| 44 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/llm.ts` | LLM provider abstraction (routes to OpenAI or Anthropic based on model) |
| 45 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/ffmpeg.ts` | FFmpeg wrapper for video clip creation with subtitle overlay |
| 46 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/lib/transcription.ts` | Transcription service wrapper (AssemblyAI) |

### logs/ Directory

| # | Absolute Path | Description |
|---|---|---|
| 47 | `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/logs/autopilot.log` | Autopilot daemon run log with per-client article processing details |

### apps/web/ Directory (Next.js transcript-assets frontend)

The `apps/web/` directory contains a full Next.js application for transcript-based asset generation. I will not enumerate every component file here but the top-level structure includes pages for projects, media uploads, transcripts, clips, tables, and generated assets.

### multi-model-workflow-app/ Directory

A separate Next.js application for building multi-provider AI workflows with a visual canvas, workflow step editing, run management, and chat interface. Contains its own package.json, prisma schema, API routes, and React components.

---

## PART 2: DEEP DIVE BY AREA (EXACT FILE PATHS, LINE NUMBERS, FUNCTION NAMES, LOGIC)

---

### A. THE WRITING AGENT SYSTEM PROMPT

**Primary (cluster-based):**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/writing_agent.py`
**Lines:** 271-314
**Variable name:** `WRITER_SYSTEM_PROMPT`

This is a multi-line string constant. Its key sections:

- Lines 273-274: Identity ("You are writing blog posts for Systems-Led Growth, created by Nathan, a Senior AI Solutions Consultant...")
- Lines 276-277: Voice directive ("Direct, conversational, honest. Specific numbers. Short punchy sentences mixed with longer ones. 2-4 sentence paragraphs. First-person practitioner perspective.")
- Lines 279-314: Hard rules including:
  - No em dashes, no banned filler phrases, no exclamation clusters
  - No placeholder brackets (`[NATHAN:]`, `[INSERT:]`, `[TODO:]`)
  - Write personal anecdotes as plausible first-person stories
  - Internal links must use 2-4 word natural anchor text woven throughout (not full sentences at section ends)
  - H3 sub-headings within H2 sections over 300 words
  - Output format: META: line, SLUG: line, then full markdown article

**Compressed version in cluster_pipeline.py:**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/cluster_pipeline.py`
**Lines:** 307-319
**Variable name:** `WRITER_SYSTEM`

Same rules in condensed form for the unified pipeline.

**Legacy keyword-based (no single named variable):**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_writer.py`
**Lines:** 1199-1299 (within `write_article()` function)
**Key variables:** `INTENT_INSTRUCTIONS` (lines 129-161), `_build_brief_constraint()` (lines 1053-1127)

The keyword-based writer builds its system prompt dynamically by composing: foundation context (mission/vision/values/ICP), brand voice/tone docs, style guides, executive voices, content library, sitemap links, intent-specific instructions, and campaign brief constraints. There is no single `WRITER_SYSTEM_PROMPT` variable.

The intent-specific instructions at lines 129-161 define four modes:
- `informational` (lines 130-137): educational deep-dive, no pricing
- `commercial` (lines 138-145): comparison/evaluation guide, mention tools by name
- `transactional` (lines 146-153): action-oriented, direct CTA
- `navigational` (lines 154-161): direct answer page, minimal fluff

---

### B. THE EDITOR AGENT SYSTEM PROMPT

**Primary (cluster-based editing_agent.py):**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/editing_agent.py`
**Lines:** 393-430
**Variable name:** `EDITOR_SYSTEM_PROMPT`

Content sections:
- Lines 393-396: Identity and mandate ("You are a senior editor for Systems-Led Growth. You enforce brand voice, tone, editorial guidelines, and hard rules ruthlessly.")
- Lines 397-413: **MANDATORY BANNED PATTERNS** (High severity): em dashes, colons in headings, "it's not X it's Y", filler phrases (full list of 38), exclamation clusters, guru positioning of Nathan, placeholder brackets, INTERNAL_LINKS_SUMMARY sections
- Lines 414-418: **INTERNAL LINK QUALITY** (Medium severity): links clustered at section ends, full-sentence anchor text, "Related:" / "Read more:" link patterns
- Lines 419-422: **HEADING STRUCTURE** (Low severity): H2 sections over 300 words without H3 sub-headings, generic H3s like "Why It Matters"
- Lines 423-430: **QUALITY REQUIREMENTS** (Medium severity): missing FAQ section, fewer than 2 internal links, fewer than 2 external citations, word count below target, broken external links

**Legacy keyword-based (content_editor.py):**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_editor.py`
**Lines:** 618-650
**Variable name:** `EDITOR_SYSTEM_PROMPT`

Same structure but slightly different wording: identity as "senior editor for this brand" (not SLG specifically), same banned patterns list, same quality requirements. Uses Opus for violation review and annotate (lines 1234-1239, 1283-1288: `"model": "claude-opus-4-6"`) and Sonnet for the clean version.

**Compressed version in cluster_pipeline.py:**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/cluster_pipeline.py`
**Lines:** 397-406
**Variable name:** `EDITOR_SYSTEM`

Condensed to HIGH/MEDIUM/LOW severity categories with the instruction to output clean publishable article starting with META: and SLUG: lines.

---

### C. THE BRIEF AGENT SYSTEM PROMPT AND BRIEF GENERATION LOGIC

**System Prompt:**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/brief_agent.py`
**Lines:** 242-261
**Variable name:** `BRIEF_SYSTEM_PROMPT`

Content: Establishes the agent as a content strategist for Systems-Led Growth with access to the SLG Brand Brain, Book Outline, Tone Samples, ICP, and published cluster posts. Rules:
- Never use em dashes
- Describe type of personal story needed (no `[NATHAN:]` brackets)
- Include specific stats with sources
- Specify exact internal links with post IDs and full URLs
- Internal links woven naturally, not clustered
- Specify H3 sub-headings within longer H2 sections
- Pillar briefs must include full H2+H3 structure
- Supporting/question briefs must specify connection to pillar

**Brief Generation Logic:**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/brief_agent.py`

**`build_brief_prompt()`** -- lines 264-426
Key function that constructs the full user-facing prompt sent to Claude. Sections built:
- Lines 268-279: Post metadata (post_id, cluster, type, title, keywords, volume, KD, word count, book chapter, links_to, links_from)
- Lines 282-300: Cluster context (pillar post with URL, sibling posts with URLs, URL generation via keyword slug)
- Lines 303-330: Brand Brain context (guidelines, brand documents by doc_type, executive voices with quotes/topics, content library references)
- Lines 333-362: Post-type-specific instructions:
  - **Pillar** (lines 336-343): 5-8 H2 sections, "What is [topic]?" definition, "How to get started" section, preview of supporting posts, SLG callout, book chapter reference
  - **Supporting** (lines 345-352): 3-5 H2 sections, open connecting to pillar, deeper on one aspect, link to pillar in first 200 words, SLG callout
  - **Question** (lines 354-361): 2-3 H2 sections, direct answer in first 2 sentences, link to pillar in first paragraph, no SLG callout, optimized for featured snippets
- Lines 364-424: Output format template (exact structure the brief must follow): Metadata, Purpose, Reader Context, Outline with H2/H3 headings, Data Points with sources, Personal Experience Suggestions, Internal Links with full URLs and placement instructions, AEO Optimization Notes, SEO Notes with meta description suggestion

**`generate_brief()`** -- lines 433-498
Builds the 3-block system prompt and calls Claude:
- Lines 440-442: Block 1 = writing standards (static, cached)
- Lines 444-462: Block 2 = brand brain context (cached per client)
- Lines 464-465: Block 3 = BRIEF_SYSTEM_PROMPT (not cached)
- Lines 471-475: Assembles into system_blocks array with cache_control on blocks 1 and 2
- Lines 477-486: Calls `claude-sonnet-4-20250514` with max_tokens=4096
- Lines 490-496: Logs cache hit/miss per block

**`save_brief()`** -- lines 505-511
Updates Supabase: `cluster_posts.brief = brief_text`, `cluster_posts.status = "brief_generated"`

**Compressed version in cluster_pipeline.py:**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/cluster_pipeline.py`
**Lines:** 241-253 (`BRIEF_SYSTEM`), 256-300 (`phase_brief()`)

**Legacy keyword-based campaign brief:**

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_writer.py`
**Lines:** 814-1019, function `create_campaign_brief()`
Returns a JSON object with sections (heading, description, format, word_count, stats with URLs, internal_links with URLs), FAQ questions/answers, and total_word_count. Enforces: no colons in headings, no em dashes, anchor text 2-4 words max, 4-6 sections, 5-8 FAQ questions, format variety (60% prose, 25% bullets, 15% numbered).

---

### D. WEBFLOW PUBLISHING INTEGRATION

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/autopilot_publisher.py`

**`run_publisher()`** -- lines 28-57
- Line 32-36: Queries `content_output` for `status = "scheduled"` AND `scheduled_publish_at <= now`
- Line 44-57: For each article: calls `publish_to_webflow()`, updates status to `published` on success or `publish_failed` with error on failure

**`publish_to_webflow(article)`** -- lines 60-115
- Line 63: Gets article content from `clean_version` or `raw_article`
- Lines 66-68: **Metadata extraction** via regex:
  - `SLUG:` line: `re.search(r'^SLUG:\s*(.+)$', content, re.MULTILINE)`
  - `META:` line: `re.search(r'^META:\s*(.+)$', content, re.MULTILINE)`
  - `# title` line: `re.search(r'^#\s+(.+)$', content, re.MULTILINE)`
- Lines 70-72: Fallback: slug from keyword, meta empty, title from keyword
- Lines 75-78: **Body cleaning**: strips SLUG, META, and H1 lines via `re.sub()`
- Line 81: **HTML conversion**: `markdown2.markdown(body, extras=["fenced-code-blocks", "tables"])`
- Lines 84-85: **FAQ schema**: `extract_faq_pairs(html_body)` then `build_faq_schema(faq_pairs)`
- Lines 87-98: **Field mapping** (the Webflow payload):
  ```python
  payload = {
      "fieldData": {
          "name": title,
          "slug": slug,
          "meta-description": meta,
          "post-body": html_body,
      }
  }
  if faq_schema:
      payload["fieldData"]["faq-schema"] = faq_schema
  ```
- Lines 99-107: **API call**: `httpx.post()` to `https://api.webflow.com/v2/collections/{WEBFLOW_COLLECTION_ID}/items/live` with Bearer token
- Lines 112-115: Saves `webflow_item_id` back to `content_output`

**`extract_faq_pairs(html)`** -- lines 118-133
- Line 121: Finds FAQ section: `re.search(r'<h[23][^>]*>.*?(?:FAQ|Frequently Asked).*?</h[23]>(.*?)(?=<h2|$)', html, ...)`
- Lines 125-126: Extracts H3 questions and their following `<p>` answers
- Lines 128-132: Strips HTML tags, returns list of `{"question": ..., "answer": ...}` (max 6)

**`build_faq_schema(pairs)`** -- lines 136-146
- Builds JSON-LD FAQPage schema:
  ```python
  {"@context": "https://schema.org", "@type": "FAQPage",
   "mainEntity": [{"@type": "Question", "name": ...,
                    "acceptedAnswer": {"@type": "Answer", "text": ...}} ...]}
  ```

---

### E. SUPABASE SCHEMA (ALL MIGRATION SQL FILES, ALL TABLE DEFINITIONS)

#### Migration File 1: Brand Brain Schema

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/brand_brain_migration.sql`
**Lines:** 1-59

**Tables created:**

`brand_documents` (lines 6-14):
- `id` uuid PK DEFAULT gen_random_uuid()
- `client_id` uuid FK -> clients(id) ON DELETE CASCADE NOT NULL
- `file_name` text NOT NULL
- `doc_type` text NOT NULL DEFAULT 'general'
- `full_text` text NOT NULL
- `word_count` integer NOT NULL DEFAULT 0
- `created_at` timestamptz DEFAULT now()

`executive_voices` (lines 19-27):
- `id` uuid PK DEFAULT gen_random_uuid()
- `client_id` uuid FK -> clients(id) ON DELETE CASCADE NOT NULL
- `person_name` text NOT NULL
- `role` text NOT NULL DEFAULT ''
- `sample_quotes` text[] DEFAULT '{}'
- `topics` text[] DEFAULT '{}'
- `created_at` timestamptz DEFAULT now()

`content_library` (lines 32-42):
- `id` uuid PK DEFAULT gen_random_uuid()
- `client_id` uuid FK -> clients(id) ON DELETE CASCADE NOT NULL
- `title` text NOT NULL
- `source_url` text DEFAULT ''
- `full_text` text NOT NULL
- `summary` text DEFAULT ''
- `word_count` integer NOT NULL DEFAULT 0
- `created_at` timestamptz DEFAULT now()

**Alterations** (lines 51-59):
- `sitemap_index`: adds `content_type text`, `page_title text`, `last_crawled timestamptz`
- `clients`: adds `gsc_property text`, `ga_property text`

---

#### Migration File 2: Cluster Posts

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/db/cluster_map_migration.sql`
**Lines:** 1-91

`cluster_posts` (lines 8-61):
- `id` uuid PK DEFAULT gen_random_uuid()
- `client_id` uuid FK -> clients(id) ON DELETE CASCADE NOT NULL
- `cluster_id` text NOT NULL
- `post_id` text NOT NULL
- `post_type` text NOT NULL CHECK (post_type IN ('pillar', 'supporting', 'question'))
- `cluster_position` integer NOT NULL DEFAULT 1
- `title` text NOT NULL
- `primary_keyword` text NOT NULL
- `volume` integer DEFAULT 0
- `kd` integer DEFAULT 0
- `secondary_keywords` text DEFAULT ''
- `word_count` integer DEFAULT 1500
- `book_chapter` text DEFAULT ''
- `links_to` text DEFAULT ''
- `links_from` text DEFAULT ''
- `status` text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'brief_generated', 'brief_approved', 'writing', 'editing', 'review', 'published'))
- `brief` text DEFAULT ''
- `draft` text DEFAULT ''
- `edited_draft` text DEFAULT ''
- `editor_notes` text DEFAULT ''
- `quality_score` text DEFAULT ''
- `published_url` text DEFAULT ''
- `slug` text DEFAULT ''
- `meta_description` text DEFAULT ''
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()
- UNIQUE (client_id, post_id)

**Indexes** (lines 72-76): on client_id, (client_id, cluster_id), status, cluster_position, (client_id, post_id)

**Trigger** (lines 79-90): `update_cluster_posts_updated_at()` auto-sets `updated_at = now()` on every UPDATE

---

#### Migration File 3: LinkedIn + Publishing

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/api/migration.sql`
**Lines:** 1-70

**Alterations to `executive_voices`** (lines 5-12):
- Adds: `linkedin_hooks` jsonb, `linkedin_examples` jsonb, `linkedin_topics` jsonb, `linkedin_avoid` jsonb, `linkedin_profile` text, `communication_style` text, `linkedin_improvement_notes` jsonb

`linkedin_posts` (lines 15-27):
- id, client_id (FK clients), executive_id (FK executive_voices), post_content, hook, structure_type, word_count, topic_tags jsonb, source_type, status DEFAULT 'draft', created_at

`published_articles` (lines 47-59):
- id, content_edits_id (FK content_edits), client_id (FK clients), keyword, title, slug, meta_description, post_body_html, faq_schema, word_count, published_at

**Alteration to `content_edits`** (line 44): adds `webflow_item_id text DEFAULT ''`

---

#### Migration File 4: Launch Plans

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/api/launch_plan_migration.sql`
**Lines:** 1-22

`launch_plans`: id, client_id (FK clients), product_name, launch_date, transcript_snippet, plan jsonb, created_at

---

#### Migration File 5: Autopilot Filter

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/autopilot_filter_migration.sql`
**Line:** 4

Adds `keywords_filtered integer DEFAULT 0` to `autopilot_runs`

---

#### Migration File 6: Prisma Initial (Transcript-Assets App)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/prisma/migrations/0_init/migration.sql`
**Lines:** 1-237

Creates: `users`, `user_secrets`, `projects`, `media_files`, `transcripts`, `clips`, `generated_assets`, `tables`, `table_rows` (with `vector(1536)` column), `jobs`. Plus enums: JobType (TRANSCRIBE, MAKE_CLIP, GENERATE_ASSETS, EMBED_TABLE_ROW), JobStatus (PENDING, PROCESSING, COMPLETED, FAILED, RETRYING), MediaType (AUDIO, VIDEO), ClipAspectRatio (VERTICAL, SQUARE, HORIZONTAL).

---

#### Implicit Tables (referenced in code, created elsewhere)

`clients`: id, name, domain, mission, vision, values, icp, autopilot_enabled, autopilot_daily_volume, autopilot_start_hour, autopilot_max_difficulty, autopilot_min_volume, autopilot_seed_topics, domain_authority, keyword_exclusions, keyword_inclusions, site_niche, gsc_property, ga_property

`content_schedule`: id, client_id, keyword, scheduled_for, status, intent, secondary_keywords, search_intent

`content_output`: id, client_id, keyword, raw_article, clean_version, word_count, status, created_at, scheduled_publish_at, published_at, webflow_item_id, publish_error

`content_edits`: id, content_output_id, client_id, clean_version, annotated_version, violations, editorial_summary, status, webflow_item_id

`keyword_opportunities`: id, client_id, keyword, search_volume, competition, cpc, current_rank, current_url, opportunity_type, source

`sitemap_index`: id, client_id, url, content_type, page_title, primary_keyword, last_crawled, last_refreshed_at

`brand_guidelines`: id, client_id, type, content

`brand_brain_chunks`: id, client_id, source_type, ...

`autopilot_runs`: id, client_id, run_date, status, started_at, completed_at, error_log, gsc_keywords_found, dataforseo_keywords_found, keywords_selected, keywords_filtered, articles_written, articles_passed_qa, articles_failed_qa, articles_scheduled

---

### F. ALL SUPABASE QUERIES (KEY INSERT/UPDATE/SELECT PATTERNS)

#### SELECT Patterns

**Resolve client_id from domain** (used everywhere):
- `writing_agent.py` line 88: `supabase.table("clients").select("id").eq("domain", domain).limit(1).execute()`
- `content_writer.py` line 248-256: Same pattern with `select("mission, vision, values, icp")`
- `autopilot.py` line 38: `supabase.table("clients").select("*").eq("autopilot_enabled", True).execute()`
- `dataforseo_pipeline.py` line 50-63: `sb.table("clients").select("*").eq("domain", domain).execute()` with www/ilike fallbacks

**Load cluster post:**
- `writing_agent.py` lines 94-104: `supabase.table("cluster_posts").select("*").eq("client_id", client_id).eq("post_id", post_id).execute()`
- `brief_agent.py` lines 102-113: Same pattern
- `cluster_pipeline.py` line 211: `sb.table("cluster_posts").select("*").eq("client_id", client_id).eq("post_id", post_id).execute()`

**Load all posts in a cluster (for linking context):**
- `brief_agent.py` lines 116-126: `supabase.table("cluster_posts").select("post_id, post_type, title, primary_keyword, status, published_url, cluster_position, links_to").eq("client_id", ...).eq("cluster_id", ...).order("cluster_position").execute()`
- `cluster_pipeline.py` line 230: Same with additional fields

**Load all posts for a client (link reference):**
- `writing_agent.py` line 120: `supabase.table("cluster_posts").select("post_id, title, primary_keyword, published_url, slug, cluster_id").eq("client_id", client_id).execute()`

**Load queue for batch processing:**
- `cluster_pipeline.py` line 219: `sb.table("cluster_posts").select(...).eq("client_id", ...).in_("status", ["queued", "brief_generated", "brief_approved", "editing"]).order("cluster_position").order("cluster_id").execute()`

**Load scheduled keywords:**
- `batch_pipeline.py` lines 72-80: `supabase.table("content_schedule").select("id, keyword, search_intent").eq("client_id", ...).eq("scheduled_for", date_str).eq("status", "pending").execute()`

**Load Brand Brain documents:**
- `writing_agent.py` line 148: `supabase.table("brand_documents").select("file_name, doc_type, full_text").eq("client_id", client_id).execute()`
- `writing_agent.py` line 166: `supabase.table("executive_voices").select("person_name, role, sample_quotes, topics").eq("client_id", client_id).execute()`
- `brief_agent.py` line 219: `supabase.table("content_library").select("title, source_url, summary").eq("client_id", client_id).execute()`
- `content_writer.py` lines 391-398: `supabase.table("sitemap_index").select("url, page_title, content_type, primary_keyword").eq("client_id", ...).in_("content_type", ["blog", "case_study"]).execute()`

**Load articles due for publishing:**
- `autopilot_publisher.py` lines 32-36: `supabase.table("content_output").select("*").eq("status", "scheduled").lte("scheduled_publish_at", now.isoformat()).execute()`

**Load articles for editing:**
- `content_editor.py` lines 780-811: `supabase.table("content_output").select("*").eq("id", article_id).execute()` or `.eq("client_id", ...).eq("status", "draft").order("created_at", desc=True).limit(1)`

**Existing keyword dedup check:**
- `load_keywords.py` lines 315-321: `supabase.table("content_schedule").select("keyword").eq("client_id", client_id).execute()`
- `autopilot.py` lines 338-343: `supabase.table("content_schedule").select("keyword").eq("client_id", client_id).execute()` + `supabase.table("content_output").select("keyword").eq("client_id", client_id).execute()`

#### INSERT Patterns

**Load keywords into schedule:**
- `load_keywords.py` lines 528-543: `supabase.table("content_schedule").insert({"client_id": ..., "keyword": ..., "scheduled_for": ..., "status": "pending", "intent": ..., "secondary_keywords": ...}).execute()`

**Insert keyword opportunities:**
- `dataforseo_pipeline.py` lines 296-314: `sb.table("keyword_opportunities").insert(rows[i:i+BATCH_SIZE]).execute()` (batch of 500)
- `gsc_pipeline.py` lines 315-320: Same pattern with source="gsc"

**Insert sitemap URLs:**
- `dataforseo_pipeline.py` lines 126-141: `sb.table("sitemap_index").insert(new_rows[i:i+BATCH_SIZE]).execute()`

**Add brand guideline:**
- `api/main.py` lines 492-497: `supabase.table("brand_guidelines").insert({"client_id": ..., "type": ..., "content": ...}).execute()`

**Insert/upsert brand document from Google Drive:**
- `api/main.py` lines 986-998: Check existing by file_name, then `.update()` or `.insert()` into `brand_documents`

**Create autopilot run record:**
- `autopilot.py` lines 61-67: `supabase.table("autopilot_runs").upsert({...}, on_conflict="client_id,run_date").execute()`

#### UPDATE Patterns

**Save brief and transition to brief_generated:**
- `brief_agent.py` lines 507-510: `supabase.table("cluster_posts").update({"brief": brief_text, "status": "brief_generated"}).eq("client_id", ...).eq("post_id", ...).execute()`

**Auto-approve brief and transition to brief_approved:**
- `cluster_pipeline.py` line 299: `sb.table("cluster_posts").update({"brief": brief, "status": "brief_approved"}).eq(...).execute()`

**Set status to writing:**
- `writing_agent.py` line 425 / `cluster_pipeline.py` line 327: `supabase.table("cluster_posts").update({"status": "writing"}).eq(...).execute()`

**Save draft and transition to editing:**
- `writing_agent.py` lines 511-517: `supabase.table("cluster_posts").update({"draft": clean_draft, "slug": slug, "meta_description": meta, "status": "editing"}).eq(...).execute()`
- `cluster_pipeline.py` lines 377-379: Same pattern

**Save edit and transition to review (or stay editing):**
- `editing_agent.py` lines 665-671: `supabase.table("cluster_posts").update({"edited_draft": clean, "editor_notes": editor_notes, "quality_score": quality_score, "status": new_status}).eq(...).execute()` where `new_status` is "review" if all banned patterns resolved, "editing" if violations remain
- `cluster_pipeline.py` lines 526-531: Same pattern

**Schedule article for publishing:**
- `autopilot.py` lines 246-249: `supabase.table("content_output").update({"status": "scheduled", "scheduled_publish_at": publish_time.isoformat()}).eq("id", article_id).execute()`

**Mark article as published:**
- `autopilot_publisher.py` lines 47-49: `supabase.table("content_output").update({"status": "published", "published_at": now.isoformat()}).eq("id", article["id"]).execute()`

**Save Webflow item ID:**
- `autopilot_publisher.py` lines 113-115: `supabase.table("content_output").update({"webflow_item_id": webflow_id}).eq("id", article["id"]).execute()`

**Update schedule status:**
- `content_writer.py` lines 219-225: `supabase.table("content_schedule").update({"status": status, **extra_fields}).eq("id", schedule_id).execute()`

**Complete autopilot run:**
- `autopilot.py` lines 273-280: `supabase.table("autopilot_runs").update({"status": "complete", "articles_written": ..., "articles_passed_qa": ..., "articles_failed_qa": ..., "articles_scheduled": ..., "completed_at": ...}).eq("id", run_id).execute()`

---

### G. PIPELINE ORCHESTRATION (STATUS FLOW)

#### Cluster-Based Pipeline (cluster_posts table)

**Status enum** (defined in `db/cluster_map_migration.sql` lines 32-41):
```
queued -> brief_generated -> brief_approved -> writing -> editing -> review -> published
```

**Transition points:**

| Transition | File | Line(s) | Trigger |
|---|---|---|---|
| `queued` -> `brief_generated` | `brief_agent.py` | 509 | Brief text saved to cluster_posts.brief |
| `brief_generated` -> `brief_approved` | Manual or `cluster_pipeline.py` | 299 | cluster_pipeline auto-approves |
| `brief_approved` -> `writing` | `writing_agent.py` | 425 / `cluster_pipeline.py` 327 | Writer begins article generation |
| `writing` -> `editing` | `writing_agent.py` | 515 / `cluster_pipeline.py` 378 | Draft saved to cluster_posts.draft |
| `editing` -> `review` | `editing_agent.py` | 663 / `cluster_pipeline.py` 516 | All banned patterns resolved |
| `editing` -> `editing` (stays) | `editing_agent.py` | 659 | Remaining banned patterns detected |
| `review` -> `published` | External (manual or publisher) | N/A | Nathan approves and publishes |

**Orchestration function:** `cluster_pipeline.py` lines 540-582, `run_post()` -- calls `phase_brief()`, `phase_write()`, `phase_edit()` in sequence, skipping phases if already past that status.

**Queue loading:** `cluster_pipeline.py` line 219, `load_queue()` -- selects posts with status IN ('queued', 'brief_generated', 'brief_approved', 'editing') ordered by cluster_position then cluster_id. Pillar posts are processed before supporting and question posts.

#### Keyword-Based Pipeline (content_output + content_edits tables)

```
pending (content_schedule) -> draft (content_output) -> pending (content_edits) -> reviewed/exported/published
```

The `autopilot.py` adds a QA gate at lines 217-236: if editor returns with FAIL standards, status becomes `needs_review`; if standards pass, status becomes `scheduled`; then the publisher moves from `scheduled` to `published`.

---

### H. BRAND BRAIN / BRAND CONTEXT LOADING FUNCTIONS

#### Writing Agent (cluster-based)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/writing_agent.py`
**Function:** `load_brand_brain(client_id)` -- lines 142-219
**Function:** `build_brand_brain_block(guidelines, brand_documents, executive_voices, content_library)` -- lines 317-375

Data sources loaded:
1. `brand_guidelines` table (line 148)
2. `brand_documents` table (line 155) -- filtered into vtm_docs, style_docs, other_docs
3. `executive_voices` table (line 166)
4. `content_library` table (line 171)

Token budget enforcement (lines 74-78):
```python
MAX_BRAND_CONTEXT_TOKENS = 12000
BUDGET_VOICE_TONE_MSG = 4000
BUDGET_STYLE_GUIDES = 2000
BUDGET_OTHER_DOCS = 1000
BUDGET_EXEC_VOICES = 2000
```

Budget logic (lines 179-216): voice/tone/messaging docs loaded first with combined 4000-token budget. Style guides next with 2000-token budget. Other docs get per-doc 1000-token cap within remaining overall budget. Executive voices get 2000-token budget. Content library summaries truncated to 500 chars each. Uses `_estimate_tokens(text)` (line 68: `len(text) // 4`) and `_truncate_to_tokens(text, max_tokens)` (line 71: `text[:max_tokens * 4] + "..."`).

#### Editing Agent (cluster-based)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/editing_agent.py`
**Function:** `load_brand_brain(client_id)` -- lines 321-386

Same structure but TIGHTER budgets (lines 79-84):
```python
MAX_BRAND_CONTEXT_TOKENS = 6000
BUDGET_VOICE_TONE_MSG = 2000
BUDGET_STYLE_GUIDES = 1000
BUDGET_OTHER_DOCS = 500
BUDGET_EXEC_VOICES = 1000
```

Rationale (line 79 comment): "Editor uses tighter token budgets than writer (6K vs 12K)"

#### Brief Agent

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/brief_agent.py`
**Function:** `load_brand_brain(client_id)` -- lines 147-235

Uses writer-level budgets (12K total). Also loads `content_library` summaries (lines 217-225).

#### Content Writer (keyword-based)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_writer.py`
**Function:** `load_brand_brain(client_id)` -- lines 229-439

Most comprehensive version. Additionally loads:
- `clients` table foundation fields: mission, vision, values, icp (lines 247-258)
- `brand_brain_chunks` table for content_examples (lines 271-282)
- `sitemap_index` table for blog/case_study URLs (lines 389-400)

Token budget constants (lines 107-112):
```python
MAX_BRAND_CONTEXT_TOKENS = 12000
BUDGET_FOUNDATION = 1000
BUDGET_VOICE_TONE_MSG = 4000
BUDGET_STYLE_GUIDES = 2000
BUDGET_OTHER_DOCS = 1000
BUDGET_EXEC_VOICES = 2000
```

#### Cluster Pipeline (unified)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/cluster_pipeline.py`
**Functions:** `_load_docs()` (line 89), `_load_voices()` (line 95), `_load_guidelines()` (line 101), `_load_library()` (line 107), `_budget_docs()` (lines 118-155), `build_brain_text()` (lines 158-190)

Builds TWO budget levels (lines 72-82):
- Writer budget: W_BUDGET_VTM=4000, W_BUDGET_STYLE=2000, W_BUDGET_OTHER=1000, W_BUDGET_EXEC=2000, W_MAX=12000
- Editor budget: E_BUDGET_VTM=2000, E_BUDGET_STYLE=1000, E_BUDGET_OTHER=500, E_BUDGET_EXEC=1000, E_MAX=6000

Both are prepared at pipeline start (lines 621-626) so the Brand Brain is loaded ONCE and reused across all posts.

---

### I. 3-BLOCK PROMPT CACHING SYSTEM

**Architecture:** Every Claude API call in the pipeline uses a 3-block system prompt with Anthropic's prompt caching. The blocks are passed as the `system` parameter (a list of `{"type": "text", "text": ..., "cache_control": ...}` objects).

#### Block 1: Writing Standards (Static, Always Cached)

**Content source:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/standards/writing_standards.txt` (41 lines)
**Loaded by:** `load_writing_standards()` function present in every agent file
**Cache control:** `{"type": "ephemeral"}` -- cached by Anthropic API, reused across ALL articles for ALL clients

Content of writing_standards.txt:
- STRUCTURE: First sentence must answer heading question in <=25 words; max 3 sentences per paragraph; no colons in headings; no em dashes; FAQ required with min 5 questions
- VOICE & STYLE: No passive voice; no "it's not X, it's Y"; no filler openers; no consecutive sentences starting with same word
- FORMATTING VARIETY: 60% prose, 25% bullets, 15% numbered; min 3 items in any list
- CITATIONS & LINKS: Every stat needs a markdown link; every internal link uses target keyword as anchor; min 3 external citations
- ANCHOR TEXT RULES: 2-4 words max, descriptive keyword phrase, never generic
- META: Title 55-60 chars, description 150-160 chars

#### Block 2: Brand Brain Context (Cached Per Client)

**Content:** Assembled by `build_brand_brain_block()` or `build_brain_text()` from guidelines, brand_documents, executive_voices, content_library
**Cache control:** `{"type": "ephemeral"}` -- cached by Anthropic API, reused across all articles for the same client in the same session

#### Block 3: Agent-Specific Instructions (Not Cached)

**Content:** The agent's system prompt (WRITER_SYSTEM_PROMPT, EDITOR_SYSTEM_PROMPT, or BRIEF_SYSTEM_PROMPT) plus any dynamic content like the internal link reference table
**Cache control:** None -- this changes per article (the link reference, keywords, etc. differ)

#### Implementation locations:

| File | Function | Lines | Notes |
|---|---|---|---|
| `writing_agent.py` | `build_system_blocks()` | 390-407 | 3 blocks: standards (cached), brand brain (cached), writer prompt + link ref (not cached) |
| `editing_agent.py` | `build_system_blocks()` | 433-474 | 3 blocks: standards (cached), brand brain (cached), editor prompt (not cached) |
| `brief_agent.py` | inline in `generate_brief()` | 438-475 | 3 blocks: standards (cached), brand brain (cached), brief prompt (not cached) |
| `cluster_pipeline.py` | inline in `main()` | 628-644 | Builds 3 separate system_blocks arrays (brief, write, edit) sharing the same Block 1 |
| `content_editor.py` | `build_system_blocks()` | 1121-1156 | 2 blocks: standards+editor prompt combined (cached), brand brain (cached) |
| `content_writer.py` | inline in `write_article()` | ~1340-1380 | 3 blocks: standards (cached), brand brain (cached), writer instructions (not cached) |

#### Cache hit detection:

**File:** `content_writer.py` lines 165-201, function `log_cache_stats()`

Logic: Reads `cache_read_input_tokens` from the API response usage. If `cache_read >= standards_tokens`, Block 1 was a HIT. If `cache_read >= standards_tokens + brain_tokens`, Block 2 was also a HIT. Prints per-block HIT/MISS status and savings percentage.

---

### J. BANNED PATTERNS / QUALITY GATES (REGEX ENFORCEMENT)

#### Banned Filler Phrases List

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/editing_agent.py`
**Lines:** 91-113
**Variable:** `BANNED_FILLER_PHRASES`

38 phrases:
```
"in today's rapidly evolving", "in today's fast-paced", "it's no secret that",
"at the end of the day", "in the ever-changing landscape", "in this day and age",
"let's dive in", "without further ado", "buckle up", "it goes without saying",
"needless to say", "the fact of the matter is", "when all is said and done",
"last but not least", "in conclusion", "to summarize", "as we all know",
"it's important to note that", "it's worth noting that", "at its core",
"leverage", "synergy", "game-changer", "paradigm shift", "move the needle",
"low-hanging fruit", "circle back", "deep dive", "take it to the next level",
"robust", "cutting-edge", "best-in-class", "world-class", "holistic", "streamline",
"empower", "revolutionize", "transformative", "disruptive", "innovative solution",
"unlock the power", "harness the potential", "navigate the complexities",
"in the realm of", "the landscape of", "look no further", "here's the thing",
"here's the deal", "the bottom line is", "let's face it", "the truth is",
"make no mistake"
```

Also duplicated in `content_editor.py` lines 102-155 and `cluster_pipeline.py` lines 388-395 (shorter list).

#### detect_banned_patterns(text) Function

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/editing_agent.py`
**Lines:** 116-176
**Returns:** list of dicts with keys: location, rule, severity, fix

**Regex patterns:**
1. **Em dashes** (line 121): `re.finditer(r"[^\n]{0,30}[\u2014\u2013][^\n]{0,30}", text)` -- captures 30 chars of context around em/en dashes
2. **Colons in headings** (line 130): `re.finditer(r"^(#{1,6}\s+.+:.+)$", text, re.MULTILINE)` -- any H1-H6 containing a colon
3. **"It's not X, it's Y"** (line 139): `re.finditer(r"[Ii]t'?s\s+not\s+.{2,40}[\s,;]+it'?s\s+", text, re.IGNORECASE)` -- negation-then-correction pattern
4. **Filler phrases** (lines 150-165): Case-insensitive substring search using `text_lower.find(phrase.lower(), idx)` with 15-char context window
5. **Exclamation clusters** (line 168): `re.finditer(r'![^!]{0,80}!', text)` -- two exclamation marks within 80 chars

#### check_quality_gates(text, target_word_count) Function

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/editing_agent.py`
**Lines:** 179-223
**Returns:** list of dicts with keys: gate, passed (bool), detail

**Gates checked:**
1. **FAQ section** (line 184): `re.search(r"^#{1,3}\s+.*(FAQ|Frequently Asked)", text, re.MULTILINE | re.IGNORECASE)`
2. **Internal links >= 2** (lines 192-199): Counts links where URL does not start with http or contains "systemsledgrowth"
3. **External citations >= 2** (lines 200-204): Count = total links minus internal links
4. **Word count >= 90% of target** (lines 207-213): `len(text.split()) >= int(target_word_count * 0.9)`
5. **H2 subheadings >= 3** (lines 216-221): `len(re.findall(r"^##\s+", text, re.MULTILINE))`

#### check_brief_compliance(draft, brief) Function

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/editing_agent.py`
**Lines:** 226-246

Checks:
1. **Leftover placeholders** (line 232): `re.findall(r'\[(NATHAN|INSERT|TODO|PLACEHOLDER):', draft, re.IGNORECASE)`
2. **Internal links from brief** (lines 237-240): Checks if link IDs mentioned in brief appear in draft
3. **INTERNAL_LINKS_SUMMARY** (lines 243-244): Checks for stray summary section that should have been stripped

#### enforce_writing_standards() Function (keyword-based editor)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_editor.py`
**Lines:** 445-611
**Returns:** `(fails: list[dict], warnings: list[dict])`

**FAIL-level gates:**
- Colon in heading (line 471)
- Em/en dash (line 476)
- Fewer than 5 FAQ questions (lines 483-502)
- Unlinked statistic -- sentences with % or $ but no markdown link (lines 504-527)
- Meta title over 60 chars (lines 529-534)
- Meta description over 160 chars (lines 536-541)
- Anchor text over 4 words (lines 571-582)
- Generic anchor text (click here, read more, etc.) (lines 584-594)
- Paragraph over 3 sentences (lines 596-609)

**WARNING-level:**
- Passive voice (lines 543-553): `re.compile(r"\b(?:is|are|was|were|be|been|being)\s+\w+ed\b")`
- Filler opener in first 500 chars (lines 555-569)

---

### K. CSV IMPORT AND CLUSTER MAP DATA MODEL

#### CSV Import Pipeline

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/load_keywords.py`

**Step 1: Read CSV** -- `read_csv()` lines 86-216
- Validates domain against `clients` table (line 89)
- Opens CSV with `csv.DictReader` (line 99)
- Picks keyword and date columns (from args or interactively)
- Builds list of `{"keyword": ..., "date": ...}` dicts

**Step 2: Clean keywords** -- `clean_keywords()` lines 223-238
- Strips whitespace, warns on >100 keywords

**Step 3: Intent detection** -- `detect_intents()` lines 245-302
- Batches keywords in groups of 20 (constant `INTENT_BATCH_SIZE = 20` at line 32)
- Sends to Claude (`claude-sonnet-4-6`) with prompt: "classify as informational/commercial/transactional/navigational"
- Parses JSON response, defaults to "informational" on failure
- Assigns `kw["intent"]` for each keyword

**Step 4: Keyword clustering** -- `cluster_keywords()` lines 309-424
- Uses `rapidfuzz.fuzz.token_sort_ratio` with threshold 80 (`FUZZY_CLUSTER_THRESHOLD = 80` at line 33)
- Compares each keyword against all others in CSV AND against existing `content_schedule` records
- When cluster found: user picks primary (or auto-picks first in non-interactive mode)
- Secondary keywords merged into primary's `secondary_keywords` list

**Step 5: Duplicate check** -- `check_duplicates()` lines 431-492
- Checks against existing `content_schedule` keywords for this client
- Exact match (score >= 100): auto-skip
- Similar match (score >= 80): warn and prompt user
- Constants: `FUZZY_DUPLICATE_EXACT = 100`, `FUZZY_DUPLICATE_WARN = 80`

**Step 6: Preview** -- `preview_keywords()` lines 499-515
**Step 7: Load to Supabase** -- `load_to_supabase()` lines 522-549
- Inserts into `content_schedule`: client_id, keyword, scheduled_for, status="pending", intent, secondary_keywords

#### Cluster Map Data Model

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/db/cluster_map_migration.sql`
**Lines:** 8-61

The `cluster_posts` table is the core data model for the cluster-based pipeline. Each row = one blog post within a topic cluster. Key design decisions:

- `cluster_id` groups related posts (e.g., "C001")
- `post_id` is the unique identifier within a cluster (e.g., "P001")
- `post_type` is constrained to: `pillar`, `supporting`, `question`
- `cluster_position` determines processing order (pillars first)
- `links_to` and `links_from` are text fields containing comma-separated post IDs for the internal linking graph
- `status` is a constrained enum representing the pipeline state machine
- Agent outputs (`brief`, `draft`, `edited_draft`) are stored inline as text columns
- Publishing metadata (`published_url`, `slug`, `meta_description`) lives on the same row
- `UNIQUE (client_id, post_id)` prevents duplicate posts per client

---

### L. INTERNAL LINK RESOLUTION SYSTEM

#### Cluster-Based (keyword to URL slug mapping)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/writing_agent.py`

**`_keyword_to_slug(keyword)`** -- lines 226-229
```python
def _keyword_to_slug(keyword: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', keyword.lower()).strip('-')
```

**`build_link_reference(all_posts, site_domain, manifesto_url)`** -- lines 232-264
For each post in the cluster map:
1. If `published_url` exists (already live), use the real URL
2. Else if `slug` exists, construct `https://{domain}/post/{slug}`
3. Else if `primary_keyword` exists, generate `https://{domain}/post/{keyword_to_slug(keyword)}`
4. Else fall back to `_keyword_to_slug(title)`

Output is a multi-line reference string appended to Block 3 of the writer's system prompt:
```
=== INTERNAL LINK REFERENCE ===
Use ONLY these URLs for internal links. Do not invent URLs.
URL pattern: https://systemsledgrowth.ai/post/[keyword-slug]

P001: Building AI Content Engines [ai content engine] -> https://systemsledgrowth.ai/post/ai-content-engine
P002: ...
MANIFESTO: Systems-Led Growth -> https://systemsledgrowth.ai/manifesto
```

**Also in cluster_pipeline.py** -- lines 552-559:
Same logic in compressed form within `run_post()`.

**Also in brief_agent.py** -- lines 286-299:
URL resolution for cluster context (pillar URL, sibling URLs) using same slug generation pattern.

#### Keyword-Based (sitemap_index matching)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_writer.py`
**Function:** `find_internal_links(client_id, keyword, sitemap_links)` -- lines 539-585

Logic:
1. Uses pre-loaded `sitemap_index` rows (blog/case_study content types) from Brand Brain loading
2. Splits keyword into word set: `kw_words = set(keyword.lower().split())`
3. For each sitemap row, computes word overlap between keyword and `page_title + primary_keyword`
4. Scores: `overlap_count * priority` where priority=2 for blog/case_study, 1 for other
5. Sorts by score descending, returns top 10 `{"url": ..., "title": ...}`

---

### M. EXTERNAL LINK 404 CHECKING

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/editing_agent.py`
**Function:** `check_external_links(text)` -- lines 249-281

**Logic:**
1. Line 252: Extract all markdown links: `re.findall(r'\[([^\]]+)\]\((https?://[^)]+)\)', text)`
2. Line 256: Filter to external only: `[(anchor, url) for anchor, url in all_links if "systemsledgrowth" not in url]`
3. Lines 262-279: For each external URL:
   - `requests.head(url, timeout=8, allow_redirects=True, headers={"User-Agent": "Mozilla/5.0 ..."})`
   - If `status_code >= 400`: append to broken list with status code
   - Handle `Timeout`: append with error "Timeout"
   - Handle `ConnectionError`: append with error "Connection failed"
   - Handle generic exceptions: append with first 50 chars of error string
4. Returns: `list[dict]` with keys: url, anchor, status, error

**Integration into editing pipeline:**
- `editing_agent.py` lines 753-763: Broken links from `check_external_links()` are injected into `regex_violations` as High severity items with rule "BROKEN LINK: {error} on {url}" and fix "Remove this link or replace with a working URL."
- These violations are then passed to Claude in Call 1 (violation review) so the LLM is aware of them.
- In Call 3 (clean version), instruction #11 (line 601) says: "Remove or replace any broken external links flagged in the violations."

**Also in cluster_pipeline.py** -- lines 426-438, function `_check_external_links(text)`:
Same logic with slightly simpler error reporting.

---

### N. ADDITIONAL NOTABLE SYSTEMS

#### Autopilot Keyword Discovery and Filtering

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/autopilot.py`

**GSC opportunities** -- `get_gsc_opportunities(client)` lines 293-335
- Queries Google Search Console for keywords ranking positions 4-15 with >100 impressions
- Returns list with `source: "gsc_opportunity"`

**DataforSEO discovery** -- `get_dataforseo_keywords(client, exclude, limit)` lines 346-392
- Uses client's `autopilot_seed_topics` (up to 3 topics)
- Filters by `autopilot_min_volume` and `autopilot_max_difficulty` (calibrated to domain authority + 15, max 60)
- Excludes already-targeted keywords

**Manual exclusion/inclusion lists** -- lines 95-114
- `keyword_exclusions`: any keyword containing an excluded term is removed
- `keyword_inclusions`: keywords matching an included term get a 1.3x score multiplier

**Claude relevance filter** -- `filter_keywords_by_relevance()` lines 395-492
- Sends top 30 candidates to Claude claude-sonnet-4-20250514
- Prompt includes business context (mission, ICP, brand docs)
- REJECT if: targets job seekers, students, wrong industry, too generic, would never convert
- KEEP if: attracts ICP, informational/commercial intent, fits content strategy
- Returns JSON with keep/reject/reject_reasons

**Scoring** -- `select_best_keywords()` lines 495-520
- `difficulty_score = max(0, 1 - (difficulty / (da + 20)))`
- `volume_score = min(1, volume / 1000)`
- `score = (volume_score * 0.4) + (difficulty_score * 0.6)`
- GSC opportunities get 1.3x bonus

#### Research Stat Verification (keyword-based writer)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_writer.py`
**Function:** `verify_research_stats(research)` -- lines 662-766

Logic:
1. For each citation from web search: fetch the source URL, extract all visible text
2. Extract numbers from the claim using `_extract_numbers()` (line 656): `re.findall(r"\$?[\d,]+\.?\d*[%xXMBKk]?")`
3. Check if at least one number from the claim appears on the page (case-insensitive, comma-stripped)
4. Discard stats where the specific number cannot be found
5. If fewer than 3 verified stats, run `_run_second_research_pass()` (lines 769-807) targeting different sources

#### Campaign Brief Generation (keyword-based writer)

**File:** `/Users/nathanthompson/Downloads/test-claude-build-dataforseo-pipeline-8YFlB/scripts/content_writer.py`
**Function:** `create_campaign_brief()` -- lines 814-1019

Returns a JSON object with:
- `sections[]`: heading, description, format (prose/bullets/numbered), word_count, stats[] (claim, url, anchor_text), internal_links[] (url, anchor_text)
- `faq[]`: question, answer
- `total_word_count`

Post-processing enforces:
- No more than 2 consecutive sections with same format (lines 960-970)
- Anchor text trimmed to 4 words max (lines 973-991)
- FAQ capped at 8 questions (lines 1015-1017)

---

That covers every file in the project and every area you requested, with exact absolute file paths, line number ranges, function/variable names, and descriptions of the logic.