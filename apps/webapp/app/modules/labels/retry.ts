/** labels feature: gap before trying a failed print again — 30 s, 1, 2, 4… up to 10 minutes. */
export function retryDelayMs(attempts: number) {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000);
}
