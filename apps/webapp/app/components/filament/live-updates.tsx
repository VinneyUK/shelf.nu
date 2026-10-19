/**
 * Live AMS for an open Filament page (fork). The printer's reports arrive
 * the moment Shelf has them, over an event stream (/api/sse/ams):
 *
 * - levels and slots change in place: the bars and percentages move, and
 *   nothing else on the page reloads;
 * - when something can't be shown in place (filament in or out, something
 *   new to add, a spool run out), the page fetches its data again, but only
 *   once you've finished whatever you're editing;
 * - anything to tell shows as Shelf's pop-up.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { useRevalidator } from "react-router";
import { showNotificationAtom } from "~/atoms/notifications";
import type { Tray } from "~/modules/filament/ams";

type Level = { remainingPercent: number; amsSlot: number };
type Live = {
  trays: Tray[];
  levels: ({ id: string } & Level)[];
  events: string[];
  refresh: boolean;
};

/** Whether you're in the middle of something a refresh would get in the way of. */
export function isBusy(doc: Document = document) {
  const el = doc.activeElement as HTMLElement | null;
  const typing =
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable);
  // an open picker, menu or dialog
  const open = !!doc.querySelector(
    "[data-radix-popper-content-wrapper], [role='dialog'], [role='alertdialog']"
  );
  return typing || open;
}

/** A spool with the AMS's latest level and slot, when the AMS has reported it. */
export function withLevel<
  S extends { id: string; remainingPercent: number; amsSlot: number | null },
>(spool: S, levels: Map<string, Level>): S {
  const live = levels.get(spool.id);
  return live
    ? {
        ...spool,
        remainingPercent: live.remainingPercent,
        amsSlot: live.amsSlot,
      }
    : spool;
}

/**
 * Follows the AMS live. Give it the trays the page loaded with and something
 * that changes whenever the page's data is fetched again (the loader data);
 * it returns the trays now and a function that brings spools up to date.
 */
export function useAmsLive(initialTrays: Tray[] | null, data: unknown) {
  const revalidator = useRevalidator();
  const [, notify] = useAtom(showNotificationAtom);
  const [trays, setTrays] = useState(initialTrays);
  const [levels, setLevels] = useState(() => new Map<string, Level>());
  const pending = useRef(false);

  // fresh data from the server replaces whatever was shown in place
  useEffect(() => {
    setTrays(initialTrays);
    setLevels(new Map());
    pending.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const source = new EventSource("/api/sse/ams");
    const onAms = (event: MessageEvent<string>) => {
      let live: Live;
      try {
        live = JSON.parse(event.data) as Live;
      } catch {
        return;
      }
      setTrays(live.trays);
      setLevels((prev) => {
        const next = new Map(prev);
        for (const l of live.levels)
          next.set(l.id, {
            remainingPercent: l.remainingPercent,
            amsSlot: l.amsSlot,
          });
        return next;
      });
      if (live.events.length) {
        notify({
          title:
            live.events.length === 1
              ? "AMS"
              : `AMS: ${live.events.length} changes`,
          message: live.events.join(" "),
          icon: { name: "success", variant: "success" },
          senderId: null,
        });
      }
      if (live.refresh) pending.current = true;
    };
    source.addEventListener("ams", onAms as EventListener);
    return () => {
      source.removeEventListener("ams", onAms as EventListener);
      source.close();
    };
  }, [notify]);

  // a refresh that's due waits until you've finished what you're doing
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const r = revalidatorRef.current;
      if (!pending.current || r.state !== "idle" || isBusy()) return;
      pending.current = false;
      void r.revalidate();
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const live = useCallback(
    <
      S extends {
        id: string;
        remainingPercent: number;
        amsSlot: number | null;
      },
    >(
      spools: S[]
    ): S[] => (levels.size ? spools.map((s) => withLevel(s, levels)) : spools),
    [levels]
  );

  return { trays, live };
}
