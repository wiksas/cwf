# Przebudowa strony `cwf.pl` — Centrum Wspinaczkowe Forteca

> Nowa strona główna CWF w **oryginalnej identyfikacji** (żółty znak wspinacza, biel, czerń, zdjęcia z `cwf.pl`) — z porządkiem w ofercie, pełnym cennikiem w tabelach, menu mobilnym i animacjami CSS Scroll-driven.

| | |
|---|---|
| **Kategoria** | 01 — Strony internetowe |
| **Klient** | Centrum Wspinaczkowe Forteca (`cwf.pl`) |
| **Status** | `koncept` |
| **Data** | 2026-10-31 |

---

## Problem klienta (obserwacje z `cwf.pl`, 2026-10-31)

- **Oferta pokazana dwa razy pod rząd** (karuzela + 5 kolumn z tym samym tekstem), a telefony i e-maile recepcji powtórzone w stopce.
- **Cennik schowany na podstronie**, ceny jako puste linki `href="#"`, a cena wejścia po 21:00 różna na dwóch podstronach (25 zł / 30 zł).
- **Literówki w nagłówkach** — `Centrum WspinaczkoweForteca`, `WspinaczkoweURODZINY`, `wspianczkowe`, `Marszałkowki`, `SEKCJE WSPINCZKOWE`.
- **Brak bezpośredniego CTA do urodzin** — najbardziej dochodowej usługi.

---

## Rozwiązanie

Zostawiamy wszystko, po czym klienci rozpoznają Fortecę, a poprawiamy wykonanie:

| Zachowane z oryginału | Ulepszone |
|---|---|
| logo i żółty znak wspinacza, kolory `#ffca08` / `#fbb03b` / biel / czerń | jedna, uporządkowana sekcja oferty ze zdjęciami CWF |
| hero ze zdjęciem ścianki i napisem „Centrum Wspinaczkowe **Forteca**” | pełny cennik w czytelnych tabelach (kolumny: ulgowy/normalny, z kartą sportową itd.) |
| biały nagłówek z żółtym przyciskiem „Wybierz lokalizację” | menu mobilne (wcześniej brak na wąskich ekranach w koncepcie) i ikony SVG zamiast emoji |
| białe karty z cieniem i przyciski „Zobacz więcej” | sekcja urodzin z pakietami od 600 zł, galerią atrakcji i animacją tyrolki |
| 3 lokalizacje z godzinami, telefonami i e-mailami | kontakt bez duplikatów, linki „Jak dojechać” |
| filmy CWF z YouTube, FAQ i słowniczek | karty wideo z prawdziwymi tytułami filmów, pełne FAQ i słowniczek na stronie głównej |
| podstrony lokalizacji (parametry ścian, udogodnienia, galerie) | parametry ścian na kartach lokalizacji, wspólne udogodnienia, galeria 3 × 3 zdjęcia (na telefonie karuzela przesuwana palcem) |
| podstrony oferty, formularze, regulaminy, fundacja, dane firmy | fakty z podstron oferty na kartach, sekcja „Pierwsza wizyta” z formularzami, `regulaminy.html`, `fundacja.html`, dane rejestrowe w stopce |

---

## Zawartość folderu

| Plik | Opis |
|---|---|
| `index.html` | strona główna CWF (lokalizacje, oferta, urodziny, cennik, promocje, pierwsza wizyta + formularze, galeria, wideo, FAQ, kontakt) |
| `regulaminy.html` | regulaminy: Racławicka 60, wieża, Ludowa 6 i Rydlówka 32, bony upominkowe |
| `fundacja.html` | Fundacja Magnezja — cele i dane rejestrowe |
| `styles.css` | style w palecie CWF + 9 efektów CSS Scroll-driven Animations |
| `script.js` | zamykanie menu mobilnego po wyborze sekcji / Escape / kliknięciu obok |
| `assets/logo-cwf.png`, `assets/sygnet-cwf.png` | oryginalne logo z `cwf.pl` |
| `assets/sygnet.svg` | wektorowy znak CWF |
| `assets/*.jpg`, `assets/galeria/*.jpg` | oryginalne zdjęcia z `cwf.pl` (hero, sekcje, urodziny, szkoły, galerie 3 lokalizacji) |
| `assets/dokumenty/oswiadczenie-rodzicow.pdf` | oświadczenie rodziców z `cwf.pl` (wersja 2025) |

---

## Jak otworzyć

Dwuklik w `index.html`. Pełne animacje w Chrome / Edge 115+ i Safari 26+; w innych przeglądarkach strona działa statycznie. Menu mobilne sprawdzisz, zwężając okno poniżej 1080 px.

---

