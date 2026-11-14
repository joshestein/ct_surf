import { minutesInto, toMinutes } from "./time.ts";
import type { ForecastDay, Slot, Tide, WindState } from "./types.ts";

type Tone = "poor" | "fair" | "good" | "great";

export function tone(rating: number): Tone {
  return rating >= 7 ? "great" : rating >= 5 ? "good" : rating >= 3 ? "fair" : "poor";
}

/**
 * From this speed, wind from any direction is flagged. The Rating already counts wind,
 * so the page shows no other wind colour.
 */
export const STRONG_WIND_KMH = 30;

export const isStrongWind = (speed: number) => speed >= STRONG_WIND_KMH;

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** Clockwise degrees from north of a compass point such as "SSE" */
export function compassDegrees(point: string): number | null {
  const i = COMPASS.indexOf(point);
  return i < 0 ? null : i * 22.5;
}

export const WIND_LABEL: Record<WindState, string> = {
  glassy: "Glassy",
  "off-shore": "Offshore",
  "cross-offshore": "Cross-offshore",
  "cross-shore": "Cross-shore",
  "cross-onshore": "Cross-onshore",
  "on-shore": "Onshore",
};

/** The tide chart spans 04:00 to 20:00 of one day */
export const CHART_FROM = 4 * 60;
export const CHART_TO = 20 * 60;

/** Position (0 to 100) of a minute-of-day on the tide chart */
export const chartX = (minutes: number) => Math.round(((minutes - CHART_FROM) / (CHART_TO - CHART_FROM)) * 1000) / 10;

/** Half a tidal cycle. Pads the curve before the first and after the last known tide. */
const HALF_CYCLE_MIN = 372;

/**
 * Tide level from 0 (low) to 1 (high) at a minute-of-day of `date`. A cosine between consecutive tides: the page
 * gives only the turning points, and this shape is close enough to read the trend.
 */
export function tideLevel(tides: Tide[], date: string): (minutes: number) => number {
  const turns = tides.map((t) => ({ m: minutesInto(date, t.time), v: t.type === "high" ? 1 : 0 }));
  const first = turns[0];
  const last = turns.at(-1);
  if (!first || !last) return () => 0.5;
  turns.unshift({ m: first.m - HALF_CYCLE_MIN, v: 1 - first.v });
  turns.push({ m: last.m + HALF_CYCLE_MIN, v: 1 - last.v });
  return (minutes) => {
    for (let i = 0; i < turns.length - 1; i++) {
      const a = turns[i]!;
      const b = turns[i + 1]!;
      if (minutes >= a.m && minutes <= b.m) {
        const f = (minutes - a.m) / (b.m - a.m);
        return a.v + ((b.v - a.v) * (1 - Math.cos(Math.PI * f))) / 2;
      }
    }
    return 0.5;
  };
}

/** Surf Window of `day` in minutes since local midnight. See CONTEXT.md "Surf Window". */
export function surfWindow(day: ForecastDay): { from: number; to: number } {
  return { from: toMinutes(day.sunrise) - 60, to: toMinutes(day.sunset) };
}

/** The latest page steps 3 hours, so a Slot within 3 hours of each end means it covers the whole Surf Window */
const FINE_STEP_MIN = 180;

/**
 * The Slots shown on one day, at one resolution for every Spot: 3-hourly when every Spot with data has them across
 * the whole Surf Window of `day`, else AM and PM. One list per Spot, null for a Spot without that day.
 * See CONTEXT.md "Slot" and "Surf Window".
 */
export function chooseSlots(day: ForecastDay, spotDays: (ForecastDay | null)[]): (Slot[] | null)[] {
  const { from, to } = surfWindow(day);
  const within = (lo: number, hi: number) => (s: Slot) => {
    const m = minutesInto(day.date, s.time);
    return m >= lo && m <= hi;
  };
  const inWindow = within(from, to);
  const covers = (d: ForecastDay) =>
    d.fine.some(within(from, from + FINE_STEP_MIN - 1)) && d.fine.some(within(to - FINE_STEP_MIN + 1, to));
  const fine = spotDays.every((d) => d === null || covers(d));
  return spotDays.map((d) => d && (fine ? d.fine : d.coarse).filter(inWindow));
}
