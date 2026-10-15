import { describe, expect, it } from "vitest";
import { resolveFilamentView } from "./view.server";

/** A request as the server sees it (Node's Request drops a Cookie set by hand). */
const req = (url: string, cookie?: string) =>
  ({
    url: `http://shelf.local${url}`,
    headers: new Headers(cookie ? { cookie } : {}),
  }) as unknown as Request;

describe("the Filament page view", () => {
  it("is List until chosen", async () => {
    expect(await resolveFilamentView(req("/filament"))).toEqual({
      view: "list",
      setCookie: null,
    });
  });
  it("switches with ?view= and remembers it", async () => {
    const tile = await resolveFilamentView(req("/filament?view=tile"));
    expect(tile.view).toBe("tile");
    expect(tile.setCookie).toMatch(/^filament-view=/);
    const cookie = tile.setCookie!.split(";")[0];
    expect((await resolveFilamentView(req("/filament", cookie))).view).toBe(
      "tile"
    );
    // asking for what's already remembered sets nothing new
    expect(
      (await resolveFilamentView(req("/filament?view=tile", cookie))).setCookie
    ).toBeNull();
  });
  it("ignores a view it doesn't know", async () => {
    expect((await resolveFilamentView(req("/filament?view=grid"))).view).toBe(
      "list"
    );
  });
});
