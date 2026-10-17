/**
 * The menu, reorderable (fork): press and hold any item to enter edit mode,
 * drag the items into the order you want, then Done (or Cancel). A quick tap
 * still just opens the page. The order is saved for the workspace.
 */
import { useEffect, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { GripVerticalIcon } from "lucide-react";
import { useFetcher } from "react-router";
import { Button } from "~/components/shared/button";
import type { NavItem } from "~/hooks/use-sidebar-nav-items";
import { menuKey } from "~/modules/customisation/apply-to-menu";
import { tw } from "~/utils/tw";
import { useSidebar } from "./sidebar";
import SidebarNav from "./sidebar-nav";

/** How long a press must last before it's a hold, and how far it may wander. */
const HOLD_MS = 550;
const WANDER_PX = 8;

export function ReorderableNav({ items }: { items: NavItem[] }) {
  const fetcher = useFetcher();
  const { state, setOpen, isMobile } = useSidebar();
  const [editing, setEditing] = useState(false);
  const [keys, setKeys] = useState<string[]>([]);
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const byKey = new Map(items.map((item) => [menuKey(item), item]));

  const stopTimer = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  const enter = () => {
    setKeys(items.map(menuKey));
    setEditing(true);
    if (state === "collapsed" && !isMobile) setOpen(true);
  };
  useEffect(() => stopTimer, []);
  // leave edit mode once a save has gone through
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) setEditing(false);
  }, [fetcher.state, fetcher.data]);

  if (editing) {
    return (
      <div
        className="flex flex-col gap-2 px-2 py-1"
        aria-label="Reorder the menu"
      >
        <p className="px-1 text-xs text-gray-500">
          Drag the items into the order you want.
        </p>
        <Reorder.Group
          axis="y"
          values={keys}
          onReorder={setKeys}
          className="flex flex-col gap-1"
        >
          {keys.map((key) => {
            const item = byKey.get(key);
            if (!item) return null;
            const Icon = "Icon" in item ? item.Icon : null;
            return (
              <Reorder.Item
                key={key}
                value={key}
                className={tw(
                  "flex cursor-grab touch-none select-none items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 active:cursor-grabbing",
                  item.type === "label"
                    ? "text-xs font-medium uppercase tracking-wide text-gray-500"
                    : ""
                )}
                whileDrag={{
                  scale: 1.02,
                  boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                }}
              >
                <GripVerticalIcon
                  className="size-4 shrink-0 text-gray-400"
                  aria-hidden="true"
                />
                {Icon ? (
                  <Icon
                    className="size-4 shrink-0 text-gray-500"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="truncate">{item.title}</span>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={fetcher.state !== "idle"}
            onClick={() =>
              fetcher.submit(
                { order: JSON.stringify(keys) },
                { method: "post", action: "/api/menu-order" }
              )
            }
          >
            Done
          </Button>
        </div>
        <button
          type="button"
          className="self-start px-1 text-xs text-gray-500 hover:text-gray-800 hover:underline"
          onClick={() =>
            fetcher.submit(
              { intent: "reset" },
              { method: "post", action: "/api/menu-order" }
            )
          }
        >
          Reset to default
        </button>
      </div>
    );
  }

  return (
    <div
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          swallowClick.current = true; // the press that opened edit mode isn't also a click
          stopTimer();
          enter();
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        if (
          start.current &&
          Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) >
            WANDER_PX
        ) {
          stopTimer();
        }
      }}
      onPointerUp={stopTimer}
      onPointerLeave={stopTimer}
      onPointerCancel={stopTimer}
      onContextMenu={(e) => {
        // a long press on a phone opens the browser's menu; edit mode wins
        if (timer.current || swallowClick.current) e.preventDefault();
      }}
      onClickCapture={(e) => {
        if (swallowClick.current) {
          e.preventDefault();
          e.stopPropagation();
          swallowClick.current = false;
        }
      }}
    >
      <SidebarNav items={items} />
    </div>
  );
}
