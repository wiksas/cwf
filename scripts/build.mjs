// Wstawia treści z content/*.json (edytowane w panelu /admin/ — Sveltia CMS) do stron HTML.
// Podmieniane są wyłącznie bloki <!-- cms:nazwa --> … <!-- /cms:nazwa -->; reszta HTML jest pisana ręcznie.
// Uruchomienie: node scripts/build.mjs (to samo robi GitHub Action po każdym zapisie w CMS).
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = ["index.html", "regulaminy.html", "fundacja.html"];

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

function need(value, where) {
  const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  if (empty || (Array.isArray(value) && value.length === 0)) throw new Error(`Brak wymaganej treści: ${where}`);
  return value;
}

/** Wcięcie wszystkich niepustych linii o `spaces` spacji. */
const nest = (text, spaces) => text.split("\n").map((line) => (line ? " ".repeat(spaces) + line : line)).join("\n");

const wrap = (open, items, close, spaces = 2) => `${open}\n${nest(items.join("\n"), spaces)}\n${close}`;

const ico = (name) => `<svg class="ico"><use href="#i-${name}"/></svg>`;

/** "512 631 621" → "+48512631621" */
function tel(display) {
  const digits = String(need(display, "numer telefonu")).replace(/\D/g, "");
  return `+${digits.length === 9 ? `48${digits}` : digits}`;
}

/** "Racławicka 60" → "raclawicka-60" */
const slug = (text) =>
  text.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Ścieżka z CMS ("/assets/x.jpg") → ścieżka względna strony ("assets/x.jpg"); plik musi istnieć w repozytorium. */
function asset(src, where) {
  const rel = String(need(src, where)).replace(/^\/+/, "");
  const file = path.join(ROOT, rel);
  try {
    if (statSync(file).isFile()) return { href: encodeURI(rel), file };
  } catch {}
  throw new Error(`Nie ma pliku „${rel}” (${where})`);
}

/** Wymiary JPEG / PNG / WebP / GIF / SVG — do atrybutów width/height (brak skoków układu przy ładowaniu). */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (chunk === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  }
  if (b.toString("ascii", 0, 3) === "GIF") return [b.readUInt16LE(6), b.readUInt16LE(8)];
  const svg = b.toString("utf8", 0, 2048).match(/<svg[^>]*>/)?.[0];
  if (svg) {
    const w = svg.match(/\swidth="([\d.]+)"/)?.[1];
    const h = svg.match(/\sheight="([\d.]+)"/)?.[1];
    if (w && h) return [Math.round(w), Math.round(h)];
    const box = svg.match(/viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
    if (box) return [Math.round(box[1]), Math.round(box[2])];
  }
  throw new Error(`Nieobsługiwany format obrazu: ${path.relative(ROOT, file)} (użyj JPG, PNG lub WebP)`);
}

/** <img> z wymiarami odczytanymi z pliku; `attrs` trafiają przed src (np. ' class="…"'). */
function img(src, alt, where, attrs = "") {
  const { href, file } = asset(src, where);
  const [w, h] = imageSize(file);
  return `<img${attrs} src="${esc(href)}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy">`;
}

const anchor = (id) => (id ? ` id="${esc(id)}"` : "");

// ---------- godziny otwarcia ----------

const DAYS = ["pn", "wt", "sr", "cz", "pt", "sb", "nd"];
const DAY_FULL = { pn: "Poniedziałek", wt: "Wtorek", sr: "Środa", cz: "Czwartek", pt: "Piątek", sb: "Sobota", nd: "Niedziela" };
const DAY_SHORT = { pn: "Pn", wt: "Wt", sr: "Śr", cz: "Czw", pt: "Pt", sb: "Sb", nd: "Nd" };
const DAY_SCHEMA = { pn: "Mo", wt: "Tu", sr: "We", cz: "Th", pt: "Fr", sb: "Sa", nd: "Su" };

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

/** Łączy sąsiednie dni z tymi samymi godzinami (Pt + Sb–Nd → Pt–Nd) — do stopki i danych dla Google. */
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

// ---------- bloki ----------

const locs = need(lokalizacje.lokalizacje, "lokalizacje");

function schema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Centrum Wspinaczkowe Forteca",
    url: "https://cwf.pl/",
    logo: "https://cwf.pl/assets/logo-cwf.png",
    telephone: tel(ustawienia.infolinia),
    sameAs: ["https://www.facebook.com/cwforteca", "https://www.instagram.com/cwforteca"],
    location: locs.map((loc) => ({
      "@type": "SportsActivityLocation",
      name: `Centrum Wspinaczkowe Forteca — ${loc.nazwa}`,
      address: { "@type": "PostalAddress", streetAddress: loc.adres, addressLocality: "Kraków", addressCountry: "PL" },
      telephone: tel(loc.telefon),
      email: loc.email,
      openingHours: mergedRows(openingRows(loc)).map(
        (row) => `${dayRange(row, DAY_SCHEMA, "-")} ${row.open}-${row.close}`,
      ),
    })),
  };
}

