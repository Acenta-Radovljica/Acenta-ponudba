# acenta-ponudbe — Claude Code

Sistem za pripravo prodajnih ponudb za Acenta d.o.o. (digitalna marketinška agencija, Radovljica).

## Kako deluje

1. Uporabnik pokliče `/ponudba` skill in prilepi transkript kickoff sestanka
2. Claude prebere cenik (`cenik.md`), sestavi `data/ponudba.json`
3. `render.js word` generira Word osnutek za pregled
4. Po potrditvi `render.js pdf` generira končni PDF

## Ukazi

```bash
node --env-file=.env render.js word   # JSON → Word osnutek
node --env-file=.env render.js pdf    # JSON → PDF
```

## Konfiguracijske spremenljivke (.env)

```
OSNUTKI_MAPA=C:\pot\do\Osnutki   # opcijsko, privzeto output/osnutki/
IZHOD_MAPA=C:\pot\do\Izhod       # opcijsko, privzeto output/
```

Brez `.env` se datoteke shranijo v `output/` znotraj mape ponudbe.

## Acenta podatki

- Podjetje: Acenta d.o.o., Kranjska cesta 4, 4240 Radovljica
- Tel: +386 (0) 4 530 28 28 | info@acenta.si | www.acenta.si
- ID: SI97997404 | TRR: SI56 0700 0000 4418 828, Gorenjska banka d.d.
- Barve: `#00AFAA` teal, `#FF0A60` accent, `#0B0F10` pitch, `#24272A` dark

## Datoteke

- `render.js` — generira Word in PDF iz `data/ponudba.json`
- `cenik.md` — cenik storitev (Claude ga bere pri sestavljanju ponudbe)
- `templates/ponudba-v2.html` — PDF predloga
- `templates/ponudba-word.html` — Word predloga
- `data/ponudba.json` — trenutna ponudba (prepisana ob vsakem klicu)
- `.claude/skills/ponudba/skill.md` — skill za `/ponudba` ukaz

## Varnostna pravila

1. **Nikoli ne komitaj `.env`** — vsebuje poti do map
2. **Ne deli `.env`** — vsak uporabnik nastavi svoje poti
