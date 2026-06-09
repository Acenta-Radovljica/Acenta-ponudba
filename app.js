import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
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

// ── Claudov klic (skupno za vse vire vhoda) ────────────────────────
async function razcleniVsebino(content, sistemskiPrompt = SISTEM_PROMPT, maxTokens = 4096) {
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

// ── RAZČLENI z Claude (PDF / besedilo / popravljen Word) ───────────
app.post('/razcleni', async (req, res) => {
  try {
    const { pdf, besedilo, docx, ohraniVerbatim } = req.body;
    const content = [];
    let vir = besedilo || '';
    let preveriDatum = Boolean(besedilo);
    let sistemskiPrompt = SISTEM_PROMPT;
    let maxTokens = 4096;

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
        content.push({
          type: 'text',
          text: `To je ŽE pripravljena ponudba, ki jo je človek ročno popravil v Wordu. Spodaj je HTML, ki ohranja TOČNO strukturo dokumenta (razdelki, tabele, naloge, ure). Prepiši VSE — vsako vrstico, vsak razdelek, vsako ceno — TOČNO kot je. Če v tabeli ni stolpca/vrednosti za ure, pusti polje "ure" prazno (ne izmišljuj). Če je človek dodal nove razdelke ali besedilo, jih VKLJUČI. Vrni JSON:\n\n${html}`
        });
      } else {
        // Word kot vir/brief: zadošča surovo besedilo (cene po ceniku)
        const { value: tekst } = await mammoth.extractRawText({ buffer });
        vir = tekst;
        preveriDatum = true;
        content.push({
          type: 'text',
          text: `Razčleni naslednje besedilo in vrni JSON:\n\n${tekst}`
        });
      }
    } else {
      content.push({
        type: 'text',
        text: besedilo
          ? `Razčleni naslednje besedilo in vrni JSON:\n\n${besedilo}`
          : 'Razčleni priloženi PDF in vrni JSON.'
      });
    }

    const surovi = await razcleniVsebino(content, sistemskiPrompt, maxTokens);
    const podatki = normalizirajPonudbo(surovi, { vir, preveriDatum });

    res.json({ ok: true, podatki: podatki.data, opozorila: podatki.opozorila });

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
