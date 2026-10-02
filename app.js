import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import mammoth from 'mammoth';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, dirname, basename, extname, sep } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { randomBytes, timingSafeEqual } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── PRIJAVA ────────────────────────────────────────────────────────
// PONUDBE_UPORABNIKI="ime:geslo,ime2:geslo2" vklopi HTTP Basic prijavo za cel app
// (stran in API). Brez spremenljivke prijave ni (lokalni razvoj).
const UPORABNIKI = (process.env.PONUDBE_UPORABNIKI || '')
  .split(',').map(s => s.trim()).filter(Boolean)
  .map(s => { const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1)]; })
  .filter(([u, g]) => u && g);
const enako = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
if (UPORABNIKI.length) {
  app.use((req, res, next) => {
    const [vrsta, kodirano] = (req.headers.authorization || '').split(' ');
    if (vrsta === 'Basic' && kodirano) {
      const dekodirano = Buffer.from(kodirano, 'base64').toString('utf8');
      const i = dekodirano.indexOf(':');
      const ime = dekodirano.slice(0, i), geslo = dekodirano.slice(i + 1);
      if (i > 0 && UPORABNIKI.some(([u, g]) => enako(u, ime) && enako(g, geslo))) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Generator ponudb", charset="UTF-8"');
    res.status(401).send('Prijava je obvezna.');
  });
}

app.use(express.json({ limit: '20mb' }));
app.use(express.static(resolve(__dirname, 'public')));

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-5-5'; // isti model na API in naročninski (Agent SDK) poti
const cenik = readFileSync(resolve(__dirname, 'cenik.md'), 'utf8');

const SISTEM_PROMPT = `Si generator ponudb za digitalno marketinško agencijo Acenta.si.
Iz priloženega dokumenta ali besedila razčleni podatke in vrni SAMO veljaven JSON brez markdown ovojnice.
NIKOLI ne uporabljaj — (em dash). Namesto tega uporabi vejico, piko ali dvopičje.
Cene vzemi iz cenika. Če cena ni v ceniku, vzemi ceno iz dokumenta.

PRAVILA SLOVENSKEGA JEZIKA (kritično — pred oddajo JSON-a preveri vsa besedila):
- VEDNO uporabljaj šumnike č, š, ž. Posebej previdno preveri te pogoste napake:
  • "zaracuna" → "zaračuna"
  • "vkljucena/vkljucen" → "vključena/vključen"
  • "zakljucno/zakljucek" → "zaključno/zaključek"
  • "porocilo/porocila" → "poročilo/poročila"
  • "narocnik/narocilo" → "naročnik/naročilo"
  • "obracuna" → "obračuna"
  • "stevilo" → "število"
  • "casa" → "časa"
- Pravilna oblika: "inženiring" (NE "inžiniring"), "vlagate" (NE "vlagete"), "izvajate" (NE "izvajete"), "pripravljate" (NE "pripravljete").
- Pri glagolih v 2. osebi množine je končnica "-ate" ali "-ite", redko "-ete" (primer: "vlagate", "pripravljate", "izvajate").
- Vsa imena lastnih hotelov, podjetij in oseb pusti v originalni obliki iz vira.

Cenik:
${cenik}

Vrni JSON točno v tej obliki:
{
  "STORITEV_BADGE": "kratka oznaka, npr. Google Ads ali Delavnica AI",
  "NASLOV": "privlačen naslov ponudbe, specifičen za stranko",
  "PODNASLOV": "1 stavek kaj ponudba rešuje",
  "DATUM": "datum iz dokumenta v formatu D. M. YYYY ali prazno, če datum ni naveden",
  "STEVILKA_PONUDBE": "številka iz dokumenta ali prazno",
  "IME_STRANKE": "polno ime podjetja",
  "NASLOV_STRANKE": "ulica in kraj ali prazno",
  "KONTAKTNA_OSEBA": "ime kontakta ali prazno",
  "TELEFON_STRANKE": "telefon ali prazno",
  "DODATNI_META": "1 stavek opis stranke in kontekst",
  "UVODNI_ODSTAVEK": "3-4 stavki, specifično za to stranko, brez splošnih fraz",
  "OPOMBA_CENE": "Oglaševalski proračun pri Googlu in Meta se zaračuna neposredno pri ponudniku in ni vključen v zgornje cene.",
  "NASLOV_KORAK_1": "naslov 1. koraka",
  "KORAK_1": "opis 1. koraka",
  "NASLOV_KORAK_2": "naslov 2. koraka",
  "KORAK_2": "opis 2. koraka",
  "NASLOV_KORAK_3": "naslov 3. koraka",
  "KORAK_3": "opis 3. koraka",
  "NASLOV_KORAK_4": "naslov 4. koraka",
  "KORAK_4": "opis 4. koraka",
  "PREDPOSTAVKE": "predpostavke ali prazno",
  "IZKLUCITVE": "kaj ni vključeno ali prazno",
  "PLACILNI_POGOJI": "plačilni pogoji ali prazno",
  "VELJAVNOST_PONUDBE": "15 dni ali 30 dni",
  "IME_KOMERCIALISTA": "Mateja",
  "NAZIV_KOMERCIALISTA": "Komercialistka",
  "EMAIL_KOMERCIALISTA": "mateja@acenta.si",
  "TELEFON_KOMERCIALISTA": "telefon ali prazno",
  "storitve": [
    {
      "naziv": "uradni naziv storitve",
      "podnaslov": "šifra | kratek opis",
      "tocke": ["točka 1", "točka 2", "točka 3", "točka 4"],
      "vzpostavitev": "cena npr. 429,00 EUR ali /",
      "mesecno": "cena npr. 190,00 EUR/mes. ali /",
      "opomba": "kratka opomba ali prazno — PREPOVEDANO pisati karkoli o DDV, ceni brez DDV, 22 %, itd. DDV se izpise samodejno v SKUPAJ pasu.",
      "faze": []
    }
  ],
  "dodatna_opcija": {
    "naslov": "",
    "uvod": "",
    "tocke": [],
    "investicija": []
  },
  "casovnica": {
    "naslov": "",
    "vrstice": []
  }
}

DODATNA OPCIJA (neobvezen blok):
Polje "dodatna_opcija" izpolni SAMO, če zapiski eksplicitno omenjajo neobvezno dodatno opcijo (npr. odsek "DODATNO:" ali "DODATNA OPCIJA:", ali besede "neobvezno", "po želji", "dodatno se lahko"). Sicer pusti vsa polja prazna. Dodatne opcije NE izmišljuj.

ČASOVNICA (neobvezen blok):
Polje "casovnica" izpolni SAMO, če zapiski omenjajo roke, mesece, zaporedje izvedbe ali željo po planu dela. Vsaka vrstica: "obdobje" (npr. "Oktober 2026" ali "1. in 2. teden po potrditvi"), "naslov" (kaj se takrat zgodi), "opis" (en kratek stavek ali prazno). Datume in mesece piši samo, če so v zapiskih; sicer obdobja zapiši relativno od potrditve. Sicer pusti "vrstice" prazne.

═══════════════════════════════════════════════════════════════
KRITIČNO PRAVILO — POLJE "faze" (poglobljen prikaz cene)
═══════════════════════════════════════════════════════════════

KDAJ MORAŠ IZPOLNITI POLJE "faze" (z dejansko vsebino, ne praznim arrayem):
Če storitev vsebuje katero od besed/konceptov:
- "implementacija" (npr. AI implementacija, CRM implementacija)
- "delavnica" / "izobraževanje"
- "projekt" / "razvoj"
- "svetovanje" / "audit" / "analiza"
- "strategija" / "strateški"

→ MORAŠ razdeliti storitev na 2-3 faze in izpolniti polje "faze".
→ V tem primeru "vzpostavitev" = SKUPNA cena vseh faz brez DDV; "mesecno" = "/".
→ Cene faz se morajo SESTETI v vzpostavitev.
→ Vsaka faza ima 2-5 nalog z urami in ceno.

KDAJ POLJE "faze" PUSTI PRAZNO ([]):
- Google Ads, Meta Ads, LinkedIn Ads (stalno upravljanje)
- SEO, družbena omrežja, vsebinski marketing (mesečno)
- Spletna stran z mesečnim vzdrževanjem
- Email marketing, newsletter
→ V teh primerih navadno: "vzpostavitev" = enkratna cena, "mesecno" = mesečna cena.

STRUKTURA POSAMEZNE FAZE:
{
  "naslov": "1. faza — analiza in načrtovanje",
  "trajanje": "1–2 tedna",
  "naloge": [
    { "opis": "Intervjuji z zaposlenimi (4 oddelki)", "ure": "4 h", "vrednost": "400 €" },
    { "opis": "Popis procesov in ocenjevalna matrica", "ure": "3 h", "vrednost": "300 €" },
    { "opis": "Poročilo z prioritetami in akcijskim načrtom", "ure": "3 h", "vrednost": "300 €" }
  ],
  "skupaj_ure": "10 h",
  "skupaj_vrednost": "1.000 €"
}

PRIMER — AI IMPLEMENTACIJA ZA HOTEL (3 faze):
"storitve": [{
  "naziv": "Implementacija AI v poslovne procese",
  "podnaslov": "AI implementacija | Strukturiran 3-fazni projekt",
  "tocke": [
    "Analiza procesov v izbranih oddelkih",
    "Pilotna implementacija AI orodij",
    "Skupna knjižnica promptov",
    "Zaključno poročilo z merjenimi rezultati"
  ],
  "vzpostavitev": "4.000,00 EUR",
  "mesecno": "/",
  "opomba": "Projekt v 3 fazah, skupaj 40 ur",
  "faze": [
    {
      "naslov": "1. faza — analiza in načrtovanje",
      "trajanje": "1–2 tedna",
      "naloge": [
        { "opis": "Intervjuji z zaposlenimi (4 oddelki)", "ure": "4 h", "vrednost": "400 €" },
        { "opis": "Popis procesov in ocenjevalna matrica", "ure": "3 h", "vrednost": "300 €" },
        { "opis": "Poročilo z prioritetami", "ure": "3 h", "vrednost": "300 €" }
      ],
      "skupaj_ure": "10 h",
      "skupaj_vrednost": "1.000 €"
    },
    {
      "naslov": "2. faza — pilotna implementacija",
      "trajanje": "3–4 tedne",
      "naloge": [
        { "opis": "Marketing: odgovarjanje na ocene gostov", "ure": "4 h", "vrednost": "400 €" },
        { "opis": "Recepcija: FAQ in potrditveni e-maili", "ure": "4 h", "vrednost": "400 €" },
        { "opis": "Delavnica z ekipo", "ure": "5 h", "vrednost": "500 €" }
      ],
      "skupaj_ure": "22 h",
      "skupaj_vrednost": "2.200 €"
    },
    {
      "naslov": "3. faza — spremljanje in optimizacija",
      "trajanje": "4–6 tednov po zagonu",
      "naloge": [
        { "opis": "Dva follow-up sestanka", "ure": "3 h", "vrednost": "300 €" },
        { "opis": "Zaključno poročilo z merjenimi rezultati", "ure": "3 h", "vrednost": "300 €" }
      ],
      "skupaj_ure": "8 h",
      "skupaj_vrednost": "800 €"
    }
  ]
}]
═══════════════════════════════════════════════════════════════`;

// ── VERBATIM prompt — za ROČNO POPRAVLJEN Word ─────────────────────
// Ko direktor naloži popravljen Word, mora PDF odražati TOČNO njegov dokument
// (tudi če odstopa od pravil appa: npr. brez ur, brez faz). Zato tu NE uporabljamo
// cenika in NE silimo v fazno strukturo — prepišemo le to, kar dejansko piše.
// POZOR: oblika JSON (ključi) mora ostati usklajena s SISTEM_PROMPT zgoraj.
const VERBATIM_PROMPT = `Si pomočnik, ki že pripravljeno, ročno popravljeno ponudbo iz Worda pretvori nazaj v JSON za izris v Acenta predlogo.

ZLATO PRAVILO: Prepiši TOČNO to, kar piše v dokumentu. Ničesar ne dodajaj, ne dopolnjuj in ne "izboljšuj".
- NE uporabljaj cenika. Cene prepiši dobesedno iz dokumenta.
- Če nekega podatka v dokumentu NI, pusti polje prazno ("") oziroma prazen seznam ([]).
- Če v fazah/nalogah NI navedenih ur, pusti "ure" in "skupaj_ure" prazna (""). Ur NE izračunavaj in NE izmišljuj.
- Če dokument NIMA faznega razčlenjevanja po nalogah, pusti "faze": []. Faz NE ustvarjaj na silo.
- Ne dodajaj korakov, točk ali storitev, ki jih v dokumentu ni. Ohrani vrstni red in besedila kot so.
- NIKOLI ne uporabljaj — (em dash). Namesto tega uporabi vejico, piko ali dvopičje.

PRAVILA SLOVENSKEGA JEZIKA: VEDNO uporabljaj šumnike č, š, ž (npr. "zaračuna", "vključena", "poročilo", "naročnik", "število", "časa"). Imena hotelov, podjetij in oseb pusti v originalni obliki iz dokumenta.

Vrni SAMO veljaven JSON brez markdown ovojnice, točno v tej obliki. Polja, ki jih v dokumentu ni, pusti prazna:
{
  "STORITEV_BADGE": "kratka oznaka, npr. Google Ads ali Delavnica AI",
  "NASLOV": "naslov ponudbe iz dokumenta",
  "PODNASLOV": "podnaslov iz dokumenta ali prazno",
  "DATUM": "datum iz dokumenta v formatu D. M. YYYY ali prazno",
  "STEVILKA_PONUDBE": "številka iz dokumenta ali prazno",
  "IME_STRANKE": "polno ime podjetja",
  "NASLOV_STRANKE": "ulica in kraj ali prazno",
  "KONTAKTNA_OSEBA": "ime kontakta ali prazno",
  "TELEFON_STRANKE": "telefon ali prazno",
  "DODATNI_META": "opis stranke iz dokumenta ali prazno",
  "UVODNI_ODSTAVEK": "uvodni odstavek iz dokumenta",
  "OPOMBA_CENE": "opomba o cenah iz dokumenta ali prazno",
  "NASLOV_KORAK_1": "naslov 1. koraka ali prazno",
  "KORAK_1": "opis 1. koraka ali prazno",
  "NASLOV_KORAK_2": "naslov 2. koraka ali prazno",
  "KORAK_2": "opis 2. koraka ali prazno",
  "NASLOV_KORAK_3": "naslov 3. koraka ali prazno",
  "KORAK_3": "opis 3. koraka ali prazno",
  "NASLOV_KORAK_4": "naslov 4. koraka ali prazno",
  "KORAK_4": "opis 4. koraka ali prazno",
  "PREDPOSTAVKE": "predpostavke iz dokumenta ali prazno",
  "IZKLUCITVE": "kaj ni vključeno iz dokumenta ali prazno",
  "PLACILNI_POGOJI": "plačilni pogoji iz dokumenta ali prazno",
  "VELJAVNOST_PONUDBE": "veljavnost iz dokumenta ali prazno",
  "IME_KOMERCIALISTA": "ime iz dokumenta ali prazno",
  "NAZIV_KOMERCIALISTA": "naziv iz dokumenta ali prazno",
  "EMAIL_KOMERCIALISTA": "email iz dokumenta ali prazno",
  "TELEFON_KOMERCIALISTA": "telefon iz dokumenta ali prazno",
  "storitve": [
    {
      "naziv": "naziv storitve iz dokumenta",
      "podnaslov": "podnaslov storitve ali prazno",
      "tocke": ["samo točke, ki so v dokumentu"],
      "vzpostavitev": "cena točno iz dokumenta, ali / če je ni",
      "mesecno": "cena točno iz dokumenta, ali / če je ni",
      "opomba": "opomba iz dokumenta ali prazno (NE pisati o DDV)",
      "faze": []
    }
  ],
  "dodatna_opcija": {
    "naslov": "naslov dodatne opcije iz dokumenta",
    "uvod": "uvodni stavek dodatne opcije ali prazno",
    "tocke": ["samo točke, ki so v dokumentu"],
    "investicija": ["cene/vrstice dodatne opcije točno iz dokumenta"]
  }
}

DODATNA OPCIJA (neobvezen blok):
Če v dokumentu najdeš odsek, ki se začne z naslovom "DODATNO:" (lahko tudi "DODATNA OPCIJA:" ali "Dodatna opcija"), ga zapiši v polje "dodatna_opcija":
- "naslov" = besedilo za "DODATNO:" (npr. "Mesečni pregled in svetovanje").
- "uvod" = uvodni odstavek tega odseka, če obstaja.
- "tocke" = alineje/naštevanja v tem odseku.
- "investicija" = vrstice s cenami v tem odseku, dobesedno.
Če takega odseka v dokumentu NI, pusti "dodatna_opcija": { "naslov": "", "uvod": "", "tocke": [], "investicija": [] }. Tega bloka NE izmišljuj.

Če dokument VSEBUJE razčlenjene faze z nalogami, vsako fazo zapiši kot:
{ "naslov": "...", "trajanje": "... ali prazno", "naloge": [ { "opis": "...", "ure": "... ali prazno", "vrednost": "... ali prazno" } ], "skupaj_ure": "... ali prazno", "skupaj_vrednost": "... ali prazno" }
Polje "ure" izpolni SAMO, če je ura dejansko zapisana ob tej nalogi v dokumentu.`;

// ── DVOSTOPENJSKA POT ZA AI/PROCESNE PONUDBE ───────────────────────
// Standardne storitve (Ads, SEO, spletne strani) imajo vso strukturo v ceniku,
// zato zadošča en klic (SISTEM_PROMPT). AI/procesne ponudbe so vsakič drugačne:
// korak 1 = SCOPING (razumevanje strankinih procesov iz transkripta),
// korak 2 = RAZGRADNJA (faze/naloge/ure iz dejanskih procesov, ne iz šablone).
// Manjkajoči podatki NIKOLI ne blokirajo: model predpostavi + označi,
// predpostavke in odprta vprašanja se vrnejo v UI kot opozorila.
const AI_VZOREC = /\b(ai|umetn\w*\s+intelig\w*|implementac\w*|avtomatiz\w*|agent\w*|chatbot\w*|asistent\w*|delavnic\w*)\b/i;

// Unikatna ponudba ima vedno časovnico (plan dela iz faz); skupno pravilo za oba razgradnja prompta.
const CASOVNICA_PRAVILO = `ČASOVNICA: izpolni polje "casovnica" s 3 do 6 vrsticami, ki sledijo fazam.
   "obdobje" zapiši relativno od potrditve ponudbe (npr. "1. in 2. teden", "3. teden",
   "po zaključku"), konkretne datume in mesece samo, če so v transkriptu. Trajanja se
   morajo ujemati s polji "trajanje" pri fazah. "naslov" = kaj se takrat zgodi (ime faze
   ali mejnik, npr. "Potrditev dizajna"), "opis" = en kratek stavek ali prazno. Zadnja
   vrstica je predaja, zagon ali objava. "naslov" časovnice pusti prazen.`;

const SCOPING_PROMPT = `Si izkušen svetovalec za AI implementacije v digitalni marketinški agenciji Acenta.si.
Pred pripravo ponudbe moraš iz transkripta kickoff sestanka IZLUŠČITI, kaj stranka
dejansko potrebuje: katere procese želi izboljšati, kako ti procesi potekajo danes,
s katerimi sistemi delajo in kakšen obseg dela gre skozi njih.

TVOJA NALOGA NI pisanje ponudbe. Tvoja naloga je RAZUMEVANJE. Ponudbo bo iz tvojega
izhoda sestavil naslednji korak, zato je vsaka tvoja napaka ali izmišljotina
napaka v ponudbi, ki jo dobi stranka.

METODA (izvedi po vrsti, preden izpišeš rezultat):
1. Preberi celoten transkript. Označi si vsako mesto, kjer stranka opisuje delo,
   ki ga danes opravlja ročno, jo moti, ji vzame čas ali ga želi izboljšati.
2. Vsako tako mesto pretvori v en zapis v polju "procesi". En proces = ena
   zaokrožena delovna naloga (npr. "odgovarjanje na povpraševanja po e-pošti"),
   NE oddelek in NE orodje.
3. Za vsak proces poišči v transkriptu: kako poteka danes, kdo ga dela, kateri
   sistemi so vpleteni, kakšen je obseg (št. na dan/teden/mesec), kaj naj bi AI
   prevzel. Kar je povedano, prepiši. Česar NI povedano, NE izmišljuj.
4. Ločeno zberi storitve, ki so standardne po ceniku (Google Ads, spletna stran,
   SEO ...), če so bile omenjene poleg AI dela.
5. Šele nato izpolni predpostavke in odprta vprašanja (pravila spodaj).

ZLATA PRAVILA:
- Vsak proces MORA imeti polje "dokaz" z dobesednim citatom (ali tesno parafrazo)
  iz transkripta, ki dokazuje, da je bil ta proces res omenjen. Proces brez dokaza
  ne obstaja. Procesov NE dodajaj zato, ker bi bili "smiselni" za to panogo.
- Če podatka ni (npr. volumen, sistem, kdo bo vzdrževal), zapiši "ni podatka" in
  dodaj vnos v "predpostavke" (tvoja razumna delovna predpostavka + zakaj) TER
  po potrebi v "odprta_vprasanja" (kaj bi vprašal stranko). Nikoli ne zapiši
  predpostavke, kot da je dejstvo iz transkripta.
- "odprta_vprasanja": največ 6, razvrščena po pomembnosti za natančnost ponudbe.
- "datum_sestanka" izpolni SAMO, če je datum zapisan v transkriptu.
- Imena podjetij, oseb, hotelov in orodij pusti v obliki iz transkripta.
- VEDNO uporabljaj šumnike č, š, ž (zaračuna, vključena, poročilo, naročnik,
  število, časa). NIKOLI ne uporabljaj — (em dash); uporabi vejico, piko ali dvopičje.

SAMOKONTROLA pred oddajo:
1. Ali ima vsak proces neprazen "dokaz" iz transkripta?
2. Ali je vsak podatek, ki ga v transkriptu ni, označen kot "ni podatka" ali predpostavka?
3. Ali so vsi šumniki na mestu in ni nobenega — znaka?
Če katera točka ne drži, popravi in šele nato oddaj rezultat.`;

const RAZGRADNJA_PROMPT = `Si generator ponudb za digitalno marketinško agencijo Acenta.si, specializiran za
AI implementacije in avtomatizacijo procesov. Prejel boš SCOPING JSON: strukturiran
povzetek kickoff sestanka s procesi stranke, sistemi, volumni in predpostavkami.
Iz njega sestavi ponudbo.

KLJUČNO NAČELO: stranka mora v ponudbi PREPOZNATI SVOJE procese. Faze in naloge
gradiš IZ PROCESOV v scoping JSON-u, ne iz šablone. Dve različni stranki ne smeta
nikoli dobiti enakih faz z zamenjanim imenom.

METODA (izvedi po vrsti):
1. Preglej "procesi" v scoping JSON-u. Za vsak proces določi naloge, ki so potrebne
   za njegovo avtomatizacijo/izboljšavo. Kjer obstaja normativ v ceniku (odsek
   "AI normativi", če obstaja), uporabi njegov razpon ur; obseg znotraj razpona
   določi po volumnu in kompleksnosti procesa. Kjer normativa ni, oceni ure sam
   po izkušnji in to zabeleži v "interna_opozorila" (npr. "Ure za integracijo X
   ocenjene brez normativa, preveri pred pošiljanjem").
2. Naloge združi v 2 do 5 faz. Število in vsebina faz sledita naravi projekta:
   majhna avtomatizacija enega procesa ima lahko 2 fazi, celovita implementacija
   čez več oddelkov 4 ali 5. Nikoli ne uporabiš 3 faz samo zato, ker je to privzeto.
3. Poimenuj faze in naloge s STRANKINIMI procesi in sistemi.
   SLABO (generično, prepovedano): "1. faza: analiza in načrtovanje",
   naloga "Popis procesov".
   DOBRO: "1. faza: Popis procesa odgovarjanja na povpraševanja in rezervacije",
   naloga "Intervju z receptorko in popis poteka od e-maila do potrditve rezervacije".
4. Izračunaj cene: ure naloge krat urna postavka iz cenika (če urne postavke v
   ceniku ni, uporabi 100 EUR/h in to zabeleži v "interna_opozorila"). Nato preveri
   seštevke: naloge se seštejejo v "skupaj_ure" in "skupaj_vrednost" faze; vse faze
   se seštejejo v "vzpostavitev" storitve. Če se ne ujema, popravi ure ali vrednosti,
   NE prilagajaj končne cene na roko.
5. Tekoči stroški iz "vzdrzevanje" (API klici, naročnine): če so znani, jih zapiši
   v "mesecno" ali kot postavko; sicer omeni v "opomba" storitve, da se tekoči
   stroški API klicev obračunajo po porabi.
6. "standardne_storitve" iz scopinga obravnavaj klasično: cene in opisi iz cenika,
   "faze": [] (zanje faz ne gradiš).
7. "predpostavke" iz scopinga povzemi v polje "PREDPOSTAVKE" ponudbe (kratko,
   berljivo za stranko, brez internega žargona). "odprta_vprasanja" NE gredo v
   ponudbo; sistem jih komercialistu pokaže ločeno.
8. ${CASOVNICA_PRAVILO}

PRAVILA CEN IN VSEBINE:
- Cene standardnih storitev vzemi iz cenika. Cene AI dela vedno izpelji iz ur in
  urne postavke; pavšal AI2409 uporabi samo, če projekt ustreza njegovemu opisu
  (majhen, jasno omejen AI proces brez integracij).
- FORMAT ŠTEVILK (slovenski zapis, dosledno povsod): "vzpostavitev" npr.
  "2.359,00 EUR" ali "/"; "mesecno" npr. "60,00 EUR/mes." ali "/"; pri nalogah
  "ure" npr. "3 h", "vrednost" npr. "214,50 €"; "skupaj_ure" npr. "8 h",
  "skupaj_vrednost" npr. "572,00 €". Pika za tisočice, vejica za decimalke.
- V "opomba" je PREPOVEDANO pisati karkoli o DDV (DDV se izpiše samodejno v SKUPAJ pasu).
- Statistik, rezultatov in obljub (npr. "prihranek 40 %") NE izmišljuj; obljubiš
  lahko samo dobavljive stvari (poročilo, delavnica, delujoča avtomatizacija).
- "UVODNI_ODSTAVEK": 3-4 stavki, imenuj vsaj en konkreten proces stranke, brez
  splošnih fraz.
- "dodatna_opcija" izpolni SAMO, če scoping vsebuje proces ali storitev, ki je
  stranka ni potrdila kot obvezno ("po želji", "mogoče kasneje", "neobvezno").
  Sicer pusti prazno. Ne izmišljuj je.
- NIKOLI ne uporabljaj — (em dash). VEDNO šumniki č, š, ž (zaračuna, vključena,
  poročilo, naročnik, število, časa). "inženiring", ne "inžiniring". Imena podjetij,
  oseb in orodij pusti v obliki iz scoping JSON-a.
- Privzeti podpisnik: IME_KOMERCIALISTA "Mateja", NAZIV_KOMERCIALISTA "Komercialistka",
  EMAIL_KOMERCIALISTA "mateja@acenta.si".
- OPOMBA_CENE: "Oglaševalski proračun pri Googlu in Meta se zaračuna neposredno pri ponudniku in ni vključen v zgornje cene."

SAMOKONTROLA pred oddajo (vse tri točke morajo držati):
1. PREPOZNAVNOST: preberi imena faz in nalog. Ali bi jih lahko poslal drugi stranki
   brez sprememb? Če DA, so pregenerične; prepiši jih s strankinimi procesi.
2. MATEMATIKA: seštej ure in vrednosti vseh nalog vsake faze in vseh faz v
   "vzpostavitev". Vsota se mora ujemati na cent.
3. SLEDLJIVOST: vsaka faza pokriva vsaj en proces iz scoping JSON-a; noben proces
   ni izpuščen; nič ni dodano, česar v scopingu ni.
Če katera točka ne drži, popravi in šele nato oddaj rezultat.

Cenik:
${cenik}`;

// ── UNIKATNA PONUDBA ZA PROJEKTE, KI NISO AI (splet, prenova, kampanja, razvoj) ──
// Ista dvostopenjska metoda kot pri AI (razumevanje → ocena po sklopih), a besedilo
// promptov ne govori o AI procesih. AI projekti ostanejo na preverjenih promptih zgoraj.
const OCENA_SCOPING_PROMPT = `Si izkušen vodja projektov v digitalni marketinški agenciji Acenta.si.
Pred pripravo ocene moraš iz transkripta sestanka ali briefa IZLUŠČITI, kaj stranka
dejansko naroča: katere sklope dela projekt obsega, kakšno je stanje danes, kaj želi
stranka na koncu imeti, s katerimi sistemi in kakšnim obsegom (strani, jeziki, izdelki,
kampanje, uporabniki) dela.

TVOJA NALOGA NI pisanje ponudbe. Tvoja naloga je RAZUMEVANJE. Oceno bo iz tvojega
izhoda sestavil naslednji korak, zato je vsaka tvoja napaka ali izmišljotina
napaka v ponudbi, ki jo dobi stranka.

METODA:
1. Preberi celoten vir. Označi si vsako mesto, kjer stranka opiše, kaj želi narediti,
   kaj jo moti pri sedanjem stanju ali kakšno zahtevo ima.
2. Vsako tako zahtevo zapiši kot en zapis v polju "procesi". En zapis = en zaokrožen
   sklop dela (npr. "prenos obstoječih vsebin in slik", "rezervacijski gumbi PHOBS",
   "štirje jeziki"), NE oddelek podjetja in NE orodje samo po sebi.
   Polja: "trenutni_potek" = kakšno je stanje danes, "zeleno_stanje" = kaj stranka želi
   na koncu, "sistemi" = orodja in platforme, "volumen" = obseg (št. strani, jezikov,
   izdelkov ...), "vpleteni" = kdo pri stranki ali pri nas sodeluje.
3. Kar je povedano, prepiši. Česar NI povedano, NE izmišljuj.
4. Ločeno zberi storitve, ki so standardne po ceniku (Google Ads, SEO, vzdrževanje ...).
5. "tip_ponudbe" nastavi na "projekt".

ZLATA PRAVILA:
- Vsak zapis v "procesi" MORA imeti "dokaz": dobeseden citat ali tesno parafrazo iz vira.
  Brez dokaza zapis ne obstaja. Ne dodajaj sklopov, ker bi bili "smiselni" za panogo.
- Če podatka ni (obseg, rok, kdo pripravi vsebine), zapiši "ni podatka" in dodaj vnos v
  "predpostavke" (razumna delovna predpostavka + zakaj) ter po potrebi v "odprta_vprasanja".
- "odprta_vprasanja": največ 6, razvrščena po pomembnosti za natančnost ocene.
- "datum_sestanka" izpolni SAMO, če je datum zapisan v viru.
- Imena podjetij, oseb in orodij pusti v obliki iz vira.
- VEDNO šumniki č, š, ž. NIKOLI ne uporabljaj — (em dash).`;

const OCENA_RAZGRADNJA_PROMPT = `Si generator ponudb za digitalno marketinško agencijo Acenta.si za unikatne
projekte (spletne strani, prenove, razvoj, kampanje po meri), ki jih ocenimo po sklopih in urah.
Prejel boš SCOPING JSON: strukturiran povzetek sestanka s sklopi dela, sistemi, obsegom in
predpostavkami. Iz njega sestavi ponudbo.

KLJUČNO NAČELO: stranka mora v ponudbi PREPOZNATI SVOJ projekt. Faze in naloge gradiš IZ
SKLOPOV v scoping JSON-u ("procesi"), ne iz šablone.

METODA:
1. Za vsak sklop določi naloge in oceni ure po realni hitrosti dela. Kjer je v ceniku
   ustrezna postavka ali normativ, ga uporabi; kjer ga ni, oceni sam in to zabeleži v
   "interna_opozorila" (npr. "Ure za prenos 256 URL-jev ocenjene brez normativa").
2. Naloge združi v 2 do 5 faz po naravi projekta (npr. zgradba, izvedba dizajna, vsebine,
   testiranje in objava). Ne uporabi 3 faz samo zato, ker je to privzeto.
3. Faze in naloge poimenuj s strankinimi sklopi in sistemi, ne generično.
   SLABO: "2. faza: izvedba". DOBRO: "2. faza: Izvedba dizajna za oba hotela v štirih jezikih".
4. Cene: ure naloge krat urna postavka iz cenika (če je ni, 100 EUR/h in zabeleži v
   "interna_opozorila"). Naloge se seštejejo v "skupaj_ure" in "skupaj_vrednost" faze,
   vse faze v "vzpostavitev" storitve. Če se ne ujema, popravi ure, ne končne cene na roko.
5. "trajanje" faze zapiši v tednih (npr. "2 tedna"), skupno koledarsko trajanje omeni v
   "opomba" storitve (npr. "Koledarsko 4 do 6 tednov od potrjenega dizajna").
6. "standardne_storitve" iz scopinga obravnavaj klasično: cene in opisi iz cenika, "faze": [].
7. "predpostavke" iz scopinga povzemi v "PREDPOSTAVKE" (kratko, berljivo za stranko).
   "odprta_vprasanja" NE gredo v ponudbo.
8. ${CASOVNICA_PRAVILO}
9. Koraki "Kako poteka sodelovanje" (NASLOV_KORAK_n, KORAK_n) opišejo sodelovanje z
   vidika stranke (potrditev, dizajn, pregled, objava), ne ponavljajo faz.

PRAVILA CEN IN VSEBINE:
- FORMAT ŠTEVILK: "vzpostavitev" npr. "2.359,00 EUR" ali "/"; "mesecno" npr. "60,00 EUR/mes."
  ali "/"; naloge "ure" npr. "3 h", "vrednost" npr. "214,50 €"; "skupaj_ure" "8 h",
  "skupaj_vrednost" "572,00 €". Pika za tisočice, vejica za decimalke.
- V "opomba" je PREPOVEDANO pisati karkoli o DDV.
- Statistik, rezultatov in obljub NE izmišljuj; obljubiš lahko samo dobavljive stvari.
- "UVODNI_ODSTAVEK": 3-4 stavki, imenuj konkreten cilj ali sklop stranke, brez splošnih fraz.
- "dodatna_opcija" izpolni SAMO za sklop, ki ga stranka ni potrdila kot obveznega.
- NIKOLI ne uporabljaj — (em dash). VEDNO šumniki č, š, ž. Imena pusti v obliki iz scopinga.
- Privzeti podpisnik: IME_KOMERCIALISTA "Mateja", NAZIV_KOMERCIALISTA "Komercialistka",
  EMAIL_KOMERCIALISTA "mateja@acenta.si".

SAMOKONTROLA pred oddajo:
1. PREPOZNAVNOST: ali bi faze lahko poslal drugi stranki brez sprememb? Če DA, prepiši.
2. MATEMATIKA: vsote nalog, faz in "vzpostavitev" se ujemajo na cent.
3. SLEDLJIVOST: vsak sklop iz scopinga je pokrit, nič ni dodano, česar v scopingu ni.
4. ČASOVNICA: vrstice se ujemajo s fazami in njihovim trajanjem.

Cenik:
${cenik}`;

// ── JSON sheme za structured output ────────────────────────────────
// Prisilita veljaven JSON (API: tool use; SDK: outputFormat json_schema) in s tem
// zapreta znano krhkost "Expected double-quoted property name" pri JSON.parse.
const SCHEMA_SCOPING = {
  type: 'object',
  properties: {
    tip_ponudbe: { type: 'string', enum: ['ai', 'mesano', 'projekt'] },
    stranka: {
      type: 'object',
      properties: {
        ime: { type: 'string' }, dejavnost: { type: 'string' }, naslov: { type: 'string' },
        kontaktna_oseba: { type: 'string' }, telefon: { type: 'string' }, datum_sestanka: { type: 'string' }
      },
      required: ['ime']
    },
    cilji_stranke: { type: 'array', items: { type: 'string' } },
    procesi: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ime: { type: 'string' }, trenutni_potek: { type: 'string' }, boleca_tocka: { type: 'string' },
          zeleno_stanje: { type: 'string' }, sistemi: { type: 'array', items: { type: 'string' } },
          volumen: { type: 'string' }, vpleteni: { type: 'string' }, dokaz: { type: 'string' }
        },
        required: ['ime', 'trenutni_potek', 'zeleno_stanje', 'dokaz']
      }
    },
    tehnicne_zahteve: { type: 'array', items: { type: 'string' } },
    vzdrzevanje: { type: 'string' },
    standardne_storitve: { type: 'array', items: { type: 'string' } },
    predpostavke: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kaj: { type: 'string' }, predpostavka: { type: 'string' }, zakaj: { type: 'string' } },
        required: ['kaj', 'predpostavka']
      }
    },
    odprta_vprasanja: { type: 'array', items: { type: 'string' } }
  },
  required: ['tip_ponudbe', 'stranka', 'procesi']
};

