/**
 * Live AMS on an open Filament page (fork): what updates in place, and when a
 * refresh waits for you.
 */
import { describe, expect, it } from "vitest";
import { isBusy, withLevel } from "./live-updates";

describe("withLevel", () => {
  const spool = {
    id: "s1",
    remainingPercent: 80,
    amsSlot: null,
    colourName: "Red",
  };

  it("takes the AMS's latest level and slot, keeping everything else", () => {
    const levels = new Map([["s1", { remainingPercent: 45, amsSlot: 2 }]]);
    expect(withLevel(spool, levels)).toEqual({
      id: "s1",
      remainingPercent: 45,
      amsSlot: 2,
      colourName: "Red",
    });
  });

  it("leaves a spool the AMS hasn't reported as it is", () => {
    expect(withLevel(spool, new Map())).toBe(spool);
  });
});

describe("isBusy", () => {
  it("is busy while you're typing in a field", () => {
    document.body.innerHTML = '<input id="i" />';
    (document.getElementById("i") as HTMLInputElement).focus();
    expect(isBusy()).toBe(true);
  });

  it("is busy while a picker or dialog is open", () => {
    document.body.innerHTML = '<div role="dialog">Delete?</div>';
    expect(isBusy()).toBe(true);
  });

  it("isn't otherwise", () => {
    document.body.innerHTML = "<button>Print</button>";
    expect(isBusy()).toBe(false);
  });
});
