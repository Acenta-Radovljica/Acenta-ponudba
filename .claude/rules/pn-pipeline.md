---
description: Pipeline integrity rules for acenta-ponudbe src/*.js files
globs: src/*.js
---

# Pipeline Integrity Rules

## Output Directory

Always create `output/` before writing PDF. Add this BEFORE `puppeteer.launch()`:

```javascript
import { mkdirSync } from 'fs';
mkdirSync(resolve(__dir, '../output'), { recursive: true });
```

Without this, Puppeteer throws `ENOENT` after the Claude API call has already been billed.

## process.exit() Rules

- `process.exit(1)` on error: OK anywhere
- `process.exit(0)` on success: ONLY at top-level entry points, never inside functions
- Reason: `03-pdf.js` will become importable when `server.js` is built — `process.exit(0)` inside a function kills the server process

Correct pattern for entry point guard:
```javascript
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  // top-level execution code here
}
```

## Tool Use Extraction

Always check `toolBlock` before accessing `.input`:

```javascript
const toolBlock = odgovor.content.find(b => b.type === 'tool_use');
if (!toolBlock) {
  console.error('Claude ni uporabil Tool Use.');
  process.exit(1);
}
const podatki = toolBlock.input;
```

Never do `odgovor.content[0].input` directly — if the model returns a text block first, this crashes.

## Price Null Safety

Never render prices with simple string comparison. Always use null-safe check:

```javascript
// WRONG:
<td>${s.vzpostavitev !== 'null' ? s.vzpostavitev : '—'}</td>

// CORRECT:
<td>${(s.vzpostavitev && s.vzpostavitev !== 'null') ? s.vzpostavitev : '—'}</td>
```

Apply to BOTH `vzpostavitev` AND `mesecno` in BOTH `src/02-generate.js` AND `src/run.js`.

## Schema Synchronization

`src/02-generate.js` is the AUTHORITATIVE source for:
- `orodje` (Tool Use schema with full `description` fields)
- `sistemskiPrompt` (with pricing rules including B2B+B2C criteria)

`src/run.js` MUST be kept in sync. When modifying the schema or prompt:
1. Edit `src/02-generate.js` first
2. Mirror ALL changes to `src/run.js`
3. Run both: `npm run generate` and `npm start` to verify identical output

## max_tokens

Always use `max_tokens: 4096`. The value `2048` is too low for complex proposals with 3+ services and full descriptions — truncated output produces literal `{{KORAK_4}}` in the PDF.

## ESM Path Resolution

Always use this pattern for file paths:
```javascript
const __dir = dirname(fileURLToPath(import.meta.url));
const pot = resolve(__dir, '../data/kickoff.txt');
```

Never use `__dirname` (CJS only) or relative paths like `'./data/kickoff.txt'`.

## Error Handling for Server Context

When adding `try/catch` blocks in `src/server.js`, wrap ALL async operations:
```javascript
try {
  const podatki = await generatePonudba(transcript);
  const pdf = await generatePDF(podatki);
  if (email) await sendEmail(email, podatki, pdf);
  res.json({ success: true });
} catch (err) {
  console.error('Pipeline error:', err.message);
  res.status(500).json({ error: err.message });
}
```
