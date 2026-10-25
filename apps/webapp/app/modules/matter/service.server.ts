/**
 * Matter (fork): a device's setup code, kept encrypted on its asset, with
 * what's known about the device. The code is only ever sent to the page when
 * someone with the right to change the asset asks to see it.
 */
import { db } from "~/database/db.server";
import { DEVICE_TYPE_IDS, PROTOCOL_IDS } from "~/modules/iot/catalogue";
import { ShelfError } from "~/utils/error";
import { decryptSecret, encryptSecret } from "~/utils/secret-box.server";
import { isIotCategory } from "./iot";
import {
  formatManualCode,
  manualCode,
  parseMatterCode,
  qrPayload,
} from "./payload";

const label = "Assets";

/** The CSA's public register of certified Matter devices. */
const DCL = "https://on.dcl.csa-iot.org/dcl";

/** The maker and model for a vendor and product ID, from the CSA's register; nulls if not found. */
export async function lookupDevice(vendorId: number, productId: number) {
  const get = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  };
  const [vendor, model] = await Promise.all([
    get(`${DCL}/vendorinfo/vendors/${vendorId}`).catch(() => null),
    get(`${DCL}/model/models/${vendorId}/${productId}`).catch(() => null),
  ]);
  const v = (vendor?.vendorInfo ?? {}) as {
    vendorName?: string;
    companyLegalName?: string;
  };
  const m = (model?.model ?? {}) as {
    productName?: string;
    productLabel?: string;
  };
  return {
    vendorName: v.vendorName || v.companyLegalName || null,
    productName: m.productName || m.productLabel || null,
  };
}

async function iotAsset(organizationId: string, assetId: string) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true, title: true, category: { select: { name: true } } },
  });
  if (!asset)
    throw new ShelfError({
      cause: null,
      message: "That asset doesn't exist.",
      status: 404,
      label,
    });
  if (!isIotCategory(asset.category?.name))
    throw new ShelfError({
      cause: null,
      message: "Matter devices are for assets in the IoT category.",
      status: 400,
      label,
      shouldBeCaptured: false,
    });
  return asset;
}

/** Each device counts towards the asset's quantity: it's as many as its devices. */
async function syncQuantity(organizationId: string, assetId: string) {
  const count = await db.matterDevice.count({
    where: { organizationId, assetId },
  });
  if (count > 0)
    await db.asset.updateMany({
      where: { id: assetId, organizationId },
      data: { quantity: count },
    });
  return count;
}

const notFound = () =>
  new ShelfError({
    cause: null,
    message: "That device isn't recorded.",
    status: 404,
    label,
  });

/** An asset's Matter devices, oldest first, without their codes. */
export async function listDevices(organizationId: string, assetId: string) {
  const devices = await db.matterDevice.findMany({
    where: { organizationId, assetId },
    orderBy: { createdAt: "asc" },
  });
  return devices.map((d, i) => ({
    id: d.id,
    number: i + 1,
    hasQr: Boolean(d.payload),
    vendorId: d.vendorId,
    productId: d.productId,
    vendorName: d.vendorName,
    productName: d.productName,
    name: d.name,
    place: d.place,
    protocol: d.protocol,
    deviceType: d.deviceType,
    address: d.address,
    ip: d.ip,
    network: d.network,
    hasSecret: Boolean(d.secret),
    transport: d.transport,
    firmware: d.firmware,
    mac: d.mac,
    controllers: d.controllers,
    labelPrintedAt: d.labelPrintedAt,
  }));
}

export type NewDevice = {
  protocol?: string | null;
  deviceType?: string | null;
  name?: string | null;
  place?: string | null;
  /** Matter: the setup code (either kind) */
  code?: string | null;
  /** Matter: Thread, Wi-Fi or Ethernet */
  transport?: string | null;
  /** Zigbee's IEEE address, Thread's extended address */
  address?: string | null;
  /** Zigbee's install code, Z-Wave's DSK (kept encrypted) */
  secret?: string | null;
  mac?: string | null;
  ip?: string | null;
  network?: string | null;
};

const clean = (v: string | null | undefined) => v?.trim() || null;

/**
 * Adds a device of any protocol: a Matter device by its code (and looks up
 * what it is), any other with the details its protocol has.
 */
