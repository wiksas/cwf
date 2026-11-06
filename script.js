// Interakcje strony CWF. Bez tego pliku strona działa w pełni (karuzele przewija się palcem / kółkiem,
// zdjęcia galerii otwierają się jako pliki), skrypt tylko dokłada wygodę.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const scrollBehavior = () => (reducedMotion.matches ? "auto" : "smooth");
const root = document.documentElement;
root.classList.add("js");

/** Blokada przewijania strony pod spodem (menu mobilne, podgląd zdjęć). */
const lock = (on) => root.classList.toggle("is-locked", on);

// ---------- Menu mobilne: zamykanie linkiem, Esc, kliknięciem obok i przyciskiem „wstecz” ----------
const mobileNav = document.querySelector(".mobile-nav");

if (mobileNav) {
  const summary = mobileNav.querySelector("summary");

  mobileNav.addEventListener("toggle", () => {
    lock(mobileNav.open);
    if (mobileNav.open) history.pushState({ menu: true }, "");
    else if (history.state?.menu) history.back();
  });

  window.addEventListener("popstate", () => {
    if (mobileNav.open) mobileNav.open = false;
  });

  mobileNav.addEventListener("click", (event) => {
    const link = event.target.closest("nav a");
    if (!link) return;
    const url = new URL(link.href);
    const target = url.pathname === location.pathname && url.hash ? document.querySelector(url.hash) : null;
    if (!target) {
      mobileNav.open = false;
      return;
    }
    // ten sam dokument: zastępujemy wpis menu w historii adresem sekcji, żeby „wstecz” nie wracało do menu
    event.preventDefault();
    history.replaceState(null, "", url.hash);
    mobileNav.open = false;
    target.scrollIntoView({ behavior: scrollBehavior() });
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileNav.open) {
      mobileNav.open = false;
      summary.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (mobileNav.open && !mobileNav.contains(event.target)) mobileNav.open = false;
  });
}

// ---------- Wyróżnienie pozycji menu dla oglądanej sekcji ----------
const navLinks = [...document.querySelectorAll(".site-nav a, .mobile-nav nav a")].filter((a) => a.hash && a.pathname === location.pathname);
const sections = [...new Set(navLinks.map((a) => document.querySelector(a.hash)).filter(Boolean))];

