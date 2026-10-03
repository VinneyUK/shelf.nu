/**
 * The current workspace's customisations, from the main layout's data.
 * Part of the customise feature; not in upstream Shelf.
 */
import { useRouteLoaderData } from "react-router";
import type { loader } from "~/routes/_layout+/_layout";
import { type Customisations, DEFAULT_CUSTOMISATIONS } from "./catalogue";

export function useCustomisations(): Customisations {
  const layoutData = useRouteLoaderData<typeof loader>(
    "routes/_layout+/_layout"
  );
  return layoutData?.customisations ?? DEFAULT_CUSTOMISATIONS;
}