export async function addDevice(
  organizationId: string,
  assetId: string,
  input: NewDevice | string,
  place?: string | null
) {
  // (the Matter-only form: a code and where it is)
  const d: NewDevice =
    typeof input === "string"
      ? { protocol: "Matter", code: input, place }
      : input;
  const protocol = PROTOCOL_IDS.includes(d.protocol ?? "")
    ? d.protocol!
    : "Matter";
  await iotAsset(organizationId, assetId);
  const common = {
    organizationId,
    assetId,
    protocol,
    deviceType:
      d.deviceType && DEVICE_TYPE_IDS.includes(d.deviceType)
        ? d.deviceType
        : null,
    name: clean(d.name),
    place: clean(d.place),
    address: clean(d.address),
    secret: clean(d.secret) ? encryptSecret(clean(d.secret)!) : null,
    mac: clean(d.mac),
    ip: clean(d.ip),
    network: clean(d.network),
    transport: clean(d.transport),
  };
  let names: { vendorName: string | null; productName: string | null } = {
    vendorName: null,
    productName: null,
  };
  if (protocol === "Matter") {
    let setup;
    try {
      setup = parseMatterCode(d.code ?? "");
    } catch (cause) {
      throw new ShelfError({
        cause,
        message:
          cause instanceof Error ? cause.message : "That isn't a Matter code.",
        status: 400,
        label,
        shouldBeCaptured: false,
      });
    }
    const payload = setup.shortDiscriminator ? null : qrPayload(setup);
    const manual = formatManualCode(manualCode(setup));
    if (setup.vendorId !== null && setup.productId !== null)
      names = await lookupDevice(setup.vendorId, setup.productId).catch(
        () => names
      );
    await db.matterDevice.create({
      data: {
        ...common,
        payload: payload ? encryptSecret(payload) : null,
        manualCode: encryptSecret(manual),
        vendorId: setup.vendorId,
        productId: setup.productId,
        vendorName: names.vendorName,
        productName: names.productName,
      },
    });
  } else {
    // other protocols have no Matter code: an empty one, encrypted like the rest
    await db.matterDevice.create({
      data: { ...common, manualCode: encryptSecret("") },
    });
  }
  const quantity = await syncQuantity(organizationId, assetId);
  return { names, quantity };
}

/** A device's code itself, to show, copy or redraw as a QR. */
export async function revealDevice(organizationId: string, id: string) {
  const d = await db.matterDevice.findFirst({ where: { id, organizationId } });
  if (!d) throw notFound();
  return {
    manualCode: decryptSecret(d.manualCode),
    payload: d.payload ? decryptSecret(d.payload) : null,
    secret: d.secret ? decryptSecret(d.secret) : null,
  };
}

/** The details you fill in: where it is, how it connects, firmware, MAC, what it's paired with. */
export async function updateDevice(
  organizationId: string,
  id: string,
  details: {
    deviceType?: string | null;
    address?: string | null;
    ip?: string | null;
    network?: string | null;
    name?: string | null;
    place?: string | null;
    transport?: string | null;
    firmware?: string | null;
    mac?: string | null;
    controllers?: string[];
  }
) {
  const { count } = await db.matterDevice.updateMany({
    where: { id, organizationId },
    data: details,
  });
  if (count === 0) throw notFound();
}

/** Forgets a device; the asset's quantity follows. */
export async function removeDevice(organizationId: string, id: string) {
  const d = await db.matterDevice.findFirst({ where: { id, organizationId } });
  if (!d) throw notFound();
  await db.matterDevice.deleteMany({ where: { id, organizationId } });
  return syncQuantity(organizationId, d.assetId);
}

/** Every IoT device in the workspace, with its asset, for the IoT page. */
export async function listAllDevices(organizationId: string) {
  const devices = await db.matterDevice.findMany({
    where: { organizationId },
    orderBy: [{ assetId: "asc" }, { createdAt: "asc" }],
    include: { asset: { select: { id: true, title: true } } },
  });
  return devices.map((d) => ({
    id: d.id,
    assetId: d.asset.id,
    assetTitle: d.asset.title,
    name: d.name,
    place: d.place,
    protocol: d.protocol,
    deviceType: d.deviceType,
    controllers: d.controllers,
    labelPrintedAt: d.labelPrintedAt,
  }));
}
