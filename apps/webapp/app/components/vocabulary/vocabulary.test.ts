import { describe, expect, it } from "vitest";
import { applyVocabulary } from "./vocabulary";

describe("applyVocabulary", () => {
  it("calls kits boxes, keeping the capitalisation", () => {
    expect(applyVocabulary("Kits")).toBe("Boxes");
    expect(applyVocabulary("Add to kit")).toBe("Add to box");
    expect(applyVocabulary("Remove from kit")).toBe("Remove from box");
    expect(applyVocabulary("KIT")).toBe("BOX");
    expect(applyVocabulary("Create your first kit")).toBe(
      "Create your first box"
    );
    expect(applyVocabulary("1 kit, 2 kits")).toBe("1 box, 2 boxes");
  });
  it("leaves other words alone", () => {
    for (const text of [
      "Kitchen",
      "Toolkit",
      "IFIXIT Toolkit",
      "kitten",
      "Skit",
    ]) {
      expect(applyVocabulary(text)).toBe(text);
    }
  });
});
