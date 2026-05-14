---
description: Claude API usage rules for acenta-ponudbe
globs: src/*.js
---

# Claude API Rules

## Always Use Tool Use — Never Raw JSON Prompt

The pipeline uses Anthropic Tool Use (`tool_choice: { type: 'tool', name: 'pripravi_ponudbo' }`) to force structured output. This guarantees valid JSON without parsing hacks.

NEVER revert to asking Claude to "return valid JSON" in the prompt text — that approach breaks randomly and requires fragile markdown-stripping code.

## Tool Schema Must Have description on Every Property

The `description` field guides Claude's output quality. Without it, Claude makes worse pricing decisions and generates generic text.

```javascript
// CORRECT — with descriptions:
IME_STRANKE: {
  type: 'string',
  description: 'Uradno ime podjetja stranke'
},

// WRONG — no description:
IME_STRANKE: { type: 'string' }
```

## System Prompt Must Include Both Rules

The `sistemskiPrompt` must always contain:

1. **Pricing rules with exact price points** — not ranges:
```
Google Ads vzpostavitev: 239,00 € (preprosta) ali 429,00 € (kompleksna, več kategorij OR B2B+B2C)
```

2. **Services restriction rule**:
```
PRAVILO STORITEV: Vključi SAMO storitve ki so eksplicitno omenjene v zapiskih.
```

## max_tokens Must Be 4096

```javascript
max_tokens: 4096,  // CORRECT
max_tokens: 2048,  // WRONG — too low for complex proposals
```

## run.js and 02-generate.js Must Be Identical

Both files contain the full Claude API call. They MUST have:
- Identical `orodje` (Tool Use schema with all `description` fields)
- Identical `sistemskiPrompt` (same pricing rules, same PRAVILO STORITEV)
- Identical `max_tokens`

`src/02-generate.js` is the authoritative source. When changing either, update both.

## Price Format Enforcement

Prices use regex patterns in the schema. These exact patterns must not be changed:

```javascript
vzpostavitev: {
  type: 'string',
  pattern: '^(\\d{1,3}\\.?\\d{3}|\\d+),\\d{2} €$|^null$'
  // Accepts: "429,00 €" or "null"
},
mesecno: {
  type: 'string',
  pattern: '^(\\d{1,3}\\.?\\d{3}|\\d+),\\d{2} €/mes\\.$|^null$'
  // Accepts: "190,00 €/mes." or "null"
}
```

## Model Selection

Use `claude-sonnet-4-6` for proposal generation — it's fast, cheap, and the Tool Use schema constrains quality. Do not use haiku (too weak for Slovenian business writing) or opus (unnecessary cost for structured output).