const PONUDBA_NIZI = [
  'STORITEV_BADGE', 'NASLOV', 'PODNASLOV', 'DATUM', 'STEVILKA_PONUDBE',
  'IME_STRANKE', 'NASLOV_STRANKE', 'KONTAKTNA_OSEBA', 'TELEFON_STRANKE',
  'DODATNI_META', 'UVODNI_ODSTAVEK', 'OPOMBA_CENE',
  'NASLOV_KORAK_1', 'KORAK_1', 'NASLOV_KORAK_2', 'KORAK_2',
  'NASLOV_KORAK_3', 'KORAK_3', 'NASLOV_KORAK_4', 'KORAK_4',
  'PREDPOSTAVKE', 'IZKLUCITVE', 'PLACILNI_POGOJI', 'VELJAVNOST_PONUDBE',
  'IME_KOMERCIALISTA', 'NAZIV_KOMERCIALISTA', 'EMAIL_KOMERCIALISTA', 'TELEFON_KOMERCIALISTA'
];

const SCHEMA_PONUDBA = {
  type: 'object',
  properties: {
    ...Object.fromEntries(PONUDBA_NIZI.map(k => [k, { type: 'string' }])),
    storitve: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          naziv: { type: 'string' }, podnaslov: { type: 'string' },
          tocke: { type: 'array', items: { type: 'string' } },
          vzpostavitev: { type: 'string' }, mesecno: { type: 'string' }, opomba: { type: 'string' },
          faze: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                naslov: { type: 'string' }, trajanje: { type: 'string' },
                naloge: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { opis: { type: 'string' }, ure: { type: 'string' }, vrednost: { type: 'string' } },
                    required: ['opis']
                  }
                },
                skupaj_ure: { type: 'string' }, skupaj_vrednost: { type: 'string' }
              },
              required: ['naslov', 'naloge']
            }
          }
        },
        required: ['naziv', 'tocke', 'vzpostavitev', 'mesecno']
      }
    },
    dodatna_opcija: {
      type: 'object',
      properties: {
        naslov: { type: 'string' }, uvod: { type: 'string' },
        tocke: { type: 'array', items: { type: 'string' } },
        investicija: { type: 'array', items: { type: 'string' } }
      }
    },
    casovnica: {
      type: 'object',
      properties: {
        naslov: { type: 'string' },
        vrstice: {
          type: 'array',
          items: {
            type: 'object',
            properties: { obdobje: { type: 'string' }, naslov: { type: 'string' }, opis: { type: 'string' } },
            required: ['obdobje', 'naslov']
          }
        }
      }
    },
    interna_opozorila: { type: 'array', items: { type: 'string' } }
  },
  required: ['NASLOV', 'IME_STRANKE', 'storitve']
};

