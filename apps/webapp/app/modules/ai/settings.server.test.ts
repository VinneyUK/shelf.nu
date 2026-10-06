import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/utils/env", () => ({
  SESSION_SECRET: "test-session-secret-0123456789",
}));
const db = vi.hoisted(() => ({
  aiSettings: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("~/database/db.server", () => ({ db }));

import { encryptSecret } from "~/utils/secret-box.server";
import {
  clampDescriptionLength,
  getAiSettings,
  saveAiSettings,
  testWebSearch,
} from "./settings.server";

const row = (extra = {}) => ({
  organizationId: "o1",
  enabled: true,
  apiKey: encryptSecret("sk-ant-real"),
  model: "claude-sonnet-5-5",
  workspaceId: "",
  descriptionLength: 300,
  webSearch: true,
  draftReceipts: true,
  lastError: null,
  ...extra,
});

beforeEach(() => {
  db.aiSettings.findUnique.mockReset().mockResolvedValue(row());
  db.aiSettings.upsert.mockReset();
  db.aiSettings.updateMany.mockReset();
});

describe("AI settings", () => {
  it("never hands the key to the browser, and web search is off by default", async () => {
    const view = await getAiSettings("o1");
    expect(view).toMatchObject({ hasKey: true, webSearch: true });
    expect(JSON.stringify(view)).not.toContain("sk-ant-real");
    db.aiSettings.findUnique.mockResolvedValue(null);
    expect((await getAiSettings("o1")).webSearch).toBe(false);
  });
  it("saves the web search switch, encrypts a new key, and keeps the old one when blank", async () => {
    await saveAiSettings("o1", {
      enabled: true,
      apiKey: " sk-ant-new ",
      model: "claude-sonnet-5-5",
      workspaceId: "",
      descriptionLength: 300,
      webSearch: true,
      draftReceipts: true,
    });
    const first = db.aiSettings.upsert.mock.calls[0][0].update;
    expect(first.webSearch).toBe(true);
    expect(first.apiKey).toMatch(/^enc:v1:/);
    expect(first.apiKey).not.toContain("sk-ant-new");
    await saveAiSettings("o1", {
      enabled: true,
      apiKey: "",
      model: "claude-sonnet-5-5",
      workspaceId: "",
      descriptionLength: 300,
      webSearch: false,
      draftReceipts: true,
    });
    const second = db.aiSettings.upsert.mock.calls[1][0].update;
    expect(second.webSearch).toBe(false);
    expect(second).not.toHaveProperty("apiKey");
  });
});

describe("Test web search", () => {
  it("passes on a working search and clears the last problem", async () => {
    const research = vi
      .fn()
      .mockResolvedValue({ text: "£229", searches: 1, error: null });
    const r = await testWebSearch("o1", research);
    expect(r).toEqual({
      ok: true,
      message: "Web search works (1 search made).",
    });
    expect(research.mock.calls[0][0].apiKey).toBe("sk-ant-real");
    expect(db.aiSettings.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "o1" },
      data: { lastError: null },
    });
  });
  it("says so when Claude answered without searching, rather than calling it a failure", async () => {
    const r = await testWebSearch(
      "o1",
      vi.fn().mockResolvedValue({ text: "£229", searches: 0, error: null })
    );
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/without searching/);
  });
  it("reports why it failed and remembers it for the settings page", async () => {
    const msg = "Web search isn't switched on for this Anthropic account.";
    const r = await testWebSearch(
      "o1",
      vi.fn().mockResolvedValue({ text: null, searches: 0, error: msg })
    );
    expect(r).toEqual({ ok: false, message: msg });
    expect(db.aiSettings.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "o1" },
      data: { lastError: msg },
    });
  });
});

describe("the description length setting", () => {
  it("is 300 until someone changes it", async () => {
    expect((await getAiSettings("o1")).descriptionLength).toBe(300);
    db.aiSettings.findUnique.mockResolvedValue(null);
    expect((await getAiSettings("o1")).descriptionLength).toBe(300);
  });
  it("is read back as saved", async () => {
    db.aiSettings.findUnique.mockResolvedValue(row({ descriptionLength: 150 }));
    expect((await getAiSettings("o1")).descriptionLength).toBe(150);
  });
  it("is saved within the allowed range", async () => {
    const save = (descriptionLength: number) =>
      saveAiSettings("o1", {
        enabled: true,
        apiKey: "",
        model: "m",
        workspaceId: "",
        descriptionLength,
        webSearch: false,
        draftReceipts: true,
      });
    await save(150);
    expect(db.aiSettings.upsert.mock.calls[0][0].update.descriptionLength).toBe(
      150
    );
    await save(5000);
    expect(db.aiSettings.upsert.mock.calls[1][0].update.descriptionLength).toBe(
      1000
    );
    await save(10);
    expect(db.aiSettings.upsert.mock.calls[2][0].update.descriptionLength).toBe(
      100
    );
  });
  it("is kept sensible whatever it's given", () => {
    expect(clampDescriptionLength(undefined)).toBe(300);
    expect(clampDescriptionLength(null)).toBe(300);
    expect(clampDescriptionLength(Number.NaN)).toBe(300);
    expect(clampDescriptionLength(Infinity)).toBe(300);
    expect(clampDescriptionLength(250.4)).toBe(250);
    expect(clampDescriptionLength(100)).toBe(100);
    expect(clampDescriptionLength(1000)).toBe(1000);
    expect(clampDescriptionLength(-5)).toBe(100);
  });
});
