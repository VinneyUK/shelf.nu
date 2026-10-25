/**
 * The protocol's mark beside an IoT asset's name in the assets list (fork):
 * Matter's mark for Matter, Zigbee's hexagon, Wi-Fi's fan… The IoT assets are
 * asked for once for the whole list (components/iot/iot-info).
 */
import { ProtocolIcon } from "~/components/iot/icons";
import { useIotInfo } from "~/components/iot/iot-info";
import { protocolOf } from "~/modules/iot/catalogue";

export { resetIotAssets as resetMatterAssetIds } from "~/components/iot/iot-info";

export function MatterNameMark({ assetId }: { assetId: string }) {
  const info = useIotInfo(assetId);
  if (!info?.protocol) return null;
  const p = protocolOf(info.protocol);
  return (
    <span
      title={[p.id, info.type].filter(Boolean).join(" · ")}
      className="ml-1.5 inline-flex shrink-0 items-center align-middle"
      style={{ color: p.colour }}
    >
      <span role="img" aria-label={`${p.id} device`} className="inline-flex">
        <ProtocolIcon protocol={p.id} className="size-4" />
      </span>
    </span>
  );
}