// ── POPRAVKI PO KOMENTARJIH (korak Predogled) ──────────────────────
const NASTAVITVE_OBLIKE = ['paketna_cena', 'zakljucni_stavek', 'skrij_reference', 'brez_ddv'];

const POPRAVKI_PROMPT = `Si urednik prodajnih ponudb digitalne marketinške agencije Acenta.si.
Dobiš obstoječo ponudbo v JSON in komentarje osebe, ki ponudbo pripravlja. Pripravi TOČNO tiste spremembe, ki jih komentarji zahtevajo, in nič drugega.

PRAVILA:
1. Vsaka sprememba ima številko komentarja, na katerega se nanaša (polje "komentar").
2. Spreminjaj samo polja, ki jih komentar našteje pri "polja". Splošni komentar (brez polj) velja za celo ponudbo.
3. "pot" je pot v JSON s pikami, indeksi začnejo z 0. Primeri: UVODNI_ODSTAVEK, PODNASLOV, KORAK_3, storitve.0.naziv, storitve.1.tocke.2, storitve.0.vzpostavitev, storitve.0.faze.1.naloge.0.vrednost, storitve.0.obseg.skupine.1.uvod, dodatna_opcija.uvod.
4. "operacija":
   - "nastavi": polje dobi novo besedilo; v "vrednost" napiši CELOTNO novo besedilo polja, ne samo spremenjenega dela.
   - "dodaj": nov element na konec seznama besedil; "pot" kaže na seznam (npr. storitve.0.tocke), "vrednost" je novo besedilo.
   - "odstrani": odstrani element seznama; "pot" kaže na element (npr. storitve.0.tocke.3), "vrednost" pusti prazno.
5. Ne izmišljuj cen, datumov, številk ali dejstev, ki jih ni v ponudbi ali v komentarju. Cene piši v obliki "1.000,00 €", mesečne "190,00 €/mes.".
6. Če spremeniš ceno naloge v fazi, uskladi tudi "skupaj_vrednost" te faze in "vzpostavitev" storitve, da se seštevki ujemajo.
7. Če komentar navaja besedilo za prepis (npr. v narekovajih ali z "napiši po tem besedilu"), ga uporabi dobesedno.
8. Jezik: slovenščina s šumniki, brez pomišljajev (— in –), stranko vikaj, ohrani slog in ton ponudbe. Ne tikaj, če ponudba vika.
9. Komentarji o obliki gredo v "oblika", ne v "spremembe", kadar se ujemajo z eno od teh nastavitev:
   - paketna_cena: v cenovni tabeli samo skupna cena paketa, brez postavk (vklopi=true).
   - zakljucni_stavek: zaključni okvir z enim samim stavkom namesto kontaktov (telefon, e-pošta, splet); "besedilo" je ta stavek.
   - skrij_reference: brez seznama referenc na zadnji strani.
   - brez_ddv: cene samo brez DDV, brez zneska DDV in cene z DDV.
   Za izklop nastavitve vrni vklopi=false.
10. Komentar, ki ga ne moreš izvesti ne z besedilom ne z nastavitvijo (npr. barve, pisava, postavitev strani, logotip, vsebina razdelka O podjetju), vrni v "neizvedljivo" s kratkim razlogom.
11. "opis" je en kratek stavek, kaj je sprememba naredila (npr. "Uvod prepisan po priloženem besedilu.").
12. En komentar lahko zahteva več sprememb (npr. "kampanje" povsod zamenjaj z "mailingi"): naredi vse, vsako kot svojo spremembo.
13. Časovnica: naslov je "casovnica.naslov", vrstice so "casovnica.vrstice.N.obdobje", ".naslov" in ".opis". Novo vrstico dodaš z operacijo "dodaj": na pot "casovnica.vrstice" za konec ali na pot "casovnica.vrstice.N" za vstavitev pred obstoječo vrstico N (šteto od 0, po izvirnem vrstnem redu); "vrednost" zapišeš v obliki "obdobje | naslov | opis" (opis je lahko prazen). Obstoječih vrstic za vstavljanje ne prestavljaj. Če ponudba časovnice še nima, jo ustvariš tako, da dodaš vrstice. Obdobja zapiši relativno od potrditve (npr. "1. in 2. teden"), datume in mesece samo, če so v ponudbi ali komentarju.`;

