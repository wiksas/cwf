// Wstawia treści z content/*.json (edytowane w panelu /admin/, Sveltia CMS) do stron HTML,
// generuje warianty zdjęć WebP (img/), obraz podglądu linku (og:image) i sitemap.xml.
// Podmieniane są wyłącznie bloki <!-- cms:nazwa --> … <!-- /cms:nazwa -->; reszta HTML jest pisana ręcznie.
// Uruchomienie: npm install, potem node scripts/build.mjs (to samo robi GitHub Action po każdym zapisie w CMS).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://cwf.pl/";
const CITY = "Kraków";
const ORG_NAME = "Centrum Wspinaczkowe Forteca";
const OPT_DIR = "img"; // wyłącznie pliki generowane; nieużywane są usuwane przy każdym buildzie

/** Strony, w których podmieniane są bloki; `url` = adres w sitemap.xml (null = poza sitemapą). */
const PAGES = [
  { file: "index.html", url: SITE },
  { file: "regulaminy.html", url: `${SITE}regulaminy.html` },
  { file: "fundacja.html", url: `${SITE}fundacja.html` },
  { file: "404.html", url: null },
];

const load = (name) => JSON.parse(readFileSync(path.join(ROOT, "content", `${name}.json`), "utf8"));
const ustawienia = load("ustawienia");
const lokalizacje = load("lokalizacje");
const oferta = load("oferta");
const urodziny = load("urodziny");
const cennik = load("cennik");
const promocje = load("promocje");
const formularze = load("formularze");
const galeria = load("galeria");
const wideo = load("wideo");
const faq = load("faq");

