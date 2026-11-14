export type SpotId = "muizenberg" | "bigbay" | "longbeach" | "llandudno";

export type Spot = {
  id: SpotId;
  name: string;
  /** surf-forecast.com break slug. Several have a suffix because the plain name is a break elsewhere. */
  slug: string;
  /** See CONTEXT.md "Webcam" */
  webcam: string | null;
};

/** See CONTEXT.md "Wind State" */
export type WindState = "glassy" | "off-shore" | "cross-offshore" | "cross-shore" | "cross-onshore" | "on-shore";

/** See CONTEXT.md "Slot" */
export type Slot = {
  /** ISO 8601 with offset */
  time: string;
  /** true for the AM / PM Slots of later days, false for the 3-hourly ones */
  coarse: boolean;
  /** See CONTEXT.md "Rating", 0 to 10 */
  rating: number;
  /** See CONTEXT.md "Primary Swell" */
  swell: { height: number; period: number; direction: string };
  /** See CONTEXT.md "Wave Energy", kJ */
  energy: number;
  wind: { speed: number; direction: string };
  windState: WindState;
};

export type Tide = {
  /** ISO 8601 with offset */
  time: string;
  type: "high" | "low";
  /** metres */
  height: number;
};

export type ForecastDay = {
  /** "2026-11-14" in SAST */
  date: string;
  /** "05:35" in SAST */
  sunrise: string;
  sunset: string;
  /** Every 3-hourly Slot on this date, from the latest page. Empty after its last day. */
  fine: Slot[];
  /** Every AM, PM and Night Slot on this date, from the six_day page */
  coarse: Slot[];
};

export type Snapshot = {
  fetchedAt: string;
  days: ForecastDay[];
  tides: Tide[];
};

/** Server values the browser script reads from the page's #config JSON */
export type ClientConfig = {
  /** `fetchedLabel` is `fetchedAt` as SAST text, such as "Fri 13 Nov, 22:10" */
  freshness: { id: SpotId; name: string; fetchedAt: string | null; fetchedLabel: string | null }[];
  staleAfterMs: number;
  /** A Slot stays on the page until this long after its time */
  slotGraceMs: number;
  /** Viewport width (px) at which details move to the side panel */
  wideMinPx: number;
};
