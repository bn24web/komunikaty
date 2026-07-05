"use strict";

/* =========================================================
   KOMUNIKATY PKP — SYNCHRONIZACJA PL / EN
   Wariant dobry
========================================================= */

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
let detailsClickAnchor = null;

/* =========================================================
   NARZĘDZIA
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

function getSlot(element) {
  return element?.closest(".load-slot") || null;
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

function waitForNextPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function isElementVisible(element) {
  if (!element) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight
  );
}

/* =========================================================
   CZYSZCZENIE STARYCH ULUBIONYCH
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
   AUTOMATYCZNE KLUCZE SYNCHRONIZACJI

   Klucze są tworzone osobno dla każdego komunikatu:
   - announcement-1-main
   - announcement-1-expand-0
   - announcement-6-details-2
   itd.
========================================================= */

function prepareMainAccordion(slot, announcementKey) {
  const header = slot.querySelector(SELECTORS.mainHeader);
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
  const uniqueTargets = [];
  const seenTargets = new Set();

  slot.querySelectorAll(
    SELECTORS.expandableTrigger
  ).forEach(trigger => {
    const targetId = trigger.dataset.target;

    if (
      !targetId ||
      seenTargets.has(targetId)
    ) {
      return;
    }

    const body = slot.querySelector(
      `#${escapeSelector(targetId)}`
    );

    if (!body) {
      return;
    }

    seenTargets.add(targetId);

    uniqueTargets.push({
      targetId,
      body
    });
  });

  uniqueTargets.forEach((item, index) => {
    const baseKey =
      `announcement-${announcementKey}-expand-${index}`;

    const triggers = [
      ...slot.querySelectorAll(
        `[data-target="${escapeSelector(item.targetId)}"]`
      )
    ];

    triggers.forEach(trigger => {
      trigger.dataset.syncKey = `${baseKey}-trigger`;
      trigger.dataset.syncAnchor = `${baseKey}-trigger`;

      if (
        trigger.tagName === "BUTTON" &&
        !trigger.hasAttribute("type")
      ) {
        trigger.setAttribute("type", "button");
      }

      trigger.setAttribute(
        "aria-expanded",
        String(item.body.classList.contains("active"))
      );
    });

    item.body.dataset.syncKey = `${baseKey}-body`;
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

    detailsElement.dataset.syncKey = `${baseKey}-body`;

    if (summary) {
      summary.dataset.syncKey = `${baseKey}-summary`;
      summary.dataset.syncAnchor = `${baseKey}-summary`;
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

    prepareMainAccordion(slot, announcementKey);
    prepareConnectionAccordions(
      slot,
      announcementKey
    );
    prepareExpandableBlocks(
      slot,
      announcementKey
    );
    prepareDetails(slot, announcementKey);
  });
}

/* =========================================================
   WYSZUKIWANIE ODPOWIEDNIKA W DRUGIM JĘZYKU
========================================================= */

function findMatchingElement(element, targetLanguage) {
  const syncKey = element?.dataset.syncKey;

  if (!syncKey) {
    return null;
  }

  const targetSection = getSection(targetLanguage);

  if (!targetSection) {
    return null;
  }

  return targetSection.querySelector(
    `[data-sync-key="${escapeSelector(syncKey)}"]`
  );
}

/* =========================================================
   KOTWICA WIDOKU

   Zapamiętuje logiczny element widoczny mniej więcej
   na 35% wysokości ekranu oraz położenie wewnątrz niego.
========================================================= */

function captureViewportAnchor() {
  const section = getActiveSection();

  if (!section) {
    return null;
  }

  const referenceY = window.innerHeight * 0.35;

  const candidates = [
    ...section.querySelectorAll("[data-sync-anchor]")
  ].filter(element => {
    const rect = element.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0
    );
  });

  if (candidates.length === 0) {
    return null;
  }

  let chosen = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const element of candidates) {
    const rect = element.getBoundingClientRect();

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

  const rect = chosen.getBoundingClientRect();

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

  const targetSection = getSection(targetLanguage);

  const target = targetSection?.querySelector(
    `[data-sync-key="${escapeSelector(anchor.syncKey)}"]`
  );

  if (!target) {
    return;
  }

  const rect = target.getBoundingClientRect();

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
   ZACHOWANIE POŁOŻENIA KLIKNIĘTEGO ELEMENTU
========================================================= */

function captureElementPosition(element) {
  if (!element) {
    return null;
  }

  return {
    element,
    top: element.getBoundingClientRect().top
  };
}

async function restoreElementPosition(snapshot) {
  if (!snapshot?.element?.isConnected) {
    return;
  }

  await waitForNextPaint();

  const currentTop =
    snapshot.element.getBoundingClientRect().top;

  const difference =
    currentTop - snapshot.top;

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
   SYNCHRONIZACJA STANU MIĘDZY JĘZYKAMI
========================================================= */

function mirrorMainAccordionState(
  sourceBody,
  isOpen
) {
  const targetLanguage =
    getActiveLanguage() === "pl"
      ? "en"
      : "pl";

  const targetBody = findMatchingElement(
    sourceBody,
    targetLanguage
  );

  if (!targetBody) {
    return;
  }

  const targetHeader =
    targetBody.previousElementSibling;

  targetBody.classList.toggle(
    "active",
    isOpen
  );

  if (targetHeader) {
    targetHeader.setAttribute(
      "aria-expanded",
      String(isOpen)
    );
  }
}

function mirrorConnectionState(
  sourceToggle,
  sourceBody,
  isOpen
) {
  const targetLanguage =
    getActiveLanguage() === "pl"
      ? "en"
      : "pl";

  const targetToggle = findMatchingElement(
    sourceToggle,
    targetLanguage
  );

  const targetBody = findMatchingElement(
    sourceBody,
    targetLanguage
  );

  targetToggle?.classList.toggle(
    "active",
    isOpen
  );

  targetBody?.classList.toggle(
    "active",
    isOpen
  );

  targetToggle?.setAttribute(
    "aria-expanded",
    String(isOpen)
  );
}

function mirrorExpandableState(
  sourceBody,
  isOpen
) {
  const targetLanguage =
    getActiveLanguage() === "pl"
      ? "en"
      : "pl";

  const targetBody = findMatchingElement(
    sourceBody,
    targetLanguage
  );

  if (!targetBody) {
    return;
  }

  targetBody.classList.toggle(
    "active",
    isOpen
  );

  targetBody.style.display =
    isOpen ? "block" : "none";

  const syncKey =
    sourceBody.dataset.syncKey?.replace(
      /-body$/,
      "-trigger"
    );

  if (!syncKey) {
    return;
  }

  const targetSection =
    getSection(targetLanguage);

  targetSection
    ?.querySelectorAll(
      `[data-sync-key="${escapeSelector(syncKey)}"]`
    )
    .forEach(trigger => {
      trigger.setAttribute(
        "aria-expanded",
        String(isOpen)
      );
    });
}

function mirrorDetailsState(
  sourceDetails,
  isOpen
) {
  const targetLanguage =
    getActiveLanguage() === "pl"
      ? "en"
      : "pl";

  const targetDetails = findMatchingElement(
    sourceDetails,
    targetLanguage
  );

  if (targetDetails) {
    targetDetails.open = isOpen;
  }
}

/* =========================================================
   GŁÓWNY AKORDEON
========================================================= */

async function toggleMainAccordion(header) {
  const body = header.nextElementSibling;

  if (!body?.matches(SELECTORS.mainBody)) {
    return;
  }

  const positionSnapshot =
    captureElementPosition(header);

  const section = header.closest(
    SELECTORS.section
  );

  const willOpen =
    !body.classList.contains("active");

  section
    ?.querySelectorAll(SELECTORS.mainBody)
    .forEach(otherBody => {
      if (otherBody === body) {
        return;
      }

      otherBody.classList.remove("active");

      const otherHeader =
        otherBody.previousElementSibling;

      otherHeader?.setAttribute(
        "aria-expanded",
        "false"
      );

      mirrorMainAccordionState(
        otherBody,
        false
      );
    });

  body.classList.toggle(
    "active",
    willOpen
  );

  header.setAttribute(
    "aria-expanded",
    String(willOpen)
  );

  mirrorMainAccordionState(
    body,
    willOpen
  );

  await restoreElementPosition(
    positionSnapshot
  );
}

/* =========================================================
   PODAKORDEONY CONNECTION-TOGGLE
========================================================= */

async function toggleConnectionAccordion(toggle) {
  const body = toggle.nextElementSibling;

  if (!body?.matches(SELECTORS.connectionBody)) {
    return;
  }

  const positionSnapshot =
    captureElementPosition(toggle);

  const slot = getSlot(toggle);

  const willOpen =
    !toggle.classList.contains("active");

  slot
    ?.querySelectorAll(SELECTORS.connectionToggle)
    .forEach(otherToggle => {
      if (otherToggle === toggle) {
        return;
      }

      const otherBody =
        otherToggle.nextElementSibling;

      otherToggle.classList.remove("active");

      otherToggle.setAttribute(
        "aria-expanded",
        "false"
      );

      if (
        otherBody?.matches(
          SELECTORS.connectionBody
        )
      ) {
        otherBody.classList.remove("active");

        mirrorConnectionState(
          otherToggle,
          otherBody,
          false
        );
      }
    });

  toggle.classList.toggle(
    "active",
    willOpen
  );

  body.classList.toggle(
    "active",
    willOpen
  );

  toggle.setAttribute(
    "aria-expanded",
    String(willOpen)
  );

  mirrorConnectionState(
    toggle,
    body,
    willOpen
  );

  await restoreElementPosition(
    positionSnapshot
  );
}

/* =========================================================
   ROZWIJANE BLOKI DATA-TARGET
========================================================= */

function resolveExpandableBody(trigger) {
  const targetId = trigger?.dataset.target;

  if (!targetId) {
    return null;
  }

  const slot = getSlot(trigger);

  return slot?.querySelector(
    `#${escapeSelector(targetId)}`
  ) || null;
}

async function toggleExpandable(trigger) {
  const body = resolveExpandableBody(trigger);

  if (!body) {
    return;
  }

  const positionSnapshot =
    captureElementPosition(
      trigger.closest(".gastronomy-header") ||
      trigger
    );

  const willOpen =
    !body.classList.contains("active");

  body.classList.toggle(
    "active",
    willOpen
  );

  body.style.display =
    willOpen ? "block" : "none";

  const slot = getSlot(trigger);
  const targetId = trigger.dataset.target;

  slot
    ?.querySelectorAll(
      `[data-target="${escapeSelector(targetId)}"]`
    )
    .forEach(item => {
      item.setAttribute(
        "aria-expanded",
        String(willOpen)
      );
    });

  mirrorExpandableState(
    body,
    willOpen
  );

  await restoreElementPosition(
    positionSnapshot
  );
}

/* =========================================================
   PRZEŁĄCZANIE JĘZYKA
========================================================= */

function updateLanguageControls(language) {
  const isPolish = language === "pl";

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
    tabPL.tabIndex = isPolish ? 0 : -1;
  }

  if (tabEN) {
    tabEN.tabIndex = isPolish ? -1 : 0;
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
  const isPolish = language === "pl";

  const sectionPL = getSection("pl");
  const sectionEN = getSection("en");

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
    (interfaceReady &&
      language === getActiveLanguage())
  ) {
    return;
  }

  languageSwitchInProgress = true;

  const langFab =
    document.getElementById("langFab");

  const tabPL =
    document.getElementById("tabPL");

  const tabEN =
    document.getElementById("tabEN");

  langFab?.setAttribute("disabled", "");
  tabPL?.setAttribute("disabled", "");
  tabEN?.setAttribute("disabled", "");

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

  if (preservePosition && anchor) {
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

  langFab?.removeAttribute("disabled");
  tabPL?.removeAttribute("disabled");
  tabEN?.removeAttribute("disabled");

  languageSwitchInProgress = false;
}

/* =========================================================
   OBSŁUGA KLIKNIĘĆ
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
    "pointerdown",
    event => {
      const summary =
        event.target.closest(
          SELECTORS.detailsSummary
        );

      if (!summary) {
        return;
      }

      detailsClickAnchor =
        captureElementPosition(summary);
    },
    {
      passive: true
    }
  );

  document.addEventListener(
    "toggle",
    async event => {
      const detailsElement =
        event.target;

      if (
        !detailsElement.matches?.(
          SELECTORS.details
        )
      ) {
        return;
      }

      mirrorDetailsState(
        detailsElement,
        detailsElement.open
      );

      if (detailsClickAnchor) {
        const snapshot =
          detailsClickAnchor;

        detailsClickAnchor = null;

        await restoreElementPosition(
          snapshot
        );
      }
    },
    true
  );

  document
    .getElementById("tabPL")
    ?.addEventListener(
      "click",
      () => {
        setLanguage("pl");
      }
    );

  document
    .getElementById("tabEN")
    ?.addEventListener(
      "click",
      () => {
        setLanguage("en");
      }
    );

  document
    .getElementById("langFab")
    ?.addEventListener(
      "click",
      () => {
        const nextLanguage =
          getActiveLanguage() === "pl"
            ? "en"
            : "pl";

        setLanguage(nextLanguage);
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
          behavior: "smooth"
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

/* =========================================================
   BLOKADA INTERFEJSU PODCZAS STARTU
========================================================= */

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

  /*
    Najpierw ustawiamy język bez zachowywania pozycji,
    ponieważ treść nie jest jeszcze załadowana.
  */
  updateLanguageControls(savedLanguage);
  showLanguageSection(savedLanguage);

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