// ---------- pomocnicze ----------

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\u00a0": "&nbsp;", "\u00ad": "&shy;" };
const esc = (value) => String(value ?? "").replace(/[&<>"\u00a0\u00ad]/g, (c) => ENTITIES[c]);

const external = (href) => (/^https?:\/\//.test(href) ? ' target="_blank" rel="noopener"' : "");

/** Tekst z prostym formatowaniem: **pogrubienie** i [link](adres). */
function inline(text, strong = "b") {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, `<${strong}>$1</${strong}>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}"${external(href)}>${label}</a>`);
}

/** Ten sam tekst bez formatowania, do danych strukturalnych. */
const plain = (text) =>
  String(text ?? "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/\u00ad/g, "")
    .replace(/\u00a0/g, " ");

function need(value, where) {
  const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  if (empty || (Array.isArray(value) && value.length === 0)) throw new Error(`Brak wymaganej treści: ${where}`);
  return value;
}

/** Wcięcie wszystkich niepustych linii o `spaces` spacji. */
const nest = (text, spaces) => text.split("\n").map((line) => (line ? " ".repeat(spaces) + line : line)).join("\n");

const wrap = (open, items, close, spaces = 2) => `${open}\n${nest(items.join("\n"), spaces)}\n${close}`;

const ico = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** "512 631 621" → "+48512631621" */
function tel(display) {
  const digits = String(need(display, "numer telefonu")).replace(/\D/g, "");
  return `+${digits.length === 9 ? `48${digits}` : digits}`;
}

/** "Racławicka 60" → "raclawicka-60" */
const slug = (text) =>
  text.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const mapUrl = (name) => `https://maps.google.com/maps?q=${encodeURIComponent(`${name}, ${CITY}`)}`;

/** Ścieżka z CMS ("/assets/x.jpg") → ścieżka względna strony ("assets/x.jpg"); plik musi istnieć w repozytorium. */
function asset(src, where) {
  const rel = String(need(src, where)).replace(/^\/+/, "");
  const file = path.join(ROOT, rel);
  try {
    if (statSync(file).isFile()) return { rel, href: encodeURI(rel), file };
  } catch {}
  throw new Error(`Nie ma pliku „${rel}” (${where})`);
}

const shortHash = (buffer) => createHash("sha1").update(buffer).digest("hex").slice(0, 8);

const anchor = (id) => (id ? ` id="${esc(id)}"` : "");

// ---------- zdjęcia: warianty WebP do srcset ----------

const WIDTHS = [480, 960, 1440];
const HERO_WIDTHS = [800, 1280, 1920];
const produced = new Set(); // nazwy plików w img/ użyte w tym buildzie
const variantCache = new Map();
mkdirSync(path.join(ROOT, OPT_DIR), { recursive: true });

/** Tworzy brakujące warianty WebP (nazwa zawiera skrót treści pliku, więc podmiana zdjęcia = nowe warianty). */
async function prepareImage(src, widths, where) {
  const { rel, file } = asset(src, where);
  const key = `${rel}|${widths}`;
  if (variantCache.has(key)) return;
  const buffer = readFileSync(file);
  const meta = await sharp(buffer).metadata();
  const [ow, oh] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const base = `${path.basename(rel, path.extname(rel))}-${shortHash(buffer)}`;
  const variants = [];
  for (const w of [...new Set(widths.map((width) => Math.min(width, ow)))]) {
    const name = `${base}-${w}.webp`;
    const out = path.join(ROOT, OPT_DIR, name);
    if (!existsSync(out)) await sharp(buffer).rotate().resize({ width: w }).webp({ quality: 78 }).toFile(out);
    produced.add(name);
    variants.push({ w, h: Math.round((oh * w) / ow), href: `${OPT_DIR}/${encodeURI(name)}` });
  }
  variantCache.set(key, variants);
}

function variants(src, widths = WIDTHS) {
  const rel = String(src).replace(/^\/+/, "");
  const found = variantCache.get(`${rel}|${widths}`);
  if (!found) throw new Error(`Zdjęcie ${rel} nie zostało przygotowane: dodaj je do sekcji „przygotowanie zdjęć” w build.mjs`);
  return found;
}

const srcset = (list) => list.map((v) => `${v.href} ${v.w}w`).join(", ");

/** <img> z srcset; `attrs` trafiają przed src (np. ' class="…"'). */
function img(src, alt, sizes, attrs = "", { widths = WIDTHS, eager = false } = {}) {
  const list = variants(src, widths);
  const middle = list[Math.min(1, list.length - 1)];
  const largest = list.at(-1);
  const loading = eager ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<img${attrs} src="${middle.href}" srcset="${srcset(list)}" sizes="${sizes}" alt="${esc(alt)}" width="${largest.w}" height="${largest.h}"${loading} decoding="async">`;
}

const largest = (src, widths = WIDTHS) => variants(src, widths).at(-1);

/** Podgląd linku 1200×630 (og:image) wycięty ze zdjęcia z nagłówka strony. */
async function prepareOgImage(src) {
  const { rel, file } = asset(src, "ustawienia: zdjęcie w nagłówku");
  const buffer = readFileSync(file);
  const name = `${path.basename(rel, path.extname(rel))}-${shortHash(buffer)}-og.jpg`;
  const out = path.join(ROOT, OPT_DIR, name);
  if (!existsSync(out)) await sharp(buffer).rotate().resize(1200, 630, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  produced.add(name);
  return `${OPT_DIR}/${encodeURI(name)}`;
}

// ---------- godziny otwarcia ----------

const DAYS = ["pn", "wt", "sr", "cz", "pt", "sb", "nd"];
const DAY_FULL = { pn: "Poniedziałek", wt: "Wtorek", sr: "Środa", cz: "Czwartek", pt: "Piątek", sb: "Sobota", nd: "Niedziela" };
const DAY_SHORT = { pn: "Pn", wt: "Wt", sr: "Śr", cz: "Czw", pt: "Pt", sb: "Sb", nd: "Nd" };
const DAY_SCHEMA = { pn: "Monday", wt: "Tuesday", sr: "Wednesday", cz: "Thursday", pt: "Friday", sb: "Saturday", nd: "Sunday" };

function openingRows(loc) {
  return need(loc.godziny, `${loc.nazwa}: godziny otwarcia`).map((row) => {
    const from = row.od;
    const to = row.do || row.od;
    if (!DAYS.includes(from) || !DAYS.includes(to) || DAYS.indexOf(to) < DAYS.indexOf(from)) {
      throw new Error(`${loc.nazwa}: nieprawidłowy zakres dni „${row.od}–${row.do}”`);
    }
    return {
      from,
      to,
      open: need(row.otwarcie, `${loc.nazwa}: godzina otwarcia`),
      close: need(row.zamkniecie, `${loc.nazwa}: godzina zamknięcia`),
    };
  });
}

/** Łączy sąsiednie dni z tymi samymi godzinami (Pt + Sb–Nd → Pt–Nd), do stopki. */
function mergedRows(rows) {
  const out = [];
  for (const row of rows) {
    const prev = out.at(-1);
    const adjacent = prev && DAYS.indexOf(row.from) === DAYS.indexOf(prev.to) + 1;
    if (adjacent && prev.open === row.open && prev.close === row.close) prev.to = row.to;
    else out.push({ ...row });
  }
  return out;
}

const dayRange = (row, names, sep) => (row.from === row.to ? names[row.from] : `${names[row.from]}${sep}${names[row.to]}`);
const daysOf = (row) => DAYS.slice(DAYS.indexOf(row.from), DAYS.indexOf(row.to) + 1);
const hhmm = (time) => time.padStart(5, "0");

// ---------- przygotowanie zdjęć ----------

const locs = need(lokalizacje.lokalizacje, "lokalizacje");
const attractions = need(urodziny.atrakcje, "urodziny: atrakcje");
const groups = need(galeria.grupy, "galeria");
const videos = wideo.filmy ?? [];

for (const card of need(oferta.karty, "oferta: karty")) await prepareImage(card.zdjecie, WIDTHS, `oferta „${card.tytul}”`);
for (const card of attractions) await prepareImage(card.zdjecie, WIDTHS, `urodziny „${card.tytul}”`);
for (const group of groups) {
  for (const photo of need(group.zdjecia, `galeria „${group.nazwa}”: zdjęcia`)) await prepareImage(photo.zdjecie, WIDTHS, `galeria „${group.nazwa}”`);
}
for (const video of videos) await prepareImage(video.miniatura, WIDTHS, `wideo „${video.tytul}”`);
await prepareImage(ustawienia.hero_zdjecie, HERO_WIDTHS, "ustawienia: zdjęcie w nagłówku");
const ogImage = await prepareOgImage(ustawienia.hero_zdjecie);

// ---------- dane strukturalne ----------

const title = need(ustawienia.tytul_seo, "ustawienia: tytuł strony");
const description = need(ustawienia.opis_seo, "ustawienia: opis SEO");
if (title.length > 60) console.warn(`Uwaga: tytuł strony ma ${title.length} znaków (zalecane ≤ 60).`);
if (description.length > 160) console.warn(`Uwaga: opis strony ma ${description.length} znaków (zalecane ≤ 160).`);

const ORG_ID = `${SITE}#organizacja`;
const absolute = (href) => SITE + href;

function schema() {
  const groupByName = new Map(groups.map((g) => [g.nazwa, g]));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}#strona`,
        url: SITE,
        name: ORG_NAME,
        inLanguage: "pl-PL",
        publisher: { "@id": ORG_ID },
      },
      {
        "@type": "SportsOrganization",
        "@id": ORG_ID,
        name: ORG_NAME,
        alternateName: ["CWF", "Forteca"],
        url: SITE,
        logo: { "@type": "ImageObject", url: `${SITE}assets/logo-cwf.png`, width: 1000, height: 414 },
        image: absolute(ogImage),
        telephone: tel(ustawienia.infolinia),
        areaServed: { "@type": "City", name: CITY },
        sameAs: ["https://www.facebook.com/cwforteca", "https://www.instagram.com/cwforteca"],
        department: locs.map((loc) => ({ "@id": `${SITE}#${slug(loc.nazwa)}` })),
        makesOffer: oferta.karty.map((card) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: card.tytul, description: plain(card.tekst), areaServed: { "@type": "City", name: CITY } },
        })),
      },
      ...locs.map((loc) => {
        const photos = groupByName.get(loc.nazwa)?.zdjecia ?? [];
        return {
          "@type": "SportsActivityLocation",
          "@id": `${SITE}#${slug(loc.nazwa)}`,
          name: `${ORG_NAME}, ${loc.nazwa}`,
          url: `${SITE}#${slug(loc.nazwa)}`,
          parentOrganization: { "@id": ORG_ID },
          ...(photos.length ? { image: photos.map((p) => absolute(largest(p.zdjecie).href)) } : {}),
          telephone: tel(loc.telefon),
          email: loc.email,
          address: {
            "@type": "PostalAddress",
            streetAddress: loc.adres,
            addressLocality: CITY,
            addressRegion: "małopolskie",
            addressCountry: "PL",
          },
          hasMap: mapUrl(loc.nazwa),
          openingHoursSpecification: openingRows(loc).map((row) => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: daysOf(row).map((d) => DAY_SCHEMA[d]),
            opens: hhmm(row.open),
            closes: hhmm(row.close),
          })),
          ...(loc.facebook ? { sameAs: [loc.facebook] } : {}),
        };
      }),
      {
        "@type": "WebPage",
        "@id": `${SITE}#strona-glowna`,
        url: SITE,
        name: title,
        description,
        inLanguage: "pl-PL",
        isPartOf: { "@id": `${SITE}#strona` },
        about: { "@id": ORG_ID },
        primaryImageOfPage: { "@type": "ImageObject", url: absolute(ogImage), width: 1200, height: 630 },
        hasPart: { "@id": `${SITE}#pytania` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}#pytania`,
        url: `${SITE}#pytania`,
        inLanguage: "pl-PL",
        isPartOf: { "@id": `${SITE}#strona-glowna` },
        mainEntity: need(faq.pytania, "FAQ").map((item) => ({
          "@type": "Question",
          name: plain(item.pytanie),
          acceptedAnswer: { "@type": "Answer", text: plain(item.odpowiedz) },
        })),
      },
    ],
  };
}

