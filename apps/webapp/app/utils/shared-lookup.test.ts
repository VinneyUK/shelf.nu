import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedLookup } from "./shared-lookup";

const respond = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

describe("createSharedLookup", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("loads once, and refresh loads again", async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockImplementation(() => respond({ n: 1 }));
    const lookup = createSharedLookup<{ n: number }>("/api/x");
    await lookup.refresh();
    expect(lookup.peek()).toEqual({ n: 1 });
    f.mockImplementation(() => respond({ n: 2 }));
    await lookup.refresh();
    expect(lookup.peek()).toEqual({ n: 2 });
  });

  it("does not lose a refresh asked for while a load is in flight", async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    let release!: (v: Response) => void;
    f.mockImplementationOnce(() => new Promise<Response>((r) => (release = r)));
    f.mockImplementation(() => respond({ n: "fresh" }));
    const lookup = createSharedLookup<{ n: string }>("/api/x");
    const first = lookup.refresh(); // in flight, slow
    const second = lookup.refresh(); // asked for meanwhile
    release({
      ok: true,
      json: () => Promise.resolve({ n: "stale" }),
    } as Response);
    await first;
    await second;
    expect(lookup.peek()).toEqual({ n: "fresh" }); // the second really fetched again
    expect(f).toHaveBeenCalledTimes(2);
  });
});
