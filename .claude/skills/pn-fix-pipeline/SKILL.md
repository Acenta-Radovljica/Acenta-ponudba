---
name: pn-fix-pipeline
description: Diagnose and fix common pipeline issues
user_invocable: true
---

# /pn:fix-pipeline — Diagnostika in popravki

Preveri celoten pipeline in popravi znane napake.

## Kdaj uporabi

- Ko pipeline neha delati
- Ko se PDF naredi narobe (null vrednosti, 3 strani, manjkajoči tekst)
- Preventivno pred prvim deployment-om

## Workflow

1. **Preveri .env:**
   ```bash
   cat .env | grep -v "=" || echo ".env ne obstaja!"
   ```
   Mora vsebovati: `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `EMAIL_USER`, `EMAIL_PASS`

2. **Preveri da output/ obstaja:**
   ```bash
   ls -la output/ 2>/dev/null || echo "output/ ne obstaja — ga je treba ustvariti"
   ```

3. **Preveri .gitignore:**
   ```bash
   cat .gitignore 2>/dev/null || echo ".gitignore ne obstaja — KRITIČNO pred git push!"
   ```
   Mora vsebovati: `.env`, `node_modules/`, `output/*.pdf`

4. **Preveri BUG-1 (null string v cenah):**
   ```bash
   grep -n "!== 'null'" src/02-generate.js src/run.js
   ```
   Če najde `s.vzpostavitev !== 'null'` brez `&&` → napaka, popravi.

5. **Preveri BUG-4 (max_tokens):**
   ```bash
   grep -n "max_tokens" src/02-generate.js src/run.js
   ```
   Mora biti `4096`, ne `2048`.

6. **Preveri BUG-3 (divergenca run.js):**
   ```bash
   grep -c "description" src/02-generate.js src/run.js
   ```
   Obe datoteki morata imeti enako število `description` polj v shemi.

7. **Poroči:** seznam najdenih problemov z oceno resnosti (KRITIČNO / VISOKO / SREDNJE) in predlogi za popravke.

## Avtomatski popravki

Za vsako najdeno napako vprašaj: "Naj popravim?" Popravi samo tiste ki jih uporabnik potrdi. Uporabi `pipeline-guardian` agenta za kompleksnejše popravke.
