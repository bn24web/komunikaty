"use strict";

const SELECTORS = {
  loadSlots: "[data-load]",
  section: ".section",
  mainHeader: ".accordion-header",
  mainBody: ".accordion-body",
  connectionToggle: ".connection-toggle",
  connectionBody: ".accordion-subbody",
  expandableTrigger: "[data-target]",
  expandableBody: ".gastronomy-more",
  details: "details",
  detailsSummary: "summary"
};

const LANGUAGE_STORAGE_KEY = "komunikaty-language";

let interfaceReady = false;
let languageSwitchInProgress = false;

/* =========================================================
   PODSTAWOWE NARZĘDZIA
========================================================= */

function getSection(language) {
  return document.getElementById(
    language === "pl" ? "sectionPL" : "sectionEN"
  );
}

function getActiveLanguage() {
  return getSection("pl")?.classList.contains("active")
    ? "pl"
    : "en";
}

function getActiveSection() {
  return getSection(getActiveLanguage());
}

function getOtherLanguage(language = getActiveLanguage()) {
  return language === "pl" ? "en" : "pl";
}

function getSlot(element) {
  return element?.closest(".load-slot") || null;
}

function getMainBody(element) {
  return element?.closest(".accordion-body") || null;
}

function getAnnouncementKey(slot) {
  return slot?.dataset.announcement || "unknown";
}

