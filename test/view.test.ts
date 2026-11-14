import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { localIso, minutesInto } from "../src/time.ts";
import type { ForecastDay, Tide } from "../src/types.ts";
import { chartX, chooseSlots, compassDegrees, isStrongWind, surfWindow, tideLevel, tone } from "../src/view.ts";
import { hours, snapshot } from "./fixtures.ts";

const { days } = snapshot;

describe("time", () => {
  it("builds SAST times past midnight", () => {
    assert.equal(localIso("2026-11-14", 25 * 60 + 3), "2026-11-15T01:03:00+02:00");
  });
});

describe("view", () => {
  it("groups Ratings", () => {
    assert.deepEqual([0, 2, 3, 4, 5, 6, 7, 10].map(tone), [
      "poor",
      "poor",
      "fair",
      "fair",
      "good",
      "good",
      "great",
      "great",
    ]);
  });

  it("flags strong wind from 30 km/h", () => {
    assert.equal(isStrongWind(29), false);
    assert.equal(isStrongWind(30), true);
  });

  it("turns compass points into degrees", () => {
    assert.equal(compassDegrees("N"), 0);
    assert.equal(compassDegrees("SSE"), 157.5);
    assert.equal(compassDegrees("SW"), 225);
    assert.equal(compassDegrees(""), null);
  });

  it("places 04:00 and 20:00 at the chart edges", () => {
    assert.equal(chartX(4 * 60), 0);
    assert.equal(chartX(12 * 60), 50);
    assert.equal(chartX(20 * 60), 100);
  });

  it("draws the tide from 0 at low water to 1 at high water", () => {
    const tides: Tide[] = [
      { time: "2026-11-14T05:43:00+02:00", type: "high", height: 1.22 },
      { time: "2026-11-14T11:45:00+02:00", type: "low", height: 0.48 },
    ];
    const level = tideLevel(tides, "2026-11-14");
    assert.equal(level(5 * 60 + 43), 1);
    assert.equal(level(11 * 60 + 45), 0);
    const mid = level((5 * 60 + 43 + 11 * 60 + 45) / 2);
    assert.ok(Math.abs(mid - 0.5) < 1e-9);
  });

  it("draws a flat line with no tides", () => {
    assert.equal(tideLevel([], "2026-11-14")(600), 0.5);
  });
});

describe("chooseSlots", () => {
  it("shows 3-hourly Slots while they cover the Surf Window, then AM and PM", () => {
    assert.deepEqual(
      days.map((d) => hours(chooseSlots(d, [d])[0]!)),
      ["05 08 11 14 17", "05 08 11 14 17", "05 08 11 14 17", "09 15", "09 15", "09 15", "09 15"],
    );
  });

  it("keeps only Slots in the Surf Window", () => {
    for (const day of days) {
      const { from, to } = surfWindow(day);
      for (const s of chooseSlots(day, [day])[0]!) {
        const m = minutesInto(day.date, s.time);
        assert.ok(m >= from && m <= to, `${s.time} outside the window`);
      }
    }
  });

  it("uses AM and PM for every Spot when one Spot has no 3-hourly data that day", () => {
    const day = days[0]!;
    const stale: ForecastDay = { ...day, fine: [] };
    assert.deepEqual(chooseSlots(day, [day, null, stale]).map(hours), ["09 15", undefined, "09 15"]);
  });
});
