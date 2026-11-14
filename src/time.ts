// All Spots are in Cape Town. South Africa has no daylight saving, so the offset is fixed.
export const TIME_ZONE = "Africa/Johannesburg";
const OFFSET_HOURS = 2;
const OFFSET = `+0${OFFSET_HOURS}:00`;

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

/** "2026-11-14" + 5 * 60 -> "2026-11-14T05:00:00+02:00". Minutes may run past 24h or below 0. */
export function localIso(date: string, minutes: number): string {
  const ms = Date.parse(`${date}T00:00:00${OFFSET}`) + minutes * MINUTE;
  const local = new Date(ms + OFFSET_HOURS * HOUR).toISOString().slice(0, 19);
  return `${local}${OFFSET}`;
}

/** "05:35" -> 335 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 335 -> "05:35" */
export function fromMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes since local midnight of `date` for an ISO time with the SAST offset */
export function minutesInto(date: string, iso: string): number {
  return (Date.parse(iso) - Date.parse(`${date}T00:00:00${OFFSET}`)) / MINUTE;
}

/** "2026-11-14T05:00:00+02:00" -> "05:00" */
export const clock = (iso: string) => iso.slice(11, 16);