function escapeSelector(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return CSS.escape(value);
  }

  return String(value).replace(
    /([!"#$%&'()*+,.\/:;<=>?@\[\]\\^`{|}~])/g,
    "\\$1"
  );
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function waitForNextPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function prefersReducedMotion() {
  return window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
}

/* =========================================================
   PRZEWIJANIE OTWARTEJ ZAKŁADKI DO GÓRY
========================================================= */

async function scrollOpenedControlToTop(control) {
  if (!control || !control.isConnected) {
    return;
  }

  await waitForNextPaint();

  control.scrollIntoView({
    block: "start",
    inline: "nearest",
    behavior: prefersReducedMotion()
      ? "auto"
      : "smooth"
  });
}

/* =========================================================
   USUWANIE STARYCH ELEMENTÓW ULUBIONYCH
========================================================= */

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

  root.querySelectorAll(
    ".subsection-fav-row, .summary-fav-row"
  ).forEach(element => {
    element.classList.remove(
      "subsection-fav-row",
      "summary-fav-row"
    );

    element.style.removeProperty("padding-right");
  });

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

/* =========================================================
   ŁADOWANIE PODSTRON
========================================================= */

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

async function loadSections() {
  const slots = [
    ...document.querySelectorAll(SELECTORS.loadSlots)
  ];

  await Promise.all(
    slots.map(loadSection)
  );

  removeLegacyFavorites();
}

/* =========================================================
   AUTOMATYCZNE KLUCZE SYNCHRONIZACJI PL / EN
========================================================= */

function prepareMainAccordion(slot, announcementKey) {
  const header = slot.querySelector(
    SELECTORS.mainHeader
  );

  const body = header?.nextElementSibling;

  if (!header || !body?.matches(SELECTORS.mainBody)) {
    return;
  }

  const baseKey = `announcement-${announcementKey}`;

  header.dataset.syncKey = `${baseKey}-header`;
  header.dataset.syncAnchor = `${baseKey}-header`;

  body.dataset.syncKey = `${baseKey}-body`;

  header.setAttribute("type", "button");

  header.setAttribute(
    "aria-expanded",
    String(body.classList.contains("active"))
  );
}

function prepareConnectionAccordions(
  slot,
  announcementKey
) {
  const toggles = [
    ...slot.querySelectorAll(
      SELECTORS.connectionToggle
    )
  ];

  toggles.forEach((toggle, index) => {
    const body = toggle.nextElementSibling;

    if (!body?.matches(SELECTORS.connectionBody)) {
      return;
    }

    const baseKey =
      `announcement-${announcementKey}-connection-${index}`;

    toggle.dataset.syncKey = `${baseKey}-toggle`;
    toggle.dataset.syncAnchor = `${baseKey}-toggle`;

    body.dataset.syncKey = `${baseKey}-body`;

    toggle.setAttribute("type", "button");

    toggle.setAttribute(
      "aria-expanded",
      String(body.classList.contains("active"))
    );
  });
}

function prepareExpandableBlocks(
  slot,
  announcementKey
) {
  const targets = [];
  const usedTargets = new Set();

  slot.querySelectorAll(
    SELECTORS.expandableTrigger
  ).forEach(trigger => {
    const targetId = trigger.dataset.target;

    if (!targetId || usedTargets.has(targetId)) {
      return;
    }

    const body = slot.querySelector(
      `#${escapeSelector(targetId)}`
    );

    if (!body) {
      return;
    }

    usedTargets.add(targetId);

    targets.push({
      targetId,
      body
    });
  });

  targets.forEach((item, index) => {
    const baseKey =
      `announcement-${announcementKey}-expand-${index}`;

    const triggers = [
      ...slot.querySelectorAll(
        `[data-target="${escapeSelector(item.targetId)}"]`
      )
    ];

    triggers.forEach(trigger => {
      trigger.dataset.syncKey =
        `${baseKey}-trigger`;

      trigger.dataset.syncAnchor =
        `${baseKey}-trigger`;

      trigger.setAttribute(
        "aria-expanded",
        String(item.body.classList.contains("active"))
      );
    });

    item.body.dataset.syncKey =
      `${baseKey}-body`;
  });
}

function prepareDetails(slot, announcementKey) {
  const detailsElements = [
    ...slot.querySelectorAll(SELECTORS.details)
  ];

  detailsElements.forEach((detailsElement, index) => {
    const summary = detailsElement.querySelector(
      ":scope > summary"
    );

    const baseKey =
      `announcement-${announcementKey}-details-${index}`;

    detailsElement.dataset.syncKey =
      `${baseKey}-body`;

    if (summary) {
      summary.dataset.syncKey =
        `${baseKey}-summary`;

      summary.dataset.syncAnchor =
        `${baseKey}-summary`;
    }
  });
}

function prepareLoadedContent() {
  document.querySelectorAll(
    SELECTORS.loadSlots
  ).forEach(slot => {
    const announcementKey =
      getAnnouncementKey(slot);

    slot.dataset.syncKey =
      `announcement-${announcementKey}-slot`;

    slot.dataset.syncAnchor =
      `announcement-${announcementKey}-slot`;

    prepareMainAccordion(
      slot,
      announcementKey
    );

    prepareConnectionAccordions(
      slot,
      announcementKey
    );

    prepareExpandableBlocks(
      slot,
      announcementKey
    );

    prepareDetails(
      slot,
      announcementKey
    );
  });
}

/* =========================================================
   ODPOWIEDNIKI W DRUGIM JĘZYKU
========================================================= */

function findMatchingElement(element, targetLanguage) {
  const syncKey = element?.dataset.syncKey;

  if (!syncKey) {
    return null;
  }

  return getSection(targetLanguage)?.querySelector(
    `[data-sync-key="${escapeSelector(syncKey)}"]`
  ) || null;
}

/* =========================================================
   KOTWICA WIDOKU PODCZAS ZMIANY JĘZYKA
========================================================= */

function captureViewportAnchor() {
  const section = getActiveSection();

  if (!section) {
    return null;
  }

  const referenceY =
    window.innerHeight * 0.35;

  const candidates = [
    ...section.querySelectorAll(
      "[data-sync-anchor]"
    )
  ].filter(element => {
    const rect =
      element.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0
    );
  });

  if (candidates.length === 0) {
    return null;
  }

  let chosen = null;
  let bestDistance = Infinity;

  for (const element of candidates) {
    const rect =
      element.getBoundingClientRect();

    if (
      rect.top <= referenceY &&
      rect.bottom >= referenceY
    ) {
      chosen = element;
      break;
    }

    const distance = Math.min(
      Math.abs(rect.top - referenceY),
      Math.abs(rect.bottom - referenceY)
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      chosen = element;
    }
  }

  if (!chosen) {
    return null;
  }

  const rect =
    chosen.getBoundingClientRect();

  const ratio = rect.height > 0
    ? clamp(
        (referenceY - rect.top) / rect.height,
        0,
        1
      )
    : 0;

  return {
    syncKey: chosen.dataset.syncKey,
    ratio,
    referenceY
  };
}

async function restoreViewportAnchor(
  anchor,
  targetLanguage
) {
  if (!anchor?.syncKey) {
    return;
  }

  await waitForNextPaint();

  const target = getSection(targetLanguage)?.querySelector(
    `[data-sync-key="${escapeSelector(anchor.syncKey)}"]`
  );

  if (!target) {
    return;
  }

  const rect =
    target.getBoundingClientRect();

  if (rect.height <= 0) {
    return;
  }

  const targetPoint =
    rect.top + rect.height * anchor.ratio;

  const difference =
    targetPoint - anchor.referenceY;

  if (Math.abs(difference) < 1) {
    return;
  }

  window.scrollBy({
    top: difference,
    left: 0,
    behavior: "auto"
  });
}

/* =========================================================
   USTAWIANIE STANÓW
========================================================= */

function setMainBodyState(body, isOpen) {
  if (!body) {
    return;
  }

  body.classList.toggle(
    "active",
    isOpen
  );

  const header =
    body.previousElementSibling;

  header?.setAttribute(
    "aria-expanded",
    String(isOpen)
  );
}

function setConnectionState(
  toggle,
  body,
  isOpen
) {
  toggle?.classList.toggle(
    "active",
    isOpen
  );

  body?.classList.toggle(
    "active",
    isOpen
  );

  toggle?.setAttribute(
    "aria-expanded",
    String(isOpen)
  );
}

function setExpandableState(body, isOpen) {
  if (!body) {
    return;
  }

  body.classList.toggle(
    "active",
    isOpen
  );

  body.style.display =
    isOpen ? "block" : "none";

  const bodyId = body.id;
  const slot = getSlot(body);

  if (!bodyId || !slot) {
    return;
  }

  slot.querySelectorAll(
    `[data-target="${escapeSelector(bodyId)}"]`
  ).forEach(trigger => {
    trigger.setAttribute(
      "aria-expanded",
      String(isOpen)
    );
  });
}

function setDetailsState(detailsElement, isOpen) {
  if (!detailsElement) {
    return;
  }

  if (detailsElement.open === isOpen) {
    return;
  }

  detailsElement.dataset.internalToggle = "true";
  detailsElement.open = isOpen;

  setTimeout(() => {
    delete detailsElement.dataset.internalToggle;
  }, 0);
}

/* =========================================================
   SYNCHRONIZACJA Z DRUGIM JĘZYKIEM
========================================================= */

function mirrorMainBodyState(body, isOpen) {
  const target = findMatchingElement(
    body,
    getOtherLanguage()
  );

  setMainBodyState(target, isOpen);
}

function mirrorConnectionState(
  toggle,
  body,
  isOpen
) {
  const targetLanguage =
    getOtherLanguage();

  const targetToggle =
    findMatchingElement(
      toggle,
      targetLanguage
    );

  const targetBody =
    findMatchingElement(
      body,
      targetLanguage
    );

  setConnectionState(
    targetToggle,
    targetBody,
    isOpen
  );
}

function mirrorExpandableState(body, isOpen) {
  const target = findMatchingElement(
    body,
    getOtherLanguage()
  );

  setExpandableState(
    target,
    isOpen
  );
}

function mirrorDetailsState(
  detailsElement,
  isOpen
) {
  const target = findMatchingElement(
    detailsElement,
    getOtherLanguage()
  );

  setDetailsState(
    target,
    isOpen
  );
}

/* =========================================================
   ZAMYKANIE INNYCH PODZAKŁADEK

   W jednym głównym komunikacie może być otwarta
   tylko jedna podzakładka — niezależnie od tego,
   czy jest wykonana jako details, data-target,
   czy connection-toggle.
========================================================= */

function closeOtherSubsections(
  mainBody,
  exceptElement = null
) {
  if (!mainBody) {
    return;
  }

  mainBody.querySelectorAll(
    SELECTORS.details
  ).forEach(detailsElement => {
    if (
      detailsElement === exceptElement ||
      !detailsElement.open
    ) {
      return;
    }

    setDetailsState(
      detailsElement,
      false
    );

    mirrorDetailsState(
      detailsElement,
      false
    );
  });

  mainBody.querySelectorAll(
    SELECTORS.connectionToggle
  ).forEach(toggle => {
    const body =
      toggle.nextElementSibling;

    if (
      toggle === exceptElement ||
      body === exceptElement
    ) {
      return;
    }

    if (
      !body?.matches(SELECTORS.connectionBody)
    ) {
      return;
    }

    setConnectionState(
      toggle,
      body,
      false
    );

    mirrorConnectionState(
      toggle,
      body,
      false
    );
  });

  mainBody.querySelectorAll(
    SELECTORS.expandableBody
  ).forEach(body => {
    if (body === exceptElement) {
      return;
    }

    if (
      !body.classList.contains("active") &&
      body.style.display !== "block"
    ) {
      return;
    }

    setExpandableState(
      body,
      false
    );

    mirrorExpandableState(
      body,
      false
    );
  });
}

/* =========================================================
   GŁÓWNE AKORDEONY
========================================================= */

async function toggleMainAccordion(header) {
  const body =
    header.nextElementSibling;

  if (!body?.matches(SELECTORS.mainBody)) {
    return;
  }

  const section =
    header.closest(SELECTORS.section);

  const willOpen =
    !body.classList.contains("active");

  section?.querySelectorAll(
    SELECTORS.mainBody
  ).forEach(otherBody => {
    if (otherBody === body) {
      return;
    }

    setMainBodyState(
      otherBody,
      false
    );

    mirrorMainBodyState(
      otherBody,
      false
    );
  });

  setMainBodyState(
    body,
    willOpen
  );

  mirrorMainBodyState(
    body,
    willOpen
  );

  if (willOpen) {
    await scrollOpenedControlToTop(header);
  }
}

/* =========================================================
   CONNECTION-TOGGLE
========================================================= */

async function toggleConnectionAccordion(toggle) {
  const body =
    toggle.nextElementSibling;

  if (!body?.matches(SELECTORS.connectionBody)) {
    return;
  }

  const willOpen =
    !toggle.classList.contains("active");

  if (willOpen) {
    closeOtherSubsections(
      getMainBody(toggle),
      body
    );
  }

  setConnectionState(
    toggle,
    body,
    willOpen
  );

  mirrorConnectionState(
    toggle,
    body,
    willOpen
  );

  if (willOpen) {
    await scrollOpenedControlToTop(toggle);
  }
}

/* =========================================================
   BLOKI DATA-TARGET
========================================================= */

function resolveExpandableBody(trigger) {
  const targetId =
    trigger?.dataset.target;

  if (!targetId) {
    return null;
  }

  return getSlot(trigger)?.querySelector(
    `#${escapeSelector(targetId)}`
  ) || null;
}

async function toggleExpandable(trigger) {
  const body =
    resolveExpandableBody(trigger);

  if (!body) {
    return;
  }

  const control =
    trigger.closest(".gastronomy-header") ||
    trigger;

  const willOpen =
    !body.classList.contains("active");

  if (willOpen) {
    closeOtherSubsections(
      getMainBody(trigger),
      body
    );
  }

  setExpandableState(
    body,
    willOpen
  );

  mirrorExpandableState(
    body,
    willOpen
  );

  if (willOpen) {
    await scrollOpenedControlToTop(control);
  }
}

/* =========================================================
   ELEMENTY DETAILS — KOMUNIKAT 6
========================================================= */

async function handleDetailsToggle(detailsElement) {
  if (
    detailsElement.dataset.internalToggle === "true"
  ) {
    return;
  }

  const isOpen =
    detailsElement.open;

  if (isOpen) {
    closeOtherSubsections(
      getMainBody(detailsElement),
      detailsElement
    );
  }

  mirrorDetailsState(
    detailsElement,
    isOpen
  );

  if (isOpen) {
    const summary =
      detailsElement.querySelector(
        ":scope > summary"
      );

    await scrollOpenedControlToTop(summary);
  }
}

/* =========================================================
   JĘZYK
========================================================= */

function updateLanguageControls(language) {
  const isPolish =
    language === "pl";

  const tabPL =
    document.getElementById("tabPL");

  const tabEN =
    document.getElementById("tabEN");

  const langFab =
    document.getElementById("langFab");

  tabPL?.classList.toggle(
    "active",
    isPolish
  );

  tabEN?.classList.toggle(
    "active",
    !isPolish
  );

  tabPL?.setAttribute(
    "aria-selected",
    String(isPolish)
  );

  tabEN?.setAttribute(
    "aria-selected",
    String(!isPolish)
  );

  if (tabPL) {
    tabPL.tabIndex =
      isPolish ? 0 : -1;
  }

  if (tabEN) {
    tabEN.tabIndex =
      isPolish ? -1 : 0;
  }

  if (langFab) {
    langFab.textContent =
      isPolish ? "EN" : "PL";

    langFab.setAttribute(
      "aria-label",
      isPolish
        ? "Switch to English"
        : "Przełącz na język polski"
    );
  }
}

function showLanguageSection(language) {
  const isPolish =
    language === "pl";

  const sectionPL =
    getSection("pl");

  const sectionEN =
    getSection("en");

  sectionPL?.classList.toggle(
    "active",
    isPolish
  );

  sectionEN?.classList.toggle(
    "active",
    !isPolish
  );

  if (sectionPL) {
    sectionPL.hidden = !isPolish;
  }

  if (sectionEN) {
    sectionEN.hidden = isPolish;
  }

  document.documentElement.lang =
    language;
}

async function setLanguage(
  language,
  {
    preservePosition = true,
    savePreference = true
  } = {}
) {
  if (
    languageSwitchInProgress ||
    (
      interfaceReady &&
      language === getActiveLanguage()
    )
  ) {
    return;
  }

  languageSwitchInProgress = true;

  const tabPL =
    document.getElementById("tabPL");

  const tabEN =
    document.getElementById("tabEN");

  const langFab =
    document.getElementById("langFab");

  tabPL?.setAttribute("disabled", "");
  tabEN?.setAttribute("disabled", "");
  langFab?.setAttribute("disabled", "");

  const anchor = preservePosition
    ? captureViewportAnchor()
    : null;

  document.documentElement.classList.add(
    "is-language-switching"
  );

  updateLanguageControls(language);
  showLanguageSection(language);

  if (savePreference) {
    try {
      localStorage.setItem(
        LANGUAGE_STORAGE_KEY,
        language
      );
    } catch {}
  }

  if (anchor) {
    await restoreViewportAnchor(
      anchor,
      language
    );
  } else {
    await waitForNextPaint();
  }

  document.documentElement.classList.remove(
    "is-language-switching"
  );

  tabPL?.removeAttribute("disabled");
  tabEN?.removeAttribute("disabled");
  langFab?.removeAttribute("disabled");

  languageSwitchInProgress = false;
}

/* =========================================================
   OBSŁUGA INTERFEJSU
========================================================= */

function bindInterface() {
  document.addEventListener(
    "click",
    event => {
      if (!interfaceReady) {
        return;
      }

      const expandable =
        event.target.closest(
          SELECTORS.expandableTrigger
        );

      if (expandable) {
        event.preventDefault();
        event.stopPropagation();

        toggleExpandable(expandable);
        return;
      }

      const connection =
        event.target.closest(
          SELECTORS.connectionToggle
        );

      if (connection) {
        event.preventDefault();
        event.stopPropagation();

        toggleConnectionAccordion(
          connection
        );

        return;
      }

      const header =
        event.target.closest(
          SELECTORS.mainHeader
        );

      if (header) {
        event.preventDefault();

        toggleMainAccordion(header);
      }
    }
  );

  document.addEventListener(
    "toggle",
    event => {
      const detailsElement =
        event.target;

      if (
        !detailsElement.matches?.(
          SELECTORS.details
        )
      ) {
        return;
      }

      handleDetailsToggle(
        detailsElement
      );
    },
    true
  );

  document
    .getElementById("tabPL")
    ?.addEventListener(
      "click",
      () => setLanguage("pl")
    );

  document
    .getElementById("tabEN")
    ?.addEventListener(
      "click",
      () => setLanguage("en")
    );

  document
    .getElementById("langFab")
    ?.addEventListener(
      "click",
      () => {
        setLanguage(
          getOtherLanguage()
        );
      }
    );

  document
    .querySelector(".topbar__logo")
    ?.addEventListener(
      "click",
      () => {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: prefersReducedMotion()
            ? "auto"
            : "smooth"
        });
      }
    );
}

