import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildSnapshot } from "../src/surfForecast.ts";
import { fetchedAt, hours, sixDay, snapshot } from "./fixtures.ts";

describe("surf-forecast.com (Muizenberg)", () => {
  it("covers 7 days", () => {
    assert.deepEqual(
      snapshot.days.map((d) => d.date),
      ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"],
    );
    assert.equal(snapshot.fetchedAt, "2026-11-14T10:23:00.000Z");
  });

  it("keeps every 3-hourly Slot while the latest page lasts, and every AM, PM and Night Slot", () => {
    assert.deepEqual(
      snapshot.days.map((d) => hours(d.fine)),
      ["05 08 11 14 17 20 23", "02 05 08 11 14 17 20 23", "02 05 08 11 14 17 20 23", "02 05", "", "", ""],
    );
    assert.ok(snapshot.days.every((d) => hours(d.coarse) === "09 15 21"));
    assert.ok(snapshot.days.every((d) => d.fine.every((s) => !s.coarse) && d.coarse.every((s) => s.coarse)));
  });

  it("reads every value of a Slot", () => {
    assert.deepEqual(snapshot.days[0]!.fine[0], {
      time: "2026-11-14T05:00:00+02:00",
      coarse: false,
      rating: 0,
      swell: { height: 1.7, period: 14, direction: "SW" },
      energy: 1052,
      wind: { speed: 32, direction: "SE" },
      windState: "on-shore",
    });
  });

  it("reads sunset as an afternoon time", () => {
    assert.deepEqual(
      { sunrise: snapshot.days[0]!.sunrise, sunset: snapshot.days[0]!.sunset },
      { sunrise: "05:35", sunset: "19:25" },
    );
  });

  it("dates a tide listed in the column of the evening before", () => {
    // The six_day page lists the 00:03 low tide of Sunday in Saturday's Night column
    assert.ok(
      snapshot.tides.some((t) => t.time === "2026-11-15T00:03:00+02:00" && t.type === "low" && t.height === 0.42),
    );
  });

  it("lists each tide once, alternating high and low", () => {
    assert.ok(snapshot.tides.length >= 25);
    snapshot.tides.forEach((t, i) => {
      if (i > 0) assert.notEqual(t.type, snapshot.tides[i - 1]!.type, `two ${t.type} tides in a row at ${t.time}`);
    });
  });

  it("throws on a page without the forecast table", () => {
    assert.throws(() => buildSnapshot("<html></html>", sixDay, fetchedAt), /surf-forecast: no "days" row/);
  });
});
