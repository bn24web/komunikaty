// ========================
// m.komunikaty — script.js v1.3.2
// Centralny silnik: ładowanie, PL/EN, akordeony, podsekcje, ulubione, szukanie
// ========================

const loadedUrls = new Set();
const loadingUrls = new Set();

const FAVORITES_KEY = "mkomunikaty_favorites_v1";

const tabPL = document.getElementById("tabPL");
const tabEN = document.getElementById("tabEN");
const sectionPL = document.getElementById("sectionPL");
const sectionEN = document.getElementById("sectionEN");
const langFab = document.getElementById("langFab");
const searchInput = document.getElementById("searchInput");
const favoritesToggle = document.getElementById("favoritesToggle");
const emptyState = document.getElementById("emptyState");

let langSwitchBusy = false;
let showFavoritesOnly = false;

let lastMainAccordionState = null;
let lastDetailsState = null;
let lastSubPanelState = null;

// ========================
// ŁADOWANIE SEKCJI
// ========================

async function loadOne(el) {
  const url = el.getAttribute("data-load");
  if (!url) return;

  if (el.dataset.loaded === "true") return;
  if (loadingUrls.has(url)) return;

  loadingUrls.add(url);
  el.dataset.loading = "true";

  try {
    const response = await fetch(url, { cache: "no-cache" });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    el.innerHTML = await response.text();
    el.dataset.loaded = "true";
    loadedUrls.add(url);

    enhanceLoadedSlot(el);
  } catch (e) {
    el.innerHTML = `<p class="load-error">Błąd ładowania: ${url}</p>`;
    console.warn("Błąd ładowania sekcji:", url, e);
  } finally {
    el.dataset.loading = "false";
    loadingUrls.delete(url);
  }
}

async function loadElements(elements) {
  const tasks = Array.from(elements).map((el) => loadOne(el));
  await Promise.allSettled(tasks);
}

async function loadSections() {
  const activeSection = document.querySelector(".section.active");
  const inactiveSections = Array.from(document.querySelectorAll(".section:not(.active)"));

  if (activeSection) {
    await loadElements(activeSection.querySelectorAll("[data-load]"));
  }

  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => {
      inactiveSections.forEach((section) => {
        loadElements(section.querySelectorAll("[data-load]"));
      });
    });
  } else {
    setTimeout(() => {
      inactiveSections.forEach((section) => {
        loadElements(section.querySelectorAll("[data-load]"));
      });
    }, 400);
  }
}

// ========================
// JĘZYK
// ========================

function getActiveLang() {
  return sectionEN && sectionEN.classList.contains("active") ? "EN" : "PL";
}

function getActiveSection() {
  return getActiveLang() === "PL" ? sectionPL : sectionEN;
}

function updateLangFabLabel() {
  if (!langFab) return;
  langFab.textContent = getActiveLang() === "PL" ? "EN" : "PL";
}

function applyLangVisualState(lang) {
  const isPL = lang === "PL";

  if (tabPL) {
    tabPL.classList.toggle("active", isPL);
    tabPL.setAttribute("aria-selected", isPL ? "true" : "false");
  }

  if (tabEN) {
    tabEN.classList.toggle("active", !isPL);
    tabEN.setAttribute("aria-selected", !isPL ? "true" : "false");
  }

  if (sectionPL) sectionPL.classList.toggle("active", isPL);
  if (sectionEN) sectionEN.classList.toggle("active", !isPL);

  document.documentElement.lang = isPL ? "pl" : "en";

  updateLangFabLabel();
}

async function setLangReady(lang) {
  applyLangVisualState(lang);

  await loadSections();

  const activeSection = lang === "PL" ? sectionPL : sectionEN;

  for (let i = 0; i < 100; i++) {
    if (activeSection && activeSection.querySelector(".accordion-header")) return;
    await sleep(40);
  }
}

