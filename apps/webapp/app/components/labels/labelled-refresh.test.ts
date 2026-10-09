/**
 * After a print is asked for, the badge keeps looking until the label is
 * actually printed (labels print on a background pass, and the printer takes
 * a while), and stops as soon as it has.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => ({
  data: { labelled: {} as Record<string, string> },
  refresh: vi.fn(),
}));
vi.mock("~/utils/shared-lookup", () => ({
  createSharedLookup: () => ({
    useData: () => lookup.data,
    peek: () => lookup.data,
    refresh: lookup.refresh,
  }),
}));

import { refreshLabelledSoon } from "./labelled-badge";

beforeEach(() => {
  vi.useFakeTimers();
  lookup.data = { labelled: {} };
  lookup.refresh.mockReset().mockImplementation(() => Promise.resolve());
});
afterEach(() => vi.useRealTimers());

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("refreshLabelledSoon", () => {
  it("looks again every 3 seconds until the asset shows as labelled, then stops", async () => {
    refreshLabelledSoon(["a1"]);
    await flush();
    expect(lookup.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(lookup.refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(lookup.refresh).toHaveBeenCalledTimes(3);
    // the print finishes
    lookup.data = { labelled: { a1: "2026-10-09T10:00:00.000Z" } };
    await vi.advanceTimersByTimeAsync(3000);
    expect(lookup.refresh).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lookup.refresh).toHaveBeenCalledTimes(4); // stopped
  });
  it("counts a removed label as a change too", async () => {
    lookup.data = { labelled: { a1: "2026-10-09T10:00:00.000Z" } };
    refreshLabelledSoon(["a1"]);
    await flush();
    lookup.data = { labelled: {} };
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lookup.refresh).toHaveBeenCalledTimes(2);
  });
  it("gives up after two minutes if nothing ever changes", async () => {
    refreshLabelledSoon(["a1"]);
    await flush();
    await vi.advanceTimersByTimeAsync(130_000);
    const calls = lookup.refresh.mock.calls.length;
    expect(calls).toBeGreaterThan(30);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lookup.refresh.mock.calls.length).toBe(calls);
  });
  it("without ids, stops as soon as anything changes (bulk prints)", async () => {
    refreshLabelledSoon();
    await flush();
    lookup.data = { labelled: { b7: "2026-10-09T10:00:00.000Z" } };
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lookup.refresh).toHaveBeenCalledTimes(2);
  });
});
