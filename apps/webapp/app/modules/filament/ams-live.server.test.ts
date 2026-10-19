/**
 * Live AMS (fork): watchers start with Shelf, and each printer report goes
 * straight to open Filament pages. The printer, cloud and database are pretend.
 */
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  printers: [] as { organizationId: string }[],
  rows: {} as Record<string, unknown>,
  off: new Set<string>(),
  clients: [] as { handlers: Record<string, (...a: unknown[]) => void> }[],
  sync: vi.fn(),
}));

vi.mock("~/database/db.server", () => ({
  db: {
    printer: {
      findMany: vi.fn(() => m.printers),
      findUnique: vi.fn(({ where }) => m.rows[where.organizationId] ?? null),
      update: vi.fn(() => Promise.resolve()),
    },
  },
}));
vi.mock("~/utils/secret-box.server", () => ({
  decryptSecret: (s: string) => s,
  encryptSecret: (s: string) => s,
}));
vi.mock("~/modules/customisation/service.server", () => ({
  isFeatureSwitchedOff: (org: string) => Promise.resolve(m.off.has(org)),
}));
vi.mock("mqtt", () => ({
  default: {
    connect: vi.fn(() => {
      const client = {
        handlers: {} as Record<string, (...a: unknown[]) => void>,
        on(event: string, fn: (...a: unknown[]) => void) {
          client.handlers[event] = fn;
          return client;
        },
        subscribe: vi.fn(),
        publish: vi.fn(),
        end: vi.fn(),
      };
      m.clients.push(client);
      return client;
    }),
  },
}));
vi.mock("./service.server", () => ({ syncAmsTrays: m.sync }));

const emitter = new EventEmitter();
vi.mock("~/utils/emitter/emitter.server", () => ({ emitter }));

const { publishAms, startAmsWatchers } = await import("./printer.server");

const printerRow = (enabled = true) => ({
  enabled,
  host: "192.168.0.119",
  serial: "00M00A000000000",
  accessCode: "12345678",
});

beforeEach(() => {
  m.clients = [];
  m.printers = [];
  m.rows = {};
  m.off = new Set();
  emitter.removeAllListeners();
});

describe("when Shelf starts", () => {
  it("starts reading the AMS for each workspace with its printer set up, not one with Filament switched off", async () => {
    m.printers = [{ organizationId: "o1" }, { organizationId: "o2" }];
    m.rows = { o1: printerRow(), o2: printerRow() };
    m.off = new Set(["o2"]);
    startAmsWatchers();
    await vi.waitFor(() => expect(m.clients).toHaveLength(1));
    // a second start (a dev reload) doesn't start them twice
    startAmsWatchers();
    await new Promise((r) => setTimeout(r, 10));
    expect(m.clients).toHaveLength(1);
  });
});

describe("a printer report", () => {
  it("reaches open pages straight away, with the levels and what to say", () => {
    const heard: string[] = [];
    emitter.on("ams", (msg: string) => heard.push(msg));
    publishAms({
      organizationId: "o1",
      trays: [],
      levels: [{ id: "s1", remainingPercent: 45, amsSlot: 2 }],
      events: [],
      refresh: false,
    });
    expect(JSON.parse(heard[0])).toEqual({
      organizationId: "o1",
      trays: [],
      levels: [{ id: "s1", remainingPercent: 45, amsSlot: 2 }],
      events: [],
      refresh: false,
    });
  });
});