// ---------- bloki ----------

function locationCard(loc) {
  const name = need(loc.nazwa, "lokalizacja: nazwa");
  const head = [
    `<h3>${esc(name)}</h3>`,
    `<p class="loc__addr">${esc(need(loc.adres, `${name}: adres`))}, ${CITY}${loc.dzielnica ? ` · ${esc(loc.dzielnica)}` : ""}</p>`,
  ];
  if (loc.okolice) head.push(`<p class="loc__near">${esc(loc.okolice)}</p>`);
  const parts = [wrap(`<div class="loc__name">`, head, "</div>")];
  if (loc.parametry?.length) {
    parts.push(wrap(`<ul class="loc__specs ticks" aria-label="Ściany: ${esc(name)}">`, loc.parametry.map((p) => `<li>${inline(p)}</li>`), "</ul>"));
  }
  parts.push(
    wrap(
      `<div class="loc__info">`,
      [
        wrap(
          `<dl class="loc__hours">`,
          openingRows(loc).map((row) => `<div><dt>${dayRange(row, DAY_FULL, " – ")}</dt><dd>${esc(row.open)}–${esc(row.close)}</dd></div>`),
          "</dl>",
        ),
        wrap(
          `<div class="loc__contact">`,
          [
            `<a href="tel:${tel(loc.telefon)}">${ico("phone")} ${esc(loc.telefon)}</a>`,
            `<a href="mailto:${esc(need(loc.email, `${name}: e-mail`))}">${ico("mail")} ${esc(loc.email)}</a>`,
            `<a href="${esc(mapUrl(name))}" target="_blank" rel="noopener">${ico("pin")} Jak dojechać <span class="visually-hidden">(${esc(name)}, mapa Google)</span></a>`,
          ],
          "</div>",
        ),
      ],
      "</div>",
    ),
  );
  return wrap(`<article class="loc" id="${slug(name)}">`, parts, "</article>");
}

