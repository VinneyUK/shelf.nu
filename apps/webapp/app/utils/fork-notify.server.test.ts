import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("~/utils/emitter/send-notification.server", () => ({
  sendNotification: send,
}));

import { done, failed, withPopups } from "./fork-notify.server";

beforeEach(() => send.mockReset());

const args = (intent: string | null) => {
  const body = new FormData();
  if (intent !== null) body.set("intent", intent);
  return {
    request: new Request("http://shelf.local/settings/ai", {
      method: "POST",
      body,
    }),
    context: { getSession: () => ({ userId: "u1" }) },
  } as never;
};
const titles = {
  save: { ok: "AI settings saved", failed: "Couldn't save the AI settings" },
  test: { ok: "Claude connection works", failed: "Claude connection failed" },
};

describe("the fork's pop-ups", () => {
  it("done and failed send green and red", () => {
    expect(done("u1", "Draft saved", null, { id: "d1" })).toMatchObject({
      ok: true,
      id: "d1",
    });
    failed("u1", "Couldn't save the draft", "It's gone.");
    expect(send.mock.calls.map((c) => [c[0].title, c[0].icon])).toEqual([
      ["Draft saved", { name: "success", variant: "success" }],
      ["Couldn't save the draft", { name: "x", variant: "error" }],
    ]);
  });

  it("a wrapped action's answer becomes the pop-up for the button pressed", async () => {
    const action = withPopups(
      async () => ({ message: "Connected: claude-sonnet-5-5 answered." }),
      titles
    );
    const result = await action(args("test"));
    expect(result).toEqual({
      message: "Connected: claude-sonnet-5-5 answered.",
    });
    expect(send.mock.calls[0][0]).toMatchObject({
      title: "Claude connection works",
      message: "Connected: claude-sonnet-5-5 answered.",
      icon: { variant: "success" },
    });
  });
  it("'Saved.' needs no message: the title says it", async () => {
    await withPopups(async () => ({ message: "Saved." }), titles)(args("save"));
    expect(send.mock.calls[0][0]).toMatchObject({
      title: "AI settings saved",
      message: null,
    });
  });
  it("an error, or an answer marked failed, is red", async () => {
    await withPopups(
      async () => ({ data: { error: { message: "Bad key." } } }),
      titles
    )(args("save"));
    await withPopups(
      async () => ({ failed: true, message: "Not working: 401" }),
      titles
    )(args("test"));
    expect(
      send.mock.calls.map((c) => [c[0].title, c[0].message, c[0].icon.variant])
    ).toEqual([
      ["Couldn't save the AI settings", "Bad key.", "error"],
      ["Claude connection failed", "Not working: 401", "error"],
    ]);
  });
  it("stays quiet for a button it has no title for", async () => {
    await withPopups(
      async () => ({ message: "Unknown action." }),
      titles
    )(args("other"));
    expect(send).not.toHaveBeenCalled();
  });
});