const SCHEMA_POPRAVKI = {
  type: 'object',
  properties: {
    spremembe: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          komentar: { type: 'integer' },
          operacija: { type: 'string', enum: ['nastavi', 'dodaj', 'odstrani'] },
          pot: { type: 'string' },
          vrednost: { type: 'string' },
          opis: { type: 'string' }
        },
        required: ['komentar', 'operacija', 'pot', 'vrednost', 'opis']
      }
    },
    oblika: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          komentar: { type: 'integer' },
          nastavitev: { type: 'string', enum: NASTAVITVE_OBLIKE },
          vklopi: { type: 'boolean' },
          besedilo: { type: 'string' }
        },
        required: ['komentar', 'nastavitev', 'vklopi']
      }
    },
    neizvedljivo: {
      type: 'array',
      items: {
        type: 'object',
        properties: { komentar: { type: 'integer' }, razlog: { type: 'string' } },
        required: ['komentar', 'razlog']
      }
    }
  },
  required: ['spremembe', 'oblika', 'neizvedljivo']
};

// Polja ponudbe, ki jih sme spremeniti popravek (ostalo, npr. oblika ali tuji ključi, zavrnemo).
const POPRAVLJIVA_POLJA = new Set([
  'STORITEV_BADGE', 'NASLOV', 'PODNASLOV', 'DATUM', 'STEVILKA_PONUDBE', 'IME_STRANKE', 'NASLOV_STRANKE',
  'KONTAKTNA_OSEBA', 'TELEFON_STRANKE', 'DODATNI_META', 'UVODNI_ODSTAVEK', 'PREDPOSTAVKE', 'IZKLUCITVE',
  'PLACILNI_POGOJI', 'VELJAVNOST_PONUDBE', 'IME_KOMERCIALISTA', 'NAZIV_KOMERCIALISTA', 'EMAIL_KOMERCIALISTA',
  'TELEFON_KOMERCIALISTA', 'NASLOV_KORAK_1', 'KORAK_1', 'NASLOV_KORAK_2', 'KORAK_2', 'NASLOV_KORAK_3', 'KORAK_3',
  'NASLOV_KORAK_4', 'KORAK_4', 'storitve', 'dodatna_opcija', 'casovnica'
]);
// Seznami besedil, ki jih sme popravek ustvariti, če jih ponudba še nima.
const SEZNAMI_BESEDIL = new Set(['tocke', 'opis', 'investicija']);

