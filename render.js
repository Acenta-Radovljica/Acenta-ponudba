// render.js — Acenta ponudba renderer
// Uporaba: node --env-file=.env render.js word|pdf|html
//
// Bere:  PONUDBA_JSON (env) ali data/ponudba.json
// Piše:  Word → OSNUTKI_MAPA  (env var ali ./output/osnutki)
//        PDF  → IZHOD_MAPA    (env var ali ./output)
//        HTML → HTML_OUT      (env var ali ./output/predogled.html) — predogled v appu, enak kot PDF

import HTMLtoDOCX from 'html-to-docx';
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const ukaz = process.argv[2];
if (!ukaz || !['word', 'pdf', 'html'].includes(ukaz)) {
  console.error('Napaka: poda render.js word, pdf ali html');
  process.exit(1);
}

// ── BERI JSON ────────────────────────────────────────────────────
const jsonPot = process.env.PONUDBA_JSON || resolve(process.cwd(), 'data/ponudba.json');
const podatki = JSON.parse(readFileSync(jsonPot, 'utf8'));

// Nastavitve oblike (korak Dokument / Predogled). Vse privzeto izklopljene = predloga kot prej.
const oblika = podatki.oblika && typeof podatki.oblika === 'object' ? podatki.oblika : {};
const zakljucniStavek = typeof oblika.zakljucni_stavek === 'string' ? oblika.zakljucni_stavek.trim() : '';