async function switchLanguagePreservingPosition(nextLang) {
  if (langSwitchBusy) return;

  langSwitchBusy = true;

  if (langFab) {
    langFab.disabled = true;
    langFab.style.opacity = "0.72";
  }

  const state = captureViewportState();

  await setLangReady(nextLang);
  restoreOpenStateAfterLangSwitch(state);
  applyFilters();

  await doubleFrame();
  restoreViewportState(state);

  if (langFab) {
    langFab.disabled = false;
    langFab.style.opacity = "";
  }

  langSwitchBusy = false;
}

// ========================
// POMOCNICZE
// ========================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function doubleFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHeaderKey(text) {
  const t = (text || "").trim();
  const m = t.match(/^([0-9]+\.|[A-Z][0-9]+\.|B[0-9]+\.|C[0-9]+\.)/i);
  return m ? m[1].toUpperCase() : null;
}

function getHeaderTextWithoutFavorite(header) {
  if (!header) return "";
  const clone = header.cloneNode(true);
  clone.querySelectorAll(".favorite-star").forEach((el) => el.remove());
  return clone.textContent.trim();
}

function getSummaryTextWithoutFavorite(summary) {
  if (!summary) return "";
  const clone = summary.cloneNode(true);
  clone.querySelectorAll(".favorite-star").forEach((el) => el.remove());
  return clone.textContent.trim();
}

function getAccordionBodyFromHeader(header) {
  if (!header) return null;

  if (
    header.nextElementSibling &&
    header.nextElementSibling.classList.contains("accordion-body")
  ) {
    return header.nextElementSibling;
  }

  const row = header.closest(".accordion-title-row");
  if (
    row &&
    row.nextElementSibling &&
    row.nextElementSibling.classList.contains("accordion-body")
  ) {
    return row.nextElementSibling;
  }

  return null;
}

function findAccordionHeaderFromBody(body) {
  if (!body) return null;

  let prev = body.previousElementSibling;

  while (prev) {
    if (prev.classList && prev.classList.contains("accordion-header")) return prev;

    if (prev.classList && prev.classList.contains("accordion-title-row")) {
      const header = prev.querySelector(".accordion-header");
      if (header) return header;
    }

    prev = prev.previousElementSibling;
  }

  return null;
}

function getHeaderIndex(section, header) {
  if (!section || !header) return -1;
  const headers = Array.from(section.querySelectorAll(".accordion-header"));
  return headers.indexOf(header);
}

function findHeaderByKeyOrIndex(section, key, index) {
  if (!section) return null;

  const headers = Array.from(section.querySelectorAll(".accordion-header"));

  if (key) {
    const byKey = headers.find((h) => getHeaderKey(getHeaderTextWithoutFavorite(h)) === key);
    if (byKey) return byKey;
  }

  if (typeof index === "number" && index >= 0 && headers[index]) {
    return headers[index];
  }

  return headers[0] || null;
}

function getAnnouncementIdFromSlot(slot) {
  if (!slot) return "unknown";
  return slot.dataset.announcement || slot.getAttribute("data-load") || "unknown";
}

function clearLastOpenState() {
  lastMainAccordionState = null;
  lastDetailsState = null;
  lastSubPanelState = null;
}

function rememberMainAccordion(header) {
  if (!header) return;

  const activeSection = getActiveSection();
  const text = getHeaderTextWithoutFavorite(header);

  lastMainAccordionState = {
    lang: getActiveLang(),
    key: getHeaderKey(text),
    index: getHeaderIndex(activeSection, header),
    text: normalizeText(text)
  };
}

function rememberDetails(details) {
  if (!details) return;

  const body = details.closest(".accordion-body");
  const header = findAccordionHeaderFromBody(body);

  if (header) rememberMainAccordion(header);

  const allDetails = body ? Array.from(body.querySelectorAll("details")) : [];
  const detailsIndex = allDetails.indexOf(details);

  const group =
    details.closest(".k6-group") ||
    details.closest(".k7-group") ||
    details.parentElement;

  const groupDetails = group ? Array.from(group.querySelectorAll("details")) : allDetails;
  const groupIndex = groupDetails.indexOf(details);

  const summary = details.querySelector("summary");
  const summaryText = getSummaryTextWithoutFavorite(summary);

  lastDetailsState = {
    lang: getActiveLang(),
    id: details.id || null,
    detailsIndex,
    groupIndex,
    summaryKey: getHeaderKey(summaryText),
    summaryText: normalizeText(summaryText)
  };

  lastSubPanelState = null;
}