function footerLocation(loc) {
  const items = [
    `<li><a href="${esc(mapUrl(loc.nazwa))}" target="_blank" rel="noopener">${ico("pin")} ${esc(loc.adres)}, ${CITY}</a></li>`,
    `<li><a href="tel:${tel(loc.telefon)}">${ico("phone")} ${esc(loc.telefon)}</a></li>`,
    `<li><a href="mailto:${esc(loc.email)}">${ico("mail")} ${esc(loc.email)}</a></li>`,
    ...mergedRows(openingRows(loc)).map((row) => `<li class="footer-loc__hours">${dayRange(row, DAY_SHORT, "–")} ${esc(row.open)}–${esc(row.close)}</li>`),
  ];
  if (loc.facebook) items.push(`<li><a href="${esc(loc.facebook)}" target="_blank" rel="noopener">Facebook ${esc(loc.nazwa)} ↗</a></li>`);
  return wrap(`<div class="footer-loc">`, [`<h3>${esc(loc.nazwa)}</h3>`, wrap("<ul>", items, "</ul>")], "</div>");
}

// sizes: pierwsze dwie karty oferty i pierwsze zdjęcie w grupie galerii są większe (układ w styles.css)
const SIZES_OFFER_LEAD = "(min-width: 1280px) 610px, (min-width: 760px) 50vw, 100vw";
const SIZES_OFFER = "(min-width: 1280px) 400px, (min-width: 760px) 33vw, 100vw";
const SIZES_BDAY = "(min-width: 460px) 360px, 80vw";
const SIZES_GALLERY_LEAD = "(min-width: 1280px) 820px, (min-width: 720px) 66vw, 82vw";
const SIZES_GALLERY = "(min-width: 1280px) 410px, (min-width: 720px) 33vw, 82vw";
const SIZES_VIDEO = "(min-width: 1280px) 400px, (min-width: 720px) 33vw, 50vw";
const SIZES_HERO = "(min-width: 960px) 60vw, 100vw";

