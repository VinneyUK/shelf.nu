/**
 * A filament's page, laid out after Ant's design (fork): the summary, the
 * spool in use with its ring and run-out estimate, other open spools as
 * rows, sealed stock, finished folded away, and Reorder, Print settings and
 * Label on the right.
 */
import { render, screen, within, fireEvent } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/components/filament/live-updates", () => ({
  useAmsLive: () => ({ live: (s: unknown[]) => s, trays: null, status: null }),
}));
vi.mock("~/utils/client-hints", () => ({
  getHints: vi.fn(() => ({ locale: "en-GB", timeZone: "UTC" })),
  useHints: vi.fn(() => ({ locale: "en-GB", timeZone: "UTC" })),
}));
vi.mock("~/components/shared/date", () => ({
  DateS: ({ date }: { date: string | Date }) => (
    <span>{new Date(date).toISOString().slice(0, 10)}</span>
  ),
}));
vi.mock("~/hooks/use-current-organization", () => ({
  useCurrentOrganization: () => ({ currency: "GBP" }),
}));
vi.mock("~/components/layout/header", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
}));

const { default: FilamentDetail } = await import(
  "~/routes/_layout+/filament.$slug"
);

const day = (d: string) => new Date(`${d}T12:00:00Z`).toISOString();
const spool = (over: Record<string, unknown>) => ({
  id: String(over.n),
  type: "PLA Basic",
  material: "PLA",
  colourName: "Jade White",
  colourHex: "#EDEDE6",
  weightGrams: 1000,
  remainingPercent: 100,
  pricePaid: 16.99,
  purchasedOn: null,
  openedOn: null,
  status: "active",
  amsSlot: null,
  filamentCode: "10100",
  packaging: "spool",
  spoolWeightGrams: null,
  retiredAt: null,
  createdAt: day(`2026-10-0${over.n}`),
  ...over,
});

const opened = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
const data = {
  fil: { id: "n1", label: "FIL-0010" },
  label: null,
  header: { title: "Jade White" },
  slug: "pla-basic--jade-white",
  filament: {
    type: "PLA Basic",
    material: "PLA",
    colourName: "Jade White",
    colourHex: "#EDEDE6",
    filamentCode: "10100",
    weightGrams: 1000,
    spoolWeightGrams: null,
    key: "pla basic|jade white",
  },
  catalogue: { density: 1.24, nozzleTemp: 220, bedTemp: 60, spoolWeight: 250 },
  spools: [
    spool({ n: 1, packaging: "refill", pricePaid: 13.99 }),
    spool({ n: 2 }),
    spool({
      n: 5,
      remainingPercent: 27,
      openedOn: opened,
      amsSlot: 2,
      purchasedOn: day("2026-10-07"),
    }),
    spool({ n: 6, remainingPercent: 64, openedOn: day("2026-10-01") }),
    spool({
      n: 7,
      status: "retired",
      remainingPercent: 0,
      retiredAt: day("2026-10-09"),
    }),
    spool({
      n: 8,
      status: "retired",
      remainingPercent: 0,
      retiredPercent: 27,
      retiredAt: day("2026-10-08"),
    }),
  ],
  images: {},
  price: {
    status: "found",
    checkedAt: new Date().toISOString(),
    message: null,
    productUrl: "https://uk.store.bambulab.com/products/pla-basic",
    variants: [
      {
        kind: "Filament with spool",
        weight: "1 kg",
        price: 16.99,
        compareAt: null,
      },
      { kind: "Refill", weight: "1 kg", price: 13.99, compareAt: null },
    ],
  },
  codes: [],
  inAms: [
    {
      id: "5",
      amsSlot: 2,
      type: "PLA Basic",
      colourName: "Jade White",
      colourHex: "#EDEDE6",
    },
    {
      id: "x",
      amsSlot: 1,
      type: "PLA Basic",
      colourName: "Red",
      colourHex: "#D62B2B",
    },
  ],
  levels: [
    { day: "2026-10-15", grams: 3600 },
    { day: "2026-10-17", grams: 3300 },
    { day: "2026-10-19", grams: 2910 },
  ],
};