const OZNAKE_POLJ = {
  STORITEV_BADGE: 'Oznaka storitve', NASLOV: 'Naslov', PODNASLOV: 'Podnaslov', DATUM: 'Datum',
  STEVILKA_PONUDBE: 'Številka ponudbe', IME_STRANKE: 'Stranka', NASLOV_STRANKE: 'Naslov stranke',
  KONTAKTNA_OSEBA: 'Kontaktna oseba', TELEFON_STRANKE: 'Telefon stranke', DODATNI_META: 'Povzetek v glavi',
  UVODNI_ODSTAVEK: 'Zakaj ta storitev', PREDPOSTAVKE: 'Predpostavke', IZKLUCITVE: 'V ceno ni zajeto',
  PLACILNI_POGOJI: 'Plačilni pogoji', VELJAVNOST_PONUDBE: 'Veljavnost', IME_KOMERCIALISTA: 'Podpis: ime',
  NAZIV_KOMERCIALISTA: 'Podpis: naziv', EMAIL_KOMERCIALISTA: 'Podpis: e-pošta', TELEFON_KOMERCIALISTA: 'Podpis: telefon',
  naziv: 'naziv', podnaslov: 'podnaslov', tocke: 'točka', opis: 'odstavek', vzpostavitev: 'cena vzpostavitve',
  mesecno: 'mesečna cena', opomba: 'opomba', naziv_tabela: 'naziv v tabeli', faze: 'faza', naloge: 'naloga',
  vrednost: 'vrednost', ure: 'ure', skupaj_vrednost: 'skupaj', skupaj_ure: 'skupaj ur', trajanje: 'trajanje',
  naslov: 'naslov', uvod: 'uvod', obseg: 'obseg', skupine: 'skupina', investicija: 'investicija'
};

const vzemiPot = (obj, deli) => deli.reduce((o, k) => (o == null ? undefined : o[k]), obj);

