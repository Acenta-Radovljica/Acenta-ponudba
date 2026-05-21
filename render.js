// render.js — Acenta ponudba renderer
// Uporaba: node --env-file=.env render.js word|pdf
//
// Bere:  data/ponudba.json  (pripravi ga Claude Code skill)
// Piše:  Word → OSNUTKI_MAPA  (env var ali ./output/osnutki)
//        PDF  → IZHOD_MAPA    (env var ali ./output)

import HTMLtoDOCX from 'html-to-docx';
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const ukaz = process.argv[2];
if (!ukaz || !['word', 'pdf'].includes(ukaz)) {
  console.error('Napaka: poda render.js word ali render.js pdf');
  process.exit(1);
}

// ── BERI JSON ────────────────────────────────────────────────────
const jsonPot = resolve(process.cwd(), 'data/ponudba.json');
const podatki = JSON.parse(readFileSync(jsonPot, 'utf8'));

// ── PRETVORI storitve[] → HTML bloke ─────────────────────────────
if (Array.isArray(podatki.storitve)) {

  // PDF kartice (CSS grid)
  podatki.KARTICE_STORITEV = podatki.storitve.map(s => `
    <div class="service-card">
      <div class="card-title">${s.naziv || ''}</div>
      <div class="card-subtitle">${s.podnaslov || ''}</div>
      <ul>${(s.tocke || []).map(t => `<li>${t}</li>`).join('')}</ul>
    </div>`).join('');

  // Word kartice (table layout za html-to-docx)
  podatki.KARTICE_STORITEV_WORD = podatki.storitve.map(s => {
    const tocke = s.tocke || [];
    const levo = tocke.filter((_, i) => i % 2 === 0);
    const desno = tocke.filter((_, i) => i % 2 === 1);
    const vrstice = Math.max(levo.length, desno.length);
    let rows = '';
    for (let i = 0; i < vrstice; i++) {
      rows += `<tr>
        <td style="padding:4px 8px 4px 0;font-size:9.5pt;color:#444;vertical-align:top;">
          ${levo[i] ? `<span style="color:#00AFAA;font-weight:bold;">&#9679;</span> ${levo[i]}` : '&nbsp;'}
        </td>
        <td style="padding:4px 0 4px 8px;font-size:9.5pt;color:#444;vertical-align:top;">
          ${desno[i] ? `<span style="color:#00AFAA;font-weight:bold;">&#9679;</span> ${desno[i]}` : '&nbsp;'}
        </td>
      </tr>`;
    }
    return `
    <div style="border:1px solid #dde3e6;border-left:4px solid #00AFAA;padding:14px 18px;margin-bottom:10px;">
      <p style="font-size:11.5pt;font-weight:bold;color:#0B0F10;margin:0 0 2px 0;">${s.naziv || ''}</p>
      <p style="font-size:9pt;color:#888;font-style:italic;margin:0 0 8px 0;">${s.podnaslov || ''}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
    </div>`;
  }).join('');

  // Pretvori — ali prazno vrednost v prazen niz za prikaz v tabeli
  const cenaAliPrazno = v => (!v || v === '—' || v === '–') ? '' : v;

  podatki.VRSTICE_CEN = podatki.storitve.map((s, i) => {
    const bg = i % 2 === 1 ? 'background-color:#f7f9fa;' : '';
    return `
    <tr style="${bg}">
      <td style="padding:10px 14px;color:#333;border:1px solid #e0e5e8;">${s.naziv || ''}</td>
      <td style="padding:10px 14px;color:#333;border:1px solid #e0e5e8;text-align:right;white-space:nowrap;">${cenaAliPrazno(s.vzpostavitev)}</td>
      <td style="padding:10px 14px;color:#333;border:1px solid #e0e5e8;text-align:right;white-space:nowrap;">${cenaAliPrazno(s.mesecno)}</td>
      <td style="padding:10px 14px;color:#999;font-size:8.5pt;font-style:italic;border:1px solid #e0e5e8;">${s.opomba || ''}</td>
    </tr>`;
  }).join('');

  const formatEur = n =>
    n.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  const sestej = (vrednosti) => {
    const vsote = vrednosti
      .map(v => parseFloat((v || '0').replace(/[^\d,]/g, '').replace(',', '.')))
      .filter(n => !isNaN(n) && n > 0);
    if (!vsote.length) return { display: '', znesek: 0 };
    const skupaj = vsote.reduce((a, b) => a + b, 0);
    return { display: formatEur(skupaj), znesek: skupaj };
  };

  const skupajVzp = sestej(podatki.storitve.map(s => s.vzpostavitev));
  const skupajMes = sestej(podatki.storitve.map(s => s.mesecno));

  podatki.SKUPAJ_VZPOSTAVITEV = skupajVzp.display;
  podatki.SKUPAJ_MESECNO = skupajMes.display ? skupajMes.display.replace(' €', ' €/mes.') : '';

  // DDV info pod SKUPAJ pasom (22 %)
  const skupajZnesek = skupajVzp.znesek + skupajMes.znesek;
  if (skupajZnesek > 0) {
    const ddv = skupajZnesek * 0.22;
    const zDdv = skupajZnesek + ddv;
    podatki.SKUPAJ_DDV_INFO = `DDV (22 %): ${formatEur(ddv)} · Z DDV: ${formatEur(zDdv)}`;
  } else {
    podatki.SKUPAJ_DDV_INFO = '';
  }
}

if (!podatki.DATUM) podatki.DATUM = new Date().toLocaleDateString('sl-SI');
if (!podatki.STEVILKA_PONUDBE) podatki.STEVILKA_PONUDBE = `P${Date.now().toString().slice(-6)}`;

// Fallback naslovi za korake (stari JSONi brez NASLOV_KORAK polj)
if (!podatki.NASLOV_KORAK_1) podatki.NASLOV_KORAK_1 = 'Vzpostavitev';
if (!podatki.NASLOV_KORAK_2) podatki.NASLOV_KORAK_2 = 'Optimizacija';
if (!podatki.NASLOV_KORAK_3) podatki.NASLOV_KORAK_3 = 'Poročanje';
if (!podatki.NASLOV_KORAK_4) podatki.NASLOV_KORAK_4 = 'Razvoj';

// ── PODATKI STRANKE ──────────────────────────────────────────────
const naslovStranke   = podatki.NASLOV_STRANKE   || '';
const kontaktnaOseba  = podatki.KONTAKTNA_OSEBA  || '';
const telefonStranke  = podatki.TELEFON_STRANKE  || '';

// PDF: inline za meta-table div (br-jevska sintaksa)
let sd = '';
if (naslovStranke)  sd += `<br><span class="meta-label">Naslov:</span> <strong>${naslovStranke}</strong>`;
if (kontaktnaOseba) sd += `<br><span class="meta-label">Kontakt:</span> <strong>${kontaktnaOseba}</strong>`;
if (telefonStranke) sd += `<br><span class="meta-label">Tel:</span> <strong>${telefonStranke}</strong>`;
podatki.STRANKA_DETAILS = sd;

// Word: <tr> vrstice za obstoječo meta tabelo
let sdw = '';
if (naslovStranke)  sdw += `<tr><td style="padding:2px 20px 2px 0;color:#888;">Naslov:</td><td style="padding:2px 0;color:#1a1a1a;font-weight:bold;">${naslovStranke}</td></tr>`;
if (kontaktnaOseba) sdw += `<tr><td style="padding:2px 20px 2px 0;color:#888;">Kontakt:</td><td style="padding:2px 0;color:#1a1a1a;font-weight:bold;">${kontaktnaOseba}</td></tr>`;
if (telefonStranke) sdw += `<tr><td style="padding:2px 20px 2px 0;color:#888;">Tel:</td><td style="padding:2px 0;color:#1a1a1a;font-weight:bold;">${telefonStranke}</td></tr>`;
podatki.STRANKA_DETAILS_WORD = sdw;

// ── TELEFON KOMERCIALISTA (opcijsko polje v podpisu) ─────────────
const telefonKom = podatki.TELEFON_KOMERCIALISTA || '';
podatki.TELEFON_KOMERCIALISTA_HTML = telefonKom
  ? `<div class="signature-email">${telefonKom}</div>`
  : '';
podatki.TELEFON_KOMERCIALISTA_HTML_WORD = telefonKom
  ? `<div style="font-size:9.5pt;color:#888;">${telefonKom}</div>`
  : '';

// ── POGOJI (predpostavke, izklucitve, placilni pogoji) ───────────
const predpostavke   = podatki.PREDPOSTAVKE    || '';
const izklucitve     = podatki.IZKLUCITVE      || '';
const placilniPogoji = podatki.PLACILNI_POGOJI || '';
const veljavnost     = podatki.VELJAVNOST_PONUDBE || '30 dni';

// PDF version (CSS klase iz predloge)
let pogPdf = '';
if (predpostavke || izklucitve || placilniPogoji) {
  pogPdf = '<div class="conditions-block">';
  if (predpostavke) pogPdf += `<div class="conditions-box"><div class="cond-title">Predpostavke</div><div class="cond-text">${predpostavke}</div></div>`;
  if (izklucitve)   pogPdf += `<div class="conditions-box conditions-excl"><div class="cond-title">V ceno ni zajeto</div><div class="cond-text">${izklucitve}</div></div>`;
  pogPdf += `<div class="conditions-box conditions-pay"><div class="cond-title">Plačilni pogoji</div><div class="cond-text">${placilniPogoji || 'Po dogovoru.'}<br><span style="font-size:8pt;color:#aaa;">Veljavnost: ${veljavnost}</span></div></div>`;
  pogPdf += '</div>';
}
podatki.POGOJI_HTML = pogPdf;

// Word version (tabela z inline stili)
let pogWord = '';
if (predpostavke || izklucitve || placilniPogoji) {
  pogWord = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;margin-bottom:8px;"><tr>';
  if (predpostavke) pogWord += `<td style="border:1px solid #dde3e6;border-top:3px solid #00AFAA;padding:12px 14px;vertical-align:top;"><p style="font-size:8.5pt;font-weight:bold;color:#0B0F10;margin:0 0 5px 0;text-transform:uppercase;">Predpostavke</p><p style="font-size:9pt;color:#555;line-height:1.6;margin:0;">${predpostavke}</p></td>`;
  if (izklucitve)   pogWord += `<td style="border:1px solid #dde3e6;border-top:3px solid #FF0A60;padding:12px 14px;vertical-align:top;"><p style="font-size:8.5pt;font-weight:bold;color:#0B0F10;margin:0 0 5px 0;text-transform:uppercase;">V ceno ni zajeto</p><p style="font-size:9pt;color:#555;line-height:1.6;margin:0;">${izklucitve}</p></td>`;
  pogWord += `<td style="border:1px solid #dde3e6;border-top:3px solid #0180AE;padding:12px 14px;vertical-align:top;"><p style="font-size:8.5pt;font-weight:bold;color:#0B0F10;margin:0 0 5px 0;text-transform:uppercase;">Plačilni pogoji</p><p style="font-size:9pt;color:#555;line-height:1.6;margin:0;">${placilniPogoji || 'Po dogovoru.'}</p><p style="font-size:8pt;color:#aaa;margin:4px 0 0 0;">Veljavnost: ${veljavnost}</p></td>`;
  pogWord += '</tr></table>';
}
podatki.POGOJI_HTML_WORD = pogWord;

// ── ZAPOLNI HTML PREDLOGO ────────────────────────────────────────
const predlogaIme = ukaz === 'word' ? 'templates/ponudba-word.html' : 'templates/ponudba-v2.html';
const predlogaPot = resolve(process.cwd(), predlogaIme);
let html = readFileSync(predlogaPot, 'utf8');
for (const [k, v] of Object.entries(podatki)) {
  if (typeof v === 'string') html = html.replaceAll(`{{${k}}}`, v);
}

const ime = (podatki.IME_STRANKE || 'ponudba').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

// ── WORD ─────────────────────────────────────────────────────────
if (ukaz === 'word') {
  const osnutkiMapa = process.env.OSNUTKI_MAPA || resolve(process.cwd(), 'output/osnutki');
  mkdirSync(osnutkiMapa, { recursive: true });
  const docxPot = resolve(osnutkiMapa, `ponudba-${ime}.docx`);

  const docxBuffer = await HTMLtoDOCX(html, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  writeFileSync(docxPot, docxBuffer);
  console.log(`✓ Word: ${docxPot}`);
}

// ── PDF ──────────────────────────────────────────────────────────
if (ukaz === 'pdf') {
  const izhodMapa = process.env.IZHOD_MAPA || resolve(process.cwd(), 'output');
  mkdirSync(izhodMapa, { recursive: true });
  const pdfPot = resolve(izhodMapa, `ponudba-${ime}.pdf`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const stran = await browser.newPage();
  await stran.setContent(html, { waitUntil: 'networkidle0' });
  await stran.pdf({
    path: pdfPot,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await browser.close();
  console.log(`✓ PDF: ${pdfPot}`);
}