function show() {
  const Stub = createRoutesStub([
    { path: "/filament/:slug", Component: FilamentDetail, loader: () => data },
  ]);
  return render(<Stub initialEntries={["/filament/pla-basic--jade-white"]} />);
}

describe("a filament's page", () => {
  it("sums it up at the top: on hand, units, cost, and how long it lasts", async () => {
    show();
    // 1 kg + 1 kg sealed, 270 g + 640 g open
    expect(await screen.findByText("2.91 kg")).toBeTruthy();
    expect(screen.getByText("2 open · 2 sealed")).toBeTruthy();
    expect(screen.getByText(/≈ \d+ days at your recent rate/)).toBeTruthy();
  });

  it("puts the spool in the AMS in the In use card, with its run-out estimate", async () => {
    show();
    const heading = await screen.findByRole("heading", { name: "In use" });
    const card = heading.closest("div.my-0") as HTMLElement;
    expect(within(card).getByText("#3 · Spool")).toBeTruthy();
    expect(within(card).getAllByText("AMS 2").length).toBeGreaterThan(0);
    expect(within(card).getByText("270 g")).toBeTruthy();
    expect(within(card).getByText("Runs out")).toBeTruthy();
    expect(within(card).getByText(/≈ \d+ g a day/)).toBeTruthy();
    // Weigh, Put in AMS, Back to New, Finished and Delete, nothing hidden
    expect(within(card).getByRole("button", { name: "Finished" })).toBeTruthy();
    expect(
      within(card).getByRole("button", { name: "Back to New" })
    ).toBeTruthy();
  });

  it("shows another open spool as a row, and the sealed ones in the table", async () => {
    show();
    expect(await screen.findByText(/Also open · On the shelf/)).toBeTruthy();
    const table = screen
      .getByRole("heading", { name: "Sealed stock" })
      .closest("div.my-0") as HTMLElement;
    expect(within(table).getAllByRole("row")).toHaveLength(3); // heading + 2
    expect(within(table).getAllByText("Add date")).toHaveLength(2);
  });

  it("brings a finished spool back as it was", async () => {
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Finished \d/ })
    );
    expect(
      await screen.findByRole("button", { name: "Bring it back (27% left)" })
    ).toBeTruthy();
  });

  it("asks how much is left when a finished spool's level wasn't kept", async () => {
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Finished \d/ })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Bring it back…" })
    );
    expect(await screen.findByText(/How much is left/)).toBeTruthy();
  });

  it("puts the open spool in an AMS slot, saying what's in each", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /AMS 2/ }));
    expect(await screen.findByText(/Red: swaps out/)).toBeTruthy();
    expect(screen.getByText("Take it out (keep it open)")).toBeTruthy();
  });

  it("has every action out on the rows, and a handle to reorder sealed stock", async () => {
    show();
    expect(
      await screen.findAllByRole("button", { name: "Open it" })
    ).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Move #/ })).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Back to New (sealed)" })
    ).toBeTruthy();
  });

  it("charts usage with an average and a run-out date", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Usage" })).toBeTruthy();
    expect(screen.getByText(/g a day/, { selector: "b" })).toBeTruthy();
  });

  it("folds finished ones away until asked", async () => {
    show();
    const toggle = await screen.findByRole("button", { name: /^Finished \d/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("offers the store's prices, the refill's saving, and print settings", async () => {
    show();
    expect(
      await screen.findByText("£3.00 cheaper: reuses an empty spool")
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Buy on the Bambu store/ })
        .getAttribute("href")
    ).toBe("https://uk.store.bambulab.com/products/pla-basic");
    expect(screen.getByText("220 °C")).toBeTruthy();
    expect(screen.getByText("60 °C")).toBeTruthy();
  });
});
