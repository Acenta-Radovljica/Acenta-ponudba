import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import mammoth from 'mammoth';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, basename, extname, sep } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(resolve(__dirname, 'public')));

const anthropic = new Anthropic();
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
  }
}

DODATNA OPCIJA (neobvezen blok):
Polje "dodatna_opcija" izpolni SAMO, če zapiski eksplicitno omenjajo neobvezno dodatno opcijo (npr. odsek "DODATNO:" ali "DODATNA OPCIJA:", ali besede "neobvezno", "po želji", "dodatno se lahko"). Sicer pusti vsa polja prazna. Dodatne opcije NE izmišljuj.

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

// ── JSON sheme za structured output ────────────────────────────────
// Prisilita veljaven JSON (API: tool use; SDK: outputFormat json_schema) in s tem
// zapreta znano krhkost "Expected double-quoted property name" pri JSON.parse.
const SCHEMA_SCOPING = {
  type: 'object',
  properties: {
    tip_ponudbe: { type: 'string', enum: ['ai', 'mesano'] },
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
    interna_opozorila: { type: 'array', items: { type: 'string' } }
  },
  required: ['NASLOV', 'IME_STRANKE', 'storitve']
};

// ── Claudov klic (skupno za vse vire vhoda) ────────────────────────
async function razcleniVsebino(content, sistemskiPrompt = SISTEM_PROMPT, maxTokens = 4096, schema = null) {
  // S shemo: prisiljen tool use → API vrne validiran objekt, JSON.parse odpade.
  if (schema) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: sistemskiPrompt,
      messages: [{ role: 'user', content }],
      tools: [{
        name: 'oddaj_rezultat',
        description: 'Oddaj razčlenjene podatke v zahtevani strukturirani obliki.',
        input_schema: schema
      }],
      tool_choice: { type: 'tool', name: 'oddaj_rezultat' }
    });
    const blok = response.content.find(b => b.type === 'tool_use');
    if (!blok) throw new Error('Model ni vrnil strukturiranega izhoda.');
    return blok.input;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: sistemskiPrompt,
    messages: [{ role: 'user', content }]
  });

  const text = response.content[0].text.trim()
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
        allowedTools: [],              // brez orodij — gre le za pretvorbo besedilo→JSON
        maxTurns: 1,                   // en sam obrat
        settingSources: [],            // ne nalagaj .claude/settings datotek
        env: SDK_ENV,                  // brez API ključa → naročnina
        thinking: { type: 'disabled' }, // CLI privzeto vklopi razmišljanje (+50 s) → izklop = ~3x hitreje, brez proxy timeouta
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
    const { pdf, besedilo, docx, ohraniVerbatim } = req.body;
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
    const dvostopenjsko = Boolean(promptText) && !ohraniVerbatim && AI_VZOREC.test(vir);
    const opozorilaAI = [];
    let surovi;

    if (dvostopenjsko) {
      const vhod1 = `Transkript kickoff sestanka:\n\n${vir}`;
      const scoping = await pozeniRazclembo({
        promptText: vhod1,
        content: [{ type: 'text', text: vhod1 }],
        sistemskiPrompt: SCOPING_PROMPT,
        schema: SCHEMA_SCOPING,
        timeoutMs: 80000 // 2 klica morata skupaj ostati pod proxy limitom (~180 s)
      });

      const vhod2 = `SCOPING JSON (strukturiran povzetek kickoff sestanka):\n\n${JSON.stringify(scoping, null, 2)}`;
      surovi = await pozeniRazclembo({
        promptText: vhod2,
        content: [{ type: 'text', text: vhod2 }],
        sistemskiPrompt: RAZGRADNJA_PROMPT,
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
      surovi = await pozeniRazclembo({ promptText, content, sistemskiPrompt, maxTokens, schema: SCHEMA_PONUDBA });
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
function runRender(ukaz) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['render.js', ukaz], {
      cwd: __dirname,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => out += d);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(out));
      const match = out.match(/✓ (?:Word|PDF): (.+)/);
      if (match) return resolve(match[1].trim());
      reject(new Error('Ni poti v outputu: ' + out));
    });
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ Ponudba app: http://localhost:${PORT}`));
