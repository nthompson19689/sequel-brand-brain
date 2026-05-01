# Sequel Brand Brain — MCP Server

Stdio MCP server that exposes semantic-search tools backed by pgvector +
OpenAI `text-embedding-3-small` (1536 dims).

## Tools

| Tool | Tables searched |
| --- | --- |
| `search_brand_content(query)` | `brand_docs`, `articles` |
| `search_competitive_intel(competitor)` | `battle_cards`, `competitor_scan_results` |
| `search_call_insights(query)` | `call_insights` |
| `search_campaigns(query)` | `campaigns`, `campaign_assets` |

Each tool returns matches sorted by cosine similarity (re-ranked
client-side against the OpenAI query embedding).

## Setup

```bash
npm install
```

Set in `.env.local` (same env the Next app uses):

```
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Make sure migration `db/migration_027_openai_embeddings.sql` has been run
and rows have been embedded:

```bash
curl -X POST http://localhost:3000/api/embed/backfill?table=all
```

## Run

```bash
npm run mcp
```

That starts the server on stdio. Connect it to Claude Desktop or any
MCP client by pointing at `npm run mcp` (or `npx tsx mcp/server.ts`).

Example Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sequel-brand-brain": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/sequel-brand-brain/mcp/server.ts"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "NEXT_PUBLIC_SUPABASE_URL": "https://....supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJ..."
      }
    }
  }
}
```
