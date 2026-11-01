/**
 * Filament › Palettes (fork): the page, with pretend data.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/components/layout/header", () => ({
  default: () => <header />,
}));

const { default: Palettes } = await import(
  "~/routes/_layout+/filament.palettes"
);

const f = (
  name: string,
  hex: string,
  state = "sealed",
  slot: number | null = null
) => ({
  key: `pla basic|${name.toLowerCase()}`,
  slug: `pla-basic--${name.toLowerCase()}`,
  name,
  hex,
  line: "PLA Basic",
  finish: "other",
  state,
  slot,
  hasOpen: state !== "sealed",
  hasSealed: state === "sealed",
});
const filaments = [
  f("White", "#F2F1EC", "ams", 1),
  f("Black", "#161616", "ams", 2),
  f("Red", "#C12E1F", "open"),
  f("Green", "#00AE42"),
  f("Blue", "#0A2989"),
  f("Yellow", "#F4EE2A"),
  f("Orange", "#FF6A13"),
  f("Purple", "#5E43B7"),
];

function show(over: Record<string, unknown> = {}) {
  const Stub = createRoutesStub([
    {
      path: "/filament/palettes",
      Component: Palettes,
      loader: () => ({
        header: { title: "Palettes" },
        filaments,
        saved: [],
        aiReady: false,
        ...over,
      }),
    },
  ]);
  return render(<Stub initialEntries={["/filament/palettes"]} />);
}

describe("Filament › Palettes", () => {
  it("generates a palette of five of your colours, with where each is", async () => {
    show();
    expect(
      await screen.findAllByRole("button", { name: /^Lock / })
    ).toHaveLength(5);
    expect(screen.getByText("8 colours to choose from")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save palette" })).toBeTruthy();
  });

  it("narrows to open or sealed colours", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));
    expect(screen.getByText("3 colours to choose from")).toBeTruthy();
  });

  it("asks for AI to be set up before Describe it", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Describe it" }));
    expect(screen.getByRole("link", { name: "Settings → AI" })).toBeTruthy();
  });

  it("shows the trending palettes with how much is in stock, and the colour wheel", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Trending" }));
    expect(screen.getAllByText(/\d\/\d in stock/).length).toBeGreaterThan(5);
    fireEvent.click(screen.getByRole("button", { name: "What to buy next" }));
    expect(
      screen.getByRole("img", { name: "Your colours on a colour wheel" })
    ).toBeTruthy();
  });

  it("lists saved palettes with Print card and Open in Coolors", async () => {
    show({
      saved: [
        {
          id: "p1",
          name: "Nordic",
          keys: ["pla basic|white", "pla basic|black"],
          createdAt: "2026-11-01",
        },
      ],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Saved (1)" }));
    expect(screen.getByText("Nordic")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print card" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open in Coolors" }).getAttribute("href")
    ).toBe("https://coolors.co/f2f1ec-161616");
  });
});
