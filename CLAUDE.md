# acenta-ponudbe — Claude Code

Sistem za pripravo prodajnih ponudb za Acenta d.o.o. (digitalna marketinška agencija, Radovljica).

## Kako deluje

Ponudbe se pripravljajo v appu `app.js` (https://ponudbe.deploy.acenta.si): brief ali transkript →
`/razcleni` (tipska ali unikatna) → urejanje → `/predogled` s komentarji in `/popravi` → `/generiraj-pdf`.
Vsa pravila ponudb (cenik, varovala, seštevki, podpisnik) so v `app.js`.

Iz terminala gre isto prek globalnega skilla `/ponudba` (`~/.claude/skills/ponudba`), ki samo kliče
te endpointe. Ponudbe ne sestavlja sam.

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

- `app.js` — app (endpointi, prompti, sheme, varovala)
- `render.js` — generira PDF, HTML predogled in Word iz JSON-a (`PONUDBA_JSON`, `PDF_OUT`, `HTML_OUT`)
- `cenik.md` — cenik storitev (bere ga app pri razčlembi)
- `templates/ponudba-v2.html` — PDF predloga
- `templates/ponudba-word.html` — Word predloga (zastarela, ne pozna nastavitev oblike in časovnice)
- `data/ponudba.json` — samo za ročni `render.js` in staro pot `/generiraj-pdf` s praznim telesom

## Varnostna pravila

1. **Nikoli ne komitaj `.env`** — vsebuje poti do map
2. **Ne deli `.env`** — vsak uporabnik nastavi svoje poti
