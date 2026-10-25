/**
 * IoT on the asset (fork): an IoT asset's type (what its devices are) and
 * protocol (how they connect). Its devices take them, and the two become the
 * asset's tags, kept in step: changing the protocol swaps its tag; tags you
 * added yourself are left alone.
 */
import { db } from "~/database/db.server";
import { isIotCategory } from "~/modules/matter/iot";
import { DEVICE_TYPE_IDS, PROTOCOL_IDS } from "./catalogue";

/** A tag of this name in the workspace (found whatever its case, else made). */
async function tagNamed(organizationId: string, userId: string, name: string) {
  const found = await db.tag.findFirst({
    where: { organizationId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (found) return found.id;
  const made = await db.tag.create({
    data: { name, organizationId, userId },
    select: { id: true },
  });
  return made.id;
}

/**
 * Saves an asset's IoT type and protocol (only on IoT assets; unknown values
 * are ignored), and keeps its two IoT tags in step with them.
 */
export async function saveIotSettings({
  organizationId,
  userId,
  assetId,
  iotType,
  iotProtocol,
}: {
  organizationId: string;
  userId: string;
  assetId: string;
  iotType: string | null | undefined;
  iotProtocol: string | null | undefined;
}) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: {
      iotType: true,
      iotProtocol: true,
      category: { select: { name: true } },
      tags: { select: { id: true, name: true } },
    },
  });
  if (!asset || !isIotCategory(asset.category?.name)) return;
  const type = iotType && DEVICE_TYPE_IDS.includes(iotType) ? iotType : null;
  const protocol =
    iotProtocol && PROTOCOL_IDS.includes(iotProtocol) ? iotProtocol : null;
  await db.asset.updateMany({
    where: { id: assetId, organizationId },
    data: { iotType: type, iotProtocol: protocol },
  });
  // the tags: drop the old IoT ones that changed, add the new
  const was = [asset.iotType, asset.iotProtocol].filter(Boolean) as string[];
  const now = [type, protocol].filter(Boolean) as string[];
  const lower = (s: string) => s.toLowerCase();
  const drop = asset.tags.filter(
    (t) =>
      was.map(lower).includes(lower(t.name)) &&
      !now.map(lower).includes(lower(t.name))
  );
  const add: string[] = [];
  for (const name of now)
    if (!asset.tags.some((t) => lower(t.name) === lower(name)))
      add.push(await tagNamed(organizationId, userId, name));
  if (drop.length || add.length)
    // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: the asset was found in this workspace above
    await db.asset.update({
      where: { id: assetId },
      data: {
        tags: {
          disconnect: drop.map((t) => ({ id: t.id })),
          connect: add.map((id) => ({ id })),
        },
      },
    });
}

/** Whether a category (by id) is the IoT one, for the asset form. */
export async function isIotCategoryId(organizationId: string, id: string) {
  const c = await db.category.findFirst({
    where: { id, organizationId },
    select: { name: true },
  });
  return isIotCategory(c?.name);
}
