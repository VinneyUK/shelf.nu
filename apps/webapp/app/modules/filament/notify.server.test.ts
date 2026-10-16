import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("~/utils/emitter/send-notification.server", () => ({
  sendNotification: send,
}));

import { done, failed, notify } from "./notify.server";

beforeEach(() => send.mockReset());

describe("Filament's pop-ups", () => {
  it("say it worked in green with a tick, like Asset updated, and answer the page", () => {
    const answer = done("u1", "Spool weighed", "45% left.", { percent: 45 });
    expect(send).toHaveBeenCalledWith({
      title: "Spool weighed",
      message: "45% left.",
      icon: { name: "success", variant: "success" },
      senderId: "u1",
    });
    expect(answer).toMatchObject({
      ok: true,
      message: "45% left.",
      percent: 45,
    });
  });
  it("say what failed and why in red with a cross", () => {
    failed("u1", "weigh", "Enter the weight in grams, as shown on the scale.");
    expect(send).toHaveBeenCalledWith({
      title: "Couldn't weigh the spool",
      message: "Enter the weight in grams, as shown on the scale.",
      icon: { name: "x", variant: "error" },
      senderId: "u1",
    });
    failed("u1", "something-new", "Oops.");
    expect(send.mock.calls[1][0].title).toBe("Something went wrong");
  });
  it("can be neutral, for news that isn't good or bad", () => {
    notify(
      "u1",
      "Not on the Bambu store",
      "The store doesn't list this line and colour.",
      "gray"
    );
    expect(send.mock.calls[0][0].icon).toEqual({
      name: "success",
      variant: "gray",
    });
  });
});
