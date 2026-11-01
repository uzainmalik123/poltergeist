const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYYMMDD-HHMMSS-xxxx` in UTC with four random hex digits (D-36): sortable, and unique enough per project. */
export function newRunId(now: Date = new Date(), random: () => number = Math.random): string {
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const hex = Math.floor(random() * 0x10000).toString(16).padStart(4, '0');
  return `${date}-${time}-${hex}`;
}
