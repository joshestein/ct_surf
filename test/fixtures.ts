import { readFile } from "node:fs/promises";
import { buildSnapshot } from "../src/surfForecast.ts";

// Real Muizenberg pages captured on 2026-11-14 at 12:23 SAST, cut to the forecast table, without icons and with
// only the rows the parser reads.
const fixture = (name: string) => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");

export const latest = await fixture("Muizenberg-latest.html");
export const sixDay = await fixture("Muizenberg-six_day.html");
export const fetchedAt = new Date("2026-11-14T10:23:00Z");
export const snapshot = buildSnapshot(latest, sixDay, fetchedAt);

/** "05 08 11" for a list of Slots */
export const hours = (slots: { time: string }[] | null) => slots?.map((s) => s.time.slice(11, 13)).join(" ");
