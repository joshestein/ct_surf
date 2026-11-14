import { getText } from "./http.ts";
import { forecastUrl } from "./spots.ts";
import { HOUR, fromMinutes, localIso } from "./time.ts";
import type { ForecastDay, Slot, Snapshot, Spot, Tide, WindState } from "./types.ts";

// surf-forecast.com renders its forecast as one HTML table, one <tr data-row="..."> per variable and one <td> per
// time column. Two free pages are used:
//   /forecasts/latest           3-hourly columns for about 3 days
//   /forecasts/latest/six_day   AM (09:00), PM (15:00) and Night (21:00) columns for 7 days

const WIND_STATES: Record<string, WindState> = {
  glassy: "glassy",
  off: "off-shore",
  "cross-off": "cross-offshore",
  cross: "cross-shore",
  "cross-on": "cross-onshore",
  on: "on-shore",
};

export async function fetchSpot(spot: Spot, fetchedAt: Date): Promise<Snapshot> {
  const url = forecastUrl(spot);
  const [latest, sixDay] = await Promise.all([getText(url), getText(`${url}/six_day`)]);
  return buildSnapshot(latest, sixDay, fetchedAt);
}

export function buildSnapshot(latestHtml: string, sixDayHtml: string, fetchedAt: Date): Snapshot {
  const fineTable = readTable(latestHtml);
  const coarseTable = readTable(sixDayHtml);
  const fine = readSlots(fineTable, false);
  const coarse = readSlots(coarseTable, true);
  const sun = new Map([...readSun(fineTable), ...readSun(coarseTable)]);

  // The Surf Window and the resolution are chosen when the page is rendered, across all Spots
  const dates = [...new Set(coarseTable.columns.map((c) => c.date))];
  const days = dates.flatMap((date): ForecastDay[] => {
    const daylight = sun.get(date);
    const onDate = (s: Slot) => s.time.startsWith(date);
    return daylight ? [{ date, ...daylight, fine: fine.filter(onDate), coarse: coarse.filter(onDate) }] : [];
  });
  if (days.length === 0) throw new Error("surf-forecast: no forecast days found");

  return {
    fetchedAt: fetchedAt.toISOString(),
    days,
    tides: dedupeTides([...readTides(fineTable), ...readTides(coarseTable)]),
  };
}

type Column = { date: string; hour: number; time: string };
type Cell = { attrs: string; inner: string };
type Table = { columns: Column[]; rows: Map<string, Cell[]> };

const REQUIRED_ROWS = [
  "rating",
  "swell",
  "wave-energy",
  "wind",
  "wind-state",
  "tide-high",
  "tide-low",
  "sunrise",
  "sunset",
];

function readTable(html: string): Table {
  const rows = new Map<string, Cell[]>();
  for (const [, name, body] of html.matchAll(/<tr\b[^>]*\bdata-row="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...(body ?? "").matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)].map(([, attrs, inner]) => ({
      attrs: attrs ?? "",
      inner: inner ?? "",
    }));
    rows.set(name ?? "", cells);
  }
  const row = (name: string) => {
    const cells = rows.get(name);
    if (!cells) throw new Error(`surf-forecast: no "${name}" row`);
    return cells;
  };

  // The days row has one cell per day that spans that day's time columns
  const dates = row("days").flatMap(({ attrs }) => {
    const date = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(attrs)?.[1];
    if (!date) throw new Error("surf-forecast: day cell without data-date");
    return Array<string>(Number(/colspan="(\d+)"/.exec(attrs)?.[1] ?? 1)).fill(date);
  });
  const hours = row("time").map(({ attrs }) => Number(/data-hour="(\d+)"/.exec(attrs)?.[1] ?? NaN));
  if (hours.length === 0 || hours.length !== dates.length || hours.some(Number.isNaN)) {
    throw new Error(`surf-forecast: ${hours.length} time columns but ${dates.length} day columns`);
  }
  const columns = hours.map((hour, i) => ({ date: dates[i]!, hour, time: localIso(dates[i]!, hour * 60) }));

  for (const name of REQUIRED_ROWS) {
    const cells = row(name);
    if (cells.length !== columns.length) {
      throw new Error(`surf-forecast: "${name}" row has ${cells.length} cells, expected ${columns.length}`);
    }
  }
  return { columns, rows };
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function num(value: string | undefined, what: string): number {
  const n = Number(value);
  if (value === "" || Number.isNaN(n)) throw new Error(`surf-forecast: bad ${what} "${value}"`);
  return n;
}

