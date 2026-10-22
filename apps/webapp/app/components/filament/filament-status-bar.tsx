/**
 * FilamentStatusBar — "spool rail" summary bar for the Filament page.
 *
 * Stack: React + Tailwind (matches the shelf.nu fork). Icons come from
 * lucide-react, which shelf already ships — no new dependencies.
 *
 * Colour tokens use shelf's Untitled-UI palette (gray / primary / warning /
 * error / success). Dark mode: the fork's generated dark theme
 * (scripts/dark-theme.ts) gives every light class its dark colour, as for the
 * rest of the app, so there are no `dark:` variants here.
 *
 * Ant's design, wired into the Filament page (fork): the data comes from the
 * page's loader and the live AMS stream (components/filament/live-updates).
 *
 * Layout
 *   ≥1024px  one row:   [On hand] | [Value] | [Printer · AMS ........]
 *   640–1023 two rows:  [On hand | Value] / [Printer · AMS full width]
 *   <640     same two rows, AMS slots become 4 tall colour columns,
 *            alert stacks with a full-width 44px button.
 */
import { type ElementType, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  OctagonAlert,
  Plus,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type SlotIndex = 1 | 2 | 3 | 4;

export interface AmsSlot {
  slot: SlotIndex;
  /** Tray colour. Accepts "#RRGGBB", "RRGGBB" or Bambu's "RRGGBBAA". null = empty slot. */
  color: string | null;
  /** Display name, e.g. "Black". null = empty slot. */
  name: string | null;
  /** e.g. "PLA Basic" */
  material?: string | null;
  /**
   * 0–100. null = level unknown (Bambu reports remain = -1 for spools
   * without an RFID tag — map that to null before passing it in).
   */
  percent: number | null;
  /** Slot currently feeding the extruder. */
  active?: boolean;
  /** Link to the matching spool / filament record in the inventory. */
  href?: string;
}

/**
 * Normalised printer issues. Map raw printer messages / HMS codes to one of
 * these on the server so the UI can always say *what* is wrong, *where*, and
 * *what to do next*.
 */
export type PrinterIssue =
  | { kind: "setup" } // reading the AMS isn't set up (fork)
  | { kind: "connection" } // printer unreachable on the LAN
  | { kind: "auth" } // LAN access code rejected / changed
  | { kind: "runout"; slot: SlotIndex }
  | { kind: "feed"; slot: SlotIndex } // AMS failed to load/feed from a slot
  | { kind: "other"; message: string; code?: string };

export type PrinterState = "idle" | "printing" | "paused" | "error" | "offline";

export interface FilamentStatusBarProps {
  stock: {
    spools: number;
    unopened: number;
    /** Total remaining filament, in kg. */
    kgRemaining: number;
  };
  money: {
    /** Total spent on filament. */
    spent: number;
    /** Value of filament already printed. Worth = spent − used. */
    used: number;
    currency?: string; // ISO code, default GBP
  };
  ams: {
    slots: AmsSlot[];
    /** false when the AMS / printer connection is down. */
    online: boolean;
    /** When the last live update arrived. */
    lastUpdate: Date | string | number | null;
  };
  printer: {
    state: PrinterState;
    issue?: PrinterIssue | null;
    /** The job printing now (fork): shown in the header line */
    job?: {
      name: string;
      percent: number | null;
      minutesLeft: number | null;
    } | null;
  };
  /** Where the "fix it" buttons go. */
  links: {
    printerSettings: string;
    /** Inventory search for a filament, used by run-out / feed errors. */
    findInStock: (slot: AmsSlot) => string;
  };
  /** Called by "Retry now" when the AMS is offline. */
  onRetry?: () => void;
  /** Below this % a slot is flagged Low. Default 20. */
  lowThreshold?: number;
  /** Data older than this is treated as stale even if `online` is true. Default 2 min. */
  staleAfterMs?: number;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

function normaliseHex(raw: string | null): string | null {
  if (!raw) return null;
  const h = raw.replace(/^#/, "");
  if (/^[0-9a-f]{8}$/i.test(h)) return `#${h.slice(0, 6)}`; // drop Bambu alpha
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h}`;
  return null;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Re-renders every `intervalMs` so relative times stay honest. */
function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

type Tone = "error" | "warning";

interface IssueCopy {
  tone: Tone;
  title: string;
  body: string;
  action?: { label: string; href?: string; onClick?: () => void };
  slot?: SlotIndex;
}

function slotLabel(s?: AmsSlot) {
  if (!s) return "";
  return [s.name, s.material].filter(Boolean).join(" ");
}

function describeIssue(
  issue: PrinterIssue,
  slots: AmsSlot[],
  links: FilamentStatusBarProps["links"]
): IssueCopy {
  switch (issue.kind) {
    case "setup":
      return {
        tone: "warning",
        title: "Your printer isn’t set up.",
        body: "Add it in Settings → 3D Printer to see the AMS here, live.",
        action: { label: "Set up the printer", href: links.printerSettings },
      };
    case "auth":
      return {
        tone: "error",
        title: "Printer rejected the connection.",
        body: "The LAN access code has probably changed (it resets when LAN mode is toggled). Copy the new code from the printer screen.",
        action: { label: "Update access code", href: links.printerSettings },
      };
    case "connection":
      return {
        tone: "error",
        title: "Can’t reach the printer.",
        body: "Check it is powered on and on the same network, and that its IP address in Settings is still correct.",
        action: { label: "Open printer settings", href: links.printerSettings },
      };
    case "runout": {
      const s = slots.find((x) => x.slot === issue.slot);
      return {
        tone: "error",
        slot: issue.slot,
        title: `Slot ${issue.slot} ran out${
          s?.name ? ` of ${slotLabel(s)}` : ""
        }.`,
        body: `Load a new spool into slot ${issue.slot}, then press Resume on the printer.`,
        action: s?.name
          ? {
              label: `Find ${s.name} ${s.material ?? ""} in stock`.trim(),
              href: links.findInStock(s),
            }
          : undefined,
      };
    }
    case "feed":
      return {
        tone: "error",
        slot: issue.slot,
        title: `AMS couldn’t feed from slot ${issue.slot}.`,
        body: "Open the AMS lid, check the filament end is cut cleanly and not tangled, push it into the feeder, then Retry on the printer.",
      };
    case "other":
    default:
      return {
        tone: "error",
        title: issue.code
          ? `Printer error ${issue.code}.`
          : "Printer reported a problem.",
        body: issue.message,
        action: { label: "Open printer settings", href: links.printerSettings },
      };
  }
}

const STATUS_LABEL: Record<PrinterState, string> = {
  idle: "Idle",
  printing: "Printing",
  paused: "Paused",
  error: "Error",
  offline: "Offline",
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function FilamentStatusBar({
  stock,
  money,
  ams,
  printer,
  links,
  onRetry,
  lowThreshold = 20,
  staleAfterMs = 120_000,
  className,
}: FilamentStatusBarProps) {
  const now = useNow();
  const lastUpdateMs = ams.lastUpdate ? new Date(ams.lastUpdate).getTime() : 0;
  const age = now - lastUpdateMs;
  const stale =
    !ams.online || printer.state === "offline" || age > staleAfterMs;

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: money.currency ?? "GBP",
      }),
    [money.currency]
  );
  const worth = Math.max(0, money.spent - money.used);
  const worthPct = money.spent > 0 ? (worth / money.spent) * 100 : 0;

  // Decide the one message to show, most specific first.
  let alert: IssueCopy | null = null;
  if (printer.issue) {
    alert = describeIssue(printer.issue, ams.slots, links);
  } else if (stale) {
    alert = {
      tone: "warning",
      title: lastUpdateMs
        ? `No data from the AMS for ${formatAgo(age).replace(" ago", "")}.`
        : "No data from the AMS yet.",
      body: "Levels shown are the last known values. Check the printer is powered on and connected to your network.",
      action: onRetry ? { label: "Retry now", onClick: onRetry } : undefined,
    };
  }

  const pill = (() => {
    if (
      (printer.issue && printer.issue.kind !== "setup") ||
      printer.state === "error"
    )
      return {
        label:
          printer.issue?.kind === "runout" || printer.state === "paused"
            ? "Paused"
            : printer.issue?.kind === "auth" ||
              printer.issue?.kind === "connection"
            ? "Can’t connect"
            : "Error",
        Icon: OctagonAlert,
        cls: "bg-error-50 text-error-700",
      };
    if (printer.issue?.kind === "setup")
      return {
        label: "Not set up",
        Icon: null,
        cls: "bg-gray-100 text-gray-700",
      };
    if (stale)
      return {
        label: "AMS offline",
        Icon: WifiOff,
        cls: "bg-warning-50 text-warning-700",
      };
    return {
      label: STATUS_LABEL[printer.state],
      Icon: null,
      cls: "text-success-700",
    };
  })();

  const slots = [...ams.slots].sort((a, b) => a.slot - b.slot);

  return (
    <section
      aria-label="Filament summary"
      className={cx(
        "grid grid-cols-2 rounded-xl border border-gray-200 bg-white shadow-sm",
        "lg:grid-cols-[minmax(0,12.5rem)_minmax(0,17rem)_minmax(0,1fr)]",
        className
      )}
    >
      {/* On hand ------------------------------------------------------ */}
      <div className="flex min-w-0 flex-col gap-0.5 px-4 py-3.5 lg:px-5 lg:py-4">
        <span className="text-xs font-medium text-gray-600">
          Filament on hand
        </span>
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 lg:text-3xl">
          {stock.kgRemaining.toFixed(1)}
          <span className="ml-0.5 text-base font-medium text-gray-600 lg:text-lg">
            kg
          </span>
        </span>
        <span className="truncate text-xs tabular-nums text-gray-600 sm:text-sm">
          {stock.spools} spools · {stock.unopened} sealed
        </span>
      </div>

      {/* Value -------------------------------------------------------- */}
      <div className="flex min-w-0 flex-col gap-0.5 border-l border-gray-200 px-4 py-3.5 lg:px-5 lg:py-4">
        <span className="text-xs font-medium text-gray-600">
          Value on the shelf
        </span>
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 lg:text-3xl">
          {currency.format(worth)}
        </span>
        <div
          role="img"
          aria-label={`${currency.format(worth)} of ${currency.format(
            money.spent
          )} spent is still unused, ${Math.round(worthPct)} percent`}
          className="my-1 flex h-1.5 overflow-hidden rounded-full bg-gray-100"
        >
          <div className="bg-primary-500" style={{ width: `${worthPct}%` }} />
          <div
            className="ml-0.5 bg-gray-400"
            style={{ width: `${100 - worthPct}%` }}
          />
        </div>
        <span className="truncate text-xs tabular-nums text-gray-600 sm:text-sm">
          <span className="hidden sm:inline">
            {currency.format(money.used)} used of{" "}
          </span>
          <span className="sm:hidden">of </span>
          {currency.format(money.spent)} spent
        </span>
      </div>

      {/* Printer · AMS ------------------------------------------------ */}
      <div
        className={cx(
          "col-span-2 flex min-w-0 flex-col gap-3 border-t border-gray-200 px-4 pb-4 pt-3",
          "lg:col-span-1 lg:border-l lg:border-t-0 lg:px-5 lg:pb-4 lg:pt-3.5"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-xs font-medium text-gray-600">
              Printer · AMS
            </span>
            <span
              className={cx(
                "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
                pill.cls
              )}
            >
              {pill.Icon ? (
                <pill.Icon aria-hidden className="size-3.5" />
              ) : (
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-current"
                />
              )}
              {pill.label}
            </span>
            {printer.job ? <JobLine job={printer.job} /> : null}
          </div>
          {Number.isFinite(lastUpdateMs) && lastUpdateMs > 0 ? (
            <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-gray-600 sm:inline-flex">
              <Clock aria-hidden className="size-3.5" />
              <time dateTime={new Date(lastUpdateMs).toISOString()}>
                {stale
                  ? `Last seen ${formatAgo(age)}`
                  : `Updated ${formatAgo(age)}`}
              </time>
            </span>
          ) : null}
        </div>

        {/* Polite live region: announces status changes, not every % tick. */}
        <p className="sr-only" aria-live="polite">
          {`Printer ${pill.label}.${alert ? ` ${alert.title}` : ""}`}
        </p>

        {alert && <IssueBanner {...alert} />}

        <ol
          aria-label="AMS slots"
          className="grid grid-cols-4 gap-2.5 sm:gap-3"
        >
          {slots.map((s) => (
            <SlotItem
              key={s.slot}
              slot={s}
              stale={stale}
              lowThreshold={lowThreshold}
              faulted={alert?.slot === s.slot}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function IssueBanner({ tone, title, body, action }: IssueCopy) {
  const isError = tone === "error";
  const btnCls = cx(
    "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold sm:h-9",
    "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
  );
  return (
    <div
      role={isError ? "alert" : "status"}
      className={cx(
        "flex flex-col gap-2.5 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:gap-3 sm:py-2.5",
        isError
          ? "border-error-200 bg-error-50"
          : "border-warning-200 bg-warning-50"
      )}
    >
      <p className="min-w-0 flex-1 leading-5 text-gray-900">
        <strong
          className={cx(
            "font-semibold",
            isError ? "text-error-700" : "text-warning-700"
          )}
        >
          {title}
        </strong>{" "}
        {body}
      </p>
      {action?.href ? (
        <Link to={action.href} className={btnCls}>
          {action.label}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : action?.onClick ? (
        <button type="button" onClick={action.onClick} className={btnCls}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function SlotItem({
  slot,
  stale,
  lowThreshold,
  faulted,
}: {
  slot: AmsSlot;
  stale: boolean;
  lowThreshold: number;
  faulted: boolean;
}) {
  const hex = normaliseHex(slot.color);
  const empty = !hex || !slot.name;
  const untracked = !empty && slot.percent == null;
  const pct = untracked || empty ? null : clampPct(slot.percent!);
  const low = pct != null && pct < lowThreshold && !faulted;

  // Screen-reader summary — the visual tile is aria-hidden.
  const srText = empty
    ? `Slot ${slot.slot}: empty`
    : `Slot ${slot.slot}: ${slotLabel(slot)}, ${
        untracked ? "level not tracked" : `${pct}% remaining`
      }${faulted ? ", ran out" : low ? ", low" : ""}${
        slot.active && !stale ? ", feeding" : ""
      }${stale ? ", last known value" : ""}`;

  let chip: {
    text: string;
    cls: string;
    Icon: typeof AlertTriangle | null;
  } | null = null;
  if (faulted)
    chip = {
      text: "Ran out",
      Icon: AlertTriangle,
      cls: "bg-error-50 text-error-700",
    };
  else if (low)
    chip = {
      text: "Low",
      Icon: AlertTriangle,
      cls: "bg-warning-50 text-warning-700",
    };
  else if (slot.active && !stale)
    chip = {
      text: "Feeding",
      Icon: ArrowRight,
      cls: "bg-gray-100 text-gray-700",
    };

  const linked = !!slot.href && !empty;
  // a link to the filament in Shelf when it knows it
  const Wrapper = (linked ? Link : "div") as ElementType;

  return (
    <li className="min-w-0">
      <Wrapper
        {...(linked ? { to: slot.href! } : {})}
        className={cx(
          "-m-1.5 flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5 sm:flex-row sm:items-center sm:gap-3",
          linked &&
            "hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
          faulted && "ring-2 ring-inset ring-error-500"
        )}
      >
        <span className="sr-only">{srText}</span>

        {/* Colour tile: the hero. Fill rises from the bottom. */}
        {empty ? (
          <span
            aria-hidden
            className="flex h-16 w-full shrink-0 items-center justify-center rounded-lg border-[1.5px] border-dashed border-gray-400 text-gray-500 sm:h-14 sm:w-11"
          >
            <Plus className="size-4" />
          </span>
        ) : (
          <span
            aria-hidden
            className={cx(
              "relative h-16 w-full shrink-0 overflow-hidden rounded-lg sm:h-14 sm:w-11",
              // an outline that shows in both themes (black filament on a dark page)
              "ams-slot-outline",
              stale && "opacity-50"
            )}
            style={{
              // Hatched "empty space" in a faint tint of the filament colour.
              backgroundImage: `repeating-linear-gradient(135deg, ${hex}2E 0 4px, ${hex}14 4px 8px)`,
            }}
          >
            <span
              className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out motion-reduce:transition-none"
              style={{
                height: `${untracked ? 100 : pct}%`,
                backgroundColor: hex!,
              }}
            />
          </span>
        )}

        <span aria-hidden className="flex min-w-0 flex-col">
          <span className="hidden truncate text-[11px] leading-4 text-gray-600 sm:block">
            Slot {slot.slot}
            {!empty && slot.material ? ` · ${slot.material}` : ""}
          </span>
          <span className="truncate text-xs font-semibold leading-4 text-gray-900 sm:text-sm sm:leading-5">
            {empty ? "Empty" : slot.name}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-5 sm:text-[13px]">
            <span
              className={cx(
                "tabular-nums",
                empty || untracked
                  ? "font-normal text-gray-600"
                  : "font-semibold",
                faulted
                  ? "text-error-700"
                  : low
                  ? "text-warning-700"
                  : stale && !empty && !untracked
                  ? "text-gray-600"
                  : !empty && !untracked && "text-gray-900"
              )}
            >
              {empty ? (
                <>
                  <span className="sm:hidden">—</span>
                  <span className="hidden sm:inline">Load a spool</span>
                </>
              ) : untracked ? (
                <>
                  <span className="sm:hidden">?</span>
                  <span className="hidden sm:inline">Level not tracked</span>
                </>
              ) : (
                `${pct}%`
              )}
            </span>
            {chip && (
              <span
                className={cx(
                  "inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold",
                  chip.cls
                )}
              >
                {chip.Icon && <chip.Icon className="size-3" />}
                <span
                  className={
                    chip.text === "Feeding" ? "hidden sm:inline" : undefined
                  }
                >
                  {chip.text}
                </span>
              </span>
            )}
          </span>
        </span>
      </Wrapper>
    </li>
  );
}

/** "Desk organiser · 42% · 3h 36m left", with a thin bar (fork). */
function JobLine({
  job,
}: {
  job: { name: string; percent: number | null; minutesLeft: number | null };
}) {
  const left =
    job.minutesLeft === null
      ? null
      : job.minutesLeft >= 60
      ? `${Math.floor(job.minutesLeft / 60)}h ${job.minutesLeft % 60}m left`
      : `${job.minutesLeft}m left`;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="truncate text-sm text-gray-900">
        <b className="font-semibold">{job.name}</b>
        {job.percent !== null ? ` · ${job.percent}%` : ""}
        {left ? ` · ${left}` : ""}
      </span>
      {job.percent !== null ? (
        <span
          className="hidden h-1.5 w-32 shrink-0 overflow-hidden rounded-full sm:block"
          style={{ backgroundColor: "var(--level-track)" }}
          role="progressbar"
          aria-label="Print progress"
          aria-valuenow={job.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className="block h-full rounded-full bg-primary-500"
            style={{ width: `${job.percent}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

export default FilamentStatusBar;
