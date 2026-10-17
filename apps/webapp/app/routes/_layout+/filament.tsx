/**
 * Filament (fork): the parent of the Filament pages, as assets.tsx is for
 * Assets. It owns the "Filament" breadcrumb; the list, each filament's page
 * and stocktake add their own crumb after it.
 */
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

export const meta = () => [{ title: appendToMetaTitle("Filament") }];

export function loader() {
  return null;
}

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  // toggling the sidebar needs no reload here; _layout handles it
  if (actionResult?.isTogglingSidebar) return false;
  return defaultShouldRevalidate;
}

export const handle = {
  breadcrumb: () => <Link to="/filament">Filament</Link>,
};

export default function FilamentLayout() {
  return <Outlet />;
}

export const ErrorBoundary = () => <ErrorContent />;
