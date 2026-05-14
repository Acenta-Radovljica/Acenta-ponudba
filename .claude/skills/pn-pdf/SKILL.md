---
name: pn-pdf
description: Generate PDF from existing ponudba.json
user_invocable: true
---

# /pn:pdf — Generiraj PDF

Vzame `data/ponudba.json` in naredi PDF v `output/`.

## Kdaj uporabi

- Ko je `ponudba.json` že generiran in hočeš samo PDF
- Ko si uredil ponudba.json ročno in hočeš preveriti izgled
- Ko testiraš spremembe na predlogi

## Workflow

1. Preveri da `data/ponudba.json` obstaja:
   ```bash
   ls -la "data/ponudba.json"
   ```

2. Poženi generacijo PDF:
   ```bash
   npm run pdf
   ```

3. Preveri koliko strani ima PDF:
   ```bash
   node -e "import('fs').then(({readFileSync})=>{const p=readFileSync('./output/ponudba-*.pdf','utf8');const m=p.match(/\/Type\s*\/Page[^s]/g);console.log('Strani:',m?m.length:'?')})"
   ```

4. Odpri PDF:
   ```bash
   start "" "output/ponudba-{ime-stranke}.pdf"
   ```

5. Poroči: pot do PDF in število strani.

## Možne napake

- `ENOENT: output/` → mapa ne obstaja, dodaj `mkdirSync` v `src/03-pdf.js`
- 3 strani namesto 2 → preveč vsebine, zmanjšaj spacing v @media print
- Beli tekst na belem → `print-color-adjust: exact` manjka v template
- `{{PLACEHOLDER}}` v PDFju → polje manjka v ponudba.json
