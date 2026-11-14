import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { loadSnapshot, saveSnapshot } from "../src/store.ts";
import { snapshot } from "./fixtures.ts";

const dir = await mkdtemp(join(tmpdir(), "surf-store-"));
after(() => rm(dir, { recursive: true }));

describe("store", () => {
  it("reads back a saved Snapshot", async () => {
    await saveSnapshot(dir, "muizenberg", snapshot);
    assert.deepEqual(await loadSnapshot(dir, "muizenberg"), snapshot);
  });

  it("treats a missing, corrupt or older-format file as no data", async () => {
    assert.equal(await loadSnapshot(dir, "bigbay"), null);
    await writeFile(join(dir, "longbeach.json"), "{not json");
    assert.equal(await loadSnapshot(dir, "longbeach"), null);
    // Before fine and coarse, each day had one list of Slots
    const old = {
      ...snapshot,
      days: snapshot.days.map(({ date, sunrise, sunset }) => ({ date, sunrise, sunset, slots: [] })),
    };
    await writeFile(join(dir, "llandudno.json"), JSON.stringify(old));
    assert.equal(await loadSnapshot(dir, "llandudno"), null);
  });
});
