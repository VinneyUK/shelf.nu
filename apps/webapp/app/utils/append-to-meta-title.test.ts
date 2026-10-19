/**
 * Page titles name the app as Vinventory (fork).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { config } from "~/config/shelf.config";
import { appendToMetaTitle } from "./append-to-meta-title";

describe("page titles and icons", () => {
  it("end with Vinventory", () => {
    expect(appendToMetaTitle("Filament")).toBe("Filament | Vinventory");
    expect(appendToMetaTitle(null)).toBe("Not found | Vinventory");
  });

  it("use Vinventory's icon in the tab and on a home screen", () => {
    expect(config.faviconPath).toBe("/static/vinventory-favicon.ico");
    const manifest = JSON.parse(
      readFileSync("public/static/manifest.json", "utf8")
    );
    expect(manifest.name).toBe("Vinventory");
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual([
      "/static/images/vinventory-x192.png",
      "/static/images/vinventory-x512.png",
    ]);
  });
});
