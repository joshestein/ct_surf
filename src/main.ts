import { join } from "node:path";
import { render } from "./render.ts";
import { spots } from "./spots.ts";
import { loadSnapshot, saveSnapshot, writeAtomic } from "./store.ts";
import { fetchSpot } from "./surfForecast.ts";

const dataDir = process.env.SURF_DATA_DIR ?? "data";
const outFile = process.env.SURF_OUT_FILE ?? join("dist", "index.html");

const now = new Date();

let failed = false;
const snapshots = await Promise.all(
  spots.map(async (spot) => {
    try {
      const snapshot = await fetchSpot(spot, now);
      await saveSnapshot(dataDir, spot.id, snapshot);
      console.log(`${spot.name}: ${snapshot.days.length} days`);
      return snapshot;
    } catch (err) {
      failed = true;
      console.error(`${spot.name}: update failed, keeping last good data`, err);
      return loadSnapshot(dataDir, spot.id);
    }
  }),
);

await writeAtomic(outFile, render(spots, snapshots, now));
console.log(`Wrote ${outFile}`);

// Non-zero exit marks the systemd run as failed, so `systemctl status` shows a broken scrape
if (failed) process.exitCode = 1;