function rememberSubPanel(panel, triggerEl) {
  if (!panel) return;

  const body = panel.closest(".accordion-body") || triggerEl?.closest(".accordion-body");
  const header = findAccordionHeaderFromBody(body);

  if (header) rememberMainAccordion(header);

  const panels = body ? Array.from(body.querySelectorAll(".gastronomy-more, .accordion-subbody")) : [];
  const panelIndex = panels.indexOf(panel);

  lastSubPanelState = {
    lang: getActiveLang(),
    id: panel.id || null,
    panelIndex
  };

  lastDetailsState = null;
}

// ========================
// UKŁAD GWIAZDKI W PODSEKCJACH
// ========================

function applyInlineFavoriteRowLayout(row, star, trigger) {
  if (!row || !star || !trigger) return;

  row.classList.add("favorite-inline-row");

  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "flex-start";
  row.style.flexWrap = "nowrap";
  row.style.gap = row.style.gap || "0.65rem";

  const titleCandidates = Array.from(row.children).filter((child) => {
    return child !== star && child !== trigger && !child.classList.contains("favorite-star");
  });

  titleCandidates.forEach((child, index) => {
    if (index === 0) {
      child.style.flex = "1 1 auto";
      child.style.minWidth = "0";
      child.style.overflowWrap = "anywhere";
    }
  });

  star.style.flex = "0 0 auto";
  star.style.marginLeft = "auto";
  star.style.marginRight = "0";
  star.style.marginTop = "0";
  star.style.float = "none";

  trigger.style.flex = "0 0 auto";
  trigger.style.marginLeft = "0";
}

function applySummaryFavoriteLayout(summary, star) {
  if (!summary || !star) return;

  summary.classList.add("favorite-inline-summary");

  summary.style.display = "flex";
  summary.style.alignItems = "center";
  summary.style.gap = "0.65rem";

  star.style.flex = "0 0 auto";
  star.style.marginLeft = "auto";
  star.style.marginRight = "0";
  star.style.marginTop = "0";
  star.style.float = "none";
}

// ========================
// ULUBIONE
// ========================

function readFavorites() {
  try {
    const data = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(data) ? new Set(data) : new Set();
  } catch {
    return new Set();
  }
}

function writeFavorites(set) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function toggleFavorite(id) {
  if (!id) return;

  const favs = readFavorites();

  if (favs.has(id)) {
    favs.delete(id);
  } else {
    favs.add(id);
  }

  writeFavorites(favs);
  updateFavoriteStars();
  applyFilters();
}

function updateFavoriteStars() {
  const favs = readFavorites();

  document.querySelectorAll(".favorite-star[data-fav-id]").forEach((star) => {
    const id = star.dataset.favId;
    const active = favs.has(id);

    star.classList.toggle("active", active);
    star.textContent = active ? "★" : "☆";
    star.setAttribute("aria-label", active ? "Usuń z ulubionych" : "Dodaj do ulubionych");
    star.setAttribute("title", active ? "Usuń z ulubionych" : "Dodaj do ulubionych");
  });
}

function createFavoriteStar(favId) {
  const star = document.createElement("span");
  star.className = "favorite-star";
  star.dataset.favId = favId;
  star.setAttribute("role", "button");
  star.setAttribute("tabindex", "0");
  star.setAttribute("aria-label", "Dodaj do ulubionych");
  star.setAttribute("title", "Dodaj do ulubionych");
  star.textContent = "☆";
  return star;
}