function oznakaPoti(deli, ponudba) {
  const [glava, ...ostalo] = deli;
  const korak = /^(NASLOV_)?KORAK_(\d)$/.exec(glava);
  if (korak) return `Korak ${korak[2]}${korak[1] ? ': naslov' : ''}`;
  if (glava === 'storitve') {
    const i = Number(ostalo[0]);
    const naziv = ponudba.storitve?.[i]?.naziv || `storitev ${i + 1}`;
    const rep = ostalo.slice(1).map(k => (/^\d+$/.test(k) ? String(Number(k) + 1) : (OZNAKE_POLJ[k] || k)));
    return [`Storitev »${naziv}«`, rep.join(' ')].filter(Boolean).join(' · ');
  }
  if (glava === 'casovnica') {
    const OZN = { naslov: 'naslov', vrstice: 'vrstica', obdobje: 'obdobje', opis: 'opis' };
    return ['Časovnica', ostalo.map(k => (/^\d+$/.test(k) ? String(Number(k) + 1) : (OZN[k] || k))).join(' ')].filter(Boolean).join(' · ');
  }
  if (glava === 'dodatna_opcija') {
    return ['Dodatna opcija', ostalo.map(k => (/^\d+$/.test(k) ? String(Number(k) + 1) : (OZNAKE_POLJ[k] || k))).join(' ')].filter(Boolean).join(' · ');
  }
  return OZNAKE_POLJ[glava] || glava;
}

// Preveri predlog modela proti dejanski ponudbi: neznane poti in tipi gredo ven,
// "prej" vzamemo iz ponudbe, označimo spremembe cen in posege izven komentiranega dela.
function preveriPopravke(odgovor, izvirnik, komentarji) {
  // Časovnica sme nastati iz komentarja, zato poti razrešujemo na kopiji s prazno časovnico.
  const cas = izvirnik.casovnica && typeof izvirnik.casovnica === 'object' ? izvirnik.casovnica : {};
  const ponudba = { ...izvirnik, casovnica: { naslov: '', ...cas, vrstice: Array.isArray(cas.vrstice) ? cas.vrstice : [] } };
  const poKomentarju = new Map(komentarji.map(k => [k.n, k]));
  const spremembe = [];
  const zavrnjene = [];
  const opisBesedila = (v) => (typeof v === 'string' ? v : (v && (v.naziv || v.naslov || v.opis)) || JSON.stringify(v));

  for (const s of odgovor.spremembe || []) {
    const pot = String(s.pot || '').trim();
    const deli = pot.split('.');
    const op = s.operacija;
    const zadnji = deli[deli.length - 1];
    const trenutno = vzemiPot(ponudba, deli);
    const stars = deli.length > 1 ? vzemiPot(ponudba, deli.slice(0, -1)) : ponudba;
    let prej = '';
    let potem = String(s.vrednost ?? '').trim();
    let objekt;

    // Nova vrstica časovnice pride kot "obdobje | naslov | opis"; pot "casovnica.vrstice" doda
    // na konec, "casovnica.vrstice.N" vstavi pred izvirno vrstico N.
    const vstavek = op === 'dodaj' && /^casovnica\.vrstice(\.\d+)?$/.exec(pot);
    if (vstavek) {
      const [obdobje = '', naslov = '', ...opis] = potem.split('|').map(x => x.trim());
      const vstavi = vstavek[1] ? Number(vstavek[1].slice(1)) : null;
      if ((!obdobje && !naslov) || (vstavi !== null && vstavi > ponudba.casovnica.vrstice.length)) { zavrnjene.push(pot); continue; }
      objekt = { obdobje, naslov, opis: opis.join(' | ') };
      potem = [obdobje, naslov, objekt.opis].filter(Boolean).join(' · ');
      spremembe.push({
        komentar: poKomentarju.get(Number(s.komentar))?.n ?? null, operacija: op, pot: 'casovnica.vrstice', objekt, vstavi,
        oznaka: vstavi === null ? 'Časovnica · nova vrstica na koncu' : `Časovnica · nova vrstica pred ${vstavi + 1}. vrstico`,
        prej: '', potem, opis: String(s.opis || ''), je_cena: false,
        izven: Boolean(poKomentarju.get(Number(s.komentar))?.polja.length && !poKomentarju.get(Number(s.komentar)).polja.some(p => p === 'casovnica'))
      });
      continue;
    }

    const veljavnaPot = /^[A-Za-z_][A-Za-z_0-9]*(\.[A-Za-z_0-9]+)*$/.test(pot) && POPRAVLJIVA_POLJA.has(deli[0]);
    if (!veljavnaPot || !['nastavi', 'dodaj', 'odstrani'].includes(op)) { zavrnjene.push(pot); continue; }

    if (op === 'nastavi') {
      const noviKljuc = trenutno === undefined && stars && typeof stars === 'object' && !Array.isArray(stars);
      if (!(typeof trenutno === 'string' || noviKljuc || (trenutno == null && deli.length === 1))) { zavrnjene.push(pot); continue; }
      prej = typeof trenutno === 'string' ? trenutno : '';
      if (prej === potem) continue;
    } else if (op === 'dodaj') {
      const obstojeci = Array.isArray(trenutno) && trenutno.every(x => typeof x === 'string');
      const novSeznam = trenutno === undefined && SEZNAMI_BESEDIL.has(zadnji) && stars && typeof stars === 'object' && !Array.isArray(stars);
      if (!(obstojeci || novSeznam) || !potem) { zavrnjene.push(pot); continue; }
    } else {
      const idx = Number(zadnji);
      if (!Array.isArray(stars) || !/^\d+$/.test(zadnji) || idx >= stars.length) { zavrnjene.push(pot); continue; }
      prej = opisBesedila(trenutno);
      potem = '';
    }

    const kom = poKomentarju.get(Number(s.komentar));
    spremembe.push({
      komentar: kom ? kom.n : null,
      operacija: op,
      pot,
      oznaka: oznakaPoti(deli, ponudba),
      prej,
      potem,
      opis: String(s.opis || ''),
      je_cena: /(^|\.)(vzpostavitev|mesecno|vrednost|skupaj_vrednost|investicija)(\.|$)/.test(pot),
      izven: Boolean(kom && kom.polja.length && !kom.polja.some(p => pot === p || pot.startsWith(p + '.')))
    });
  }

  const oblika = [];
  for (const o of odgovor.oblika || []) {
    if (!NASTAVITVE_OBLIKE.includes(o.nastavitev) || oblika.some(x => x.nastavitev === o.nastavitev)) continue;
    oblika.push({ komentar: Number(o.komentar) || null, nastavitev: o.nastavitev, vklopi: Boolean(o.vklopi), besedilo: String(o.besedilo || '').trim() });
  }
  const neizvedljivo = (odgovor.neizvedljivo || []).map(x => ({ komentar: Number(x.komentar) || null, razlog: String(x.razlog || '') }));
  if (zavrnjene.length) console.warn('Popravki: zavrnjene poti:', zavrnjene.join(', '));
  return { spremembe, oblika, neizvedljivo, zavrnjenih: zavrnjene.length };
}

// ── Claudov klic (skupno za vse vire vhoda) ────────────────────────
async function razcleniVsebino(content, sistemskiPrompt = SISTEM_PROMPT, maxTokens = 4096, schema = null) {
  // S shemo: tool use → API vrne objekt, JSON.parse odpade. Sonnet 5.5 zavrne vsiljen
  // tool_choice (400), zato 'auto' + navodilo v promptu + en ponovni poskus, če klica ni.
  if (schema) {
    for (let poskus = 1; poskus <= 2; poskus++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        thinking: { type: 'between_tools' }, // brez razmišljanja, kot prej na Sonnet 4.6
        system: sistemskiPrompt + '\n\nRezultat oddaj izključno s klicem orodja oddaj_rezultat.',
        messages: [{ role: 'user', content }],
        tools: [{
          name: 'oddaj_rezultat',
          description: 'Oddaj razčlenjene podatke v zahtevani strukturirani obliki.',
          input_schema: schema
        }],
        tool_choice: { type: 'auto' }
      });
      const blok = response.content.find(b => b.type === 'tool_use');
      if (blok) return blok.input;
    }
    throw new Error('Model ni vrnil strukturiranega izhoda.');
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'between_tools' },
    system: sistemskiPrompt,
    messages: [{ role: 'user', content }]
  });

  const text = response.content.find(b => b.type === 'text').text.trim()
    .replace(/^```json\n?/, '')
    .replace(/\n?```$/, '');

  return JSON.parse(text);
}

// ── Claudov klic prek Agent SDK (naročnina namesto API) ────────────
// Agent SDK zažene `claude` podproces. Ta uporabi OAuth NAROČNINO, če v
// okolju NI ANTHROPIC_API_KEY. `env` ZAMENJA okolje podprocesa (ne zlije),
// zato razširimo process.env (PATH/HOME) in izbrišemo le API ključ.
const SDK_ENV = { ...process.env };
delete SDK_ENV.ANTHROPIC_API_KEY;

// Stikalo: SDK (naročnina) se uporabi SAMO če je PONUDBE_SDK=1. Privzeto izklopljeno,
// da produkcija ostane na API-ju, dokler ni na strežniku nastavljen naročninski žeton.
const SDK_OMOGOCEN = process.env.PONUDBE_SDK === '1';

