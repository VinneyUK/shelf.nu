/**
 * The current workspace's customisations, from the main layout's data.
 * Part of the customise feature; not in upstream Shelf.
 */
import { useRouteLoaderData } from "react-router";
import type { loader } from "~/routes/_layout+/_layout";
import { type Customisations, DEFAULT_CUSTOMISATIONS } from "./catalogue";

const LAYOUT_ROUTE = "routes/_layout+/_layout";

/**
 * The layout's data, or undefined when there is none: outside the app's router
 * (PDF receipts, emails, tests) the router hook throws, and these should simply
 * get the defaults. The same hook runs every render either way, so the order of
 * hooks is stable.
 */
function useLayoutData() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- always called, never conditionally; only its failure is handled
    return useRouteLoaderData<typeof loader>(LAYOUT_ROUTE);
  } catch {
    return undefined;
  }
}

export function useCustomisations(): Customisations {
  return useLayoutData()?.customisations ?? DEFAULT_CUSTOMISATIONS;
}

/**
 * Whether dates in lists show the time. Outside the app (PDF receipts and the
 * like) there's no setting, and those documents keep their times.
 */
export function useShowTimesInDates(): boolean {
  const customisations = useLayoutData()?.customisations;
  return customisations ? customisations.showTimesInDates : true;
}
