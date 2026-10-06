import { describe, expect, it, vi } from "vitest";
import {
  callClaude,
  ClaudeError,
  explainFailure,
  imageBlock,
} from "./claude.server";

const tool = {
  name: "record_items",
  description: "d",
  input_schema: { type: "object" },
};
const ok = (input: unknown) =>
  new Response(
    JSON.stringify({
      content: [{ type: "tool_use", name: "record_items", input }],
      stop_reason: "tool_use",
    }),
    { status: 200 }
  );
const fail = (status: number, message = "") =>
  new Response(JSON.stringify({ error: { message } }), { status });
const args = (fetchImpl: typeof fetch) => ({
  apiKey: "sk-test",
  model: "claude-sonnet-5-5",
  system: "sys",
  content: [imageBlock(new Uint8Array([1, 2, 3]), "image/jpeg")],
  tool,
  fetchImpl,
  sleep: () => Promise.resolve(),
});

describe("callClaude", () => {
  it("sends the key, model and the tool, and returns its input, and returns the tool input", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ items: [] }));
    expect(await callClaude(args(fetchImpl as never))).toEqual({ items: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-test");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-sonnet-5-5");
    // newer models (Sonnet 5.5, Opus 5.5) refuse a forced tool: the model chooses
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.tool_choice.type).not.toBe("tool");
    const last = body.messages[0].content.at(-1);
    expect(last.type).toBe("text");
    expect(last.text).toMatch(/calling the record_items tool/);
    expect(last.text).not.toMatch(/You must call it now/);
    expect(body.messages[0].content[0].source.data).toBe(
      Buffer.from([1, 2, 3]).toString("base64")
    );
  });
  it("retries a busy API, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fail(529))
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(ok({ items: [1] }));
    expect(await callClaude(args(fetchImpl as never))).toEqual({ items: [1] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("gives up after three busy answers, in plain words", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(529));
    await expect(callClaude(args(fetchImpl as never))).rejects.toThrow(
      /overloaded/
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("does not retry a rejected key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(401, "invalid x-api-key"));
    await expect(callClaude(args(fetchImpl as never))).rejects.toThrow(
      /rejected the API key/
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("explains a missing key, a lost connection, and an answer with no tool call", async () => {
    await expect(
      callClaude({ ...args(vi.fn() as never), apiKey: "" })
    ).rejects.toThrow(/No API key/);
    const down = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(callClaude(args(down as never))).rejects.toThrow(
      /Couldn't reach Anthropic/
    );
    // a fresh response each call, as a real fetch gives
    const empty = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ content: [{ type: "text", text: "hi" }] }),
            { status: 200 }
          )
        )
      );
    await expect(callClaude(args(empty as never))).rejects.toThrow(
      /usable answer/
    );
    expect(empty).toHaveBeenCalledTimes(2); // asked once more, then reported
  });
  it("re-asks once, insisting, when the first answer is plain text, and uses the second", async () => {
    const prose = new Response(
      JSON.stringify({
        content: [{ type: "text", text: "Here is a charger." }],
        stop_reason: "end_turn",
      }),
      { status: 200 }
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(prose)
      .mockResolvedValueOnce(ok({ items: [{ name: "Charger" }] }));
    expect(await callClaude(args(fetchImpl as never))).toEqual({
      items: [{ name: "Charger" }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(second.messages[0].content.at(-1).text).toMatch(
      /You must call it now/
    );
    expect(second.tool_choice).toEqual({ type: "auto" });
  });
  it("does not re-ask an answer that was cut off, and says so", async () => {
    const cut = new Response(
      JSON.stringify({ content: [], stop_reason: "max_tokens" }),
      { status: 200 }
    );
    const fetchImpl = vi.fn().mockResolvedValue(cut);
    await expect(callClaude(args(fetchImpl as never))).rejects.toThrow(
      /cut off/
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("gives the model room to think before answering", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ items: [] }));
    await callClaude(args(fetchImpl as never));
    expect(
      JSON.parse(fetchImpl.mock.calls[0][1].body).max_tokens
    ).toBeGreaterThanOrEqual(4096);
  });
});

describe("explainFailure", () => {
  it("names the real problem", () => {
    expect(explainFailure(404, "model: x").message).toMatch(
      /doesn't know that model/
    );
    expect(
      explainFailure(400, "Your credit balance is too low").message
    ).toMatch(/out of credit/);
    expect(explainFailure(413, "").message).toMatch(/too large/);
    expect(explainFailure(500, "").retryable).toBe(true);
    expect(explainFailure(401, "").retryable).toBe(false);
    expect(explainFailure(401, "")).toBeInstanceOf(ClaudeError);
  });
});

describe("workspace-scoped keys", () => {
  it("sends the workspace ID header only when one is set", async () => {
    const withId = vi.fn().mockResolvedValue(ok({ items: [] }));
    await callClaude({
      ...args(withId as never),
      workspaceId: " wrkspc_01ABC ",
    });
    expect(withId.mock.calls[0][1].headers["anthropic-workspace-id"]).toBe(
      "wrkspc_01ABC"
    );
    const without = vi.fn().mockResolvedValue(ok({ items: [] }));
    await callClaude(args(without as never));
    expect(without.mock.calls[0][1].headers).not.toHaveProperty(
      "anthropic-workspace-id"
    );
    const blank = vi.fn().mockResolvedValue(ok({ items: [] }));
    await callClaude({ ...args(blank as never), workspaceId: "  " });
    expect(blank.mock.calls[0][1].headers).not.toHaveProperty(
      "anthropic-workspace-id"
    );
  });
  it("explains what to do when Anthropic asks for a workspace", () => {
    const e = explainFailure(
      400,
      "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use."
    );
    expect(e.message).toMatch(/create the key inside a workspace/i);
    expect(e.message).toMatch(/wrkspc_/);
    expect(e.retryable).toBe(false);
  });
});

describe("a stalled request", () => {
  const stalled = () =>
    Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });

  it("is given a time limit", async () => {
    const f = vi.fn().mockResolvedValue(ok({ items: [] }));
    await callClaude(args(f as never));
    const signal = f.mock.calls[0][1].signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });
  it("ends with a plain message, and isn't retried (which would only add to the wait)", async () => {
    const f = vi.fn().mockRejectedValue(stalled());
    await expect(callClaude(args(f as never))).rejects.toThrow(
      /took too long to answer/
    );
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("is told apart from a lost connection, which is still retried", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(callClaude(args(f as never))).rejects.toThrow(
      /Couldn't reach Anthropic/
    );
    expect(f).toHaveBeenCalledTimes(3);
  });
});