// ── PRETVORI storitve[] → HTML bloke ─────────────────────────────
if (Array.isArray(podatki.storitve)) {

  // PDF kartice (CSS grid)
  podatki.KARTICE_STORITEV = podatki.storitve.map((s, i) => {
    // Neobvezni opisni odstavki (prosta vsebina iz popravljenega Worda)
    const opisArr = Array.isArray(s.opis) ? s.opis : (s.opis ? [s.opis] : []);
    const opisHtml = opisArr.map(p => `<p class="card-desc">${p}</p>`).join('');

    // Neobvezni strukturiran "obseg" blok (podnaslovi z naštevanji)
    let obsegHtml = '';
    if (s.obseg && Array.isArray(s.obseg.skupine)) {
      const skupine = s.obseg.skupine.map(g => `
        <div class="obseg-skupina">
          <div class="obseg-skupina-naslov">${g.naslov || ''}</div>
          ${g.uvod ? `<p class="obseg-uvod">${g.uvod}</p>` : ''}
          <ul class="obseg-list">${(g.tocke || []).map(t => `<li>${t}</li>`).join('')}</ul>
        </div>`).join('');
      obsegHtml = `
      <div class="card-obseg">
        <div class="obseg-naslov">${s.obseg.naslov || ''}</div>${skupine}
      </div>`;
    }

    // Velike kartice (z OBSEG blokom) smejo teči čez strani, da ne puščajo lukenj
    const karticaClass = obsegHtml ? 'service-card service-card--tall' : 'service-card';
    return `
    <div class="${karticaClass}" data-storitev="${i}">
      <div class="card-title">${s.naziv || ''}</div>
      <div class="card-subtitle">${s.podnaslov || ''}</div>
      ${opisHtml}
      <ul>${(s.tocke || []).map(t => `<li>${t}</li>`).join('')}</ul>${obsegHtml}
    </div>`;
  }).join('');

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

  // Odstrani DDV omembe iz opombe (DDV se prikaže v SKUPAJ pasu)
  const ociscOpombo = (txt) => {
    if (!txt) return '';
    return txt
      .replace(/[.\s]*Cena\s+je\s+brez\s+DDV[^.]*\.?/gi, '')
      .replace(/[.\s]*brez\s+DDV\s*\(?22\s*%?\)?[^.]*\.?/gi, '')
      .replace(/[.\s]*DDV\s*\(22\s*%\)[^.]*\.?/gi, '')
      .trim();
  };

  podatki.VRSTICE_CEN = podatki.storitve.map((s, i) => {
    const bg = i % 2 === 1 ? 'background-color:#f7f9fa;' : '';
    return `
    <tr style="${bg}">
      <td style="padding:10px 14px;color:#333;border:1px solid #e0e5e8;">${s.naziv || ''}</td>
      <td style="padding:10px 14px;color:#333;border:1px solid #e0e5e8;text-align:right;white-space:nowrap;">${cenaAliPrazno(s.vzpostavitev)}</td>
      <td style="padding:10px 14px;color:#333;border:1px solid #e0e5e8;text-align:right;">${cenaAliPrazno(s.mesecno)}</td>
      <td style="padding:10px 14px;color:#999;font-size:8.5pt;font-style:italic;border:1px solid #e0e5e8;">${ociscOpombo(s.opomba)}</td>
    </tr>`;
  }).join('');

  // Ročno združevanje tisočic: sl-SI v Intl štirimestnih zneskov ne združi ("1648,00 €"),
  // cenik in ponudbe pa pišejo "1.648,00 €".
  const formatEur = n =>
    n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';

  // Prava cena = SAMO številka v obliki "190,00 €" / "17,00 EUR/mes." (brez opisnih besed).
  // Opisne vrednosti ("od 19 dalje", "od 250 do 900 EUR") se v seštevek NE štejejo —
  // sicer bi regex zlepil "250" in "900" v 250900 in pokvaril vsoto.
  const jeCistaCena = (v) =>
    /^\s*\d{1,3}(\.\d{3})*,\d{2}\s*(€|EUR)(\s*\/\s*mes\.?)?\s*$/.test(v || '');

  const sestej = (vrednosti) => {
    let imeloOpisne = false;
    const vsote = [];
    for (const v of vrednosti) {
      if (!v || v === '—' || v === '–') continue;          // prazno → preskoči
      if (jeCistaCena(v)) {
        const n = parseFloat(v.replace(/[^\d,]/g, '').replace(',', '.'));
        if (!isNaN(n) && n > 0) vsote.push(n);
      } else if (/\d/.test(v)) {
        imeloOpisne = true;                                 // opisna/variabilna cena → preskoči, a zabeleži
      }
    }
    if (!vsote.length) return { display: '', znesek: 0, imeloOpisne };
    const skupaj = vsote.reduce((a, b) => a + b, 0);
    return { display: formatEur(skupaj), znesek: skupaj, imeloOpisne };
  };

  const skupajVzp = sestej(podatki.storitve.map(s => s.vzpostavitev));
  const skupajMes = sestej(podatki.storitve.map(s => s.mesecno));

  podatki.SKUPAJ_VZPOSTAVITEV = skupajVzp.display;

  // Če so bile med mesečnimi tudi opisne cene (preskočene), je vsota le spodnja meja → "od ..."
  let mesDisplay = skupajMes.display ? skupajMes.display.replace(' €', ' €/mes.') : '';
  if (mesDisplay && skupajMes.imeloOpisne) mesDisplay = 'od ' + mesDisplay;
  podatki.SKUPAJ_MESECNO = mesDisplay;

  // DDV info pod SKUPAJ pasom (22 %) — DDV se računa samo od fiksnih (seštetih) zneskov
  const skupajZnesek = skupajVzp.znesek + skupajMes.znesek;
  let ddvInfo = '';
  if (skupajZnesek > 0) {
    const ddv = skupajZnesek * 0.22;
    const zDdv = skupajZnesek + ddv;
    ddvInfo = `DDV (22 %): ${formatEur(ddv)} · Z DDV: ${formatEur(zDdv)}`;
  }
  // Opozorilo, da niso vsi mesečni stroški všteti (variabilni/opcijski)
  if (skupajMes.imeloOpisne) {
    ddvInfo += (ddvInfo ? ' · ' : '') + '+ variabilni in opcijski stroški (glej opombe)';
  }
  // Nastavitev "Cene samo brez DDV": znesek DDV in cena z DDV izpadeta, pod tabelo ostane opomba.
  const ddvOpomba = 'Cene so brez DDV (22 %).';
  if (oblika.brez_ddv) {
    ddvInfo = skupajMes.imeloOpisne ? '+ variabilni in opcijski stroški (glej opombe)' : '';
  }
  podatki.SKUPAJ_DDV_INFO = ddvInfo;

  // ── CENOVNA TABELA ─────────────────────────────────────────────
  // Privzeto: vrstica na storitev (Storitev | Vzpostavitev | Mesečno | Opomba).
  // Nastavitev "Paketna cena": ena vrstica s skupno ceno paketa, brez postavk.
  if (oblika.paketna_cena) {
    const paketNaziv = (oblika.paket_naziv || '').trim()
      || `Paket: ${podatki.NASLOV || podatki.STORITEV_BADGE || 'storitve'}`;
    const imaMesecno = Boolean(podatki.SKUPAJ_MESECNO);
    const cols = imaMesecno
      ? '<col style="width:52%"><col style="width:24%"><col style="width:24%">'
      : '<col style="width:68%"><col style="width:32%">';
    const glava = imaMesecno ? '<th>Storitev</th><th>Enkratno</th><th>Mesečno</th>' : '<th>Storitev</th><th>Cena</th>';
    const celice = imaMesecno
      ? `<td>${podatki.SKUPAJ_VZPOSTAVITEV}</td><td>${podatki.SKUPAJ_MESECNO}</td>`
      : `<td>${podatki.SKUPAJ_VZPOSTAVITEV}</td>`;
    podatki.CENOVNA_TABELA = `<table class="price-table price-table--paket">
        <colgroup>${cols}</colgroup>
        <thead><tr>${glava}</tr></thead>
        <tbody>
          <tr><td>${paketNaziv}</td>${celice}</tr>
          <tr class="total-row"><td>SKUPAJ</td>${celice}</tr>
        </tbody>
      </table>`;
    // Paket nima stolpca za DDV: informacija gre v opombo pod tabelo.
    podatki.CENE_OPOMBA = `<p class="price-note">${oblika.brez_ddv ? ddvOpomba : (ddvInfo || ddvOpomba)}</p>`;
  } else {
    podatki.CENOVNA_TABELA = `<table class="price-table">
        <colgroup>
          <col style="width:23%">
          <col style="width:19%">
          <col style="width:22%">
          <col style="width:36%">
        </colgroup>
        <thead>
          <tr>
            <th>Storitev</th>
            <th>Vzpostavitev (1x)</th>
            <th>Mesečno</th>
            <th>Opomba</th>
          </tr>
        </thead>
        <tbody>
          ${podatki.VRSTICE_CEN}
          <tr class="total-row">
            <td>SKUPAJ</td>
            <td>${podatki.SKUPAJ_VZPOSTAVITEV}</td>
            <td>${podatki.SKUPAJ_MESECNO}</td>
            <td class="total-ddv">${podatki.SKUPAJ_DDV_INFO}</td>
          </tr>
        </tbody>
      </table>`;
    podatki.CENE_OPOMBA = oblika.brez_ddv ? `<p class="price-note">${ddvOpomba}</p>` : '';
  }

  // ── FAZNI BLOK (samo za projektne storitve s poljem "faze") ────
  let fazniBlok = '';
  let fazniBlokWord = '';

  podatki.storitve.forEach((s, si) => {
    if (!Array.isArray(s.faze) || s.faze.length === 0) return;

    fazniBlok += `<div class="storitev-naslov">${s.naziv || ''}</div>`;
    fazniBlokWord += `<p style="font-size:12pt;font-weight:bold;color:#0B0F10;margin:18px 0 8px 0;">${s.naziv || ''}</p>`;

    s.faze.forEach((faza, fi) => {
      const naloge = faza.naloge || [];
      // Stolpec "Ur" prikažemo SAMO, če faza dejansko ima ure. Če jih je človek
      // v popravljenem Wordu odstranil, jih izpustimo tudi tu (zvestoba dokumentu).
      const imaUre = naloge.some(n => n.ure && String(n.ure).trim());
      const stolpcev = imaUre ? 3 : 2;

      const nalogeVrstice = naloge.map(n => `
        <tr>
          <td>${n.opis || ''}</td>
          ${imaUre ? `<td>${n.ure || ''}</td>` : ''}
          <td>${n.vrednost || ''}</td>
        </tr>`).join('');

      fazniBlok += `
        <div class="faza-blok" data-storitev="${si}" data-faza="${fi}">
          <div class="faza-glava">
            <div class="faza-naslov">${faza.naslov || ''}</div>
            ${faza.trajanje ? `<div class="faza-trajanje">Trajanje: ${faza.trajanje}</div>` : ''}
          </div>
          <table class="faze-tabela">
            <thead>
              <tr><th>Naloga</th>${imaUre ? '<th>Ur</th>' : ''}<th>Vrednost</th></tr>
            </thead>
            <tbody>${nalogeVrstice}</tbody>
            <tfoot>
              <tr class="faza-skupaj">
                <td>Skupaj faza</td>
                ${imaUre ? `<td>${faza.skupaj_ure || ''}</td>` : ''}
                <td>${faza.skupaj_vrednost || ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;

      const nalogeWord = naloge.map(n => `
        <tr>
          <td style="padding:5px 12px;border-bottom:1px solid #f1f3f5;font-size:9.5pt;color:#333;">${n.opis || ''}</td>
          ${imaUre ? `<td style="padding:5px 12px;border-bottom:1px solid #f1f3f5;font-size:9.5pt;color:#333;text-align:right;white-space:nowrap;">${n.ure || ''}</td>` : ''}
          <td style="padding:5px 12px;border-bottom:1px solid #f1f3f5;font-size:9.5pt;color:#333;text-align:right;white-space:nowrap;">${n.vrednost || ''}</td>
        </tr>`).join('');

      fazniBlokWord += `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px;border:1px solid #dde3e6;border-left:4px solid #00AFAA;">
          <tr><td colspan="${stolpcev}" style="padding:10px 14px;background:#f7f9fa;">
            <p style="margin:0;font-weight:bold;font-size:11pt;color:#0B0F10;">${faza.naslov || ''}</p>
            ${faza.trajanje ? `<p style="margin:2px 0 0 0;font-size:9pt;color:#888;font-style:italic;">Trajanje: ${faza.trajanje}</p>` : ''}
          </td></tr>
          <tr style="background:#fafbfc;">
            <th style="padding:7px 12px;text-align:left;font-size:8.5pt;color:#666;text-transform:uppercase;border-bottom:1px solid #dde3e6;">Naloga</th>
            ${imaUre ? '<th style="padding:7px 12px;text-align:right;font-size:8.5pt;color:#666;text-transform:uppercase;border-bottom:1px solid #dde3e6;width:60px;">Ur</th>' : ''}
            <th style="padding:7px 12px;text-align:right;font-size:8.5pt;color:#666;text-transform:uppercase;border-bottom:1px solid #dde3e6;width:90px;">Vrednost</th>
          </tr>
          ${nalogeWord}
          <tr style="background:#0B0F10;color:#fff;">
            <td style="padding:8px 14px;font-weight:bold;font-size:10pt;color:#fff;">Skupaj faza</td>
            ${imaUre ? `<td style="padding:8px 14px;font-weight:bold;font-size:10pt;color:#fff;text-align:right;">${faza.skupaj_ure || ''}</td>` : ''}
            <td style="padding:8px 14px;font-weight:bold;font-size:10pt;color:#fff;text-align:right;">${faza.skupaj_vrednost || ''}</td>
          </tr>
        </table>`;
    });
  });

  // Paketna cena skrije tudi fazne tabele: tudi te bi pokazale postavke.
  podatki.FAZNI_BLOK_HTML = oblika.paketna_cena ? '' : fazniBlok;
  podatki.FAZNI_BLOK_HTML_WORD = fazniBlokWord;
}
if (podatki.CENOVNA_TABELA === undefined) podatki.CENOVNA_TABELA = '';
if (podatki.CENE_OPOMBA === undefined) podatki.CENE_OPOMBA = '';

// ── DODATNA OPCIJA (neobvezen prosti blok v cenovni strukturi) ───
// Vir: prosta vsebina iz Worda (npr. "Dodatna opcija — Mesečni pregled").
// Vedno nastavimo vrednost (prazen niz), da placeholder ne ostane v PDF-ju.
const dop = podatki.dodatna_opcija;
if (dop && (dop.uvod || (Array.isArray(dop.tocke) && dop.tocke.length))) {
  const tocke = (dop.tocke || []).map(t => `<li>${t}</li>`).join('');
  const investicijaArr = Array.isArray(dop.investicija)
    ? dop.investicija
    : (dop.investicija ? [dop.investicija] : []);
  const investicija = investicijaArr.map(i => `<div class="dop-inv-row">${i}</div>`).join('');
  podatki.DODATNA_OPCIJA_HTML = `
  <div class="dodatna-opcija" data-cilj="dodatna">
    <div class="dop-naslov">${dop.naslov || 'Dodatna opcija'}</div>
    ${dop.uvod ? `<p class="dop-uvod">${dop.uvod}</p>` : ''}
    ${tocke ? `<ul class="dop-list">${tocke}</ul>` : ''}
    ${investicija ? `<div class="dop-investicija"><span class="dop-inv-label">Investicija</span>${investicija}</div>` : ''}
  </div>`;

  // Word verzija (inline stili za html-to-docx). Naslov ima predpono "DODATNO:",
  // da ga verbatim parser (mammoth → Claude) ob ponovnem nalaganju spet prepozna
  // kot dodatno opcijo in ne kot navadno storitev.
  const naslovWord = (dop.naslov && /dodat/i.test(dop.naslov))
    ? dop.naslov
    : `DODATNO: ${dop.naslov || 'Dodatna opcija'}`;
  // Točke kot <p> odstavki (NE gnezdena tabela — html-to-docx jo izpusti).
  const tockeWord = (dop.tocke || [])
    .map(t => `<p style="font-size:9.5pt;color:#444;margin:2px 0;"><span style="color:#00AFAA;font-weight:bold;">&#9679;</span> ${t}</p>`)
    .join('');
  const investicijaWord = investicijaArr
    .map(i => `<p style="font-size:9.5pt;color:#0B0F10;font-weight:bold;margin:2px 0;">${i}</p>`)
    .join('');
  podatki.DODATNA_OPCIJA_HTML_WORD = `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;margin-bottom:8px;border:1px solid #dde3e6;border-left:4px solid #FF0A60;">
    <tr><td style="padding:12px 16px;">
      <p style="font-size:11pt;font-weight:bold;color:#0B0F10;margin:0 0 6px 0;">${naslovWord}</p>
      ${dop.uvod ? `<p style="font-size:9.5pt;color:#555;line-height:1.6;margin:0 0 8px 0;">${dop.uvod}</p>` : ''}
      ${tockeWord}
      ${investicijaWord ? `<p style="font-size:8.5pt;color:#888;text-transform:uppercase;margin:8px 0 2px 0;">Investicija</p>${investicijaWord}` : ''}
    </td></tr>
  </table>`;
} else {
  podatki.DODATNA_OPCIJA_HTML = '';
  podatki.DODATNA_OPCIJA_HTML_WORD = '';
}

// Če datum ni naveden (prazen niz, null ali undefined), uporabi
// dejanski datum ob generiranju ponudbe — to je realni datum izdaje.
if (!podatki.DATUM) {
  podatki.DATUM = new Date().toLocaleDateString('sl-SI');
}
if (!podatki.STEVILKA_PONUDBE) podatki.STEVILKA_PONUDBE = `P${Date.now().toString().slice(-6)}`;

// ── RAZDELEK 4 "Kako poteka sodelovanje" — DINAMIČNO ─────────────
// Prej je PDF predloga vedno izrisala 4 trdo zakodirane korake, render.js pa
// je praznim vsilil privzete naslove. Na verbatim poti (naložen popravljen
// Word) je to DODAJALO izmišljene korake. Zdaj izrišemo TOČNO toliko korakov,
// kot jih ima ponudba — prazne izpustimo, če korakov ni, izpustimo cel razdelek.
// Beremo SUROVE vrednosti tu, PREDEN spodaj nastavimo fallback naslove (ti
// zdaj služijo le Word predlogi, ki ostane pri 4 korakih).
const privzetiKorakNaslov = ['Vzpostavitev', 'Optimizacija', 'Poročanje', 'Razvoj'];
const koraki = [];
for (let i = 1; i <= 4; i++) {
  const naslov = (podatki[`NASLOV_KORAK_${i}`] || '').trim();
  const opis   = (podatki[`KORAK_${i}`] || '').trim();
  if (!naslov && !opis) continue; // prazen korak → izpusti (nič izmišljenega)
  koraki.push({ naslov: naslov || privzetiKorakNaslov[i - 1], opis, polje: i });
}

if (koraki.length) {
  // data-korak = številka polja (KORAK_n), ne prikazana številka: prazni koraki izpadejo.
  const korakStep = (k, n) => `
        <div class="process-step" data-korak="${k.polje}">
          <div class="step-circle">${n}</div>
          <div class="step-content">
            <div class="step-label">Korak ${n}</div>
            <div class="step-title">${k.naslov}</div>
            <div class="step-desc">${k.opis}</div>
          </div>
        </div>`;
  let vrstice = '';
  for (let i = 0; i < koraki.length; i += 2) {
    const a = korakStep(koraki[i], i + 1);
    const b = koraki[i + 1] ? korakStep(koraki[i + 1], i + 2) : '';
    vrstice += `\n      <div class="process-row">${a}${b}
      </div>`;
  }
  podatki.RAZDELEK_KORAKI = `
  <div class="section">
    <div class="section-header">
      <div class="section-number">4</div>
      <h2 class="section-title">KAKO POTEKA <span class="accent">SODELOVANJE?</span></h2>
    </div>
    <div class="process-grid">${vrstice}
    </div>
  </div>`;
  podatki.ST_RAZDELEK_PODJETJE = '5';
} else {
  podatki.RAZDELEK_KORAKI = '';
  podatki.ST_RAZDELEK_PODJETJE = '4'; // razdelek korakov izpadel → preštevilči
}

// Fallback naslovi za korake (stari JSONi brez NASLOV_KORAK polj) — samo Word
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
  if (predpostavke) pogPdf += `<div class="conditions-box" data-cilj="predpostavke"><div class="cond-title">Predpostavke</div><div class="cond-text">${predpostavke}</div></div>`;
  if (izklucitve)   pogPdf += `<div class="conditions-box conditions-excl" data-cilj="izkljucitve"><div class="cond-title">V ceno ni zajeto</div><div class="cond-text">${izklucitve}</div></div>`;
  pogPdf += `<div class="conditions-box conditions-pay" data-cilj="placilo"><div class="cond-title">Plačilni pogoji</div><div class="cond-text">${placilniPogoji || 'Po dogovoru.'}<br><span style="font-size:8pt;color:#aaa;">Veljavnost: ${veljavnost}</span></div></div>`;
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

// Nastavitvi "Svoj zaključni stavek" in "Skrij reference": bloka sta v predlogi med oznakami.
if (zakljucniStavek) {
  html = html.replace(/<!-- CTA:ZACETEK -->[\s\S]*?<!-- CTA:KONEC -->/,
    `<p class="cta-text" style="margin:0">${zakljucniStavek}</p>`);
}
if (oblika.skrij_reference) {
  html = html.replace(/<!-- REFERENCE:ZACETEK -->[\s\S]*?<!-- REFERENCE:KONEC -->/, '');
}

const ime = (podatki.IME_STRANKE || 'ponudba').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

// ── HTML (predogled v appu) ──────────────────────────────────────
if (ukaz === 'html') {
  const htmlPot = process.env.HTML_OUT || resolve(process.cwd(), 'output/predogled.html');
  writeFileSync(htmlPot, html);
  console.log(`✓ HTML: ${htmlPot}`);
}

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
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log(`✓ PDF: ${pdfPot}`);
}