function locationCard(loc, i) {
  const name = need(loc.nazwa, "lokalizacja: nazwa");
  const parts = [
    `<img class="loc-card__sign" src="assets/sygnet.svg" alt="" width="88" height="88">`,
    `<h3>${esc(name)}</h3>`,
    `<p class="loc-card__addr">${esc(need(loc.adres, `${name}: adres`))}${loc.dzielnica ? ` · ${esc(loc.dzielnica)}` : ""}</p>`,
  ];
  if (loc.okolice) parts.push(`<p class="loc-card__near">${esc(loc.okolice)}</p>`);
  if (loc.parametry?.length) {
    parts.push(wrap(`<ul class="loc-card__specs" aria-label="Ściana ${esc(name)}">`, loc.parametry.map((p) => `<li>${inline(p)}</li>`), "</ul>"));
  }
  parts.push(
    wrap(
      `<dl class="loc-card__hours">`,
      openingRows(loc).map((row) => `<div><dt>${dayRange(row, DAY_FULL, " – ")}</dt><dd>${esc(row.open)} – ${esc(row.close)}</dd></div>`),
      "</dl>",
    ),
    wrap(
      `<div class="loc-card__contact">`,
      [
        `<a href="tel:${tel(loc.telefon)}">${ico("phone")} ${esc(loc.telefon)}</a>`,
        `<a href="mailto:${esc(need(loc.email, `${name}: e-mail`))}">${ico("mail")} ${esc(loc.email)}</a>`,
      ],
      "</div>",
    ),
    `<a class="btn btn--white-pill" href="https://maps.google.com/maps?q=${esc(encodeURIComponent(`${name}, Kraków`))}" target="_blank" rel="noopener">${ico("pin")} Jak dojechać</a>`,
  );
  return wrap(`<article class="loc-card" id="${slug(name)}" style="--i:${i}">`, parts, "</article>");
}

function footerLocation(loc) {
  const items = [
    `<li><a href="tel:${tel(loc.telefon)}">${ico("phone")} ${esc(loc.telefon)}</a></li>`,
    `<li><a href="mailto:${esc(loc.email)}">${ico("mail")} ${esc(loc.email)}</a></li>`,
    `<li>${mergedRows(openingRows(loc)).map((row) => `${dayRange(row, DAY_SHORT, "–")} ${esc(row.open)}–${esc(row.close)}`).join(" · ")}</li>`,
  ];
  if (loc.facebook) items.push(`<li><a href="${esc(loc.facebook)}" target="_blank" rel="noopener">Facebook ${esc(loc.nazwa)} ↗</a></li>`);
  return wrap(`<div class="footer-loc">`, [`<h3>${esc(loc.nazwa)}</h3>`, wrap("<ul>", items, "</ul>")], "</div>");
}

function offerCard(card, i) {
  const where = `oferta „${card.tytul}”`;
  const body = [`<h3>${esc(need(card.tytul, "oferta: tytuł"))}</h3>`, `<p>${inline(card.tekst)}</p>`];
  if (card.punkty?.length) body.push(wrap(`<ul class="offer-card__facts">`, card.punkty.map((p) => `<li>${inline(p)}</li>`), "</ul>"));
  if (card.przycisk_tekst && card.przycisk_link) {
    body.push(`<a class="btn btn--white-pill" href="${esc(card.przycisk_link)}"${external(card.przycisk_link)}>${esc(card.przycisk_tekst)}</a>`);
  }
  return wrap(
    `<article class="offer-card"${anchor(card.kotwica)} style="--i:${i}">`,
    [img(card.zdjecie, card.opis_zdjecia, where, ` class="offer-card__img"`), wrap(`<div class="offer-card__body">`, body, "</div>")],
    "</article>",
  );
}

/** 1 atrakcja, 2–4 atrakcje, 5+ atrakcji (12–14 atrakcji). */
function attractionsWord(n) {
  if (n === 1) return "atrakcja";
  const tens = n % 100;
  return n % 10 >= 2 && n % 10 <= 4 && (tens < 12 || tens > 14) ? "atrakcje" : "atrakcji";
}