function slotHasFavorite(slot) {
  if (!slot) return false;

  const favs = readFavorites();
  const stars = Array.from(slot.querySelectorAll(".favorite-star[data-fav-id]"));

  return stars.some((star) => favs.has(star.dataset.favId));
}

document.addEventListener("click", function (e) {
  const star = e.target.closest(".favorite-star[data-fav-id]");
  if (!star) return;

  e.preventDefault();
  e.stopPropagation();

  toggleFavorite(star.dataset.favId);
});

document.addEventListener("keydown", function (e) {
  const star = e.target.closest?.(".favorite-star[data-fav-id]");
  if (!star) return;

  if (e.key !== "Enter" && e.key !== " ") return;

  e.preventDefault();
  e.stopPropagation();

  toggleFavorite(star.dataset.favId);
});

// ========================
// ULEPSZANIE ZAŁADOWANYCH KOMUNIKATÓW
// ========================

function enhanceLoadedSlot(slot) {
  if (!slot || slot.dataset.enhanced === "true") return;

  const announcementId = getAnnouncementIdFromSlot(slot);

  enhanceMainHeaders(slot, announcementId);
  enhanceDetails(slot, announcementId);
  enhanceGastronomyPanels(slot, announcementId);
  enhanceConnectionToggles(slot, announcementId);

  slot.dataset.enhanced = "true";

  updateFavoriteStars();
  applyFilters();
}

function enhanceMainHeaders(slot, announcementId) {
  const headers = Array.from(slot.querySelectorAll(".accordion-header"));

  headers.forEach((header, index) => {
    if (header.dataset.enhanced === "true") return;

    const favId = `ann:${announcementId}:main:${index}`;
    const star = createFavoriteStar(favId);

    header.appendChild(star);
    header.dataset.enhanced = "true";
    header.dataset.favId = favId;
  });
}

function enhanceDetails(slot, announcementId) {
  const detailsList = Array.from(slot.querySelectorAll("details"));

  detailsList.forEach((details, index) => {
    const summary = details.querySelector("summary");
    if (!summary || summary.dataset.enhanced === "true") return;

    const favId = `ann:${announcementId}:details:${index}`;
    const star = createFavoriteStar(favId);

    summary.appendChild(star);
    applySummaryFavoriteLayout(summary, star);

    summary.dataset.enhanced = "true";
    summary.dataset.favId = favId;
  });
}

function enhanceGastronomyPanels(slot, announcementId) {
  const panels = Array.from(slot.querySelectorAll(".gastronomy-more"));

  panels.forEach((panel, index) => {
    if (panel.dataset.favEnhanced === "true") return;

    const id = panel.id;
    if (!id) return;

    const trigger = slot.querySelector(`.gastronomy-plus[data-target="${CSS.escape(id)}"]`);
    if (!trigger) return;

    const favId = `ann:${announcementId}:panel:${index}`;
    const star = createFavoriteStar(favId);

    star.classList.add("favorite-star--small");

    const row =
      trigger.closest(".gastronomy-header") ||
      trigger.closest(".k7-pill") ||
      trigger.closest(".k8-pill") ||
      trigger.closest(".k9-pill") ||
      trigger.closest(".misc-pill") ||
      trigger.parentElement;

    if (row) {
      row.classList.add("subsection-fav-row");

      const actions = document.createElement("span");
      actions.className = "subsection-actions";

      trigger.insertAdjacentElement("beforebegin", actions);
      actions.appendChild(star);
      actions.appendChild(trigger);
    } else {
      trigger.insertAdjacentElement("beforebegin", star);
    }

    panel.dataset.favEnhanced = "true";
    panel.dataset.favId = favId;
    trigger.dataset.favId = favId;
  });
}

function enhanceConnectionToggles(slot, announcementId) {
  const toggles = Array.from(slot.querySelectorAll(".connection-toggle"));

  toggles.forEach((toggle, index) => {
    if (toggle.dataset.enhanced === "true") return;

    const favId = `ann:${announcementId}:connection:${index}`;
    const star = createFavoriteStar(favId);

    toggle.appendChild(star);
    toggle.dataset.enhanced = "true";
    toggle.dataset.favId = favId;
  });
}

