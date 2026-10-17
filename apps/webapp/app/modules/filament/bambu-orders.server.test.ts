import { beforeEach, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ settings: vi.fn() }));
vi.mock("~/modules/ai/settings.server", () => ({
  getAiSettingsRow: ai.settings,
}));
vi.mock("./service.server", () => ({ proposeSpool: vi.fn() }));

import {
  looksLikeBambuOrder,
  parseOrderDate,
  spoolsFromBambuOrder,
} from "./bambu-orders.server";

beforeEach(() => {
  ai.settings.mockReset().mockResolvedValue({
    enabled: true,
    apiKey: "k",
    model: "m",
    workspaceId: "",
  });
});

const order = {
  organizationId: "o1",
  subject: "Fwd: Your Bambu Lab order #UK123",
  text: "Order confirmation…",
  files: [],
};

describe("recognising a Bambu order", () => {
  it("by what it says, since a forward comes from you", () => {
    expect(
      looksLikeBambuOrder({
        subject: "Fwd: Your Bambu Lab order #UK123",
        text: "",
      })
    ).toBe(true);
    expect(
      looksLikeBambuOrder({
        subject: "Fwd: receipt",
        text: "Thanks for shopping at uk.store.bambulab.com",
      })
    ).toBe(true);
    expect(
      looksLikeBambuOrder({ subject: "Your Amazon order", text: "A desk fan" })
    ).toBe(false);
    expect(
      looksLikeBambuOrder({
        subject: "Bambu Lab newsletter",
        text: "New printers!",
      })
    ).toBe(false);
  });
});

describe("reading an order into the Filament inbox", () => {
  it("proposes each filament line with its quantity, price per spool, date, code and Bambu's colour", async () => {
    const call = vi.fn().mockResolvedValue({
      isBambuOrder: true,
      orderDate: "2026-10-12",
      items: [
        {
          isFilament: true,
          line: "PLA Basic",
          colour: "Jade White",
          code: "10100",
          quantity: 4,
          unitPrice: 15.994,
          sizeGrams: 1000,
        },
        {
          isFilament: false,
          line: "Hardened nozzle",
          colour: "",
          quantity: 1,
          unitPrice: 24,
        },
        {
          isFilament: true,
          line: "PLA Matte",
          colour: "Not A Real Colour",
          code: null,
          quantity: 1,
          unitPrice: null,
          sizeGrams: null,
        },
      ],
    });
    const propose = vi
      .fn()
      .mockResolvedValue({ kind: "pending", candidateId: "c" });
    expect(await spoolsFromBambuOrder(order, { call, propose })).toBe(2);
    expect(propose).toHaveBeenCalledTimes(2);
    expect(propose.mock.calls[0]).toEqual([
      "o1",
      expect.objectContaining({
        source: "receipt",
        type: "PLA Basic",
        colourName: "Jade White",
        colourHex: "#FFFFFF",
        quantity: 4,
        pricePaid: 15.99,
        filamentCode: "10100",
        purchasedOn: new Date("2026-10-12T00:00:00.000Z"),
        weightGrams: 1000,
      }),
    ]);
    // a colour the catalogue doesn't know still comes through, with a neutral swatch
    expect(propose.mock.calls[1][1]).toMatchObject({
      colourName: "Not A Real Colour",
      colourHex: "#888888",
      pricePaid: null,
      weightGrams: 1000,
    });
  });
  it("makes nothing when it isn't an order, or AI is off, so the email goes on to drafts", async () => {
    const propose = vi.fn();
    expect(
      await spoolsFromBambuOrder(order, {
        call: vi.fn().mockResolvedValue({ isBambuOrder: false, items: [] }),
        propose,
      })
    ).toBe(0);
    ai.settings.mockResolvedValue({
      enabled: false,
      apiKey: "",
      model: "m",
      workspaceId: "",
    });
    const call = vi.fn();
    expect(await spoolsFromBambuOrder(order, { call, propose })).toBe(0);
    expect(call).not.toHaveBeenCalled();
    expect(propose).not.toHaveBeenCalled();
  });
});

describe("the order date becomes the bought date", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  it("in whichever way it's written", () => {
    expect(parseOrderDate("2026-10-12")).toEqual(day("2026-10-12"));
    expect(parseOrderDate("12/10/2026")).toEqual(day("2026-10-12")); // UK: day first
    expect(parseOrderDate("12 October 2026")).toEqual(day("2026-10-12"));
    expect(parseOrderDate("3rd Sep 2026")).toEqual(day("2026-09-03"));
  });
  it("stays blank when there's no real date", () => {
    expect(parseOrderDate(null)).toBeNull();
    expect(parseOrderDate("soon")).toBeNull();
    expect(parseOrderDate("31/02/2026")).toBeNull();
    expect(parseOrderDate("2099-01-01")).toBeNull(); // not in the future
  });
  it("reaches the inbox entry, whatever the format", async () => {
    const call = vi.fn().mockResolvedValue({
      isBambuOrder: true,
      orderDate: "12/10/2026",
      items: [
        {
          isFilament: true,
          line: "PLA Basic",
          colour: "Jade White",
          quantity: 1,
        },
      ],
    });
    const propose = vi
      .fn()
      .mockResolvedValue({ kind: "pending", candidateId: "c" });
    await spoolsFromBambuOrder(order, { call, propose });
    expect(propose.mock.calls[0][1].purchasedOn).toEqual(day("2026-10-12"));
  });
});

describe("refills on an order", () => {
  it("arrive as refills", async () => {
    const call = vi.fn().mockResolvedValue({
      isBambuOrder: true,
      items: [
        {
          isFilament: true,
          line: "PLA Basic",
          colour: "Jade White",
          quantity: 2,
          kind: "refill",
        },
        {
          isFilament: true,
          line: "PLA Basic",
          colour: "Black",
          quantity: 1,
          kind: "spool",
        },
        { isFilament: true, line: "PLA Basic", colour: "Red", quantity: 1 },
      ],
    });
    const propose = vi
      .fn()
      .mockResolvedValue({ kind: "pending", candidateId: "c" });
    await spoolsFromBambuOrder(order, { call, propose });
    expect(propose.mock.calls.map((c) => c[1].packaging)).toEqual([
      "refill",
      "spool",
      "spool",
    ]);
  });
});
