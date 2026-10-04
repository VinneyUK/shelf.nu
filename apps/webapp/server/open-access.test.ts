/**
 * Open access (fork): with SHELF_OPEN_ACCESS_USER set, a visitor with no
 * session gets one; auth pages go Home; unset, nothing happens.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: "",
  mint: vi.fn((email: string) => Promise.resolve({ email, userId: "u1" })),
  store: new Map<string, unknown>(),
}));
vi.mock("~/utils/env", () => ({
  get OPEN_ACCESS_USER() {
    return mocks.user;
  },
}));
vi.mock("~/modules/auth/mobile-sso.server", () => ({
  mintMobileSessionForUser: mocks.mint,
}));
vi.mock("~/utils/logger", () => ({ Logger: { error: vi.fn() } }));
vi.mock("remix-hono/session", () => ({
  getSession: () => ({
    get: (k: string) => mocks.store.get(k),
    set: (k: string, v: unknown) => mocks.store.set(k, v),
  }),
}));

import { openAccess } from "./open-access";
import { authSessionKey } from "./session";

const run = async (path: string) => {
  const redirects: string[] = [];
  let nextCalled = false;
  await openAccess()(
    {
      req: { url: `http://shelf.local${path}` },
      redirect: (to: string) => redirects.push(to),
    } as never,
    () => {
      nextCalled = true;
      return Promise.resolve();
    }
  );
  return { redirects, nextCalled };
};

beforeEach(() => {
  mocks.store.clear();
  mocks.mint.mockClear();
  mocks.user = "";
});

describe("openAccess", () => {
  it("does nothing when the setting is unset", async () => {
    const { nextCalled } = await run("/assets");
    expect(nextCalled).toBe(true);
    expect(mocks.mint).not.toHaveBeenCalled();
    expect(mocks.store.has(authSessionKey)).toBe(false);
  });
  it("signs a visitor in as the named user when there's no session", async () => {
    mocks.user = "ant@example.com";
    await run("/qr/abc");
    expect(mocks.mint).toHaveBeenCalledWith("ant@example.com");
    expect(mocks.store.get(authSessionKey)).toMatchObject({
      email: "ant@example.com",
    });
  });
  it("leaves an existing session alone", async () => {
    mocks.user = "ant@example.com";
    mocks.store.set(authSessionKey, { email: "someone@else.com" });
    await run("/assets");
    expect(mocks.mint).not.toHaveBeenCalled();
    expect(mocks.store.get(authSessionKey)).toMatchObject({
      email: "someone@else.com",
    });
  });
  it("sends the auth pages Home", async () => {
    mocks.user = "ant@example.com";
    for (const p of [
      "/login",
      "/login.data",
      "/logout",
      "/join",
      "/forgot-password",
      "/otp",
    ]) {
      const { redirects, nextCalled } = await run(p);
      expect(redirects, p).toEqual(["/"]);
      expect(nextCalled, p).toBe(false);
    }
    const { redirects } = await run("/logins-report");
    expect(redirects).toEqual([]);
  });
  it("carries on (without a session) if the user can't be signed in", async () => {
    mocks.user = "nobody@example.com";
    mocks.mint.mockRejectedValueOnce(new Error("no such user"));
    const { nextCalled } = await run("/assets");
    expect(nextCalled).toBe(true);
    expect(mocks.store.has(authSessionKey)).toBe(false);
    // and the login page stays reachable, so it can't loop
    mocks.mint.mockRejectedValueOnce(new Error("no such user"));
    const login = await run("/login");
    expect(login.redirects).toEqual([]);
    expect(login.nextCalled).toBe(true);
  });
});
