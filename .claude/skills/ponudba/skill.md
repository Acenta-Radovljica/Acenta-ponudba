---
name: ponudba
description: Iz transkripta kickoff sestanka generiraj ponudbo Acenta — najprej Word za pregled, nato PDF po potrditvi. Pokliči z /ponudba ali /ponudba [pot do txt datoteke].
---

# Skill: Generator ponudb Acenta

## Kaj narediš

1. Prebereš transkript
2. Prebereš cenik (`cenik.md` v projektni mapi)
3. **Ti sam (Claude)** iz transkripta razberaš podatke in sestaviš `ponudba.json`
4. Zapišeš JSON v `data/ponudba.json`
5. Poženeš `render.js word` → Word odprt (uporablja `templates/ponudba-word.html`)
6. Čakaš na potrditev uporabnika
7. Poženeš `render.js pdf` → PDF (uporablja `templates/ponudba-v2.html`)

**Ni API klicev. Ni npm run generate. Vse narediš sam.**

---

## Korak 1 — Pridobi transkript

- Če je podan kot argument, uporabi tega
- Če je pot do datoteke (npr. `/ponudba data/kickoff.txt`), jo preberi z Read orodjem
- Če ni nič, vprašaj uporabnika da prilepi besedilo

---

## Korak 2 — Preberi cenik

Z Read orodjem preberi `cenik.md` iz projektne mape.

---

## Korak 3 — Sestavi JSON

Na podlagi transkripta in cenika sestavi ta JSON. Zapolni VSA polja.

```json
{
  "STORITEV_BADGE": "kratka oznaka (npr. 'Google Ads & Meta Ads')",
  "NASLOV": "privlačen naslov ponudbe, specifičen za stranko",
  "PODNASLOV": "1 stavek kaj ponudba rešuje",
  "DATUM": "današnji datum v formatu D. M. YYYY",
  "STEVILKA_PONUDBE": "P + trenutni mesec + leto (npr. P052026)",
  "IME_STRANKE": "ime podjetja",
  "DODATNI_META": "1 stavek opis stranke ali kontekst",
  "UVODNI_ODSTAVEK": "3-4 stavki. Pokaži da razumeš strankine cilje in izzive iz transkripta. Specifično, brez splošnih fraz.",
  "OPOMBA_CENE": "Oglaševalski proračun pri Googlu in Meta se zaračuna neposredno pri ponudniku in ni vključen v zgornje cene.",
  "NASLOV_KORAK_1": "naslov koraka (npr. 'Vzpostavitev' ali 'Analiza & načrt')",
  "KORAK_1": "opis koraka 1, prilagodi glede na vrsto storitve",
  "NASLOV_KORAK_2": "naslov koraka (npr. 'Optimizacija' ali 'Razvoj & prenos')",
  "KORAK_2": "opis koraka 2",
  "NASLOV_KORAK_3": "naslov koraka (npr. 'Poročanje' ali 'Testiranje')",
  "KORAK_3": "opis koraka 3",
  "NASLOV_KORAK_4": "naslov koraka (npr. 'Proaktivni razvoj' ali 'Objava & predaja')",
  "KORAK_4": "opis koraka 4",
  "NASLOV_STRANKE": "ulica in kraj stranke (opcijsko, ce poznas)",
  "KONTAKTNA_OSEBA": "ime in priimek kontaktne osebe (opcijsko)",
  "TELEFON_STRANKE": "telefon kontaktne osebe (opcijsko)",
  "PREDPOSTAVKE": "kaj predpostavljamo pri izvedbi (npr. 'Narocnik zagotovi dostop do gostovanja.') — opcijsko",
  "IZKLUCITVE": "kaj ni vkljuceno v ceno (npr. 'Oglaševalski proracun, domena, gostovanje.') — opcijsko",
  "PLACILNI_POGOJI": "kako poteka placilo (npr. '50 % pred zacetkom, 50 % po zakljucku.') — opcijsko",
  "VELJAVNOST_PONUDBE": "npr. '30 dni' — opcijsko, privzeto 30 dni",
  "IME_KOMERCIALISTA": "ime prodajnika",
  "NAZIV_KOMERCIALISTA": "naziv (npr. 'Komercialist')",
  "EMAIL_KOMERCIALISTA": "email prodajnika",
  "storitve": [
    {
      "naziv": "ime storitve iz cenika",
      "podnaslov": "sifra artikla | kratek opis (npr. 'GG2312 | vzpostavitev za 1 kategorijo')",
      "tocke": [
        "kaj je vkljuceno 1",
        "kaj je vkljuceno 2",
        "kaj je vkljuceno 3",
        "kaj je vkljuceno 4"
      ],
      "vzpostavitev": "cena iz cenika (npr. '429,00 EUR') ali prazno",
      "mesecno": "cena iz cenika (npr. '190,00 EUR/mes.') ali prazno",
      "opomba": "kratka opomba (npr. 'Enkratni strosek') ali prazno"
    }
  ]
}
```

