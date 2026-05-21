import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
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
  "DATUM": "datum v formatu D. M. YYYY",
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
      "opomba": "kratka opomba ali prazno (NE pisi DDV info — DDV je ze v skupnem polju)",
      "faze": []
    }
  ]
}

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

// ── RAZČLENI z Claude ──────────────────────────────────────────────
app.post('/razcleni', async (req, res) => {
  try {
    const { pdf, besedilo } = req.body;
    const content = [];

    if (pdf) {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdf }
      });
    }

    content.push({
      type: 'text',
      text: besedilo
        ? `Razčleni naslednje besedilo in vrni JSON:\n\n${besedilo}`
        : 'Razčleni priloženi PDF in vrni JSON.'
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SISTEM_PROMPT,
      messages: [{ role: 'user', content }]
    });

    const text = response.content[0].text.trim()
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '');

    res.json({ ok: true, podatki: JSON.parse(text) });

  } catch (err) {
    console.error('Napaka /razcleni:', err.message);
    res.status(500).json({ ok: false, napaka: err.message });
  }
});

// ── GENERIRAJ WORD ─────────────────────────────────────────────────
app.post('/generiraj-word', async (req, res) => {
  try {
    mkdirSync(resolve(__dirname, 'data'), { recursive: true });
    writeFileSync(
      resolve(__dirname, 'data/ponudba.json'),
      JSON.stringify(req.body, null, 2)
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
  res.download(resolve(mapa, req.params.datoteka));
});

app.get('/prenesi/pdf/:datoteka', (req, res) => {
  const mapa = process.env.IZHOD_MAPA || resolve(__dirname, 'output');
  res.download(resolve(mapa, req.params.datoteka));
});

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
