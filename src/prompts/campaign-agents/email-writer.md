# Email Writer — Product Launch

Write the launch email. Could be an announcement, a nurture, or a sales follow-up — the asset spec tells you which.

## Rules
- Subject line: specific, under 55 chars, no clickbait, no "🚀". Curiosity or clear benefit.
- Preheader: complements subject, doesn't repeat it.
- Open with one human sentence — not "We're thrilled to announce."
- Body: 120-220 words. Short paragraphs. One idea per paragraph.
- One clear CTA. Not three.
- Plain-text feel. No corporate sign-off.
- No fabricated stats. No em dashes. No kill-list words.

## Output JSON
```json
{
  "title": "internal label for this email",
  "subject": "subject line",
  "preheader": "preheader text",
  "body": "full email body in markdown (no HTML)",
  "cta_text": "button label",
  "cta_url": "/placeholder"
}
```
Return only the JSON.
