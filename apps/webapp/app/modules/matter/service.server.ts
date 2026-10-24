/**
 * Matter (fork): a device's setup code, kept encrypted on its asset, with
 * what's known about the device. The code is only ever sent to the page when
 * someone with the right to change the asset asks to see it.
 */
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import { decryptSecret, encryptSecret } from "~/utils/secret-box.server";
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

async function ownAsset(organizationId: string, assetId: string) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true, title: true },
  });
  if (!asset)
    throw new ShelfError({
      cause: null,
      message: "That asset doesn't exist.",
      status: 404,
      label,
    });
  return asset;
}

/** What's known about an asset's Matter device, without its code. */
export async function getMatter(organizationId: string, assetId: string) {
  const m = await db.assetMatter.findFirst({
    where: { organizationId, assetId },
  });
  if (!m) return null;
  return {
    hasQr: Boolean(m.payload),
    vendorId: m.vendorId,
    productId: m.productId,
    vendorName: m.vendorName,
    productName: m.productName,
    transport: m.transport,
    firmware: m.firmware,
    mac: m.mac,
    controllers: m.controllers,
    createdAt: m.createdAt,
  };
}

/** Saves a device's code (either kind), and looks up what it is. */
export async function saveMatterCode(
  organizationId: string,
  assetId: string,
  text: string
) {
  await ownAsset(organizationId, assetId);
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
  const data = {
    payload: payload ? encryptSecret(payload) : null,
    manualCode: encryptSecret(manual),
    vendorId: setup.vendorId,
    productId: setup.productId,
    vendorName: names.vendorName,
    productName: names.productName,
  };
  await db.assetMatter.upsert({
    where: { assetId },
    create: { organizationId, assetId, ...data },
    update: data,
  });
  return { names, hasQr: Boolean(payload) };
}

/** The code itself, to show, copy or redraw as a QR. */
export async function revealMatter(organizationId: string, assetId: string) {
  const m = await db.assetMatter.findFirst({
    where: { organizationId, assetId },
  });
  if (!m)
    throw new ShelfError({
      cause: null,
      message: "This asset has no Matter code.",
      status: 404,
      label,
    });
  return {
    manualCode: decryptSecret(m.manualCode),
    payload: m.payload ? decryptSecret(m.payload) : null,
  };
}

/** The details you fill in: how it connects, firmware, MAC, what it's paired with. */
export async function updateMatterDetails(
  organizationId: string,
  assetId: string,
  details: {
    transport?: string | null;
    firmware?: string | null;
    mac?: string | null;
    controllers?: string[];
  }
) {
  const { count } = await db.assetMatter.updateMany({
    where: { organizationId, assetId },
    data: details,
  });
  if (count === 0)
    throw new ShelfError({
      cause: null,
      message: "Add its Matter code first.",
      status: 400,
      label,
    });
}

/** Forgets an asset's Matter code and details. */
export async function removeMatter(organizationId: string, assetId: string) {
  await db.assetMatter.deleteMany({ where: { organizationId, assetId } });
}