// ========================
// WYSZUKIWANIE I FILTRY
// ========================

function getSearchQuery() {
  return normalizeText(searchInput ? searchInput.value : "");
}

function slotMatchesSearch(slot, query) {
  if (!query) return true;

  const text = normalizeText(slot.textContent || "");
  return text.includes(query);
}

function applyFilters() {
  const activeSection = getActiveSection();
  if (!activeSection) return;

  const query = getSearchQuery();
  const slots = Array.from(activeSection.querySelectorAll(".load-slot"));

  let visibleCount = 0;

  slots.forEach((slot) => {
    const loaded = slot.dataset.loaded === "true";

    if (!loaded) {
      slot.hidden = false;
      visibleCount++;
      return;
    }

    const matchesSearch = slotMatchesSearch(slot, query);
    const matchesFavorite = !showFavoritesOnly || slotHasFavorite(slot);

    const visible = matchesSearch && matchesFavorite;

    slot.hidden = !visible;

    if (visible) visibleCount++;
  });

  if (emptyState) {
    emptyState.hidden = visibleCount > 0;
  }
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    applyFilters();
  });
}

if (favoritesToggle) {
  favoritesToggle.addEventListener("click", () => {
    showFavoritesOnly = !showFavoritesOnly;

    favoritesToggle.classList.toggle("active", showFavoritesOnly);
    favoritesToggle.setAttribute("aria-pressed", showFavoritesOnly ? "true" : "false");
    favoritesToggle.textContent = showFavoritesOnly ? "★ Ulubione" : "☆ Ulubione";

    applyFilters();
  });
}

// ========================
// GŁÓWNE AKORDEONY
// ========================

document.addEventListener("click", function (e) {
  if (e.target.closest(".favorite-star")) return;

  const btn = e.target.closest(".accordion-header");
  if (!btn) return;

  const body = getAccordionBodyFromHeader(btn);
  if (!body || !body.classList.contains("accordion-body")) return;

  e.preventDefault();

  const activeSection = getActiveSection();
  const isOpen = body.classList.contains("active");

  activeSection.querySelectorAll(".accordion-body").forEach((b) => {
    if (b !== body) b.classList.remove("active");
  });

  body.classList.toggle("active", !isOpen);

  if (isOpen) {
    clearLastOpenState();
    return;
  }

  rememberMainAccordion(btn);

  lastDetailsState = null;
  lastSubPanelState = null;

  closeInnerPanels(body);
});

function closeInnerPanels(body) {
  if (!body) return;

  body.querySelectorAll(".gastronomy-more").forEach((m) => {
    m.classList.remove("active");
    m.style.display = "none";
  });

  body.querySelectorAll(".gastronomy-plus").forEach((p) => {
    p.classList.remove("active");
  });

  body.querySelectorAll(".connection-toggle").forEach((p) => {
    p.classList.remove("active");
  });

  body.querySelectorAll(".connection-toggle + .accordion-subbody").forEach((p) => {
    p.classList.remove("active");
  });
}

// ========================
// PODAKORDEON — PRZESIADKI / LOTNISKA
// ========================

document.addEventListener("click", function (e) {
  if (e.target.closest(".favorite-star")) return;

  const btn = e.target.closest(".connection-toggle");
  if (!btn) return;

  const body = btn.nextElementSibling;
  if (!body || !body.classList.contains("accordion-subbody")) return;

  e.preventDefault();

  const parentBody = btn.closest(".accordion-body") || getActiveSection();
  const parentHeader = findAccordionHeaderFromBody(parentBody);

  if (parentHeader) rememberMainAccordion(parentHeader);

  const isOpen = btn.classList.contains("active");

  parentBody.querySelectorAll(".connection-toggle").forEach((o) => {
    if (o !== btn) o.classList.remove("active");
  });

  parentBody.querySelectorAll(".connection-toggle + .accordion-subbody").forEach((b) => {
    if (b !== body) b.classList.remove("active");
  });

  btn.classList.toggle("active", !isOpen);
  body.classList.toggle("active", !isOpen);

  if (!isOpen) {
    rememberSubPanel(body, btn);
  } else {
    lastSubPanelState = null;
  }
});

