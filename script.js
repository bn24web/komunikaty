"use strict";

const SELECTORS = {
  loadSlots: "[data-load]",
  mainHeader: ".accordion-header",
  mainBody: ".accordion-body",
  connectionToggle: ".connection-toggle",
  connectionBody: ".accordion-subbody",
  gastronomyPlus: ".gastronomy-plus"
};

/*
  Usuwa pozostałości po mechanizmie ulubionych,
  gdyby stare gwiazdki nadal znajdowały się
  w którejś podstronie HTML.
*/
function removeLegacyFavorites(root = document) {
  root.querySelectorAll([
    ".favorite-star",
    ".subsection-favorite-star",
    ".favorite-shortcut",
    ".favorites-list",
    ".favorites-toggle",
    ".tools-panel",
    ".search-box",
    ".search-input",
    "[data-favorite]",
    "[data-fav-id]"
  ].join(",")).forEach(element => {
    element.remove();
  });

  root.querySelectorAll(".subsection-fav-row, .summary-fav-row").forEach(element => {
    element.classList.remove(
      "subsection-fav-row",
      "summary-fav-row"
    );

    element.style.removeProperty("padding-right");
  });

  /*
    Usuwa samodzielne znaki gwiazdek,
    ale nie ingeruje w normalny tekst komunikatów.
  */
  root.querySelectorAll("button, span").forEach(element => {
    const text = element.textContent.trim();

    if (
      (text === "☆" || text === "★") &&
      element.children.length === 0
    ) {
      element.remove();
    }
  });
}

/*
  Ładowanie pojedynczej podstrony.
*/
async function loadSection(slot) {
  if (slot.dataset.loaded === "true") {
    return;
  }

  const url = slot.dataset.load;

  try {
    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    slot.innerHTML = await response.text();
    slot.dataset.loaded = "true";

    removeLegacyFavorites(slot);
  } catch (error) {
    console.error(`Błąd ładowania ${url}:`, error);

    slot.innerHTML = `
      <p class="load-error">
        Nie udało się wczytać komunikatu.
      </p>
    `;
  }
}

/*
  Równoległe ładowanie wszystkich komunikatów.
*/
async function loadSections() {
  const slots = [
    ...document.querySelectorAll(SELECTORS.loadSlots)
  ];

  await Promise.all(
    slots.map(loadSection)
  );

  removeLegacyFavorites();
}

/*
  Zamknięcie innych głównych akordeonów.
*/
function closeOtherMainAccordions(currentBody) {
  document.querySelectorAll(SELECTORS.mainBody).forEach(body => {
    if (body !== currentBody) {
      body.classList.remove("active");

      const previousHeader = body.previousElementSibling;

      if (previousHeader) {
        previousHeader.setAttribute(
          "aria-expanded",
          "false"
        );
      }
    }
  });
}

/*
  Główny akordeon.
*/
function toggleMainAccordion(header) {
  const body = header.nextElementSibling;

  if (!body || !body.matches(SELECTORS.mainBody)) {
    return;
  }

  const willOpen = !body.classList.contains("active");

  closeOtherMainAccordions(body);

  body.classList.toggle("active", willOpen);

  header.setAttribute(
    "aria-expanded",
    String(willOpen)
  );
}

/*
  Podakordeon przesiadek na lotniska.
*/
function toggleConnectionAccordion(toggle) {
  const body = toggle.nextElementSibling;

  if (!body || !body.matches(SELECTORS.connectionBody)) {
    return;
  }

  const willOpen = !toggle.classList.contains("active");

  document.querySelectorAll(
    SELECTORS.connectionToggle
  ).forEach(otherToggle => {
    if (otherToggle !== toggle) {
      otherToggle.classList.remove("active");

      otherToggle.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  });

  document.querySelectorAll(
    SELECTORS.connectionBody
  ).forEach(otherBody => {
    if (otherBody !== body) {
      otherBody.classList.remove("active");
    }
  });

  toggle.classList.toggle("active", willOpen);
  body.classList.toggle("active", willOpen);

  toggle.setAttribute(
    "aria-expanded",
    String(willOpen)
  );
}

/*
  Rozwijanie sekcji gastronomicznych plusikiem.
*/
function toggleGastronomy(plus) {
  const targetId = plus.dataset.target;

  if (!targetId) {
    return;
  }

  const block = document.getElementById(targetId);

  if (!block) {
    return;
  }

  const willOpen = !block.classList.contains("active");

  block.classList.toggle("active", willOpen);
  block.style.display = willOpen ? "block" : "none";

  plus.setAttribute(
    "aria-expanded",
    String(willOpen)
  );
}

/*
  Przełączanie języka.
*/
function setLanguage(
  language,
  { scrollToTop = false } = {}
) {
  const isPolish = language === "pl";

  const tabPL = document.getElementById("tabPL");
  const tabEN = document.getElementById("tabEN");
  const sectionPL = document.getElementById("sectionPL");
  const sectionEN = document.getElementById("sectionEN");
  const langFab = document.getElementById("langFab");

  tabPL.classList.toggle("active", isPolish);
  tabEN.classList.toggle("active", !isPolish);

  tabPL.setAttribute(
    "aria-selected",
    String(isPolish)
  );

  tabEN.setAttribute(
    "aria-selected",
    String(!isPolish)
  );

  tabPL.tabIndex = isPolish ? 0 : -1;
  tabEN.tabIndex = isPolish ? -1 : 0;

  sectionPL.classList.toggle("active", isPolish);
  sectionEN.classList.toggle("active", !isPolish);

  sectionPL.hidden = !isPolish;
  sectionEN.hidden = isPolish;

  document.documentElement.lang = isPolish
    ? "pl"
    : "en";

  langFab.textContent = isPolish
    ? "EN"
    : "PL";

  langFab.setAttribute(
    "aria-label",
    isPolish
      ? "Switch to English"
      : "Przełącz na język polski"
  );

  try {
    localStorage.setItem(
      "komunikaty-language",
      language
    );
  } catch {}

  if (scrollToTop) {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
}

/*
  Obsługa kliknięć.
*/
function bindInterface() {
  document.addEventListener("click", event => {
    const header = event.target.closest(
      SELECTORS.mainHeader
    );

    if (header) {
      toggleMainAccordion(header);
      return;
    }

    const connection = event.target.closest(
      SELECTORS.connectionToggle
    );

    if (connection) {
      toggleConnectionAccordion(connection);
      return;
    }

    const plus = event.target.closest(
      SELECTORS.gastronomyPlus
    );

    if (plus) {
      event.preventDefault();
      event.stopPropagation();

      toggleGastronomy(plus);
    }
  });

  document.getElementById("tabPL").addEventListener(
    "click",
    () => setLanguage("pl")
  );

  document.getElementById("tabEN").addEventListener(
    "click",
    () => setLanguage("en")
  );

  document.getElementById("langFab").addEventListener(
    "click",
    () => {
      const polishSectionActive = document
        .getElementById("sectionPL")
        .classList
        .contains("active");

      const nextLanguage = polishSectionActive
        ? "en"
        : "pl";

      setLanguage(nextLanguage, {
        scrollToTop: true
      });
    }
  );

  document
    .querySelector(".topbar__logo")
    ?.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
}

/*
  Start aplikacji.
*/
async function init() {
  bindInterface();

  let savedLanguage = "pl";

  try {
    const stored = localStorage.getItem(
      "komunikaty-language"
    );

    if (stored === "pl" || stored === "en") {
      savedLanguage = stored;
    }
  } catch {}

  setLanguage(savedLanguage);

  await loadSections();
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
