---
description: HTML template rules for acenta-ponudbe proposal design
globs: templates/*.html
---

# Template Rules

## Placeholder Tokens Are Untouchable

Never delete or rename a `{{PLACEHOLDER}}` token without coordinating with pipeline-guardian to update the Tool Use schema in BOTH `src/02-generate.js` AND `src/run.js`.

If a placeholder is removed from the template, the corresponding key in `ponudba.json` becomes orphaned — no immediate error, but the data is silently discarded.

All 19 tokens: `{{STORITEV_BADGE}}`, `{{NASLOV}}`, `{{PODNASLOV}}`, `{{DATUM}}` (3x), `{{STEVILKA_PONUDBE}}`, `{{IME_STRANKE}}`, `{{DODATNI_META}}`, `{{UVODNI_ODSTAVEK}}`, `{{KARTICE_STORITEV}}`, `{{OPOMBA_CENE}}`, `{{VRSTICE_CEN}}`, `{{SKUPAJ_VZPOSTAVITEV}}`, `{{SKUPAJ_MESECNO}}`, `{{KORAK_1}}`, `{{KORAK_2}}`, `{{KORAK_3}}`, `{{KORAK_4}}`, `{{IME_KOMERCIALISTA}}`, `{{NAZIV_KOMERCIALISTA}}`, `{{EMAIL_KOMERCIALISTA}}` (2x)

## Page Break Syntax

Always use the legacy CSS property — not the modern shorthand:

```html
<!-- CORRECT: -->
<div style="page-break-before: always; padding-top: 32px;">

<!-- WRONG — less reliable in Puppeteer/Chromium: -->
<div style="break-before: page;">
```

## Print Color Adjust

The `@media print` block MUST include `print-color-adjust: exact` for these elements:
`.header`, `.cta-box`, `.price-table thead tr`, `.price-table .total-row`, `.step-circle`, `.section-number`, `.footer`, `.service-badge`

Without this, Chromium strips all background colors in print mode.

## Brand Colors

Always use CSS custom properties — never hardcode hex values:

```css
/* CORRECT: */
background: var(--pitch);
color: var(--teal);

/* WRONG: */
background: #0B0F10;
color: #00AFAA;
```

## Font

Font family must remain `'Exo 2', 'Helvetica Neue', Arial, sans-serif`. Never change the primary font.

Google Fonts CDN link must remain in `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600;700&display=swap" rel="stylesheet">
```

## Footer Location

The `.footer` div is a regular HTML element at the bottom of the document — NOT a Puppeteer `footerTemplate`. This is intentional: it ensures the footer appears only on page 2. Never convert it to a Puppeteer footerTemplate.

## Self-Contained Template

Never add:
- External CSS files (`<link rel="stylesheet" href="...">` other than Google Fonts)
- External JavaScript files (`<script src="...">`)
- Local image files — use CSS gradients and shapes only

The template must render correctly with only the Google Fonts CDN request.

## After Every Change

Run `npm run pdf` and visually inspect the output in `output/`. Verify:
1. Both pages render (not 1 page, not 3)
2. Page break after Section 2 (before Section 3 — Cenovna struktura)
3. All background colors appear (dark header, teal accents, pitch footer)
4. Font renders as Exo 2 (not Helvetica Neue)
5. No literal `{{PLACEHOLDER}}` text in the PDF
