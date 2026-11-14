import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Snapshot, SpotId } from "./types.ts";

/** Last good Snapshot per Spot. A failed fetch leaves the previous file in place. */
export async function loadSnapshot(dataDir: string, id: SpotId): Promise<Snapshot | null> {
  const path = snapshotPath(dataDir, id);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return null;
    throw err;
  }
  // A corrupt file, or one in an older format, must not take down the whole page: treat it like a missing one
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error(`${path}: unreadable snapshot, ignoring`, err);
    return null;
  }
  if (isSnapshot(data)) return data;
  console.error(`${path}: snapshot in an unknown format, ignoring`);
  return null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Checks the outline down to each day. Enough to catch a format change, without a schema library. */
function isSnapshot(v: unknown): v is Snapshot {
  return (
    isObject(v) &&
    typeof v.fetchedAt === "string" &&
    Array.isArray(v.tides) &&
    Array.isArray(v.days) &&
    v.days.every(
      (d) =>
        isObject(d) &&
        typeof d.date === "string" &&
        typeof d.sunrise === "string" &&
        typeof d.sunset === "string" &&
        Array.isArray(d.fine) &&
        Array.isArray(d.coarse),
    )
  );
}

export async function saveSnapshot(dataDir: string, id: SpotId, snapshot: Snapshot): Promise<void> {
  await writeAtomic(snapshotPath(dataDir, id), JSON.stringify(snapshot));
}

const snapshotPath = (dataDir: string, id: SpotId) => join(dataDir, `${id}.json`);

/** Write to a temp file, then rename, so readers never see a partial file */
export async function writeAtomic(path: string, contents: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  // A crash before the rename can leave this file behind. In the web root it holds only the public page.
  const tmp = join(dir, `.${basename(path)}.${process.pid}.tmp`);
  await writeFile(tmp, contents);
  await rename(tmp, path);
}
