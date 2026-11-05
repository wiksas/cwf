// Menu mobilne: zamknij po wyborze sekcji, klawiszu Escape lub kliknięciu poza menu.
const mobileNav = document.querySelector(".mobile-nav");

if (mobileNav) {
  mobileNav.addEventListener("click", (event) => {
    if (event.target.closest("nav a")) mobileNav.open = false;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileNav.open) {
      mobileNav.open = false;
      mobileNav.querySelector("summary").focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (mobileNav.open && !mobileNav.contains(event.target)) mobileNav.open = false;
  });
}
