import { readFileSync } from "node:fs";
import { forecastUrl } from "./spots.ts";
import { HOUR, MINUTE, TIME_ZONE, clock, fromMinutes, localIso, minutesInto, toMinutes } from "./time.ts";
import type { ClientConfig, ForecastDay, Slot, Snapshot, Spot, Tide } from "./types.ts";
import {
  CHART_FROM,
  CHART_TO,
  WIND_LABEL,
  chartX,
  chooseSlots,
  compassDegrees,
  isStrongWind,
  tideLevel,
  tone,
} from "./view.ts";

// Inlined so the page stays one file that writeAtomic swaps in whole
const style = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const script = readFileSync(new URL("./client.js", import.meta.url), "utf8");

/** The timer runs every 3 hours. Older data means at least one failed fetch. */
const STALE_AFTER_HOURS = 4;
/** A Slot describes about 1.5 hours either side of its time */
const SLOT_GRACE_MIN = 90;
/** Viewport width where details move from under the row to the side panel */
const WIDE_MIN_PX = 900;
/** Swell height that fills the tide chart when a Spot is open */
const CHART_MAX_SWELL_M = 3.5;

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, ...options });
const weekdayShort = fmt({ weekday: "short" });
const weekdayLong = fmt({ weekday: "long", day: "numeric", month: "short" });
const dayOfMonth = fmt({ day: "numeric" });
const updated = fmt({
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

const noon = (date: string) => new Date(localIso(date, 12 * 60));
/** Column heading: "08:00", or "AM" / "PM" for coarse Slots */
const slotLabel = (s: Slot) => (s.coarse ? (clock(s.time) < "12:00" ? "AM" : "PM") : clock(s.time));

const ICON_CAM = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3z"/><path d="m17 10 4-2.5v9L17 14"/></svg>`;

const legend = `
  <div class="legend">
    <div class="legend-group">
      <span class="legend-title">Rating</span>
      <span><i class="sw t-poor"></i>0 to 2</span>
      <span><i class="sw t-fair"></i>3 to 4</span>
      <span><i class="sw t-good"></i>5 to 6</span>
      <span><i class="sw t-great"></i>7+</span>
    </div>
  </div>`;

/** Wind speed with an arrow that points where the wind blows to */
function windBadge(wind: Slot["wind"]): string {
  const from = compassDegrees(wind.direction);
  const arrow =
    from === null
      ? ""
      : `<svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform:rotate(${from}deg)"><path d="M5 1v8M2 6l3 3 3-3"/></svg>`;
  return `${arrow}${wind.speed}`;
}

export function render(spots: Spot[], snapshots: (Snapshot | null)[], generatedAt: Date): string {
  // The first Spot with data sets the days, columns, tides and daylight. They differ by minutes between Spots.
  const reference = snapshots.find((s) => s !== null) ?? null;
  const days = reference?.days ?? [];
  const tides = reference?.tides ?? [];

  const config: ClientConfig = {
    freshness: spots.map((s, i) => {
      const fetchedAt = snapshots[i]?.fetchedAt ?? null;
      return { id: s.id, name: s.name, fetchedAt, fetchedLabel: fetchedAt && updated.format(new Date(fetchedAt)) };
    }),
    staleAfterMs: STALE_AFTER_HOURS * HOUR,
    slotGraceMs: SLOT_GRACE_MIN * MINUTE,
    wideMinPx: WIDE_MIN_PX,
  };

  const tabs = days
    .map(({ date }) => {
      const n = noon(date);
      return `
    <button type="button" class="tab" data-day="${date}" aria-pressed="false" aria-label="${weekdayLong.format(n)}">
      <span class="tab-label"><b>${weekdayShort.format(n)}</b> <span>${dayOfMonth.format(n)}</span></span>
      <span class="mark"></span>
    </button>`;
    })
    .join("");

  const sections = days.map((day) => renderDay(day, spots, snapshots, tides)).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0F1211">
<title>Cape Town surf</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap">
<style>
${style}</style>
</head>
<body>
<div class="page">
<header>
  <h1>Cape Town surf</h1>
  <p class="updated">Updated ${updated.format(generatedAt)}</p>
</header>
<div class="stale" role="status" hidden><div class="stale-text"></div></div>
${days.length ? `<nav class="tabs" aria-label="Days">${tabs}</nav>` : ""}
<div class="layout">
  <main class="board">
${sections || `<p class="empty">No forecast data yet.</p>`}
  </main>
  <aside class="panel" aria-label="Details">
    <div class="panel-intro">
      ${legend}
    </div>
    <div class="panel-slot"></div>
  </aside>
</div>
</div>
<script type="application/json" id="config">${JSON.stringify(config).replaceAll("<", "\\u003c")}</script>
<script type="module">
${script}</script>
</body>
</html>
`;
}

/** `day` is the reference Spot's day: it sets the Surf Window, and its Slots set the columns */
function renderDay(day: ForecastDay, spots: Spot[], snapshots: (Snapshot | null)[], tides: Tide[]): string {
  const slots = chooseSlots(
    day,
    snapshots.map((s) => s?.days.find((d) => d.date === day.date) ?? null),
  );
  const columns = slots.find((s) => s !== null) ?? [];
  const label = weekdayLong.format(noon(day.date));
  const rows = spots
    .map((spot, i) =>
      renderRow(
        spot,
        label,
        columns,
        slots[i] ?? null,
        snapshots[i] ? "No forecast for this day." : "No data. The fetch failed.",
      ),
    )
    .join("");

  return `
    <section class="day" data-day="${day.date}" style="--n:${columns.length}" hidden>
      ${renderTide(day, columns, spots, slots, tides)}
      <div class="grid" role="presentation">
        <div class="grid-row grid-head"><span></span>${columns.map((s) => `<span data-time="${s.time}">${slotLabel(s)}</span>`).join("")}</div>
        ${rows}
      </div>
      ${legend}
    </section>`;
}

function renderRow(spot: Spot, dayLabel: string, columns: Slot[], slots: Slot[] | null, missing: string): string {
  const name = `<span class="spot-name"><a href="${forecastUrl(spot)}" target="_blank" rel="noopener">${escape(spot.name)}</a><span class="old">Old data</span></span>`;
  if (!slots) {
    return `
        <div class="spot-row" data-spot="${spot.id}">
          <div class="grid-row">${name}<span class="nodata">${missing}</span></div>
        </div>`;
  }

  const cells = columns
    .map((column) => {
      const s = slots.find((x) => x.time === column.time);
      if (!s) return `<span class="cell cell-empty" data-time="${column.time}">–</span>`;
      const label = `${spot.name} ${slotLabel(s)}: rating ${s.rating}, swell ${s.swell.height} m ${s.swell.period} s, wind ${WIND_LABEL[s.windState].toLowerCase()} ${s.wind.speed} km/h. Show details.`;
      return `<button type="button" class="cell t-${tone(s.rating)}${isStrongWind(s.wind.speed) ? " strong-wind" : ""}" data-time="${s.time}" data-r="${s.rating}" aria-expanded="false" aria-label="${escape(label)}"><span class="cell-main"><b>${s.rating}</b><span class="cell-swell">${s.swell.height.toFixed(1)}<small>m</small> ${s.swell.period}<small>s</small></span></span><span class="cell-wind">${windBadge(s.wind)}</span></button>`;
    })
    .join("");

  const slotRows = slots
    .map(
      (s) => `
            <div role="row" class="slot" data-time="${s.time}">
              <span role="cell" class="slot-time"><b>${slotLabel(s)}</b>${s.coarse ? `<small>${clock(s.time)}</small>` : ""}</span>
              <span role="cell"><span class="slot-r t-${tone(s.rating)}">${s.rating}</span></span>
              <span role="cell" class="slot-text"><b>${s.swell.height.toFixed(1)} m <span>${s.swell.period} s</span></b><small>${s.swell.direction}, ${s.energy} kJ</small></span>
              <span role="cell" class="slot-text"><b>${WIND_LABEL[s.windState]}</b><small>${isStrongWind(s.wind.speed) ? `<span class="strong-wind">${s.wind.speed} km/h</span>` : `${s.wind.speed} km/h`} ${s.wind.direction}</small></span>
            </div>`,
    )
    .join("");

  const webcam = spot.webcam
    ? `<div class="details-actions"><a class="webcam" href="${escape(spot.webcam)}" target="_blank" rel="noopener">${ICON_CAM}<span class="narrow-only">Webcam</span><span class="wide-only">${escape(spot.name)} webcam</span></a></div>`
    : "";

  return `
        <div class="spot-row" data-spot="${spot.id}">
          <div class="grid-row">${name}${cells}</div>
          <div class="details" data-spot="${spot.id}" hidden>
            ${webcam}
            <div role="table" class="slots" aria-label="${escape(spot.name)}, ${dayLabel}">
              <div role="row" class="slot slot-head"><span role="columnheader">Time</span><span role="columnheader">Rate</span><span role="columnheader">Swell</span><span role="columnheader">Wind</span></div>${slotRows}
            </div>
          </div>
        </div>`;
}

function renderTide(day: ForecastDay, columns: Slot[], spots: Spot[], slots: (Slot[] | null)[], tides: Tide[]): string {
  const level = tideLevel(tides, day.date);
  const points: string[] = [];
  for (let m = CHART_FROM; m <= CHART_TO; m += 15) {
    // x in 0..1000 and y in 0..72 (viewBox); high water sits 14 below the top, low water 8 above the bottom
    points.push(`${(chartX(m) * 10).toFixed(1)} ${(64 - level(m) * 50).toFixed(1)}`);
  }
  const line = `M${points.join(" L")}`;
  const dawn = Math.max(0, chartX(toMinutes(day.sunrise)) * 10);
  const dusk = Math.min(1000, chartX(toMinutes(day.sunset)) * 10);

  const events = tides
    .map((t) => ({ ...t, m: minutesInto(day.date, t.time) }))
    .filter((t) => t.m >= CHART_FROM && t.m <= CHART_TO)
    .map(
      (t) =>
        `<span class="tide-event tide-${t.type}" style="--x:${chartX(t.m)}%">${fromMinutes(t.m)}</span>`,
    )
    .join("");

  const ticks = columns
    .map((s) => {
      const x = chartX(minutesInto(day.date, s.time));
      return `<span class="tick" data-time="${s.time}" style="left:${x}%"></span><span class="tick-label" data-time="${s.time}" style="left:${x}%">${slotLabel(s)}</span>`;
    })
    .join("");

  const bars = spots
    .map((spot, i) => {
      const spotSlots = slots[i];
      if (!spotSlots) return "";
      const items = spotSlots
        .map((s) => {
          const height = Math.max(4, Math.min(100, (s.swell.height / CHART_MAX_SWELL_M) * 75));
          return `<span class="bar t-${tone(s.rating)}${s.coarse ? " bar-wide" : ""}" data-time="${s.time}" style="left:${chartX(minutesInto(day.date, s.time))}%;height:${height.toFixed(1)}%"><span class="bar-label">${s.swell.height.toFixed(1)}</span></span>`;
        })
        .join("");
      return `<div class="bars" data-spot="${spot.id}" hidden>${items}</div>`;
    })
    .join("");

  return `
      <div class="tide">
        <div class="plot">
          <svg viewBox="0 0 1000 72" preserveAspectRatio="none" aria-hidden="true">
            <rect class="night" x="0" y="0" width="${dawn.toFixed(1)}" height="72"/>
            <rect class="night" x="${dusk.toFixed(1)}" y="0" width="${(1000 - dusk).toFixed(1)}" height="72"/>
            <path class="tide-area" d="${line} L1000 72 L0 72 Z"/>
            <path class="tide-line" d="${line}"/>
          </svg>
          ${ticks}${events}${bars}
        </div>
        <div class="axis"></div>
      </div>`;
}
