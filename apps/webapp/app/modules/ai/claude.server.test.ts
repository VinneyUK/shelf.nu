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
  it("sends the key, model and a forced tool call, and returns the tool input", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ items: [] }));
    expect(await callClaude(args(fetchImpl as never))).toEqual({ items: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-test");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.tool_choice).toEqual({ type: "tool", name: "record_items" });
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
    const empty = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: "hi" }] }),
          { status: 200 }
        )
      );
    await expect(callClaude(args(empty as never))).rejects.toThrow(
      /usable answer/
    );
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