## Efekty scroll-driven

| Element | Efekt | Oś czasu |
|---|---|---|
| `.sd-progress` | żółty pasek postępu czytania | `scroll(root)` |
| `.site-header::after` | cień nagłówka pojawia się po zjechaniu z góry | `scroll(root)`, `0 150px` |
| `.altimeter__climber` | wysokościomierz 0–17 m (wysokość wieży CWF), od 1500 px — mieści się na marginesie | `scroll(root)` |
| `.hero__inner` | treść hero odpływa i blednie | `view()`, `exit` |
| `.sd-reveal` | wejście nagłówków sekcji | `view()` |
| `.sd-stagger > *` | kaskadowe wejście kart (lokalizacje, oferta, cennik, promocje, wideo, FAQ) | `view()` + `--i` |
| `.loc-card__sign` | znak CWF obraca się do pozycji na kartach lokalizacji | `view()` |
| `.sd-hscroll` | atrakcje urodzinowe: przyklejona scena na cały ekran (od 920 × 660 px), pionowy scroll przesuwa 6 kart ze zdjęciami z urodzin w CWF | `--bday-scroll` (`view-timeline-name`) |
| `.zipline__rider` | romb tyrolki jedzie po 30-metrowej linie razem z galerią; na telefonie — przy przewijaniu strony | `--bday-scroll` / `view()` |

Wszystkie animacje działają tylko pod `prefers-reduced-motion: no-preference` i `@supports (animation-timeline: view())`, wyłącznie na `transform` / `opacity`.

---

## Przed wdrożeniem

- [ ] Potwierdzić z klientem cenę wejścia po 21:00 — przyjęto **30 zł** z zakładki „Cennik” (edytowanej 27.02.2026); strona główna `cwf.pl` podawała 25 zł.
- [ ] Szczegóły promocji „Przyprowadź znajomego” (na `cwf.pl` brak konkretów).
- [ ] Formularz osobowy nadal leży na Google Drive klienta — warto przenieść do `assets/dokumenty/`.
- [ ] Zdjęcia w wyższej rozdzielczości / WebP z archiwum klienta.
- [ ] Self-hosting fontów Inter i Montserrat (Google Fonts przesyła IP odwiedzającego do Google — RODO).
- [ ] `og:image` i JSON-LD zakładają hosting w katalogu głównym `https://cwf.pl/`.
- [ ] Przekierowania 301 ze starych adresów WordPressa:

| Stary adres | Nowy adres |
|---|---|
| `/ludowa-6/`, `/raclawicka-60/`, `/rydlowka-32/` | `/#ludowa-6`, `/#raclawicka-60`, `/#rydlowka-32` |
| `/sekcje-wspinaczkowe-dorosli/`, `/sekcje-wspinaczkowe-dzieci/` | `/#sekcje-dorosli`, `/#sekcje-dzieci` |
| `/urodziny-dla-dzieci/` | `/#urodziny` |
| `/zajecia-wspinaczkowe-dla-szkol/`, `/zajecia-dla-osob-z-niepelnosprawnoscia/` | `/#szkoly`, `/#niepelnosprawnosc` |
| `/cennik/`, `/pytania-i-odpowiedzi/`, `/kontakt/`, `/formularze/` | `/#cennik`, `/#pytania`, `/#kontakt`, `/#formularze` |
| `/regulaminy/`, `/fundacja/` | `/regulaminy.html`, `/fundacja.html` |
| `/wp-content/uploads/2026/01/oswiadczenie-rodzicow-nowe-2025.pdf` | `/assets/dokumenty/oswiadczenie-rodzicow.pdf` |

---

## Oferta dla klienta

| Pakiet | Zakres dla CWF | Cena orientacyjna (netto) |
|---|---|---|
| **Start — nowa strona główna** | wdrożenie tej strony głównej w WordPressie, poprawki treści i cennika | **2 900 zł** |
| **Standard — cały serwis** | strona główna + 3 podstrony lokalizacji + 5 podstron oferty + cennik + FAQ, SEO lokalne | **5 400 zł** |
| **Premium — serwis + rezerwacje** | Standard + kalkulator urodzin i czat FAQ | **7 800 zł** |

---

## Argumenty sprzedażowe

1. **Klient od razu rozpozna swoją firmę** — to wciąż Forteca: to samo logo, kolory i zdjęcia.
2. **Rodzic znajdzie cenę urodzin w 5 sekund** — pakiety od 600 zł i numer `509 838 500` są na stronie głównej, bez przechodzenia do cennika.
3. **Wygodnie na telefonie** — menu mobilne, duże przyciski `tel:` i tabela cennika, która się nie rozjeżdża.