// ========================
// PLUSIKI / ROZWIJANE BLOKI .gastronomy-more
// ========================

document.addEventListener("click", function (e) {
  if (e.target.closest(".favorite-star")) return;

  const plus = e.target.closest(".gastronomy-plus");
  if (!plus) return;

  const id = plus.getAttribute("data-target");
  if (!id) return;

  const block = document.getElementById(id);
  if (!block) return;

  e.preventDefault();
  e.stopPropagation();

  const root = plus.closest(".accordion-body") || document;
  const isCurrentlyActive = block.classList.contains("active");

  root.querySelectorAll(".gastronomy-more").forEach((other) => {
    other.classList.remove("active");
    other.style.display = "none";
  });

  root.querySelectorAll(".gastronomy-plus").forEach((otherPlus) => {
    otherPlus.classList.remove("active");
  });

  if (!isCurrentlyActive) {
    block.classList.add("active");
    block.style.display = "block";

    root.querySelectorAll(`.gastronomy-plus[data-target="${CSS.escape(id)}"]`).forEach((trigger) => {
      trigger.classList.add("active");
    });

    rememberSubPanel(block, plus);
  } else {
    lastSubPanelState = null;
  }
});

// ========================
// DETAILS / SUMMARY
// ========================

document.addEventListener("click", function (e) {
  if (e.target.closest(".favorite-star")) return;

  const summary = e.target.closest("summary");
  if (!summary) return;

  const details = summary.parentElement;
  if (!details || details.tagName !== "DETAILS") return;

  const body = details.closest(".accordion-body");
  if (!body) return;

  rememberDetails(details);
});

// Komunikat 6 — tylko jeden wewnętrzny akordeon naraz
document.addEventListener("click", function (e) {
  if (e.target.closest(".favorite-star")) return;

  const summary = e.target.closest("summary.k6-pill");
  if (!summary) return;

  const details = summary.parentElement;
  if (!details || details.tagName !== "DETAILS") return;

  const group = details.closest(".k6-group");
  if (!group) return;

  e.preventDefault();

  rememberDetails(details);

  const wasOpen = details.open;

  group.querySelectorAll("details.k6-details[open]").forEach((d) => {
    d.open = false;
  });

  if (!wasOpen) {
    details.open = true;
  } else {
    lastDetailsState = null;
  }
});

// ========================
// ZAPIS I ODTWARZANIE POZYCJI
// ========================

function getVisibleReferenceElement() {
  const points = [
    { x: window.innerWidth * 0.5, y: window.innerHeight * 0.38 },
    { x: window.innerWidth * 0.5, y: window.innerHeight * 0.50 },
    { x: window.innerWidth * 0.5, y: window.innerHeight * 0.62 },
    { x: window.innerWidth * 0.75, y: window.innerHeight - 160 },
    { x: window.innerWidth * 0.5, y: 120 }
  ];

  for (const p of points) {
    const x = Math.max(1, Math.min(window.innerWidth - 2, p.x));
    const y = Math.max(1, Math.min(window.innerHeight - 2, p.y));
    const el = document.elementFromPoint(x, y);

    if (el && el.closest(".section.active")) {
      return { el, x, y };
    }
  }

  return null;
}

function calculateElementRatio(el) {
  if (!el) return 0;

  const ref = getVisibleReferenceElement();
  const refY = ref ? ref.y : window.innerHeight * 0.45;

  const rect = el.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  const height = Math.max(1, rect.height);
  const refDocY = window.scrollY + refY;

  let ratio = (refDocY - top) / height;
  ratio = Math.max(0, Math.min(1, ratio));

  return ratio;
}

