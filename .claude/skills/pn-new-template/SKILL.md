---
name: pn-new-template
description: Create a new proposal template variant based on ponudba-v2.html
user_invocable: true
---

# /pn:new-template — Nova predloga ponudbe

Ustvari novo varianto predloge na osnovi `templates/ponudba-v2.html`.

## Kdaj uporabi

- Ko hočeš krajšo (1-stransko) varianto ponudbe
- Ko hočeš drugačen dizajn za specifično vrsto stranke
- Ko hočeš testirati spremembe ne da bi pokvaril produkcijsko predlogo

## Workflow

1. **Vprašaj** kaj naj bo drugače v novi predlogi:
   - Koliko strani?
   - Katere sekcije dodati/odstraniti?
   - Barve drugačne ali enake kot Acenta brand?

2. **Kopiraj produkcijsko predlogo:**
   ```bash
   cp templates/ponudba-v2.html templates/ponudba-{ime}.html
   ```

3. **Razloži sistem placeholderjev** (ključno da razume):
   - Vseh 19 `{{PLACEHOLDER}}` tokenov mora ostati
   - Vsak `{{TOKEN}}` ki ga odstraniš → tisti podatek ne bo v PDFju
   - Novo polje dodaš v predlogo + shemo v `src/02-generate.js` IN `src/run.js`

4. **Uredi novo predlogo** po zahtevah.

5. **Testiraj:**
   - Posodobi `src/03-pdf.js` da kaže na novo predlogo:
     ```javascript
     const predlogaPot = resolve(__dir, '../templates/ponudba-{ime}.html');
     ```
   - Poženi: `npm run pdf`
   - Preveri output

6. **Po testiranju** vrni `src/03-pdf.js` na `ponudba-v2.html` ali dodaj izbiro predloge kot parameter.

## Opomba za design-guardian

Za kompleksnejše dizajnerske spremembe pokliči `design-guardian` agenta — pozna vse CSS pravila, print media block in brand sistem.
