---
name: pn-generate
description: Generate proposal content from kickoff transcript using Claude API
user_invocable: true
---

# /pn:generate — Generiraj vsebino ponudbe

Pokliče Claude API (Tool Use) in iz `data/kickoff.txt` generira `data/ponudba.json`.

## Kdaj uporabi

- Ko imaš transkript sestanka v `data/kickoff.txt`
- Ko hočeš videti kaj bo Claude generiral preden narediš PDF
- Ko popravljaš prompt in hočeš testirati rezultat

## Workflow

1. Preveri da `data/kickoff.txt` obstaja in ni prazen:
   ```bash
   ls -la "data/kickoff.txt"
   ```

2. Preveri vsebino (prvih 5 vrstic):
   ```bash
   head -5 "data/kickoff.txt"
   ```

3. Poženi generacijo:
   ```bash
   npm run generate
   ```

4. Preveri rezultat:
   ```bash
   cat "data/ponudba.json"
   ```

5. Poroči uporabniku:
   - Ime stranke (`IME_STRANKE`)
   - Storitve (`STORITEV_BADGE`)
   - Cena vzpostavitve (`SKUPAJ_VZPOSTAVITEV`)
   - Mesečna cena (`SKUPAJ_MESECNO`)
   - Vprašaj: "Hočeš generirati PDF?"

## Možne napake

- `Napaka: manjka data/kickoff.txt` → kickoff.txt ne obstaja, ga je treba ustvariti
- `Claude ni uporabil Tool Use` → API klicni problem, preveri ANTHROPIC_API_KEY v .env
- `JSON parse error` → redko z Tool Use, preveri surovi output
