import { describe, expect, it } from "vitest";
import { ALL_SELECTED_KEY } from "~/utils/list";
import { labelMenuEntries, labelMenuMode } from "./menu-mode";

const labelled = { a: "2026-10-04T10:00:00Z", b: "2026-10-04T10:00:00Z" };
const labels = (ids: string[]) =>
  labelMenuEntries(labelMenuMode(ids, labelled)).map((e) => e.label);

describe("label menu for a selection", () => {
  it("offers just Print labels when nothing selected has a label", () => {
    expect(labels(["x"])).toEqual(["Print labels"]);
    expect(labels(["x", "y"])).toEqual(["Print labels"]);
    expect(labels([])).toEqual(["Print labels"]);
  });
  it("offers Re-print and Remove when everything selected has a label", () => {
    expect(labels(["a"])).toEqual(["Re-print labels", "Remove labels"]);
    expect(labels(["a", "b"])).toEqual(["Re-print labels", "Remove labels"]);
  });
  it("offers Print and Remove for a mix, so unlabelled ones can still be printed", () => {
    expect(labels(["a", "x"])).toEqual(["Print labels", "Remove labels"]);
  });
  it("offers Print and Remove for select-all across pages, where it can't tell", () => {
    expect(labels([ALL_SELECTED_KEY])).toEqual([
      "Print labels",
      "Remove labels",
    ]);
  });
  it("sends the right action for each entry", () => {
    expect(labelMenuEntries("reprint-remove").map((e) => e.intent)).toEqual([
      "print",
      "remove",
    ]);
  });
});
