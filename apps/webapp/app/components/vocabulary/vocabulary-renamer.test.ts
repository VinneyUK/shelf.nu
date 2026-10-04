import { beforeEach, describe, expect, it } from "vitest";
import { rewriteAttributes, rewriteText } from "./vocabulary-renamer";

beforeEach(() => {
  document.body.innerHTML = "";
});
const html = (s: string) => {
  document.body.innerHTML = s;
  rewriteText(document.body, "/kits");
  rewriteAttributes(document.body);
  return document.body;
};

describe("vocabulary renamer", () => {
  it("renames Shelf's placeholders, tooltips and aria-labels", () => {
    const body = html(`
      <input placeholder="Search kits" />
      <button aria-label="Edit kit information" title="Edit kit information"><svg></svg></button>
      <a href="/kits/new" aria-label="new kit"></a>`);
    expect(body.querySelector("input")!.getAttribute("placeholder")).toBe(
      "Search boxes"
    );
    const button = body.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Edit box information");
    expect(button.getAttribute("title")).toBe("Edit box information");
    expect(body.querySelector("a")!.getAttribute("aria-label")).toBe("new box");
  });

  it("leaves a name the user chose alone, even in a tooltip", () => {
    const body = html(`<a href="/kits/k1" title="Camera kit">Camera kit</a>`);
    expect(body.querySelector("a")!.getAttribute("title")).toBe("Camera kit");
    expect(body.querySelector("a")!.textContent).toBe("Camera kit");
  });

  it("renames the Kits menu link and New kit, but not a link to a box named by the user", () => {
    const body = html(`
      <a href="/kits">Kits</a>
      <a href="/kits/new">New kit</a>
      <a href="/kits/k1">Camera kit</a>
      <a href="/assets/a1">First aid kit</a>
      <a href="/kits/k1/edit"><span>Edit kit</span></a>`);
    const text = [...body.querySelectorAll("a")].map((a) => a.textContent);
    expect(text).toEqual([
      "Boxes",
      "New box",
      "Camera kit",
      "First aid kit",
      "Edit box",
    ]);
  });

  it("never touches what's typed into an input", () => {
    const body = html(`<input value="my kit" /><textarea>kit notes</textarea>`);
    expect(body.querySelector("input")!.getAttribute("value")).toBe("my kit");
    expect(body.querySelector("textarea")!.textContent).toBe("kit notes");
  });

  it("renames visible text too", () => {
    const body = html(`<span>Add to kit</span><span>Toolkit</span>`);
    expect(body.textContent).toBe("Add to boxToolkit");
  });
});
