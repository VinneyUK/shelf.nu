/**
 * Live AMS updates for an open Filament page (fork): asks every 5 seconds
 * while the page is visible whether the AMS has changed; if it has, the page
 * refreshes itself, and anything to tell (new filament, filament moved or
 * taken out) shows as Shelf's pop-up.
 */
import { useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { useFetcher, useRevalidator } from "react-router";
import { showNotificationAtom } from "~/atoms/notifications";

type Updates = { version: number; lastEventId: number; events: string[] };

export function useAmsLiveUpdates() {
  const fetcher = useFetcher<Updates>();
  const revalidator = useRevalidator();
  const [, notify] = useAtom(showNotificationAtom);
  const seen = useRef<{ version: number; lastEventId: number } | null>(null);

  useEffect(() => {
    const ask = () => {
      if (document.visibilityState !== "visible" || fetcher.state !== "idle")
        return;
      const since = seen.current ? `?since=${seen.current.lastEventId}` : "";
      void fetcher.load(`/api/filament/ams-updates${since}`);
    };
    ask();
    const timer = window.setInterval(ask, 5000);
    document.addEventListener("visibilitychange", ask);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const u = fetcher.data;
    if (!u || typeof u.version !== "number") return;
    const before = seen.current;
    seen.current = { version: u.version, lastEventId: u.lastEventId };
    if (!before) return; // the first answer only sets where we are
    if (u.events.length) {
      notify({
        title:
          u.events.length === 1 ? "AMS" : `AMS: ${u.events.length} changes`,
        message: u.events.join(" "),
        icon: { name: "success", variant: "success" },
        senderId: null,
      });
    }
    if (u.version !== before.version && revalidator.state === "idle")
      void revalidator.revalidate();
  }, [fetcher.data, notify, revalidator]);
}
