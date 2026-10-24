/**
 * The Matter mark beside names in the assets list (fork): only on assets with
 * Matter devices, and ONE request for the whole list, however many rows.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatterNameMark, resetMatterAssetIds } from "./matter-name-mark";

afterEach(() => {
  resetMatterAssetIds();
  vi.unstubAllGlobals();
});

describe("MatterNameMark", () => {
  it("shows on assets with Matter devices only, asking once for fifty rows", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ assetIds: ["plug"] }),
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <>
        <MatterNameMark assetId="plug" />
        {Array.from({ length: 49 }, (_, i) => (
          <MatterNameMark key={i} assetId={`other-${i}`} />
        ))}
      </>
    );
    expect(
      await screen.findAllByRole("img", { name: "Matter device" })
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows nothing, and doesn't keep asking, when the request fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <>
        <MatterNameMark assetId="plug" />
        <MatterNameMark assetId="bike" />
      </>
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(
      screen.queryAllByRole("img", { name: "Matter device" })
    ).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
