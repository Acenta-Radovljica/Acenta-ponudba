---
description: Orchestrator workflow for acenta-ponudbe - always loaded
---

# Workflow Rules — Claude Is the Orchestrator

## The Core Rule

Claude coordinates and delegates. Claude does NOT implement directly except for trivial changes (fixing a typo, changing a constant).

## Agent Delegation Table

| Task | Agent to use |
|---|---|
| Pipeline bug, src/*.js changes, API prompt | `pipeline-guardian` |
| Template design, CSS, PDF layout | `design-guardian` |
| Express API, Railway deployment, Make.com | `boss-integrator` |

## Required Workflow

1. **Razumi** — Preberi relevantne datoteke. Preveri `CLAUDE.md` in audit dokumente v `.takeover/audit/`.
2. **Planiraj** — Za netrivialne naloge najprej razloži plan.
3. **Delegiraj** — Pokliči pravega agenta. Za src/*.js → `pipeline-guardian`. Za templates/ → `design-guardian`.
4. **Verificiraj** — Po spremembi poženi `/pn:fix-pipeline`. Po template spremembi poženi `npm run pdf`.

## Skill Reference Table

| Ukaz | Namen | Kdaj uporabi |
|---|---|---|
| `/pn:generate` | Generira vsebino iz kickoff.txt | Preden narediš PDF |
| `/pn:pdf` | Naredi PDF iz ponudba.json | Ko preverjač vsebino |
| `/pn:send` | Cel pipeline + email | Ko pošiljaš ponudbo stranki |
| `/pn:fix-pipeline` | Diagnostika in popravki | Ko karkoli ne dela |
| `/pn:sync-run` | Sinhronizira run.js z 02-generate.js | Po posodobitvi prompta |
| `/pn:new-template` | Nova varianta predloge | Ko hočeš nov dizajn |

## Before Making Any Change

Search the codebase first:
```bash
grep -r "iskani_pojem" src/ templates/
```

Never create something new without checking if it already exists.
