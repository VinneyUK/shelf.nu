/**
 * Filament page view (fork): Tile or List, remembered in a cookie for a year.
 */
import { createCookie } from "react-router";

export type FilamentView = "tile" | "list";

const filamentViewCookie = createCookie("filament-view", {
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  path: "/",
});

/** The view asked for (?view=), else the remembered one, else List; plus a cookie when it changed. */
export async function resolveFilamentView(
  request: Request
): Promise<{ view: FilamentView; setCookie: string | null }> {
  const asked = new URL(request.url).searchParams.get("view");
  const remembered = (await filamentViewCookie.parse(
    request.headers.get("Cookie")
  )) as string | null;
  const valid = (v: string | null): v is FilamentView =>
    v === "tile" || v === "list";
  if (valid(asked)) {
    return {
      view: asked,
      setCookie:
        asked === remembered ? null : await filamentViewCookie.serialize(asked),
    };
  }
  return { view: valid(remembered) ? remembered : "list", setCookie: null };
}
