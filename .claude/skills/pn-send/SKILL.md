---
name: pn-send
description: Full pipeline - generate content, PDF and send email to client in one step
user_invocable: true
---

# /pn:send — Cel pipeline + pošlji email

Zažene celoten pipeline: kickoff.txt → Claude API → PDF → email stranki.

## Kdaj uporabi

- Ko je transkript v `data/kickoff.txt` in hočeš poslati ponudbo
- Ko hočeš cel proces v enem ukazu

## Workflow

1. Vprašaj za email stranke (če ni podan):
   "Na kateri email naj pošljem ponudbo?"

2. Preveri da `data/kickoff.txt` obstaja:
   ```bash
   ls -la "data/kickoff.txt"
   ```

3. Poženi cel pipeline z emailom:
   ```bash
   npm start -- {email@stranka.si}
   ```

4. Potrdi dostavo:
   - Stranka: `IME_STRANKE`
   - Email: `{email}`
   - PDF: `output/ponudba-{slug}.pdf`
   - Status: poslan ✓

## Možne napake

- Email autentikacija → preveri EMAIL_USER in EMAIL_PASS v .env
- Microsoft 365 blokira → preveri da app passwords so omogočeni na računu
- Pipeline ne najde kickoff.txt → ustvari ga najprej

## Opomba

`npm start` zažene `src/run.js` ki vsebuje celoten pipeline (generacija + PDF + email).
Brez email argumenta se pipeline ustavi po generaciji PDFja in ne pošlje emaila.