**Pravila za storitve:**
- Izberi storitve ki ustrezajo temu kar je bilo dogovorjeno v transkriptu
- Cene vzemi iz `cenik.md` — ne izmisljuj cen
- Navedi sifro artikla v polju `podnaslov` z `|` (npr. "GG2312 | vzpostavitev za 1 kategorijo")
- Tocke naj bodo konkretne (kaj dejansko vkljucuje ta storitev)
- Navedi tocno 4 tocke na storitev

**Pravilo za besedilo — NIKOLI ne uporabljaj `—` (em dash) v nobenem polju JSON-a.**
Namesto `—` uporabi: vejico, piko, dvopicje ali preoblikuj stavek.
Primer: ❌ `"ista vsebina — moderna oblika"` → ✅ `"ista vsebina, moderna oblika"`

---

## Korak 4 — Shrani JSON

Z Write orodjem shrani JSON v `data/ponudba.json` v projektni mapi.

---

## Korak 5 — Generiraj Word

```bash
node --env-file=.env render.js word
```

Iz outputa preberi pot do .docx datoteke in jo odpri:
```bash
start "" "<pot do .docx>"
```

Sporoči:
```
✓ Ponudba generirana: [IME_STRANKE] — [STORITEV_BADGE]
✓ Word odprt: [pot]
⏳ Preglej in potrdi — nato generiram PDF.
```

---

## Korak 6 — Cakaj na potrditev

Ne generiraj PDF dokler uporabnik ne rece "ok", "potrjeno" ali podobno.

---

## Korak 7 — Generiraj PDF

```bash
node --env-file=.env render.js pdf
```

Odpri PDF:
```bash
start "" "<pot do .pdf>"
```

Sporoči:
```
✓ PDF: [pot]
```

---

## Arhitektura (za debugiranje)

### render.js
- Bere `data/ponudba.json`
- Za `word`: zapolni `templates/ponudba-word.html`, pise v `OSNUTKI_MAPA` (env) ali `output/osnutki/`
- Za `pdf`: zapolni `templates/ponudba-v2.html`, pise v `IZHOD_MAPA` ali `output/`

### Placeholderji ki jih render.js generira sam (ne v JSON):
- `{{KARTICE_STORITEV}}` — HTML kartice za PDF (CSS grid, 2 stolpca)
- `{{KARTICE_STORITEV_WORD}}` — HTML kartice za Word (table layout, brez width% na td)
- `{{VRSTICE_CEN}}` — `<tr>` vrstice za cenovno tabelo
- `{{SKUPAJ_VZPOSTAVITEV}}` — sestevek vzpostavitev
- `{{SKUPAJ_MESECNO}}` — sestevek mesecnih cen
- `{{STRANKA_DETAILS}}` — PDF: dodatne vrstice v meta-tabeli (naslov, kontakt, tel)
- `{{STRANKA_DETAILS_WORD}}` — Word: `<tr>` vrstice za isto
- `{{POGOJI_HTML}}` — PDF: blok predpostavke + izklucitve + placilni pogoji
- `{{POGOJI_HTML_WORD}}` — Word: tabela z istimi podatki

### .env (vsak uporabnik nastavi svoje poti)
```
OSNUTKI_MAPA=C:\pot\do\osnutki
IZHOD_MAPA=C:\pot\do\izhod
```

---

## Napake

- **EBUSY**: Word datoteka je odprta. Sporoči "Zapri Word datoteko in potrdi." Pocakaj, potem ponovi korak 5.
- **InvalidCharacterError @w**: `html-to-docx` ne podpira `width:%` na `<td>`. Preveri da KARTICE_STORITEV_WORD nima `width:50%` v td inline stylih.
- **ponudba.json ne najde**: Preveri ali je bil Write korak uspesen.
