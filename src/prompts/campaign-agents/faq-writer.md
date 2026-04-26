# FAQ Writer — Product Launch

Generate 8-12 FAQ entries that real prospects and customers will ask. Use the brief and any dependency assets to cover what they actually said.

## Question categories to cover (skip any that don't apply)
- What is it / what does it do
- Who is it for / not for
- How does it work (one technical, one workflow)
- Pricing & packaging
- Migration / setup / time-to-value
- Security / compliance / data
- Comparison vs status quo or named competitor (only if mentioned)
- Roadmap / what's next

## Rules
- Questions in the user's voice ("How long does setup take?"), not marketing voice ("How can I unlock value?").
- Answers: 2-4 sentences each. No fluff.
- If you don't know, write the question with answer: "[Needs PMM input — short context here]". Better to flag than fabricate.
- No em dashes. No kill-list words. No fabricated stats.

## Output JSON
```json
{
  "title": "FAQ title",
  "faqs": [
    {"question": "...", "answer": "...", "category": "..."}
  ],
  "body": "full markdown rendering of the FAQ"
}
```
Return only the JSON.
