/**
 * Which assets are IoT, with their protocol and type (fork), asked for ONCE
 * and shared by every row of a list (kept a minute; a failure isn't
 * retried until then). For the protocol mark beside names, and the type icon
 * standing in for a missing picture.
 */
import { useEffect, useState } from "react";

export type IotInfo = { protocol: string | null; type: string | null };

const KEEP_MS = 60_000;
let cache: { at: number; map: Promise<Map<string, IotInfo>> } | null = null;

/** The IoT assets: one request, shared, kept a minute. */
export function iotAssets(now = Date.now()): Promise<Map<string, IotInfo>> {
  if (!cache || now - cache.at > KEEP_MS)
    cache = {
      at: now,
      map: fetch("/api/matter/assets", {
        headers: { Accept: "application/json" },
      })
        .then((r) => (r.ok ? r.json() : { assets: [] }))
        .then(
          (d: { assets?: ({ id: string } & IotInfo)[] }) =>
            new Map(
              (d.assets ?? []).map((a) => [
                a.id,
                { protocol: a.protocol, type: a.type },
              ])
            )
        )
        .catch(() => new Map<string, IotInfo>()),
    };
  return cache.map;
}

/** For tests: forget what was asked. */
export function resetIotAssets() {
  cache = null;
}

/** An asset's IoT protocol and type, or null if it isn't one. */
export function useIotInfo(assetId: string | null | undefined) {
  const [info, setInfo] = useState<IotInfo | null>(null);
  useEffect(() => {
    if (!assetId) return;
    let live = true;
    void iotAssets().then((m) => {
      if (live) setInfo(m.get(assetId) ?? null);
    });
    return () => {
      live = false;
    };
  }, [assetId]);
  return info;
}