function findMatchingDetails(targetBody, detailsState) {
  if (!targetBody || !detailsState) return null;

  const allDetails = Array.from(targetBody.querySelectorAll("details"));
  if (!allDetails.length) return null;

  if (detailsState.summaryKey) {
    const byKey = allDetails.find((d) => {
      const summary = d.querySelector("summary");
      return getHeaderKey(getSummaryTextWithoutFavorite(summary)) === detailsState.summaryKey;
    });

    if (byKey) return byKey;
  }

  if (typeof detailsState.detailsIndex === "number" && allDetails[detailsState.detailsIndex]) {
    return allDetails[detailsState.detailsIndex];
  }

  if (detailsState.summaryText) {
    const byText = allDetails.find((d) => {
      const summary = d.querySelector("summary");
      return normalizeText(getSummaryTextWithoutFavorite(summary)) === detailsState.summaryText;
    });

    if (byText) return byText;
  }

  return null;
}

function findMatchingSubPanel(targetBody, subPanelState) {
  if (!targetBody || !subPanelState) return null;

  const panels = Array.from(targetBody.querySelectorAll(".gastronomy-more, .accordion-subbody"));
  if (!panels.length) return null;

  if (typeof subPanelState.panelIndex === "number" && panels[subPanelState.panelIndex]) {
    return panels[subPanelState.panelIndex];
  }

  if (subPanelState.id) {
    const sameId = targetBody.querySelector(`#${CSS.escape(subPanelState.id)}`);
    if (sameId) return sameId;
  }

  return null;
}

function captureViewportState() {
  const activeSection = getActiveSection();

  if (!activeSection) {
    return {
      mode: "absolute",
      scrollY: window.scrollY
    };
  }

  const openBody = activeSection.querySelector(".accordion-body.active");

  if (!openBody) {
    return {
      mode: "absolute",
      scrollY: window.scrollY
    };
  }

  const header = findAccordionHeaderFromBody(openBody);

  if (!header) {
    return {
      mode: "absolute",
      scrollY: window.scrollY
    };
  }

  const key = getHeaderKey(getHeaderTextWithoutFavorite(header));
  const index = getHeaderIndex(activeSection, header);

  let sourceDetails = null;

  if (lastDetailsState && lastDetailsState.lang === getActiveLang()) {
    sourceDetails = findMatchingDetails(openBody, lastDetailsState);
  }

  let sourcePanel = null;

  if (lastSubPanelState && lastSubPanelState.lang === getActiveLang()) {
    sourcePanel = findMatchingSubPanel(openBody, lastSubPanelState);
  }

  const ref = getVisibleReferenceElement();
  const refY = ref ? ref.y : window.innerHeight * 0.45;

  return {
    mode: "smart",
    key,
    index,
    wasOpen: true,
    bodyRatio: calculateElementRatio(openBody),
    refY,

    detailsState: lastDetailsState && lastDetailsState.lang === getActiveLang() ? lastDetailsState : null,
    detailsRatio: sourceDetails ? calculateElementRatio(sourceDetails) : 0,

    subPanelState: lastSubPanelState && lastSubPanelState.lang === getActiveLang() ? lastSubPanelState : null,
    subPanelRatio: sourcePanel ? calculateElementRatio(sourcePanel) : 0
  };
}

