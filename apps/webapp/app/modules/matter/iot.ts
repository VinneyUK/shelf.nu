/** Whether an asset's category is IoT: only those get Matter devices (fork). */
export const isIotCategory = (name: string | null | undefined) =>
  /^(iot|internet of things)$/i.test((name ?? "").trim());
