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
};

/** Shelf as it ships, for workspaces that have never been customised. */
export const DEFAULT_CUSTOMISATIONS: Customisations = {
  bookingsEnabled: true,
  remindersEnabled: true,
  auditsEnabled: true,
  hiddenMenuItems: [],
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

/**
 * Where to send someone who opens a page for a feature that's switched off,
 * or null if the page is fine.
 */
export function redirectForSwitchedOffPage(
  pathname: string,
  c: Customisations
): string | null {
  const blocked =
    (!c.bookingsEnabled && BOOKING_PAGES.some((re) => re.test(pathname))) ||
    (!c.remindersEnabled && REMINDER_PAGES.some((re) => re.test(pathname))) ||
    (!c.auditsEnabled && AUDIT_PAGES.some((re) => re.test(pathname)));
  if (!blocked) return null;
  return c.hiddenMenuItems.includes("home") ? "/assets" : "/home";
}