async function razcleniVsebinoSDK(besedilo, sistemskiPrompt = SISTEM_PROMPT, schema = null, timeoutMs = 120000) {
  // Varovalka: klic ne sme nikoli viseti v nedogled (sicer proxy vrne 502).
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  let finalText = '';
  let strukturiran;
  try {
    for await (const msg of query({
      prompt: besedilo,
      options: {
        systemPrompt: sistemskiPrompt, // navaden prompt (ne Claude Code preset)
        model: MODEL,
        allowedTools: [],              // brez orodij — gre le za pretvorbo besedilo→JSON
        maxTurns: 2,                   // Sonnet 5.5: klic StructuredOutput + zaključni obrat (pri 1 vrne error_max_turns)
        settingSources: [],            // ne nalagaj .claude/settings datotek
        env: SDK_ENV,                  // brez API ključa → naročnina
        // Sonnet 5.5 zavrne thinking 'disabled' (400), CLI pa ne pozna 'between_tools'
        // → prilagodljivo razmišljanje z nizkim naporom ostane hitro (brez proxy timeouta).
        thinking: { type: 'adaptive' },
        effort: 'low',
        abortController: ctrl,         // prekini po timeoutMs
        // Structured output: CLI validira izhod proti shemi → JSON.parse odpade.
        ...(schema ? { outputFormat: { type: 'json_schema', schema } } : {}),
      },
    })) {
      if (msg.type === 'result' && msg.subtype === 'success') {
        finalText = msg.result;
        if (msg.structured_output !== undefined) strukturiran = msg.structured_output;
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  if (strukturiran !== undefined) return strukturiran;

  const text = finalText.trim()
    .replace(/^```json\n?/, '')
    .replace(/\n?```$/, '');
  return JSON.parse(text);
}

// ── Skupna pot: SDK (naročnina) če je vklopljen, sicer/ob napaki API ─
async function pozeniRazclembo({ promptText, content, sistemskiPrompt, maxTokens = 8192, schema = null, timeoutMs = 120000 }) {
  if (promptText && SDK_OMOGOCEN) {
    try {
      return await razcleniVsebinoSDK(promptText, sistemskiPrompt, schema, timeoutMs);
    } catch (e) {
      console.warn('SDK (naročnina) ni uspel, fallback na API:', e.message);
    }
  }
  return razcleniVsebino(content, sistemskiPrompt, maxTokens, schema);
}

// ── RAZČLENI z Claude (PDF / besedilo / popravljen Word) ───────────
app.post('/razcleni', async (req, res) => {
  try {
    const { pdf, besedilo, docx, ohraniVerbatim, vrsta } = req.body;
    // Navodila komercialista iz 1. koraka: priložimo jih vsakemu klicu modela.
    const navodila = String(req.body.navodila || '').trim().slice(0, 4000);
    const blokNavodil = (korak) => !navodila ? '' : `\n\nDODATNA NAVODILA KOMERCIALISTA
Upoštevaj jih${korak === 'razumevanje' ? ' pri razumevanju briefa (npr. kaj vključiti ali izpustiti)' : ''}. Imajo prednost pred privzetimi vrednostmi (podpisnik, plačilni pogoji, veljavnost, obseg, ton). NE veljajo za varovala: ne izmišljuj cen, ki jih ni v ceniku ali v teh navodilih, ne izmišljuj statistik, rezultatov ali dejstev. Če navodilo nasprotuje varovalom, tistega dela ne upoštevaj${korak === 'razumevanje' ? '' : ' in to zapiši v "interna_opozorila"'}.
---
${navodila}
---`;
    const content = [];
    let vir = besedilo || '';
    let preveriDatum = Boolean(besedilo);
    let sistemskiPrompt = SISTEM_PROMPT;
    let maxTokens = 8192; // dovolj za dolge ponudbe (8+ modulov) — brez rezanja izhoda
    let promptText = null; // besedilni prompt za SDK (naročnino); ostane null pri PDF

    if (pdf) {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdf }
      });
    }

    if (docx) {
      const buffer = Buffer.from(docx, 'base64');

      if (ohraniVerbatim) {
        // Popravljen končni Word: pretvori v HTML (mammoth ohrani tabele,
        // razdelke in sezname) — tako Claude vidi PRAVO strukturo dokumenta in
        // jo lahko prepiše TOČNO, ne pa sploščenega besedila kjer se izgubi,
        // kaj je naloga, kaj ura, kaj razdelek.
        const { value: html } = await mammoth.convertToHtml({ buffer });
        vir = html;
        preveriDatum = false;
        sistemskiPrompt = VERBATIM_PROMPT;
        maxTokens = 8192; // daljše ponudbe z več fazami — brez rezanja izhoda
        promptText = `To je ŽE pripravljena ponudba, ki jo je človek ročno popravil v Wordu. Spodaj je HTML, ki ohranja TOČNO strukturo dokumenta (razdelki, tabele, naloge, ure). Prepiši VSE — vsako vrstico, vsak razdelek, vsako ceno — TOČNO kot je. Če v tabeli ni stolpca/vrednosti za ure, pusti polje "ure" prazno (ne izmišljuj). Če je človek dodal nove razdelke ali besedilo, jih VKLJUČI. Vrni JSON:\n\n${html}`;
        content.push({ type: 'text', text: promptText });
      } else {
        // Word kot vir/brief: zadošča surovo besedilo (cene po ceniku)
        const { value: tekst } = await mammoth.extractRawText({ buffer });
        vir = tekst;
        preveriDatum = true;
        promptText = `Razčleni naslednje besedilo in vrni JSON:\n\n${tekst}`;
        content.push({ type: 'text', text: promptText });
      }
    } else if (!pdf) {
      promptText = `Razčleni naslednje besedilo in vrni JSON:\n\n${besedilo}`;
      content.push({ type: 'text', text: promptText });
    } else {
      content.push({ type: 'text', text: 'Razčleni priloženi PDF in vrni JSON.' });
    }

    // PDF gre prek Anthropic API (document blok ni možen v SDK string promptu).
    // docx/besedilo gresta prek Agent SDK (naročnina) SAMO če je PONUDBE_SDK=1;
    // sicer (privzeto) prek API. Ob napaki SDK fallback na API.
    //
    // AI/procesne ponudbe (router AI_VZOREC) gredo dvostopenjsko:
    // scoping (razumevanje procesov) → razgradnja (faze iz dejanskih procesov).
    // Velja samo za besedilo/docx-brief; verbatim Word in PDF ostaneta enostopenjska.
    // Vrsta ponudbe iz 1. koraka: "tipska" = postavke iz cenika (en korak), "unikatna" =
    // ocena po fazah in urah (dva koraka). Brez izbire (stari klici) app ugiba kot prej.
    const dvostopenjsko = !ohraniVerbatim && (
      vrsta === 'unikatna' ? true
        : vrsta === 'tipska' ? false
          : Boolean(promptText) && AI_VZOREC.test(vir));
    // AI projekti ostanejo na preverjenih AI promptih, ostali unikatni projekti dobijo splošno oceno.
    const aiProjekt = AI_VZOREC.test(vir);
    const opozorilaAI = [];
    let surovi;

    if (dvostopenjsko) {
      const vhod1 = `Transkript kickoff sestanka:\n\n${vir || '(priložen PDF)'}` + blokNavodil('razumevanje');
      const scoping = await pozeniRazclembo({
        promptText: pdf ? null : vhod1,   // PDF gre samo prek API (document blok)
        content: [...(pdf ? [content[0]] : []), { type: 'text', text: vhod1 }],
        sistemskiPrompt: aiProjekt ? SCOPING_PROMPT : OCENA_SCOPING_PROMPT,
        schema: SCHEMA_SCOPING,
        timeoutMs: 80000 // 2 klica morata skupaj ostati pod proxy limitom (~180 s)
      });

      const vhod2 = `SCOPING JSON (strukturiran povzetek kickoff sestanka):\n\n${JSON.stringify(scoping, null, 2)}` + blokNavodil('ponudba');
      surovi = await pozeniRazclembo({
        promptText: vhod2,
        content: [{ type: 'text', text: vhod2 }],
        sistemskiPrompt: aiProjekt ? RAZGRADNJA_PROMPT : OCENA_RAZGRADNJA_PROMPT,
        schema: SCHEMA_PONUDBA,
        timeoutMs: 80000
      });

      for (const p of scoping.predpostavke || []) {
        opozorilaAI.push(`Predpostavka (${p.kaj}): ${p.predpostavka}${p.zakaj ? '. Razlog: ' + p.zakaj : ''}`);
      }
      for (const q of scoping.odprta_vprasanja || []) {
        opozorilaAI.push(`Vprašanje za stranko: ${q}`);
      }
    } else {
      // Navodila gredo na konec besedilnega dela (pri PDF za document blok).
      const n = blokNavodil('ponudba');
      surovi = await pozeniRazclembo({
        promptText: promptText ? promptText + n : null,
        content: content.map((b, i) => (i === content.length - 1 && b.type === 'text' ? { ...b, text: b.text + n } : b)),
        sistemskiPrompt, maxTokens, schema: SCHEMA_PONUDBA
      });
    }

    // Interna opozorila modela ne gredo v ponudba.json/PDF, ampak v UI.
    for (const o of surovi.interna_opozorila || []) opozorilaAI.push(String(o));
    delete surovi.interna_opozorila;

    const podatki = normalizirajPonudbo(surovi, { vir, preveriDatum });
    const kontrolaSestevkov = preveriSestevke(podatki.data);

    res.json({ ok: true, podatki: podatki.data, opozorila: [...kontrolaSestevkov, ...opozorilaAI, ...podatki.opozorila] });

  } catch (err) {
    console.error('Napaka /razcleni:', err.message);
    res.status(500).json({ ok: false, napaka: err.message });
  }
});

// ── GENERIRAJ WORD ─────────────────────────────────────────────────
app.post('/generiraj-word', async (req, res) => {
  try {
    mkdirSync(resolve(__dirname, 'data'), { recursive: true });
    const podatki = normalizirajPonudbo(req.body, { preveriDatum: false }).data;
    writeFileSync(
      resolve(__dirname, 'data/ponudba.json'),
      JSON.stringify(podatki, null, 2)
    );
    const pot = await runRender('word');
    res.json({ ok: true, datoteka: basename(pot) });
  } catch (err) {
    console.error('Napaka /generiraj-word:', err.message);
    res.status(500).json({ ok: false, napaka: err.message });
  }
});