function offerCard(card, i) {
  const lead = i < 2;
  const body = [`<h3>${esc(need(card.tytul, "oferta: tytuł"))}</h3>`, `<p>${inline(card.tekst)}</p>`];
  if (card.punkty?.length) body.push(wrap(`<ul class="offer__facts ticks">`, card.punkty.map((p) => `<li>${inline(p)}</li>`), "</ul>"));
  if (card.przycisk_tekst && card.przycisk_link) {
    body.push(`<a class="text-link" href="${esc(card.przycisk_link)}"${external(card.przycisk_link)}>${esc(card.przycisk_tekst)}</a>`);
  }
  return wrap(
    `<article class="offer${lead ? " offer--lead" : ""}"${anchor(card.kotwica)}>`,
    [img(card.zdjecie, card.opis_zdjecia, lead ? SIZES_OFFER_LEAD : SIZES_OFFER, ` class="offer__img"`), wrap(`<div class="offer__body">`, body, "</div>")],
    "</article>",
  );
}

/** 1 atrakcja, 2–4 atrakcje, 5+ atrakcji (12–14 atrakcji). */
function attractionsWord(n) {
  if (n === 1) return "atrakcja";
  const tens = n % 100;
  return n % 10 >= 2 && n % 10 <= 4 && (tens < 12 || tens > 14) ? "atrakcje" : "atrakcji";
}

function birthdayCard(card) {
  return wrap(
    `<article class="bday-card${card.wyroznienie ? " bday-card--hit" : ""}">`,
    [
      img(card.zdjecie, card.opis_zdjecia, SIZES_BDAY, ` class="bday-card__img"`),
      wrap(`<div class="bday-card__body">`, [`<h4>${esc(need(card.tytul, "atrakcja: tytuł"))}</h4>`, `<p>${inline(card.tekst)}</p>`], "</div>"),
    ],
    "</article>",
  );
}

function priceTable(table, where) {
  const cols = [table.naglowek_wierszy ?? "", ...need(table.kolumny, `${where}: kolumny cen`)];
  const rows = need(table.wiersze, `${where}: wiersze`).map((row) => {
    const prices = row.ceny ?? [];
    if (!prices.length) {
      return `<tr class="price-table__group"><th scope="rowgroup" colspan="${cols.length}">${esc(row.nazwa)}</th></tr>`;
    }
    if (prices.length > cols.length - 1) throw new Error(`${where}, wiersz „${row.nazwa}”: więcej cen (${prices.length}) niż kolumn (${cols.length - 1})`);
    const cells = prices.map((price, j) => {
      const span = j === prices.length - 1 ? cols.length - prices.length : 1;
      return `<td${span > 1 ? ` colspan="${span}"` : ""}>${esc(price)}</td>`;
    });
    return `<tr><th scope="row">${esc(row.nazwa)}</th>${cells.join("")}</tr>`;
  });
  return wrap(
    `<table class="price-table">`,
    [`<thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>`, wrap("<tbody>", rows, "</tbody>")],
    "</table>",
  );
}

/** Kotwica cennika: z panelu (stare linki, np. cennik-sekcje) albo z tytułu. */
const priceBoxId = (box) => box.kotwica || `cennik-${slug(need(box.tytul, "cennik: tytuł"))}`;

function priceBox(box) {
  const boxTitle = need(box.tytul, "cennik: tytuł");
  const parts = [`<h3>${esc(boxTitle)}</h3>`];
  if (box.podtytul) parts.push(`<p class="price-box__sub">${inline(box.podtytul)}</p>`);
  need(box.tabele, `cennik „${boxTitle}”: tabele`).forEach((table, j) => {
    if (table.naglowek) parts.push(`<h4 class="price-box__subhead">${esc(table.naglowek)}</h4>`);
    if (table.opis) parts.push(`<p class="price-box__sub">${inline(table.opis)}</p>`);
    parts.push(priceTable(table, `cennik „${boxTitle}”, tabela ${j + 1}`));
  });
  if (box.dodatki?.length) {
    parts.push(wrap(`<ul class="price-extras">`, box.dodatki.map((d) => `<li><span>${esc(d.nazwa)}</span> <b>${esc(d.cena)}</b></li>`), "</ul>"));
  }
  const cls = box.wyroznienie ? "price-box price-box--highlight" : "price-box";
  return wrap(`<article class="${cls}" id="${esc(priceBoxId(box))}">`, parts, "</article>");
}

