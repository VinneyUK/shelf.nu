/**
 * Ant's protocol icons and logos (fork): drawn from his images, one-colour
 * ones marked to turn white in dark mode, logos with no tile or border.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IotProtocolTile, ProtocolIcon, ProtocolLogo } from "./icons";

describe("protocol icons and logos", () => {
  it("draws each protocol's icon from its image; one-colour ones turn white in dark mode", () => {
    render(
      <>
        <ProtocolIcon protocol="Matter" />
        <ProtocolIcon protocol="Bluetooth" />
      </>
    );
    const matter = screen.getByAltText("Matter");
    expect(matter.getAttribute("src")).toBe(
      "/static/images/iot/matter-icon.svg"
    );
    expect(matter.className).toContain("iot-icon-mono");
    expect(screen.getByAltText("Bluetooth").className).not.toContain(
      "iot-icon-mono"
    );
  });

  it("draws the logo on its own; Ethernet, which has none, as its icon and name", () => {
    render(<ProtocolLogo protocol="Zigbee" />);
    expect(screen.getByAltText("Zigbee").getAttribute("src")).toBe(
      "/static/images/iot/zigbee-logo.svg"
    );
    render(<ProtocolLogo protocol="Ethernet" />);
    expect(screen.getByText("Ethernet")).toBeTruthy();
  });

  it("puts the title bar's logo in from the edge, with no border", () => {
    const { container } = render(<IotProtocolTile protocol="Matter" />);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toContain("mr-2");
    expect(wrap.className).not.toMatch(/ring-|border|shadow/);
  });
});