/* =========================================================
   FONTY I OBRAZY
========================================================= */

async function waitForFonts() {
  if (!document.fonts?.ready) {
    return;
  }

  try {
    await document.fonts.ready;
  } catch {}
}

async function waitForImages() {
  const images = [
    ...document.images
  ];

  await Promise.all(
    images.map(image => {
      if (image.complete) {
        return Promise.resolve();
      }

      return new Promise(resolve => {
        image.addEventListener(
          "load",
          resolve,
          { once: true }
        );

        image.addEventListener(
          "error",
          resolve,
          { once: true }
        );
      });
    })
  );
}

function setInterfaceDisabled(disabled) {
  [
    document.getElementById("tabPL"),
    document.getElementById("tabEN"),
    document.getElementById("langFab")
  ].forEach(element => {
    if (!element) {
      return;
    }

    if (disabled) {
      element.setAttribute("disabled", "");
    } else {
      element.removeAttribute("disabled");
    }
  });
}

/* =========================================================
   START
========================================================= */

async function init() {
  setInterfaceDisabled(true);

  bindInterface();

  let savedLanguage = "pl";

  try {
    const storedLanguage =
      localStorage.getItem(
        LANGUAGE_STORAGE_KEY
      );

    if (
      storedLanguage === "pl" ||
      storedLanguage === "en"
    ) {
      savedLanguage = storedLanguage;
    }
  } catch {}

  updateLanguageControls(
    savedLanguage
  );

  showLanguageSection(
    savedLanguage
  );

  await loadSections();

  prepareLoadedContent();

  await Promise.all([
    waitForFonts(),
    waitForImages()
  ]);

  await waitForNextPaint();

  interfaceReady = true;

  setInterfaceDisabled(false);
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