if (sections.length && "IntersectionObserver" in window) {
  const visible = new Set();
  const update = () => {
    const current = sections.find((s) => visible.has(s));
    for (const link of navLinks) {
      if (current && link.hash === `#${current.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  };
  // sekcja jest „bieżąca”, gdy przecina pas w połowie wysokości ekranu
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target);
      update();
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  sections.forEach((s) => observer.observe(s));
}

// ---------- Galeria atrakcji: strzałki ‹ ›, licznik i romb tyrolki jako suwak ----------
// Dwa tryby z tym samym sterowaniem:
// - scena (komputer, CSS 8. w styles.css): przewijanie strony przesuwa karty i romb, więc strzałki,
//   klawisze i przeciąganie rombu przewijają stronę do odpowiedniego miejsca sceny;
// - karuzela (telefon, ograniczony ruch, przeglądarki bez animation-timeline): przewijane są same karty.
const pinnedQuery = window.matchMedia("(prefers-reduced-motion: no-preference) and (min-width: 920px) and (min-height: 660px)");
const scrollTimelines = CSS.supports("animation-timeline: view()");

for (const track of document.querySelectorAll("[data-carousel]")) {
  const nav = document.querySelector(`[aria-controls="${track.id}"]`)?.closest(".carousel-nav");
  if (!nav) continue;
  const [prev, next] = nav.querySelectorAll(".carousel-nav__btn");
  const count = nav.querySelector(".carousel-nav__count");
  const items = [...track.children];
  const gallery = track.closest(".bday-gallery");
  const stage = gallery?.querySelector(".sd-hscroll__sticky");
  const zipline = gallery?.querySelector(".zipline");
  const rail = zipline?.querySelector(".zipline__track");
  const rider = zipline?.querySelector(".zipline__rider");
  const CABLE_TILT = Math.tan((1 * Math.PI) / 180); // lina w CSS jest obrócona o 1° wokół środka
  const RIDER_INSET = 6; // odstęp rombu od końców liny (left: 6px w CSS)
  // animation-range: contain 8% contain 92% w CSS — karty ruszają po 8% i stoją od 92% sceny
  const RANGE_START = 0.08;
  const RANGE_LENGTH = 0.84;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const pinned = () => scrollTimelines && pinnedQuery.matches && gallery?.classList.contains("sd-hscroll");
  const step = () => (items[1] ? items[1].offsetLeft - items[0].offsetLeft : track.clientWidth);
  /** Szerokość okna, w którym widać karty. */
  const visible = () => {
    if (!pinned()) return track.clientWidth;
    const style = getComputedStyle(stage);
    return stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  };
  /** Maksymalne przesunięcie kart w px (w obu trybach). */
  const travel = () => Math.max(0, (pinned() ? track.offsetWidth : track.scrollWidth) - visible());

  /** Górny „inset” osi widoku: view-timeline-inset: auto bierze scroll-padding-top strony (wysokość nagłówka). */
  const viewInset = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  /** Długość fazy „contain” sceny w px przewijania. */
  const sceneRange = () => gallery.offsetHeight - (document.documentElement.clientHeight - viewInset());
  /** Postęp sceny 0–1 z położenia strony — ta sama oś co view-timeline w CSS. */
  const sceneProgress = () => {
    const range = sceneRange();
    const raw = (viewInset() - gallery.getBoundingClientRect().top) / range;
    return range > 0 ? clamp01((raw - RANGE_START) / RANGE_LENGTH) : 0;
  };
  const offset = () => (pinned() ? sceneProgress() * travel() : track.scrollLeft);

  /** Przesuwa karty do `px` (0 … travel). */
  const goTo = (px, behavior = scrollBehavior()) => {
    const target = Math.min(travel(), Math.max(0, px));
    if (!pinned()) {
      track.scrollTo({ left: target, behavior });
      return;
    }
    const progress = travel() ? target / travel() : 0;
    const top = gallery.getBoundingClientRect().top + window.scrollY - viewInset() + (RANGE_START + progress * RANGE_LENGTH) * sceneRange();
    window.scrollTo({ top, behavior });
  };

  /** Miejsca zatrzymania: początek każdej karty i koniec galerii. */
  const stops = () => [...items.map((item) => item.offsetLeft - items[0].offsetLeft).filter((s) => s < travel() - 2), travel()];
  const nearestStop = (px) => stops().reduce((best, s) => (Math.abs(s - px) < Math.abs(best - px) ? s : best));
  const nextStop = () => stops().find((s) => s > offset() + 2) ?? travel();
  const prevStop = () => stops().findLast((s) => s < offset() - 2) ?? 0;

  const riderTravel = () => rail.clientWidth - rider.offsetWidth - 2 * RIDER_INSET;
  const riderY = (x) => (RIDER_INSET + x + rider.offsetWidth / 2 - rail.clientWidth / 2) * CABLE_TILT;

  const update = () => {
    const max = travel();
    const overflow = max > 2;
    const off = offset();
    nav.hidden = !overflow;
    gallery?.classList.toggle("has-carousel", overflow);
    const first = Math.min(items.length - 1, Math.round(off / step()));
    const lastVisible = Math.min(items.length, first + Math.max(1, Math.round(visible() / step())));
    const label = lastVisible > first + 1 ? `${first + 1}–${lastVisible} / ${items.length}` : `${first + 1} / ${items.length}`;
    count.textContent = label;
    prev.disabled = off <= 2;
    next.disabled = off >= max - 2;
    if (!rider) return;
    const progress = overflow ? clamp01(off / max) : 0;
    if (pinned()) {
      // w scenie romb prowadzi animacja CSS na tej samej osi co karty; tu tylko dokładne wymiary liny
      rider.style.transform = "";
      rider.style.setProperty("--zip-x1", `${riderTravel()}px`);
      rider.style.setProperty("--zip-y0", `${riderY(0)}px`);
      rider.style.setProperty("--zip-y1", `${riderY(riderTravel())}px`);
    } else {
      const x = progress * riderTravel();
      rider.style.transform = `translate(${x}px, ${riderY(x)}px)`;
    }
    zipline.classList.toggle("is-interactive", overflow);
    rider.tabIndex = overflow ? 0 : -1;
    rider.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    rider.setAttribute("aria-valuetext", `Atrakcje ${label.replace(" / ", " z ")}`);
  };

  let frame = 0;
  const scheduleUpdate = () => {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), update()));
  };

  prev.addEventListener("click", () => goTo(prevStop()));
  next.addEventListener("click", () => goTo(nextStop()));
  track.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("scroll", () => pinned() && scheduleUpdate(), { passive: true });
  pinnedQuery.addEventListener("change", scheduleUpdate);

  if (rider) {
    // bez JS romb jest tylko ozdobą; ze skryptem staje się suwakiem dostępnym też z klawiatury
    zipline.removeAttribute("aria-hidden");
    zipline.querySelector(".zipline__scale")?.setAttribute("aria-hidden", "true");
    rider.setAttribute("role", "slider");
    rider.setAttribute("aria-label", "Przewijanie atrakcji urodzinowych");
    rider.setAttribute("aria-controls", track.id);
    rider.setAttribute("aria-valuemin", "0");
    rider.setAttribute("aria-valuemax", "100");

    /** Pozycja wskaźnika na linie → przesunięcie kart (środek rombu pod palcem / kursorem). */
    const goToPointer = (clientX) => {
      const rect = rail.getBoundingClientRect();
      const progress = clamp01((clientX - rect.left - RIDER_INSET - rider.offsetWidth / 2) / riderTravel());
      goTo(progress * travel(), "instant");
    };

    let dragging = false;
    let restoreSnap = null;
    const startDrag = (event) => {
      if (!zipline.classList.contains("is-interactive") || event.button > 0) return;
      event.preventDefault();
      dragging = true;
      // w karuzeli przyciąganie kart wyłączone na czas przeciągania, inaczej karty szarpią
      clearTimeout(restoreSnap);
      if (!pinned()) track.style.scrollSnapType = "none";
      zipline.classList.add("is-dragging");
      rail.setPointerCapture(event.pointerId);
      rider.focus({ preventScroll: true });
      goToPointer(event.clientX);
      getSelection()?.removeAllRanges();
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      zipline.classList.remove("is-dragging");
      if (pinned()) return; // w scenie strona zostaje tam, gdzie puszczono romb
      // dojazd do najbliższej karty; przyciąganie wraca dopiero po dojechaniu —
      // przywrócone od razu cofnęłoby karuzelę do karty sprzed przeciągania
      goTo(nearestStop(track.scrollLeft));
      const resnap = () => {
        clearTimeout(restoreSnap);
        track.removeEventListener("scrollend", resnap);
        if (!dragging) track.style.scrollSnapType = "";
      };
      track.addEventListener("scrollend", resnap);
      restoreSnap = setTimeout(resnap, 700); // przeglądarki bez zdarzenia scrollend
    };

    rail.addEventListener("pointerdown", startDrag);
    rail.addEventListener("pointermove", (event) => dragging && goToPointer(event.clientX));
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);
    rail.addEventListener("lostpointercapture", endDrag);

    rider.addEventListener("keydown", (event) => {
      const keys = {
        ArrowRight: nextStop,
        ArrowDown: nextStop,
        ArrowLeft: prevStop,
        ArrowUp: prevStop,
        PageDown: () => offset() + visible(),
        PageUp: () => offset() - visible(),
        Home: () => 0,
        End: travel,
      };
      if (!(event.key in keys)) return;
      event.preventDefault();
      goTo(keys[event.key]());
    });
    new ResizeObserver(scheduleUpdate).observe(rail);
  }

  new ResizeObserver(scheduleUpdate).observe(track);
  update();
}

// ---------- Podgląd zdjęć galerii (lightbox) ----------
const galleryLinks = document.querySelectorAll("a[data-lightbox]");

if (galleryLinks.length && typeof HTMLDialogElement === "function") {
  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.setAttribute("aria-label", "Podgląd zdjęcia");
  dialog.innerHTML = `
    <div class="lightbox__bar">
      <span class="lightbox__count" aria-live="polite"></span>
      <button class="lightbox__btn lightbox__close" type="button" aria-label="Zamknij podgląd">×</button>
    </div>
    <div class="lightbox__stage">
      <img class="lightbox__img" alt="">
      <button class="lightbox__btn lightbox__prev" type="button" aria-label="Poprzednie zdjęcie">‹</button>
      <button class="lightbox__btn lightbox__next" type="button" aria-label="Następne zdjęcie">›</button>
    </div>
    <p class="lightbox__caption"></p>`;
  document.body.append(dialog);

  const image = dialog.querySelector(".lightbox__img");
  const caption = dialog.querySelector(".lightbox__caption");
  const counter = dialog.querySelector(".lightbox__count");
  const prevBtn = dialog.querySelector(".lightbox__prev");
  const nextBtn = dialog.querySelector(".lightbox__next");
  let group = [];
  let index = 0;
  let opener = null;

  const show = (i) => {
    index = Math.max(0, Math.min(group.length - 1, i));
    const link = group[index];
    const thumb = link.querySelector("img");
    image.src = link.href;
    image.alt = thumb.alt;
    image.width = thumb.width;
    image.height = thumb.height;
    caption.textContent = thumb.alt;
    counter.textContent = `${index + 1} / ${group.length}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === group.length - 1;
  };

  const open = (link) => {
    group = [...document.querySelectorAll(`a[data-lightbox="${link.dataset.lightbox}"]`)];
    opener = link;
    show(group.indexOf(link));
    dialog.showModal();
    lock(true);
    history.pushState({ lightbox: true }, "");
  };

  // zamknięcie przez ×, Esc i kliknięcie w tło przechodzi przez „wstecz”, żeby historia była spójna
  const requestClose = () => (history.state?.lightbox ? history.back() : dialog.close());

  dialog.addEventListener("close", () => {
    lock(false);
    opener?.focus();
  });
  window.addEventListener("popstate", () => {
    if (dialog.open) dialog.close();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });
  dialog.querySelector(".lightbox__close").addEventListener("click", requestClose);
  prevBtn.addEventListener("click", () => show(index - 1));
  nextBtn.addEventListener("click", () => show(index + 1));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });

  // przesunięcie palcem w bok zmienia zdjęcie (i nie jest traktowane jak kliknięcie w tło)
  let startX = null;
  let swiped = false;
  const stage = dialog.querySelector(".lightbox__stage");
  stage.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    swiped = false;
  });
  stage.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) {
      swiped = true;
      show(index + (dx < 0 ? 1 : -1));
    }
  });
  dialog.addEventListener("click", (event) => {
    if (swiped) return;
    if (event.target === dialog || event.target.classList.contains("lightbox__stage")) requestClose();
  });

  for (const link of galleryLinks) {
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      open(link);
    });
  }
}

