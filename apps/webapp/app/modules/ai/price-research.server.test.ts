import { describe, expect, it, vi } from "vitest";
import { imageBlock } from "./claude.server";
import {
  explainSearchError,
  MAX_SEARCHES,
  researchPrice,
  WEB_SEARCH_TOOL,
} from "./price-research.server";
import {
  photoContent,
  priceResearchContent,
  priceResearchSystemPrompt,
} from "./prompts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const answer = (text: string, extra: unknown[] = [], stop = "end_turn") =>
  json({ content: [...extra, { type: "text", text }], stop_reason: stop });
const search = {
  type: "server_tool_use",
  name: "web_search",
  input: { query: "roli piano m price uk" },
};
const args = (fetchImpl: unknown) => ({
  apiKey: "sk-test",
  model: "claude-sonnet-5-5",
  system: "sys",
  content: [imageBlock(new Uint8Array([1]), "image/jpeg")],
  fetchImpl: fetchImpl as typeof fetch,
  sleep: () => Promise.resolve(),
});

describe("researchPrice", () => {
  it("offers the basic web search tool, limited and set to the UK, and doesn't force a tool", async () => {
    const f = vi.fn().mockResolvedValue(answer("Item: keyboard"));
    await researchPrice(args(f));
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.tools).toEqual([WEB_SEARCH_TOOL]);
    expect(WEB_SEARCH_TOOL.type).toBe("web_search_20250305");
    expect(WEB_SEARCH_TOOL.max_uses).toBe(MAX_SEARCHES);
    expect(WEB_SEARCH_TOOL.user_location.country).toBe("GB");
    expect(body).not.toHaveProperty("tool_choice");
    expect(f.mock.calls[0][1].headers["x-api-key"]).toBe("sk-test");
  });
  it("returns Claude's plain-text findings and counts the searches", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        answer("Item: ROLI Piano M\nNew price (GBP): 150", [
          search,
          { type: "web_search_tool_result", content: [] },
          search,
        ])
      );
    const r = await researchPrice(args(f));
    expect(r).toEqual({
      text: "Item: ROLI Piano M\nNew price (GBP): 150",
      searches: 2,
      error: null,
    });
  });
  it("sends the workspace ID when one is set", async () => {
    const f = vi.fn().mockResolvedValue(answer("x"));
    await researchPrice({ ...args(f), workspaceId: "wrkspc_01ABC" });
    expect(f.mock.calls[0][1].headers["anthropic-workspace-id"]).toBe(
      "wrkspc_01ABC"
    );
  });
  it("carries on when a long search turn is paused, handing back its own work", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(answer("", [search], "pause_turn"))
      .mockResolvedValueOnce(answer("Item: keyboard\nNew price (GBP): 150"));
    const r = await researchPrice(args(f));
    expect(r.text).toMatch(/150/);
    expect(f).toHaveBeenCalledTimes(2);
    const second = JSON.parse(f.mock.calls[1][1].body);
    expect(second.messages).toHaveLength(2);
    expect(second.messages[1].role).toBe("assistant");
    expect(second.messages[1].content[0].type).toBe("server_tool_use");
    expect(second.tools).toEqual([WEB_SEARCH_TOOL]); // a paused turn needs the tool again
  });
  it("gives up, plainly, if it keeps pausing", async () => {
    const f = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(answer("", [search], "pause_turn"))
      );
    const r = await researchPrice(args(f));
    expect(r).toMatchObject({
      text: null,
      error: "The price lookup took too long.",
    });
    expect(f).toHaveBeenCalledTimes(4);
  });
  it("reports a search error that Anthropic returned inside a successful response", async () => {
    const failed = {
      type: "web_search_tool_result",
      content: {
        type: "web_search_tool_result_error",
        error_code: "too_many_requests",
      },
    };
    const none = vi
      .fn()
      .mockResolvedValue(
        json({ content: [search, failed], stop_reason: "end_turn" })
      );
    expect((await researchPrice(args(none))).error).toMatch(/rate-limited/);
    // an answer given anyway is kept, with the warning beside it
    const some = vi
      .fn()
      .mockResolvedValue(
        answer("Item: keyboard (from memory)", [search, failed])
      );
    expect(await researchPrice(args(some))).toMatchObject({
      text: "Item: keyboard (from memory)",
      error: expect.stringMatching(/rate-limited/),
    });
  });
  it("explains when web search isn't switched on for the Anthropic account", async () => {
    const f = vi.fn().mockResolvedValue(
      json(
        {
          error: {
            message:
              "The web search tool is not enabled for your organization.",
          },
        },
        400
      )
    );
    const r = await researchPrice(args(f));
    expect(r.text).toBeNull();
    expect(r.error).toMatch(/isn't switched on/);
    expect(r.error).toMatch(/Claude Console/);
    expect(f).toHaveBeenCalledTimes(1); // not retried
  });
  it("retries a busy API, and reports a lost connection, without throwing", async () => {
    const busy = vi
      .fn()
      .mockResolvedValueOnce(json({ error: {} }, 529))
      .mockResolvedValueOnce(answer("ok"));
    expect((await researchPrice(args(busy))).text).toBe("ok");
    const down = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect((await researchPrice(args(down))).error).toMatch(/Couldn't reach/);
  });
  it("says so if there's no key, or nothing came back", async () => {
    expect(
      (await researchPrice({ ...args(vi.fn()), apiKey: "" })).error
    ).toMatch(/No API key/);
    const empty = vi
      .fn()
      .mockResolvedValue(json({ content: [], stop_reason: "end_turn" }));
    expect((await researchPrice(args(empty))).error).toMatch(/found nothing/);
  });
});