function restoreOpenStateAfterLangSwitch(state) {
  if (!state || state.mode !== "smart") return;

  const activeSection = getActiveSection();
  const targetHeader = findHeaderByKeyOrIndex(activeSection, state.key, state.index);

  if (!targetHeader) return;

  const targetBody = getAccordionBodyFromHeader(targetHeader);
  if (!targetBody) return;

  activeSection.querySelectorAll(".accordion-body").forEach((body) => {
    body.classList.remove("active");
  });

  targetBody.classList.add("active");

  if (state.detailsState) {
    const targetDetails = findMatchingDetails(targetBody, state.detailsState);

    if (targetDetails) {
      const group =
        targetDetails.closest(".k6-group") ||
        targetDetails.closest(".k7-group") ||
        targetDetails.parentElement;

      if (group) {
        group.querySelectorAll("details[open]").forEach((d) => {
          if (d !== targetDetails) d.open = false;
        });
      }

      targetDetails.open = true;
      lastDetailsState = state.detailsState;
      lastSubPanelState = null;
    }
  }

  if (state.subPanelState) {
    const targetPanel = findMatchingSubPanel(targetBody, state.subPanelState);

    if (targetPanel) {
      if (targetPanel.classList.contains("accordion-subbody")) {
        const toggle = targetPanel.previousElementSibling;

        targetBody.querySelectorAll(".connection-toggle").forEach((t) => t.classList.remove("active"));
        targetBody.querySelectorAll(".accordion-subbody").forEach((p) => p.classList.remove("active"));

        if (toggle && toggle.classList.contains("connection-toggle")) {
          toggle.classList.add("active");
        }

        targetPanel.classList.add("active");
      }

      if (targetPanel.classList.contains("gastronomy-more")) {
        targetBody.querySelectorAll(".gastronomy-more").forEach((p) => {
          p.classList.remove("active");
          p.style.display = "none";
        });

        targetBody.querySelectorAll(".gastronomy-plus").forEach((p) => {
          p.classList.remove("active");
        });

        targetPanel.classList.add("active");
        targetPanel.style.display = "block";

        if (targetPanel.id) {
          targetBody
            .querySelectorAll(`.gastronomy-plus[data-target="${CSS.escape(targetPanel.id)}"]`)
            .forEach((trigger) => trigger.classList.add("active"));
        }
      }

      lastSubPanelState = state.subPanelState;
      lastDetailsState = null;
    }
  }

  rememberMainAccordion(targetHeader);
}

function restoreViewportState(state) {
  if (!state) return;

  if (state.mode === "absolute") {
    window.scrollTo({
      top: Math.max(0, state.scrollY || 0),
      behavior: "instant"
    });

    return;
  }

  const activeSection = getActiveSection();
  const targetHeader = findHeaderByKeyOrIndex(activeSection, state.key, state.index);

  if (!targetHeader) return;

  const targetBody = getAccordionBodyFromHeader(targetHeader);
  if (!targetBody) return;

  const targetDetails = state.detailsState ? findMatchingDetails(targetBody, state.detailsState) : null;
  const targetPanel = state.subPanelState ? findMatchingSubPanel(targetBody, state.subPanelState) : null;

  let targetY;

  if (targetPanel) {
    const rect = targetPanel.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const height = Math.max(1, rect.height);

    targetY = top + state.subPanelRatio * height - state.refY;
  } else if (targetDetails) {
    const rect = targetDetails.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const height = Math.max(1, rect.height);

    targetY = top + state.detailsRatio * height - state.refY;
  } else if (targetBody) {
    const rect = targetBody.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const height = Math.max(1, rect.height);

    targetY = top + state.bodyRatio * height - state.refY;
  } else {
    const rect = targetHeader.getBoundingClientRect();
    targetY = rect.top + window.scrollY - 90;
  }

  window.scrollTo({
    top: Math.max(0, targetY),
    behavior: "instant"
  });
}

// ========================
// TABY I FLOATING BUTTON
// ========================

if (tabPL) {
  tabPL.addEventListener("click", async () => {
    if (getActiveLang() === "PL") return;
    await switchLanguagePreservingPosition("PL");
  });
}

if (tabEN) {
  tabEN.addEventListener("click", async () => {
    if (getActiveLang() === "EN") return;
    await switchLanguagePreservingPosition("EN");
  });
}

if (langFab) {
  langFab.addEventListener("click", async () => {
    const nextLang = getActiveLang() === "PL" ? "EN" : "PL";
    await switchLanguagePreservingPosition(nextLang);
  });
}

// ========================
// START
// ========================

updateLangFabLabel();

loadSections().then(() => {
  updateFavoriteStars();
  applyFilters();
});
