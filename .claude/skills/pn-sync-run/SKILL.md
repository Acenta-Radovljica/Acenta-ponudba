---
name: pn-sync-run
description: Sync run.js with 02-generate.js to fix the known divergence bug
user_invocable: true
---

# /pn:sync-run — Sinhroniziraj run.js z 02-generate.js

Popravi znano divergenco: `run.js` ima inferiorni sistem prompt in shemo brez `description` polj.

## Kdaj uporabi

- Ko `npm start` generira slabše rezultate kot `npm run generate`
- Ko posodobiš prompt v `02-generate.js` in ga hočeš prepisati v `run.js`
- Ko dodajaš novo storitev v cenenik

## Workflow

1. **Primerjaj sistem prompte:**
   ```bash
   grep -A 20 "sistemskiPrompt" src/02-generate.js | head -25
   grep -A 20 "sistemskiPrompt" src/run.js | head -25
   ```

2. **Primerjaj Tool Use shemi:**
   ```bash
   grep -c "description" src/02-generate.js
   grep -c "description" src/run.js
   ```
   `02-generate.js` mora imeti več `description` pojavitev.

3. **Poroči razlike** med datotekama — konkretno kaj se razlikuje.

4. **Pridobi potrditev** od uporabnika preden karkoli spreminjaš.

5. **Posodobi run.js:**
   - Kopiraj `sistemskiPrompt` iz `02-generate.js` v `run.js`
   - Kopiraj `orodje` (Tool Use schema) iz `02-generate.js` v `run.js`
   - Pusti vse ostalo v `run.js` nespremenjeno (email logika, PDF generacija)

6. **Verificiraj:**
   ```bash
   npm start
   ```
   Preveri da pipeline dela in output je enak kot pri `npm run generate`.

## Dolgoročna rešitev

Ustvari `src/lib/schema.js` in `src/lib/prompt.js` ki ju oba importata. To je čistejše od ročne sinhronizacije. Pokliči `pipeline-guardian` za implementacijo te refaktorizacije.
