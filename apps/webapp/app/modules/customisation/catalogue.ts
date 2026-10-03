/**
 * Workspace customisations — what can be switched off or hidden.
 * Shared between server and browser. Part of the customise feature; not in
 * upstream Shelf.
 */

export type Customisations = {
  /** Bookings, the calendar and everything that books assets */
  bookingsEnabled: boolean;
  /** Asset reminders */
  remindersEnabled: boolean;
  /** Audits — stored on the workspace by Shelf itself (auditsEnabled) */
  auditsEnabled: boolean;
  /** Keys from HIDEABLE_MENU_ITEMS */
  hiddenMenuItems: string[];
  /** Larger image when hovering a thumbnail in the assets list */
  imagePreviewOnHover: boolean;
  /** Label printing (labels feature) */
  labelsEnabled: boolean;
  /** Custody: assigning assets to people */
  custodyEnabled: boolean;
};

/** Shelf as it ships, for workspaces that have never been customised. */
export const DEFAULT_CUSTOMISATIONS: Customisations = {
  bookingsEnabled: true,
  remindersEnabled: true,
  auditsEnabled: true,
  hiddenMenuItems: [],
  imagePreviewOnHover: true,
  labelsEnabled: true,
  custodyEnabled: true,
};

type MenuMatch = { to?: string; title?: string };

/**
 * Menu items that can be hidden on their own. `match` identifies the item in
 * Shelf's sidebar: by link for ordinary items, by title for the rest.
 */
export const HIDEABLE_MENU_ITEMS: {
  key: string;
  label: string;
  match: MenuMatch;
}[] = [
  { key: "home", label: "Home", match: { to: "/home" } },
  { key: "kits", label: "Kits", match: { to: "/kits" } },
  { key: "categories", label: "Categories", match: { to: "/categories" } },
  { key: "tags", label: "Tags", match: { to: "/tags" } },
  { key: "locations", label: "Locations", match: { to: "/locations" } },
  { key: "reports", label: "Reports", match: { to: "/reports" } },
  { key: "team", label: "Team", match: { title: "Team" } },
  {
    key: "asset-labels",
    label: "Asset labels (Shelf's online shop)",
    match: { title: "Asset labels" },
  },
  { key: "scanner", label: "QR Scanner", match: { to: "/scanner" } },
  { key: "updates", label: "Updates", match: { title: "Updates" } },
  {
    key: "feedback",
    label: "Questions/Feedback",
    match: { title: "Questions/Feedback" },
  },
];

const HIDEABLE_KEYS = new Set(HIDEABLE_MENU_ITEMS.map((item) => item.key));

/** Drops unknown keys, e.g. from an item removed in a later version. */
export function cleanHiddenMenuItems(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.filter((k): k is string => HIDEABLE_KEYS.has(k)))];
}

/** Everything that should disappear from the menu with these settings. */
export function hiddenMenuMatches(c: Customisations): MenuMatch[] {
  const matches: MenuMatch[] = HIDEABLE_MENU_ITEMS.filter((item) =>
    c.hiddenMenuItems.includes(item.key)
  ).map((item) => item.match);

  if (!c.bookingsEnabled) {
    matches.push({ title: "Bookings" }, { to: "/settings/bookings" });
  }
  if (!c.auditsEnabled) matches.push({ to: "/audits" });
  if (!c.remindersEnabled) matches.push({ to: "/reminders" });
  if (!c.labelsEnabled) matches.push({ to: "/labels" });
  return matches;
}

export function matchesMenuItem(
  item: { title: string; to?: string },
  matches: MenuMatch[]
) {
  return matches.some(
    (m) =>
      (m.to !== undefined && item.to === m.to) ||
      (m.title !== undefined && item.title === m.title)
  );
}

