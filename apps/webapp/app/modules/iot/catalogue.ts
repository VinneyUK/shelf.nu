/**
 * IoT devices (fork): what a device is (its type) and how it talks (its
 * protocol), with the details each protocol needs. Shared by the asset's
 * Devices section, the IoT page and the server.
 */

/** What a device is, with the tint its icon is drawn in (icons: components/iot/icons.tsx). */
export const DEVICE_TYPES = [
  { id: "Smart plug", tint: "#F79009" },
  { id: "Switch", tint: "#6172F3" },
  { id: "Bulb", tint: "#FDB022" },
  { id: "Temperature sensor", tint: "#F04438" },
  { id: "Contact sensor", tint: "#7A5AF8" },
  { id: "Motion sensor", tint: "#EE46BC" },
  { id: "Leak sensor", tint: "#2E90FA" },
  { id: "Lock", tint: "#344054" },
  { id: "Camera", tint: "#475467" },
  { id: "Doorbell", tint: "#DC6803" },
  { id: "Thermostat", tint: "#F63D68" },
  { id: "Blinds", tint: "#15B79E" },
  { id: "Fan", tint: "#06AED4" },
  { id: "Speaker", tint: "#9E77ED" },
  { id: "TV / media", tint: "#667085" },
  { id: "Hub / bridge", tint: "#101828" },
] as const;
export type DeviceTypeId = (typeof DEVICE_TYPES)[number]["id"];
export const DEVICE_TYPE_IDS = DEVICE_TYPES.map((t) => t.id) as string[];
export const typeTint = (id: string | null | undefined) =>
  DEVICE_TYPES.find((t) => t.id === id)?.tint ?? "#667085";

/** A field a protocol asks for. "secret" fields are kept encrypted. */
export type ProtocolField = {
  key: "code" | "address" | "secret" | "mac" | "ip" | "network" | "transport";
  label: string;
  kind: "text" | "secret" | "pick";
  example?: string;
  options?: string[];
};

/** How a device talks, what it needs, and where to find it. */
export const PROTOCOLS: {
  id: string;
  colour: string;
  background: string;
  note: string;
  /** whether it can be scanned from a QR */
  qr: boolean;
  fields: ProtocolField[];
}[] = [
  {
    id: "Matter",
    colour: "#101828",
    background: "#F2F4F7",
    note: "Scan its Matter QR, or type the 11 digits",
    qr: true,
    fields: [
      {
        key: "code",
        label: "Setup code",
        kind: "secret",
        example: "1535-511-0751",
      },
      {
        key: "transport",
        label: "Network",
        kind: "pick",
        options: ["Thread", "Wi-Fi", "Ethernet"],
      },
    ],
  },
  {
    id: "Zigbee",
    colour: "#B54708",
    background: "#FFFAEB",
    note: "On the device or its box; the install code only where it has one",
    qr: false,
    fields: [
      {
        key: "address",
        label: "IEEE address",
        kind: "text",
        example: "00:17:88:01:0b:2c:4f:91",
      },
      {
        key: "secret",
        label: "Install code",
        kind: "secret",
        example: "83FE D340 7A93 9723 …",
      },
    ],
  },
  {
    id: "Z-Wave",
    colour: "#6941C6",
    background: "#F4F3FF",
    note: "On the device or its box: its DSK (the first five digits are its PIN)",
    qr: false,
    fields: [
      {
        key: "secret",
        label: "DSK",
        kind: "secret",
        example: "34028-23669-20938-…",
      },
    ],
  },
  {
    id: "Thread",
    colour: "#067647",
    background: "#ECFDF3",
    note: "Most Thread devices are added as Matter instead",
    qr: false,
    fields: [
      {
        key: "address",
        label: "Extended address",
        kind: "text",
        example: "1a2b3c4d5e6f7a8b",
      },
    ],
  },
  {
    id: "Wi-Fi",
    colour: "#175CD3",
    background: "#EFF8FF",
    note: "From its app, or your router's list of devices",
    qr: false,
    fields: [
      { key: "mac", label: "MAC", kind: "text", example: "A4:CF:12:9B:40:1E" },
      { key: "ip", label: "IP", kind: "text", example: "192.168.0.142" },
      { key: "network", label: "Network", kind: "text", example: "Home-IoT" },
    ],
  },
  {
    id: "Bluetooth",
    colour: "#026AA2",
    background: "#F0F9FF",
    note: "From its app",
    qr: false,
    fields: [
      { key: "mac", label: "MAC", kind: "text", example: "D4:3D:39:21:0F:8A" },
    ],
  },
  {
    id: "Ethernet",
    colour: "#344054",
    background: "#F2F4F7",
    note: "From your router's list of devices",
    qr: false,
    fields: [
      { key: "mac", label: "MAC", kind: "text", example: "B8:27:EB:4A:11:02" },
      { key: "ip", label: "IP", kind: "text", example: "192.168.0.20" },
    ],
  },
];
export const PROTOCOL_IDS = PROTOCOLS.map((p) => p.id);
export const protocolOf = (id: string | null | undefined) =>
  PROTOCOLS.find((p) => p.id === id) ?? PROTOCOLS[0];