describe("search error codes", () => {
  it("are explained in plain words", () => {
    expect(explainSearchError("unavailable")).toMatch(/unavailable/);
    expect(explainSearchError("max_uses_exceeded")).toMatch(
      /more than allowed/
    );
    expect(explainSearchError("mystery")).toMatch(/mystery/);
  });
});

describe("the research prompts", () => {
  it("ask for the NEW price in the fixed shape, ignoring used listings", () => {
    const p = priceResearchSystemPrompt("GBP");
    expect(p).toMatch(/costs NEW today/);
    expect(p).toMatch(/second-hand/);
    expect(p).toMatch(/closest current equivalent/);
    expect(p).toMatch(/New price \(GBP\): <one number, or unknown>/);
    expect(priceResearchContent({ type: "text", text: "(img)" })).toHaveLength(
      2
    );
  });
  it("go into the draft request only when there is research", () => {
    const img = { type: "text", text: "(img)" } as const;
    const without = (photoContent(img, [], "GBP")[1] as { text: string }).text;
    expect(without).not.toMatch(/Price research/);
    const withR = (
      photoContent(
        img,
        [],
        "GBP",
        "Item: keyboard\nNew price (GBP): 150"
      )[1] as { text: string }
    ).text;
    expect(withR).toMatch(/Price research from a web search/);
    expect(withR).toMatch(/New price \(GBP\): 150/);
    expect(withR.indexOf("Price research")).toBeLessThan(
      withR.indexOf("Record the item")
    );
    expect(
      (photoContent(img, [], "GBP", "   ")[1] as { text: string }).text
    ).not.toMatch(/Price research/);
  });
});

describe("a stalled search", () => {
  it("is given a time limit, and ends the lookup (without retrying) so the draft carries on", async () => {
    const f = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("timeout"), { name: "TimeoutError" })
      );
    const r = await researchPrice(args(f));
    expect(r).toMatchObject({
      text: null,
      error: "The price lookup took too long.",
    });
    expect(f).toHaveBeenCalledTimes(1);
    const ok = vi.fn().mockResolvedValue(answer("x"));
    await researchPrice(args(ok));
    expect(ok.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
