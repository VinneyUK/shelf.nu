/**
 * Matter (fork): a device's setup code, kept encrypted on its asset, with
 * what's known about the device. The code is only ever sent to the page when
 * someone with the right to change the asset asks to see it.
 */
import { db } from "~/database/db.server";
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
    transport: d.transport,
    firmware: d.firmware,
    mac: d.mac,
    controllers: d.controllers,
    labelPrintedAt: d.labelPrintedAt,
  }));
}

/** Adds a device by its code (either kind), and looks up what it is. */
export async function addDevice(
  organizationId: string,
  assetId: string,
  text: string,
  place?: string | null
) {
  await iotAsset(organizationId, assetId);
  let setup;
  try {
    setup = parseMatterCode(text);
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
  const names =
    setup.vendorId !== null && setup.productId !== null
      ? await lookupDevice(setup.vendorId, setup.productId).catch(() => ({
          vendorName: null,
          productName: null,
        }))
      : { vendorName: null, productName: null };
  await db.matterDevice.create({
    data: {
      organizationId,
      assetId,
      payload: payload ? encryptSecret(payload) : null,
      manualCode: encryptSecret(manual),
      vendorId: setup.vendorId,
      productId: setup.productId,
      vendorName: names.vendorName,
      productName: names.productName,
      place: place?.trim() || null,
    },
  });
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
  };
}

/** The details you fill in: where it is, how it connects, firmware, MAC, what it's paired with. */
export async function updateDevice(
  organizationId: string,
  id: string,
  details: {
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