function readSlots({ columns, rows }: Table, coarse: boolean): Slot[] {
  const ratings = rows.get("rating")!;
  const swells = rows.get("swell")!;
  const energies = rows.get("wave-energy")!;
  const winds = rows.get("wind")!;
  const windStates = rows.get("wind-state")!;
  return columns.map(({ time: at }, i) => {
    const rating = ratings[i]!.inner;
    const swell = swells[i]!.inner;
    const wind = winds[i]!.inner;
    const state = /wind-state--([a-z-]+)/.exec(windStates[i]!.inner)?.[1] ?? "";
    const windState = WIND_STATES[state];
    if (!windState) throw new Error(`surf-forecast: unknown wind state "${state}" at ${at}`);
    return {
      time: at,
      coarse,
      rating: num(/star-rating__rating--(\d+)/.exec(rating)?.[1], `rating at ${at}`),
      swell: {
        height: num(/data-height="([\d.]+)"/.exec(swell)?.[1], `swell height at ${at}`),
        period: num(/forecast-table__swell-period">\s*(\d+)/.exec(swell)?.[1], `swell period at ${at}`),
        direction: /<div>\s*([NESW]{1,3})\s*<\/div>/.exec(swell)?.[1] ?? "",
      },
      energy: num(text(energies[i]!.inner), `energy at ${at}`),
      wind: {
        speed: Math.round(num(/data-speed="([\d.]+)"/.exec(wind)?.[1], `wind speed at ${at}`)),
        direction: /wind-icon__letters">\s*([NESW]{1,3})/.exec(wind)?.[1] ?? "",
      },
      windState,
    };
  });
}

/** "5:43AM" -> 343, "00:03AM" -> 3, "12:32PM" -> 752 */
function clock12(value: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
  if (!m) throw new Error(`surf-forecast: bad clock time "${value}"`);
  const hour = (Number(m[1]) % 12) + (m[3]!.toUpperCase() === "PM" ? 12 : 0);
  return hour * 60 + Number(m[2]);
}

function readTides({ columns, rows }: Table): Tide[] {
  return (["high", "low"] as const).flatMap((type) =>
    rows.get(`tide-${type}`)!.flatMap(({ inner }, i) => {
      const column = columns[i]!;
      return [
        ...inner.matchAll(
          /tide-time__time[^>]*>\s*([\d:]+\s*[AP]M)\s*<\/span>\s*<span class="tide-time__height">\s*([\d.]+)/gi,
        ),
      ].map(([, clock, height]) => {
        // A column can list a tide from the next or the previous date, such as 00:03 in a 21:00 column
        const minutes = clock12(clock ?? "");
        const dayShift = Math.round((column.hour * 60 - minutes) / 1440);
        return { time: localIso(column.date, minutes + dayShift * 1440), type, height: num(height, "tide height") };
      });
    }),
  );
}

/**
 * Both pages list most tides. Keep one of each, in time order. Two tides of one type are about 12 hours apart, so
 * one type within 2 hours is the same tide, even when the two pages print a different minute.
 */
function dedupeTides(tides: Tide[]): Tide[] {
  const out: Tide[] = [];
  for (const t of tides.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    const prev = out.findLast((o) => o.type === t.type);
    if (prev && Date.parse(t.time) - Date.parse(prev.time) < 2 * HOUR) continue;
    out.push(t);
  }
  return out;
}

/** Sunrise and sunset per date. The page prints both as "5:35" and "7:25", without AM or PM. */
function readSun({ columns, rows }: Table): Map<string, { sunrise: string; sunset: string }> {
  const found = new Map<string, { sunrise?: string; sunset?: string }>();
  for (const kind of ["sunrise", "sunset"] as const) {
    rows.get(kind)!.forEach(({ inner }, i) => {
      const m = /\d{1,2}:\d{2}/.exec(text(inner));
      if (!m) return;
      const entry = found.get(columns[i]!.date) ?? {};
      entry[kind] = fromMinutes(clock12(`${m[0]}${kind === "sunset" ? "PM" : "AM"}`));
      found.set(columns[i]!.date, entry);
    });
  }
  const out = new Map<string, { sunrise: string; sunset: string }>();
  for (const [date, { sunrise, sunset }] of found) if (sunrise && sunset) out.set(date, { sunrise, sunset });
  return out;
}
