/**
 * The Asset Activity Summary can only show what it recognises. These tests
 * guard the way a feature gets missed: someone adds a new addAssetActivity call
 * and forgets the report.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyForkNote,
  FORK_ACTIVITY,
  FORK_ACTIVITY_PHRASES,
} from "./fork-activity";

const app = resolve(__dirname, "../..");
/** Every file that writes fork activity. A new one must be added here, or the check below won't see it. */
const WRITERS = [
  "modules/sold/service.server.ts",
  "modules/labels/service.server.ts",
  "modules/asset-attachment/service.server.ts",
  "modules/email-receipts/service.server.ts",
  "modules/ai/drafts.server.ts",
];

/**
 * The wording of every `action:` passed to addAssetActivity, with ${...} left as
 * a gap. A call may choose between wordings (`userId ? "a" : "b"`), so every
 * string in the expression is returned.
 */
function actionsIn(file: string) {
  const source = readFileSync(resolve(app, file), "utf8");
  const calls = [...source.matchAll(/addAssetActivity\(\{[\s\S]*?\}\);/g)].map(
    (m) => m[0]
  );
  return calls.flatMap((call) => {
    const expression = call.slice(call.indexOf("action:") + "action:".length);
    const strings = [
      ...expression.matchAll(/`([^`]*)`|"([^"]*)"|'([^']*)'/g),
    ].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, "…"));
    expect(
      strings.length,
      `no readable action: in a call in ${file}`
    ).toBeGreaterThan(0);
    return strings;
  });
}

describe("every fork activity is one the report recognises", () => {
  const all = WRITERS.flatMap((file) =>
    actionsIn(file).map((text) => ({ file, text }))
  );

  it("finds the places the fork writes activity (so this test can't pass by finding nothing)", () => {
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(new Set(all.map((a) => a.file)).size).toBe(WRITERS.length);
  });
  it.each(all.map((a) => [a.file, a.text] as const))(
    "%s: “%s”",
    (_file, text) => {
      // notes are stored as "<who> <what was done>"
      expect(
        classifyForkNote(`**Shelf** ${text}`),
        `not recognised: ${text}`
      ).not.toBeNull();
    }
  );
});

describe("classifying a note", () => {
  it("knows each kind of activity", () => {
    expect(
      classifyForkNote("[Ant](/u/1) marked this asset as **sold** (£120).")
    ).toBe("SOLD");
    expect(classifyForkNote("**Shelf** printed a **label**.")).toBe("LABEL");
    expect(
      classifyForkNote("[Ant](/u/1) added the attachment **receipt.pdf**.")
    ).toBe("ATTACHMENT");
    expect(
      classifyForkNote(
        "[Ant](/u/1) created this asset from a photo, with Claude's suggestions."
      )
    ).toBe("AI_DRAFT");
  });
  it("calls an emailed receipt a receipt, not just an attachment", () => {
    expect(
      classifyForkNote("**Shelf** attached **r.pdf** from an emailed receipt.")
    ).toBe("RECEIPT");
  });
  it("finds the notes with the same text the writers store, bold markers and all", () => {
    // the report searches the database for these, so they must be literal substrings of what is stored
    expect(FORK_ACTIVITY_PHRASES).toContain("marked this asset as **sold**");
    expect(FORK_ACTIVITY_PHRASES).toContain("printed a **label**");
    expect(FORK_ACTIVITY_PHRASES).toContain("added the attachment **");
  });
  it("still recognises a note if the bold markers are lost", () => {
    expect(classifyForkNote("Ant marked this asset as sold (£120).")).toBe(
      "SOLD"
    );
  });
  it("ignores everyone else's notes", () => {
    expect(classifyForkNote("[Ant](/u/1) left a comment")).toBeNull();
    expect(classifyForkNote("")).toBeNull();
  });
  it("lists every phrase once, for finding the notes", () => {
    expect(new Set(FORK_ACTIVITY_PHRASES).size).toBe(
      FORK_ACTIVITY_PHRASES.length
    );
    expect(FORK_ACTIVITY.length).toBeGreaterThanOrEqual(5);
  });
});
