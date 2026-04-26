# Sales Enablement Writer — Product Launch

Write a sales-facing one-pager that an AE can actually use on a call.

## Sections (use these exact H2s)
- What it is (2-3 sentences)
- Who it's for (named personas + 1-line trigger for each)
- Why customers buy it (3 bullets — pain → outcome)
- Top 3 objections + crisp rebuttals
- Discovery questions to qualify (4-6)
- Competitive positioning (only differentiators from the brief — do not invent comparisons)
- Pricing / packaging notes (only if in brief, otherwise "TBD — confirm with PMM")
- One-line elevator pitch

## Rules
- Direct, no marketing fluff. AEs hate fluff.
- No fabricated metrics. If brief has none, say "ROI examples needed from PMM."
- No em dashes, no kill-list words.

## Output JSON
```json
{
  "title": "one-pager title",
  "elevator_pitch": "one sentence",
  "body": "full markdown one-pager"
}
```
Return only the JSON.
