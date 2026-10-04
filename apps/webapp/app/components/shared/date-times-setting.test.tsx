/**
 * "Show times in dates" (fork): lists show just the date unless the workspace
 * switches times on; logs can keep theirs.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showTimesInDates: false,
  formatDate: vi.fn(
    (_date: unknown, _options: { includeTime?: boolean }) => "formatted"
  ),
}));
vi.mock("~/hooks/use-date-formatter", () => ({
  useDateFormatter: () => ({ formatDate: mocks.formatDate }),
}));
vi.mock("~/modules/customisation/use-customisations", () => ({
  useShowTimesInDates: () => mocks.showTimesInDates,
}));

import { DateS } from "./date";

const lastIncludeTime = () =>
  mocks.formatDate.mock.calls.at(-1)![1].includeTime;
const date = new Date("2026-10-04T16:35:00Z");

beforeEach(() => {
  mocks.formatDate.mockClear();
  mocks.showTimesInDates = false;
});

describe("DateS and the Show times in dates setting", () => {
  it("drops the time when the setting is off", () => {
    render(<DateS date={date} includeTime />);
    expect(lastIncludeTime()).toBe(false);
  });
  it("shows the time when the setting is on", () => {
    mocks.showTimesInDates = true;
    render(<DateS date={date} includeTime />);
    expect(lastIncludeTime()).toBe(true);
  });
  it("keeps the time for logs, whatever the setting", () => {
    render(<DateS date={date} includeTime keepTime />);
    expect(lastIncludeTime()).toBe(true);
  });
  it("never adds a time that wasn't asked for", () => {
    mocks.showTimesInDates = true;
    render(<DateS date={date} />);
    expect(lastIncludeTime()).toBe(false);
  });
});