function birthdayCard(card, i) {
  const badge = `${String(i + 1).padStart(2, "0")}${card.wyroznienie ? " · hit" : ""}`;
  return wrap(
    `<article class="bday-card${card.wyroznienie ? " bday-card--hit" : ""}">`,
    [
      img(card.zdjecie, card.opis_zdjecia, `urodziny „${card.tytul}”`, ` class="bday-card__img"`),
      wrap(
        `<div class="bday-card__body">`,
        [`<span class="bday-card__badge">${badge}</span>`, `<h4>${esc(need(card.tytul, "atrakcja: tytuł"))}</h4>`, `<p>${inline(card.tekst)}</p>`],
        "</div>",
      ),
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

function priceBox(box, i) {
  const title = need(box.tytul, "cennik: tytuł");
  const parts = [`<h3>${esc(title)}</h3>`];
  if (box.podtytul) parts.push(`<p class="price-box__sub">${inline(box.podtytul)}</p>`);
  need(box.tabele, `cennik „${title}”: tabele`).forEach((table, j) => {
    if (table.naglowek) parts.push(`<h4 class="price-box__subhead">${esc(table.naglowek)}</h4>`);
    if (table.opis) parts.push(`<p class="price-box__sub">${inline(table.opis)}</p>`);
    parts.push(priceTable(table, `cennik „${title}”, tabela ${j + 1}`));
  });
  if (box.dodatki?.length) {
    parts.push(wrap(`<ul class="price-chips">`, box.dodatki.map((d) => `<li>${esc(d.nazwa)} <b>${esc(d.cena)}</b></li>`), "</ul>"));
  }
  const cls = box.wyroznienie ? "price-box price-box--highlight" : "price-box";
  return wrap(`<article class="${cls}"${anchor(box.kotwica)} style="--i:${i}">`, parts, "</article>");
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
  const photos = need(group.zdjecia, `galeria „${name}”: zdjęcia`).map((photo, i) =>
    img(photo.zdjecie, photo.opis, `galeria „${name}”`, ` style="--i:${i}"`),
  );
  return wrap(
    `<div class="gallery__loc" id="galeria-${slug(name)}">`,
    [`<h3>${esc(name)}</h3>`, wrap(`<div class="gallery__grid sd-stagger" role="region" aria-label="Zdjęcia — ${esc(name)}" tabindex="0">`, photos, "</div>")],
    "</div>",
  );
}

function videoCard(video, i) {
  const title = need(video.tytul, "wideo: tytuł");
  return wrap(
    `<a class="video-card" style="--i:${i}" href="${esc(need(video.link, `wideo „${title}”: link`))}" target="_blank" rel="noopener">`,
    [
      img(video.miniatura, "", `wideo „${title}”`),
      `<span class="video-card__play">${ico("play")}</span>`,
      `<span class="video-card__title">${esc(title)}</span>`,
    ],
    "</a>",
  );
}

const infolinia = need(ustawienia.infolinia, "ustawienia: infolinia");
const telUrodziny = need(ustawienia.telefon_urodziny, "ustawienia: telefon urodziny");
const attractions = need(urodziny.atrakcje, "urodziny: atrakcje");
const promoList = promocje.promocje ?? [];

const BLOCKS = {
  seo: () => `<meta name="description" content="${esc(need(ustawienia.opis_seo, "ustawienia: opis SEO"))}">`,
  jsonld: () => `<script type="application/ld+json">\n${JSON.stringify(schema(), null, 2).replace(/</g, "\\u003c")}\n</script>`,
  topbar: () =>
    [
      `<span>${esc(ustawienia.pasek_gorny)}</span>`,
      `<span>Infolinia: <a href="tel:${tel(infolinia)}">${esc(infolinia)}</a> · Urodziny: <a href="tel:${tel(telUrodziny)}">${esc(telUrodziny)}</a></span>`,
    ].join("\n"),
  hero: () =>
    [
      wrap(`<p class="hero__sub">`, [inline(need(ustawienia.hero_tekst, "ustawienia: tekst w nagłówku"), "strong")], "</p>"),
      wrap(
        `<div class="hero__cta-row">`,
        [
          `<a class="btn btn--yellow" href="#lokalizacja">Wybierz lokalizację</a>`,
          `<a class="btn btn--outline-light" href="#cennik">Sprawdź cennik</a>`,
          `<a class="btn btn--outline-light" href="tel:${tel(telUrodziny)}">${ico("phone")} Urodziny: ${esc(telUrodziny)}</a>`,
        ],
        "</div>",
      ),
    ].join("\n"),
  lokalizacje: () => locs.map(locationCard).join("\n\n"),
  udogodnienia: () => (lokalizacje.udogodnienia ?? []).map((u) => `<li>${esc(u)}</li>`).join("\n"),
  "stopka-lokalizacje": () => locs.map(footerLocation).join("\n"),
  oferta: () => need(oferta.karty, "oferta: karty").map(offerCard).join("\n\n"),
  "oferta-dodatkowe": () =>
    (oferta.dodatkowe ?? [])
      .map((item, i) =>
        wrap(`<article class="extra-card"${anchor(item.kotwica)} style="--i:${i}">`, [`<h4>${esc(item.tytul)}</h4>`, `<p>${inline(item.tekst)}</p>`], "</article>"),
      )
      .join("\n"),
  "urodziny-pakiety": () =>
    [
      wrap("<div>", [`<h3>${inline(need(urodziny.pakiety_naglowek, "urodziny: nagłówek pakietów"), "span")}</h3>`, `<p>${inline(urodziny.pakiety_tekst)}</p>`], "</div>"),
      wrap(
        `<div class="bday-phone-box">`,
        [
          `<span>Rezerwacja urodzin</span>`,
          `<a class="bday-phone-box__tel" href="tel:${tel(telUrodziny)}">${esc(telUrodziny)}</a>`,
          `<a class="btn btn--yellow" href="${esc(asset(urodziny.oswiadczenie, "urodziny: oświadczenie rodzica").href)}" download>Oświadczenie rodzica (PDF)</a>`,
        ],
        "</div>",
      ),
    ].join("\n"),
  "urodziny-naglowek": () => `<h3>${attractions.length} ${attractionsWord(attractions.length)} w 2 godziny</h3>`,
  "urodziny-atrakcje": () => attractions.map(birthdayCard).join("\n"),
  "cennik-karty": () => (cennik.karty_sportowe ?? []).map((k) => `<li>${esc(k)}</li>`).join("\n"),
  cennik: () => need(cennik.cenniki, "cennik").map(priceBox).join("\n\n"),
  promocje: () =>
    promoList.length
      ? promoList
          .map((promo, i) =>
            wrap(
              `<article class="promo-card" style="--i:${i}">`,
              [`<span class="promo-card__badge">${esc(promo.etykieta)}</span>`, `<h3>${esc(promo.tytul)}</h3>`, `<p>${inline(promo.tekst)}</p>`],
              "</article>",
            ),
          )
          .join("\n")
      : `<p>Aktualnie nie mamy promocji — zapytaj w recepcji o bieżące oferty.</p>`,
  formularze: () => need(formularze.dokumenty, "formularze").map(documentLink).join("\n"),
  galeria: () => need(galeria.grupy, "galeria").map(galleryGroup).join("\n"),
  wideo: () => (wideo.filmy ?? []).map(videoCard).join("\n"),
  faq: () =>
    need(faq.pytania, "FAQ")
      .map((item, i) =>
        wrap(`<details class="faq-item" style="--i:${i}"${i === 0 ? " open" : ""}>`, [`<summary>${esc(item.pytanie)}</summary>`, `<p>${inline(item.odpowiedz)}</p>`], "</details>"),
      )
      .join("\n"),
  slowniczek: () => (faq.slowniczek ?? []).map((t) => `<div><dt>${esc(t.termin)}</dt><dd>${inline(t.definicja)}</dd></div>`).join("\n"),
  infolinia: () => `<h2>Infolinia <a href="tel:${tel(infolinia)}">${esc(infolinia)}</a></h2>`,
  "infolinia-przycisk": () => `<a class="btn btn--yellow" href="tel:${tel(infolinia)}">${ico("phone")} Zadzwoń</a>`,
};

// ---------- podmiana bloków ----------

const BLOCK = /^([ \t]*)<!-- cms:([a-z0-9-]+) -->\n[\s\S]*?^[ \t]*<!-- \/cms:\2 -->/gm;

let changed = 0;
for (const page of PAGES) {
  const file = path.join(ROOT, page);
  const original = readFileSync(file, "utf8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const html = original.replace(/\r\n/g, "\n").replace(BLOCK, (_, indent, name) => {
    const render = BLOCKS[name];
    if (!render) throw new Error(`${page}: nieznany blok <!-- cms:${name} -->`);
    return `${indent}<!-- cms:${name} -->\n${nest(render(), indent.length)}\n${indent}<!-- /cms:${name} -->`;
  });
  const output = html.replace(/\n/g, eol);
  if (output !== original) {
    writeFileSync(file, output);
    changed++;
    console.log(`zaktualizowano ${page}`);
  }
}
console.log(changed ? `Gotowe — zmienione pliki: ${changed}.` : "Gotowe — bez zmian.");