// ── GENERIRAJ PDF ──────────────────────────────────────────────────
app.post('/generiraj-pdf', async (req, res) => {
  try {
    // Če so v telesu podatki (npr. iz popravljenega Worda), jih shrani
    // pred renderjem; prazno telo {} pomeni: uporabi obstoječ ponudba.json.
    if (req.body && Object.keys(req.body).length > 0) {
      mkdirSync(resolve(__dirname, 'data'), { recursive: true });
      const podatki = normalizirajPonudbo(req.body, { preveriDatum: false }).data;
      writeFileSync(
        resolve(__dirname, 'data/ponudba.json'),
        JSON.stringify(podatki, null, 2)
      );
    }
    const pot = await runRender('pdf');
    res.json({ ok: true, datoteka: basename(pot) });
  } catch (err) {
    console.error('Napaka /generiraj-pdf:', err.message);
    res.status(500).json({ ok: false, napaka: err.message });
  }
});

// ── PREDOGLED (HTML, enak kot PDF) ─────────────────────────────────
// Vsak klic dobi svoji začasni datoteki, da se sočasni predogledi ne prepisujejo
// (data/ponudba.json ostane samo za PDF/Word izvoz).
app.post('/predogled', async (req, res) => {
  const id = randomBytes(6).toString('hex');
  const jsonPot = resolve(tmpdir(), `ponudba-predogled-${id}.json`);
  const htmlPot = resolve(tmpdir(), `ponudba-predogled-${id}.html`);
  try {
    const podatki = normalizirajPonudbo(req.body || {}, { preveriDatum: false }).data;
    writeFileSync(jsonPot, JSON.stringify(podatki));
    await runRender('html', { PONUDBA_JSON: jsonPot, HTML_OUT: htmlPot });
    res.json({ ok: true, html: readFileSync(htmlPot, 'utf8'), opozorila: preveriSestevke(podatki) });
  } catch (err) {
    console.error('Napaka /predogled:', err.message);
    res.status(500).json({ ok: false, napaka: err.message });
  } finally {
    for (const p of [jsonPot, htmlPot]) { try { unlinkSync(p); } catch {} }
  }
});

// ── POPRAVI PO KOMENTARJIH ─────────────────────────────────────────
// AI predlaga spremembe po komentarjih iz predogleda. NIČ ne uveljavi: vrne seznam
// sprememb (prej → potem), ki jih komercialist potrdi v appu. Vrednost "prej" vzamemo
// iz ponudbe na strežniku, ne iz odgovora modela.
app.post('/popravi', async (req, res) => {
  try {
    const { podatki, komentarji } = req.body || {};
    if (!podatki || typeof podatki !== 'object') throw new Error('Manjka ponudba.');
    const seznam = (Array.isArray(komentarji) ? komentarji : [])
      .filter(k => k && String(k.besedilo || '').trim())
      .map(k => ({
        n: Number(k.n),
        del: String(k.del || 'Splošno'),
        polja: Array.isArray(k.polja) ? k.polja.map(String) : [],
        besedilo: String(k.besedilo).trim()
      }));
    if (!seznam.length) throw new Error('Ni komentarjev.');

    const { oblika = {}, ...vsebina } = podatki;
    const vhod = [
      'PONUDBA (JSON):',
      JSON.stringify(vsebina, null, 2),
      '',
      'TRENUTNE NASTAVITVE OBLIKE:',
      JSON.stringify(oblika),
      '',
      'KOMENTARJI:',
      // Del brez polj (Zaključek, O podjetju, Reference) ima samo nastavitve oblike ali fiksno vsebino.
      ...seznam.map(k => `${k.n}. [Del: ${k.del}${k.polja.length ? ' · polja: ' + k.polja.join(', ')
        : k.del === 'Splošno' ? ' · velja za celo ponudbo' : ' · ta del nima besedilnih polj, samo nastavitve oblike ali fiksno vsebino'}] ${k.besedilo}`)
    ].join('\n');

    const odgovor = await pozeniRazclembo({
      promptText: vhod,
      content: [{ type: 'text', text: vhod }],
      sistemskiPrompt: POPRAVKI_PROMPT,
      maxTokens: 8192,
      schema: SCHEMA_POPRAVKI,
      timeoutMs: 120000
    });

    res.json({ ok: true, ...preveriPopravke(odgovor, vsebina, seznam) });
  } catch (err) {
    console.error('Napaka /popravi:', err.message);
    res.status(500).json({ ok: false, napaka: err.message });
  }
});

// ── DOWNLOAD ───────────────────────────────────────────────────────
app.get('/prenesi/word/:datoteka', (req, res) => {
  const mapa = process.env.OSNUTKI_MAPA || resolve(__dirname, 'output/osnutki');
  prenesiIzMape(res, mapa, req.params.datoteka, '.docx');
});

app.get('/prenesi/pdf/:datoteka', (req, res) => {
  const mapa = process.env.IZHOD_MAPA || resolve(__dirname, 'output');
  prenesiIzMape(res, mapa, req.params.datoteka, '.pdf');
});

function prenesiIzMape(res, mapa, datoteka, dovoljenaKoncnica) {
  const varnaMapa = resolve(mapa);
  const ime = basename(datoteka);
  if (extname(ime).toLowerCase() !== dovoljenaKoncnica) {
    return res.status(400).json({ ok: false, napaka: 'Neveljavna datoteka.' });
  }

  const pot = resolve(varnaMapa, ime);
  if (!pot.startsWith(varnaMapa + sep)) {
    return res.status(400).json({ ok: false, napaka: 'Neveljavna datoteka.' });
  }

  if (!existsSync(pot)) {
    return res.status(404).json({ ok: false, napaka: 'Datoteka ne obstaja.' });
  }

  res.download(pot);
}

function normalizirajPonudbo(data, { vir = '', preveriDatum = false } = {}) {
  const opozorila = [];
  const normalizirajNiz = (vrednost) => String(vrednost)
    .replace(/\s+—\s+/g, ': ')
    .replace(/—/g, ',')
    .replace(/\bobnaša\s+nju\b/gi, 'obnašanju')
    .replace(/\bz ključnimi\b/gi, 's ključnimi');

  const rekurzivno = (vrednost) => {
    if (typeof vrednost === 'string') return normalizirajNiz(vrednost);
    if (Array.isArray(vrednost)) return vrednost.map(rekurzivno);
    if (vrednost && typeof vrednost === 'object') {
      return Object.fromEntries(
        Object.entries(vrednost).map(([k, v]) => [k, rekurzivno(v)])
      );
    }
    return vrednost;
  };

  const normalized = rekurzivno(data);

  if (preveriDatum && normalized.DATUM && !virVsebujeDatum(vir)) {
    normalized.DATUM = '';
    opozorila.push('Datum ni bil naveden v briefu, zato je polje DATUM ostalo prazno.');
  }

  return { data: normalized, opozorila };
}

// Deterministična kontrola seštevkov faz. Modelova samokontrola ni 100 %
// (test 20. 8.: vsota faz 2.359, vzpostavitev 2.360), zato preverimo v kodi
// in neskladja vrnemo kot opozorila. Nič ne popravljamo samodejno — končno
// besedo ima komercialist v formi.
function preveriSestevke(podatki) {
  const opoz = [];
  const stev = (s) => {
    if (typeof s !== 'string') return null;
    const m = s.replace(/[^\d,.]/g, '');
    if (!m) return null;
    // "2.359,00" (slo) → 2359.00; "2360.00" (angl.) pusti kot je
    const norm = /,\d{1,2}$/.test(m) ? m.replace(/\./g, '').replace(',', '.') : m.replace(/,/g, '');
    const n = parseFloat(norm);
    return Number.isFinite(n) ? n : null;
  };

  for (const s of podatki.storitve || []) {
    if (!Array.isArray(s.faze) || !s.faze.length) continue;
    let vsotaFaz = 0;
    for (const f of s.faze) {
      const vsotaNalog = (f.naloge || []).reduce((a, n) => a + (stev(n.vrednost) ?? 0), 0);
      const skupaj = stev(f.skupaj_vrednost);
      if (skupaj !== null && vsotaNalog > 0 && Math.abs(vsotaNalog - skupaj) > 0.01) {
        opoz.push(`Seštevek nalog v "${f.naslov}" je ${vsotaNalog.toFixed(2)}, zapisano skupaj pa ${skupaj.toFixed(2)}. Preveri cene.`);
      }
      vsotaFaz += skupaj ?? vsotaNalog;
    }
    const vzpost = stev(s.vzpostavitev);
    if (vzpost !== null && vsotaFaz > 0 && Math.abs(vsotaFaz - vzpost) > 0.01) {
      opoz.push(`Vsota faz pri "${s.naziv}" je ${vsotaFaz.toFixed(2)}, vzpostavitev pa ${vzpost.toFixed(2)}. Preveri cene.`);
    }
  }
  return opoz;
}

function virVsebujeDatum(vir) {
  return /\b\d{1,2}\.\s*\d{1,2}\.\s*\d{2,4}\b/.test(vir)
    || /\b\d{4}-\d{2}-\d{2}\b/.test(vir);
}

// ── RENDER HELPER ──────────────────────────────────────────────────
function runRender(ukaz, dodatniEnv = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['render.js', ukaz], {
      cwd: __dirname,
      env: { ...process.env, ...dodatniEnv },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => out += d);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(out));
      const match = out.match(/✓ (?:Word|PDF|HTML): (.+)/);
      if (match) return resolve(match[1].trim());
      reject(new Error('Ni poti v outputu: ' + out));
    });
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ Ponudba app: http://localhost:${PORT}`));