function fileLabel(file) {
  const bytes = statSync(file).size;
  const size = bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${path.extname(file).slice(1).toUpperCase()} · ${size}`;
}

function documentLink(doc) {
  const name = need(doc.nazwa, "formularz: nazwa");
  if (Boolean(doc.plik) === Boolean(doc.link)) throw new Error(`Formularz „${name}”: podaj plik albo link (dokładnie jedno)`);
  if (doc.plik) {
    const { href, file } = asset(doc.plik, `formularz „${name}”`);
    return `<li><a href="${esc(href)}" download>${esc(name)} <span>${esc(doc.opis || fileLabel(file))}</span></a></li>`;
  }
  const label = doc.opis || (external(doc.link) ? "link ↗" : "");
  return `<li><a href="${esc(doc.link)}"${external(doc.link)}>${esc(name)}${label ? ` <span>${esc(label)}</span>` : ""}</a></li>`;
}

function galleryGroup(group) {
  const name = need(group.nazwa, "galeria: nazwa grupy");
  const id = `galeria-${slug(name)}`;
  const photos = group.zdjecia.map((photo, i) =>
    wrap(
      `<a class="gallery__item" href="${largest(photo.zdjecie).href}" data-lightbox="${id}">`,
      [img(photo.zdjecie, need(photo.opis, `galeria „${name}”: opis zdjęcia`), i === 0 ? SIZES_GALLERY_LEAD : SIZES_GALLERY)],
      "</a>",
    ),
  );
  return wrap(
    `<div class="gallery__loc" id="${id}">`,
    [`<h3>${esc(name)}</h3>`, wrap(`<div class="gallery__grid" role="region" aria-label="Zdjęcia: ${esc(name)}" tabindex="0">`, photos, "</div>")],
    "</div>",
  );
}

function videoCard(video) {
  const videoTitle = need(video.tytul, "wideo: tytuł");
  return wrap(
    `<a class="video" href="${esc(need(video.link, `wideo „${videoTitle}”: link`))}" target="_blank" rel="noopener">`,
    [
      wrap(`<span class="video__thumb">`, [img(video.miniatura, "", SIZES_VIDEO), `<span class="video__play">${ico("play")}</span>`], "</span>"),
      `<span class="video__title">${esc(videoTitle)} <span class="visually-hidden">(YouTube, nowa karta)</span></span>`,
    ],
    "</a>",
  );
}

const fileVersion = (rel) => shortHash(readFileSync(path.join(ROOT, rel)));
const infolinia = need(ustawienia.infolinia, "ustawienia: infolinia");
const telUrodziny = need(ustawienia.telefon_urodziny, "ustawienia: telefon urodziny");
const promoList = promocje.promocje ?? [];
const heroList = variants(ustawienia.hero_zdjecie, HERO_WIDTHS);

const ogImageTags = () =>
  [
    `<meta property="og:image" content="${esc(absolute(ogImage))}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(need(ustawienia.hero_opis, "ustawienia: opis zdjęcia w nagłówku"))}">`,
  ].join("\n");

const BLOCKS = {
  seo: () =>
    [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      ogImageTags(),
    ].join("\n"),
  "og-obraz": ogImageTags,
  "hero-preload": () =>
    `<link rel="preload" as="image" href="${heroList[Math.min(1, heroList.length - 1)].href}" imagesrcset="${srcset(heroList)}" imagesizes="${SIZES_HERO}" fetchpriority="high">`,
  zasoby: () =>
    [
      `<link rel="preload" href="fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>`,
      `<link rel="preload" href="fonts/saira-condensed-latin-800.woff2" as="font" type="font/woff2" crossorigin>`,
      `<link rel="stylesheet" href="styles.css?v=${fileVersion("styles.css")}">`,
    ].join("\n"),
  skrypt: () => `<script src="script.js?v=${fileVersion("script.js")}" defer></script>`,
  jsonld: () => `<script type="application/ld+json">\n${JSON.stringify(schema(), null, 2).replace(/</g, "\\u003c")}\n</script>`,
  topbar: () =>
    [
      `<span>${esc(ustawienia.pasek_gorny)}</span>`,
      `<span>Infolinia: <a href="tel:${tel(infolinia)}">${esc(infolinia)}</a> · Urodziny: <a href="tel:${tel(telUrodziny)}">${esc(telUrodziny)}</a></span>`,
    ].join("\n"),
  "hero-obraz": () => img(ustawienia.hero_zdjecie, "", SIZES_HERO, ` class="hero__img"`, { widths: HERO_WIDTHS, eager: true }),
  hero: () =>
    [
      wrap(`<p class="hero__sub">`, [inline(need(ustawienia.hero_tekst, "ustawienia: tekst w nagłówku"), "strong")], "</p>"),
      wrap(
        `<div class="hero__actions">`,
        [
          `<a class="btn btn--yellow" href="#lokalizacja">Wybierz lokalizację</a>`,
          `<a class="btn btn--outline-light" href="#cennik">Sprawdź cennik</a>`,
          `<a class="hero__tel" href="tel:${tel(telUrodziny)}">${ico("phone")} Urodziny: ${esc(telUrodziny)}</a>`,
        ],
        "</div>",
      ),
    ].join("\n"),
  lokalizacje: () => locs.map(locationCard).join("\n\n"),
  udogodnienia: () => (lokalizacje.udogodnienia ?? []).map((u) => `<li>${esc(u)}</li>`).join("\n"),
  "stopka-lokalizacje": () => locs.map(footerLocation).join("\n"),
  oferta: () => oferta.karty.map(offerCard).join("\n\n"),
  "oferta-dodatkowe": () =>
    (oferta.dodatkowe ?? [])
      .map((item) => wrap(`<article class="extra"${anchor(item.kotwica)}>`, [`<h4>${esc(item.tytul)}</h4>`, `<p>${inline(item.tekst)}</p>`], "</article>"))
      .join("\n"),
  "urodziny-pakiety": () =>
    [
      wrap(
        `<div class="bday__prices">`,
        [`<h3>${inline(need(urodziny.pakiety_naglowek, "urodziny: nagłówek pakietów"))}</h3>`, `<p>${inline(urodziny.pakiety_tekst)}</p>`],
        "</div>",
      ),
      wrap(
        `<div class="bday__book">`,
        [
          `<p>Rezerwacja urodzin</p>`,
          `<a class="bday__tel" href="tel:${tel(telUrodziny)}">${ico("phone")} ${esc(telUrodziny)}</a>`,
          `<a class="btn btn--ink" href="${esc(asset(urodziny.oswiadczenie, "urodziny: oświadczenie rodzica").href)}" download>Oświadczenie rodzica (PDF)</a>`,
        ],
        "</div>",
      ),
    ].join("\n"),
  "urodziny-naglowek": () => `<h3>${attractions.length} ${attractionsWord(attractions.length)} w 2 godziny</h3>`,
  "urodziny-atrakcje": () => attractions.map(birthdayCard).join("\n"),
  "cennik-karty": () => (cennik.karty_sportowe ?? []).map((k) => `<li>${esc(k)}</li>`).join("\n"),
  cennik: () => need(cennik.cenniki, "cennik").map(priceBox).join("\n\n"),
  "cennik-spis": () => cennik.cenniki.map((box) => `<li><a href="#${esc(priceBoxId(box))}">${esc(box.tytul)}</a></li>`).join("\n"),
  promocje: () =>
    promoList.length
      ? promoList
          .map((promo) =>
            wrap(
              `<article class="promo">`,
              [`<p class="promo__value">${esc(promo.etykieta)}</p>`, `<h3>${esc(promo.tytul)}</h3>`, `<p>${inline(promo.tekst)}</p>`],
              "</article>",
            ),
          )
          .join("\n")
      : `<p class="promos__empty">Aktualnie nie mamy promocji. Zapytaj w recepcji o bieżące oferty.</p>`,
  formularze: () => need(formularze.dokumenty, "formularze").map(documentLink).join("\n"),
  galeria: () => groups.map(galleryGroup).join("\n"),
  wideo: () => videos.map(videoCard).join("\n"),
  faq: () =>
    faq.pytania
      .map((item, i) =>
        wrap(`<details class="faq-item"${i === 0 ? " open" : ""}>`, [`<summary>${esc(item.pytanie)}</summary>`, `<p>${inline(item.odpowiedz)}</p>`], "</details>"),
      )
      .join("\n"),
  slowniczek: () => (faq.slowniczek ?? []).map((t) => `<div><dt>${esc(t.termin)}</dt><dd>${inline(t.definicja)}</dd></div>`).join("\n"),
  infolinia: () => `<h2>Infolinia <a href="tel:${tel(infolinia)}">${esc(infolinia)}</a></h2>`,
  "infolinia-przycisk": () => `<a class="btn btn--yellow" href="tel:${tel(infolinia)}">${ico("phone")} Zadzwoń</a>`,
  "pasek-kontakt": () =>
    wrap(
      `<nav class="call-bar" aria-label="Szybki kontakt">`,
      [
        `<a class="call-bar__btn call-bar__btn--main" href="tel:${tel(infolinia)}">${ico("phone")} Zadzwoń <span>${esc(infolinia)}</span></a>`,
        `<a class="call-bar__btn" href="tel:${tel(telUrodziny)}">${ico("phone")} Urodziny</a>`,
      ],
      "</nav>",
    ),
};

