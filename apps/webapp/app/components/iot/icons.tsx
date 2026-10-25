/**
 * IoT icons (fork): a device type's icon in a soft tinted square, and a
 * protocol's badge. Lucide's line icons, as Shelf uses; Matter uses Ant's
 * own Matter mark. (Other protocols' official logos are their owners'; an
 * official SVG supplied later drops into PROTOCOL_ICONS the same way.)
 */
import type { ComponentType, CSSProperties } from "react";
import {
  BellRingIcon,
  BlindsIcon,
  BluetoothIcon,
  CableIcon,
  CameraIcon,
  CpuIcon,
  DoorOpenIcon,
  DropletsIcon,
  FanIcon,
  GaugeIcon,
  HexagonIcon,
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
  WavesIcon,
  WifiIcon,
} from "lucide-react";
import { protocolOf, typeTint } from "~/modules/iot/catalogue";
import { MATTER_MARK_PATH } from "~/modules/matter/logo";

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

const PROTOCOL_ICONS: Record<string, IconLike> = {
  Matter: MatterIcon,
  Zigbee: HexagonIcon,
  "Z-Wave": WavesIcon,
  Thread: RadioIcon,
  "Wi-Fi": WifiIcon,
  Bluetooth: BluetoothIcon,
  Ethernet: CableIcon,
};

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

/** A protocol's icon on its own. */
export function ProtocolIcon({
  protocol,
  className = "size-3.5",
}: {
  protocol: string;
  className?: string;
}) {
  const Icon = PROTOCOL_ICONS[protocol] ?? RadioIcon;
  return <Icon className={className} />;
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