const BOOKING_PAGES = [
  /^\/(bookings|calendar)(\/|$)/,
  /^\/settings\/bookings(\/|$)/,
  /^\/(assets|kits)\/[^/]+\/bookings(\/|$)/,
  /^\/(assets|kits)\/[^/]+\/overview\/(create-new-booking|add-to-existing-booking)(\/|$)/,
];
const REMINDER_PAGES = [
  /^\/reminders(\/|$)/,
  /^\/assets\/[^/]+\/reminders(\/|$)/,
];
const AUDIT_PAGES = [/^\/audits(\/|$)/];
const LABEL_PAGES = [/^\/labels(\/|$)/];
const CUSTODY_PAGES = [
  /^\/assets\/[^/]+\/overview\/(assign|release)-custody(\/|$)/,
  /^\/kits\/[^/]+\/assets\/(assign|release)-custody(\/|$)/,
];

/**
 * Where to send someone who opens a page for a feature that's switched off,
 * or null if the page is fine.
 */
export function redirectForSwitchedOffPage(
  pathname: string,
  c: Customisations
): string | null {
  const report = pathname.match(/^\/reports\/([^/.]+)(\/|$)/);
  const blockedReport =
    report !== null &&
    !reportIsAvailable(
      { id: report[1], category: REPORT_CATEGORY[report[1]] ?? "" },
      c
    );
  const blocked =
    blockedReport ||
    (!c.bookingsEnabled && BOOKING_PAGES.some((re) => re.test(pathname))) ||
    (!c.remindersEnabled && REMINDER_PAGES.some((re) => re.test(pathname))) ||
    (!c.auditsEnabled && AUDIT_PAGES.some((re) => re.test(pathname))) ||
    (!c.labelsEnabled && LABEL_PAGES.some((re) => re.test(pathname))) ||
    (!c.custodyEnabled && CUSTODY_PAGES.some((re) => re.test(pathname)));
  if (!blocked) return null;
  return c.hiddenMenuItems.includes("home") ? "/assets" : "/home";
}

// ------------------------------------------------- columns and reports

/**
 * Each built-in report's category, so a report's address can be blocked
 * without loading Shelf's report registry here. Mirrors modules/reports/registry.ts.
 */
const REPORT_CATEGORY: Record<string, string> = {
  "booking-compliance": "bookings",
  "top-booked-assets": "bookings",
  "top-booked-kits": "bookings",
  "monthly-booking-trends": "bookings",
  "overdue-items": "bookings",
  "custody-snapshot": "custody",
};

type FeatureFlags = Pick<
  Customisations,
  "bookingsEnabled" | "remindersEnabled" | "custodyEnabled"
>;

/** Assets list columns that only mean something with a feature switched on. */
const FEATURE_COLUMNS: Record<string, (c: FeatureFlags) => boolean> = {
  availableToBook: (c) => c.bookingsEnabled,
  upcomingBookings: (c) => c.bookingsEnabled,
  upcomingReminder: (c) => c.remindersEnabled,
  custody: (c) => c.custodyEnabled,
};

/**
 * Leaves out the columns of switched-off features. Everything that reads the
 * column settings — the table, the column picker, the advanced filters and the
 * CSV export — then loses them together. Saved settings aren't changed.
 */
export function columnsWithoutSwitchedOff<T extends { name: string }>(
  columns: T[],
  c: FeatureFlags
): T[] {
  return columns.filter((col) => FEATURE_COLUMNS[col.name]?.(c) ?? true);
}

/** Whether a report still means anything with these features switched off. */
export function reportIsAvailable(
  report: { id: string; category: string },
  c: FeatureFlags & Pick<Customisations, "auditsEnabled">
) {
  if (report.category === "bookings" && !c.bookingsEnabled) return false;
  if (report.category === "custody" && !c.custodyEnabled) return false;
  if (report.category === "audits" && !c.auditsEnabled) return false;
  // "Idle" means not booked or checked out
  if (report.id === "idle-assets" && !c.bookingsEnabled) return false;
  // Measured from booking and custody time
  if (
    report.id === "asset-utilization" &&
    !c.bookingsEnabled &&
    !c.custodyEnabled
  ) {
    return false;
  }
  return true;
}