// ---------- podmiana bloków ----------

const BLOCK = /^([ \t]*)<!-- cms:([a-z0-9-]+) -->\n[\s\S]*?^[ \t]*<!-- \/cms:\2 -->/gm;
const today = new Date().toISOString().slice(0, 10);

let changed = 0;
const changedPages = new Set();
for (const page of PAGES) {
  const file = path.join(ROOT, page.file);
  const original = readFileSync(file, "utf8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const html = original.replace(/\r\n/g, "\n").replace(BLOCK, (_, indent, name) => {
    const render = BLOCKS[name];
    if (!render) throw new Error(`${page.file}: nieznany blok <!-- cms:${name} -->`);
    return `${indent}<!-- cms:${name} -->\n${nest(render(), indent.length)}\n${indent}<!-- /cms:${name} -->`;
  });
  const output = html.replace(/\n/g, eol);
  if (output !== original) {
    writeFileSync(file, output);
    changedPages.add(page.file);
    changed++;
    console.log(`zaktualizowano ${page.file}`);
  }
}

// ---------- sitemap.xml (lastmod zmienia się tylko, gdy zmieniła się strona) ----------

const sitemapFile = path.join(ROOT, "sitemap.xml");
const previousSitemap = existsSync(sitemapFile) ? readFileSync(sitemapFile, "utf8") : "";
const previousLastmod = (url) => previousSitemap.match(new RegExp(`<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>\\s*<lastmod>([\\d-]+)</lastmod>`))?.[1];
const sitemapImages = [
  ...oferta.karty.map((c) => c.zdjecie),
  ...attractions.map((c) => c.zdjecie),
  ...groups.flatMap((g) => g.zdjecia.map((p) => p.zdjecie)),
].map((src) => absolute(largest(src).href));
const sitemapUrls = PAGES.filter((p) => p.url).map((page) => {
  const lastmod = changedPages.has(page.file) ? today : previousLastmod(page.url) ?? today;
  const images = page.file === "index.html" ? [...new Set(sitemapImages)].map((loc) => `    <image:image><image:loc>${esc(loc)}</image:loc></image:image>`) : [];
  return [`  <url>`, `    <loc>${page.url}</loc>`, `    <lastmod>${lastmod}</lastmod>`, ...images, `  </url>`].join("\n");
});
const sitemap = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
  ...sitemapUrls,
  `</urlset>`,
  "",
].join("\n");
if (sitemap !== previousSitemap.replace(/\r\n/g, "\n")) {
  writeFileSync(sitemapFile, sitemap);
  changed++;
  console.log("zaktualizowano sitemap.xml");
}

// ---------- sprzątanie nieużywanych wariantów zdjęć ----------

for (const name of readdirSync(path.join(ROOT, OPT_DIR))) {
  if (!produced.has(name)) {
    unlinkSync(path.join(ROOT, OPT_DIR, name));
    console.log(`usunięto nieużywany ${OPT_DIR}/${name}`);
  }
}

console.log(changed ? `Gotowe, zmienione pliki: ${changed}.` : "Gotowe, bez zmian.");