// ---------- Wysokościomierz: przeciągnięcie rombu (albo klik w linę) przewija stronę ----------
// Romb prowadzi animacja CSS scroll(root); bez niej (ograniczony ruch, starsze przeglądarki) ustawia go skrypt.
// Element zostaje aria-hidden: to wygodny skrót dla myszy i palca, przewijanie z klawiatury działa jak zawsze.
const altimeter = document.querySelector(".altimeter");

if (altimeter) {
  const climber = altimeter.querySelector(".altimeter__climber");
  const CLIMBER_BOTTOM = 6; // bottom: 6px w CSS
  const CLIMBER_SIZE = 17;
  const TOP_GAP = 9; // romb na „17 m” kończy 9 px pod górną krawędzią (36px w keyframes sd-climb = 6 + 17 + 9 + 4 obramowania)
  const maxScroll = () => document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const travel = () => altimeter.clientHeight - CLIMBER_BOTTOM - CLIMBER_SIZE - TOP_GAP;

  const place = () => {
    if (climber.getAnimations().length) {
      climber.style.transform = "";
      return;
    }
    const progress = maxScroll() > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll())) : 0;
    climber.style.transform = `translateY(${-progress * travel()}px) rotate(45deg)`;
  };

  /** Wysokość wskaźnika na linie → położenie strony (środek rombu pod palcem / kursorem). */
  const scrollToPointer = (clientY) => {
    const bottom = altimeter.getBoundingClientRect().bottom - altimeter.clientTop - CLIMBER_BOTTOM - CLIMBER_SIZE / 2;
    const progress = Math.min(1, Math.max(0, (bottom - clientY) / travel()));
    window.scrollTo({ top: progress * maxScroll(), behavior: "instant" });
  };

  let dragging = false;
  altimeter.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    event.preventDefault();
    dragging = true;
    altimeter.classList.add("is-dragging");
    altimeter.setPointerCapture(event.pointerId);
    scrollToPointer(event.clientY);
  });
  altimeter.addEventListener("pointermove", (event) => dragging && scrollToPointer(event.clientY));
  const endDrag = () => {
    dragging = false;
    altimeter.classList.remove("is-dragging");
  };
  altimeter.addEventListener("pointerup", endDrag);
  altimeter.addEventListener("pointercancel", endDrag);
  altimeter.addEventListener("lostpointercapture", endDrag);

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), place()));
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  reducedMotion.addEventListener("change", schedule);
  place();
}

// ---------- Pasek „Zadzwoń” na telefonie chowa się przy stopce ----------
const callBar = document.querySelector(".call-bar");
const footer = document.querySelector(".site-footer");

if (callBar && footer && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => callBar.classList.toggle("is-hidden", entry.isIntersecting)).observe(footer);
}
