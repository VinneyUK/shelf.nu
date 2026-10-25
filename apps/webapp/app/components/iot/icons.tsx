/**
 * IoT icons (fork): a device type's icon in a soft tinted square, and a
 * protocol's badge. Lucide's line icons, as Shelf uses; Matter uses Ant's
 * protocol icons and logos (public/static/images/iot), which he supplied.
 */
import type { ComponentType, CSSProperties } from "react";
import {
  BellRingIcon,
  BlindsIcon,
  CameraIcon,
  CpuIcon,
  DoorOpenIcon,
  DropletsIcon,
  FanIcon,
  GaugeIcon,
  LightbulbIcon,
  LockIcon,
  PlugIcon,
  RadarIcon,
  RadioIcon,
  RouterIcon,
  SpeakerIcon,
  ThermometerIcon,
  ToggleRightIcon,
  TvIcon,
} from "lucide-react";
import { protocolOf, typeTint } from "~/modules/iot/catalogue";
import { MATTER_MARK_PATH } from "~/modules/matter/logo";
import { tw } from "~/utils/tw";

type IconLike = ComponentType<{
  className?: string;
  style?: CSSProperties;
}>;

const TYPE_ICONS: Record<string, IconLike> = {
  "Smart plug": PlugIcon,
  Switch: ToggleRightIcon,
  Bulb: LightbulbIcon,
  "Temperature sensor": ThermometerIcon,
  "Contact sensor": DoorOpenIcon,
  "Motion sensor": RadarIcon,
  "Leak sensor": DropletsIcon,
  Lock: LockIcon,
  Camera: CameraIcon,
  Doorbell: BellRingIcon,
  Thermostat: GaugeIcon,
  Blinds: BlindsIcon,
  Fan: FanIcon,
  Speaker: SpeakerIcon,
  "TV / media": TvIcon,
  "Hub / bridge": RouterIcon,
};

/** The Matter mark (Ant's matter-light.svg) as an icon. */
export function MatterIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path d={MATTER_MARK_PATH} fill="currentColor" />
    </svg>
  );
}

/** Ant's protocol icons and logos (public/static/images/iot). "mono" ones are
 * one colour, turned white in dark mode (styles/fork.css). */
const PROTOCOL_FILES: Record<
  string,
  { icon: string; logo: string | null; mono: boolean }
> = {
  Matter: { icon: "matter-icon.svg", logo: "matter-logo.svg", mono: true },
  Zigbee: { icon: "zigbee-icon.svg", logo: "zigbee-logo.svg", mono: true },
  "Z-Wave": { icon: "z-wave-icon.svg", logo: "z-wave-logo.svg", mono: true },
  Thread: { icon: "thread-icon.png", logo: "thread-logo.png", mono: false },
  "Wi-Fi": { icon: "wi-fi-icon.svg", logo: "wi-fi-logo.png", mono: true },
  Bluetooth: {
    icon: "bluetooth-icon.svg",
    logo: "bluetooth-logo.svg",
    mono: false,
  },
  Ethernet: { icon: "ethernet-icon.svg", logo: null, mono: true },
};
const IOT_IMAGES = "/static/images/iot/";

/** A device type's icon in a soft square of its tint (an unknown type: a chip). */
export function DeviceTypeIcon({
  type,
  size = 32,
}: {
  type: string | null | undefined;
  size?: number;
}) {
  const Icon = (type && TYPE_ICONS[type]) || CpuIcon;
  const tint = typeTint(type);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: size,
        height: size,
        background: `${tint}1f`,
        color: tint,
      }}
      title={type ?? "Device"}
    >
      <Icon
        className="shrink-0"
        style={{ width: size * 0.5, height: size * 0.5 }}
      />
    </span>
  );
}

/** A protocol's icon on its own (Ant's image). */
export function ProtocolIcon({
  protocol,
  className = "size-3.5",
}: {
  protocol: string;
  className?: string;
}) {
  const f = PROTOCOL_FILES[protocol];
  if (!f) return <RadioIcon className={className} />;
  return (
    <img
      src={`${IOT_IMAGES}${f.icon}`}
      alt={protocol}
      title={protocol}
      className={tw(
        "inline-block shrink-0 object-contain",
        f.mono && "iot-icon-mono",
        className
      )}
    />
  );
}

/** A protocol's logo on its own, no tile or border (Ethernet: its icon and name). */
export function ProtocolLogo({
  protocol,
  className = "h-7",
}: {
  protocol: string;
  className?: string;
}) {
  const f = PROTOCOL_FILES[protocol];
  if (!f?.logo)
    return (
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
        <ProtocolIcon protocol={protocol} className="size-6" />
        {protocol}
      </span>
    );
  return (
    <img
      src={`${IOT_IMAGES}${f.logo}`}
      alt={protocol}
      title={protocol}
      className={tw(
        "iot-logo inline-block w-auto max-w-40 object-contain",
        className
      )}
    />
  );
}

/** A protocol's badge: its icon and name in its colours. */
export function ProtocolBadge({ protocol }: { protocol: string }) {
  const p = protocolOf(protocol);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: p.background, color: p.colour }}
    >
      <ProtocolIcon protocol={p.id} className="size-3" />
      {p.id}
    </span>
  );
}

/** The protocol's logo at the right of the asset's title bar: no tile or border, in from the edge. */
export function IotProtocolTile({
  protocol,
  type,
}: {
  protocol: string;
  type?: string | null;
}) {
  return (
    <span
      className="ml-auto mr-2 flex shrink-0 items-center pl-4"
      title={[protocol, type].filter(Boolean).join(" · ")}
    >
      <ProtocolLogo protocol={protocol} className="h-8" />
    </span>
  );
}
