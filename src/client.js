// Browser script. render.ts inlines it as a module, with a ClientConfig as JSON in #config.
// The server renders every day, Spot row, tide chart and details block. This script only removes past Slots,
// shows which data is stale, and switches what is visible.

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 */
const $ = (selector, root = document) => {
  const el = root.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`No element for ${selector}`);
  return el;
};

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 */
const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)].filter((el) => el instanceof HTMLElement);

/**
 * The cell with the highest Rating, or null
 * @param {HTMLElement[]} cells
 */
const bestCell = (cells) => {
  /** @type {HTMLElement | null} */
  let best = null;
  for (const c of cells) if (!best || Number(c.dataset.r) > Number(best.dataset.r)) best = c;
  return best;
};

/** @type {import("./types.ts").ClientConfig} */
const config = JSON.parse($("#config").textContent ?? "");
const now = Date.now();
const wide = window.matchMedia(`(min-width: ${config.wideMinPx}px)`);

// Past Slots and old data are decided once, at load. A phone can show this tab again hours later without a reload,
// so reload then: that also gets the newest forecast.
const RELOAD_AFTER_MS = 30 * 60 * 1000;
const reloadIfOld = () => {
  if (document.visibilityState === "visible" && Date.now() - now > RELOAD_AFTER_MS) location.reload();
};
document.addEventListener("visibilitychange", reloadIfOld);
window.addEventListener("pageshow", (event) => event.persisted && reloadIfOld());

// The page is rebuilt every 3 hours, so drop the Slots that have passed since
$$("[data-time]").forEach((el) => {
  if (Date.parse(el.dataset.time ?? "") + config.slotGraceMs < now) el.remove();
});

const tabs = $$(".tab");
const sections = $$(".day");
sections.forEach((section, i) => {
  const columns = $$(".grid-head [data-time]", section).length;
  const tab = tabs[i];
  if (columns === 0) {
    section.remove();
    tab?.remove();
    return;
  }
  section.style.setProperty("--n", String(columns));
  // Mark each tab in the colour of the best Rating left that day
  const best = bestCell($$(".cell[data-r]", section));
  if (tab && best) {
    const toneClass = [...best.classList].find((c) => c.startsWith("t-"));
    if (toneClass) $(".mark", tab).classList.add(toneClass);
    tab.setAttribute("aria-label", `${tab.getAttribute("aria-label")}, best rating ${best.dataset.r}`);
  }
});
const days = $$(".day");
const nav = document.querySelector(".tabs");
if (nav instanceof HTMLElement) nav.style.setProperty("--days", String(days.length));

// Stale data: a failed fetch keeps the last good Snapshot
const notes = config.freshness.flatMap(({ id, name, fetchedAt, fetchedLabel }) => {
  if (!fetchedAt) return [{ headline: `${name} has no data.`, rest: " The fetch failed." }];
  if (now - Date.parse(fetchedAt) <= config.staleAfterMs) return [];
  // The details block too: it can sit in the side panel, outside its row
  $$(`.spot-row[data-spot="${id}"], .details[data-spot="${id}"]`).forEach((el) => el.classList.add("old-data"));
  return [
    { headline: `${name} data is old.`, rest: ` The last fetch failed. You see the forecast from ${fetchedLabel}.` },
  ];
});
$(".stale").hidden = notes.length === 0;
$(".stale-text").replaceChildren(
  ...notes.map(({ headline, rest }) => {
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = headline;
    p.append(strong, rest);
    return p;
  }),
);

// Each details block returns to its own Spot row when it leaves the side panel
/** @type {Map<HTMLElement, HTMLElement>} */
const home = new Map($$(".details").map((d) => [d, /** @type {HTMLElement} */ (d.parentElement)]));
const panelSlot = $(".panel-slot");
const panelIntro = $(".panel-intro");

/** @type {{ day: string | null, spot: string | null, time: string | null }} */
const state = { day: days[0]?.dataset.day ?? null, spot: null, time: null };

/**
 * The best Slot of a Spot on a day, or null when the Spot has no Slots there
 * @param {HTMLElement} section
 * @param {string} spot
 */
function bestTime(section, spot) {
  return bestCell($$(`.spot-row[data-spot="${spot}"] .cell[data-r]`, section))?.dataset.time ?? null;
}

function apply() {
  tabs.forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.day === state.day)));
  for (const section of days) {
    const shown = section.dataset.day === state.day;
    section.hidden = !shown;
    const open = shown ? state.spot : null;

    $$(".spot-row", section).forEach((row) => {
      const rowOpen = row.dataset.spot === open;
      row.classList.toggle("open", rowOpen);
      $$(".cell[data-time]", row).forEach((cell) => {
        const on = rowOpen && cell.dataset.time === state.time;
        cell.classList.toggle("selected", on);
        if (cell instanceof HTMLButtonElement) cell.setAttribute("aria-expanded", String(on));
      });
    });
    $(".tide", section).classList.toggle("open", !!open);
    $$(".bars", section).forEach((bars) => (bars.hidden = bars.dataset.spot !== open));
    $$(".bar, .slot[data-time]", section).forEach((el) =>
      el.classList.toggle("selected", el.dataset.time === state.time),
    );
  }
  // An open details block may sit in the side panel, outside its day section, so go by its home row
  for (const [details, row] of home) {
    const isOpen = details.dataset.spot === state.spot && row.closest(".day")?.getAttribute("data-day") === state.day;
    details.hidden = !isOpen;
    const target = isOpen && wide.matches ? panelSlot : row;
    if (details.parentElement !== target) target.append(details);
  }
  panelIntro.hidden = wide.matches && !!state.spot;
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const tab = target?.closest(".tab");
  if (tab instanceof HTMLElement) {
    state.day = tab.dataset.day ?? null;
    const section = days.find((d) => d.dataset.day === state.day);
    // Keep the open Spot open, on its best Slot of the new day
    if (state.spot && section) {
      state.time = bestTime(section, state.spot);
      if (!state.time) state.spot = null;
    }
    apply();
    return;
  }
  const cell = target?.closest("button.cell");
  if (cell instanceof HTMLElement) {
    const spot = cell.closest(".spot-row")?.getAttribute("data-spot") ?? null;
    const same = spot === state.spot && cell.dataset.time === state.time;
    // Tapping the selected cell again closes the details
    state.spot = same ? null : spot;
    state.time = same ? null : (cell.dataset.time ?? null);
    apply();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.spot) {
    state.spot = null;
    state.time = null;
    apply();
  }
});

wide.addEventListener("change", apply);
apply();
