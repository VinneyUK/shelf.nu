/**
 * Inline editing in the lists: one cell, one field, straight away.
 * GET  → the pick-lists (categories, tags, locations, boxes) for the pickers
 * POST → one change. Shelf's own updateAsset does the saving (and the
 *        history); status and sold value go through the sold feature; box
 *        through Shelf's kit service.
 * Part of the inline editing feature; not in upstream Shelf.
 */
import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { db } from "~/database/db.server";
import { updateAsset } from "~/modules/asset/service.server";
import { updateKitAssets } from "~/modules/kit/service.server";
import {
  markAssetsNotSold,
  markAssetsSold,
} from "~/modules/sold/service.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { assertIsPost, error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const INLINE_EDIT_URL = "/api/assets/inline-edit";

const Schema = z.discriminatedUnion("field", [
  z.object({
    field: z.literal("description"),
    assetId: z.string(),
    value: z.string().max(1000),
  }),
  z.object({
    field: z.literal("valuation"),
    assetId: z.string(),
    value: z.string(),
  }),
  z.object({
    field: z.literal("quantity"),
    assetId: z.string(),
    value: z.string(),
  }),
  z.object({
    field: z.literal("category"),
    assetId: z.string(),
    value: z.string(),
  }),
  z.object({
    field: z.literal("tags"),
    assetId: z.string(),
    value: z.string(),
  }),
  z.object({
    field: z.literal("location"),
    assetId: z.string(),
    value: z.string(),
  }),
  z.object({ field: z.literal("box"), assetId: z.string(), value: z.string() }),
  z.object({
    field: z.literal("status"),
    assetId: z.string(),
    value: z.enum(["AVAILABLE", "SOLD"]),
    soldOn: z.string().optional(),
    price: z.string().optional(),
  }),
  z.object({
    field: z.literal("soldPrice"),
    assetId: z.string(),
    value: z.string(),
  }),
]);

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const [categories, tags, locations, boxes] = await Promise.all([
      db.category.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.tag.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.location.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.kit.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return payload({ categories, tags, locations, boxes });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    assertIsPost(request);
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const input = parseData(await request.formData(), Schema);
    const { assetId } = input;
    const base = { id: assetId, userId, organizationId, request };

    switch (input.field) {
      case "description":
        await updateAsset({ ...base, description: input.value.trim() });
        break;
      case "valuation": {
        const value = input.value.trim() === "" ? null : Number(input.value);
        if (value !== null && (!Number.isFinite(value) || value < 0))
          throw bad("Enter a value of 0 or more.");
        await updateAsset({ ...base, valuation: value });
        break;
      }
      case "quantity": {
        const value = Number(input.value);
        if (!Number.isInteger(value) || value < 0)
          throw bad("Enter a whole number of 0 or more.");
        await updateAsset({ ...base, quantity: value });
        break;
      }
      case "category":
        await updateAsset({
          ...base,
          categoryId: input.value || "uncategorized",
        });
        break;
      case "tags":
        await updateAsset({
          ...base,
          tags: {
            set: input.value
              .split(",")
              .filter(Boolean)
              .map((id) => ({ id })),
          },
        });
        break;
      case "location": {
        const current = await db.assetLocation.findFirst({
          where: { assetId, asset: { organizationId } },
          select: { locationId: true },
        });
        await updateAsset({
          ...base,
          newLocationId: input.value || null,
          currentLocationId: current?.locationId ?? undefined,
        });
        break;
      }
      case "box": {
        // Leave the current box (if any), then join the chosen one (if any)
        const current = await db.assetKit.findFirst({
          where: { assetId, kit: { organizationId } },
          select: {
            kitId: true,
            kit: { select: { assetKits: { select: { assetId: true } } } },
          },
        });
        if (current && current.kitId !== input.value) {
          await updateKitAssets({
            kitId: current.kitId,
            organizationId,
            userId,
            request,
            assetIds: current.kit.assetKits
              .map((a) => a.assetId)
              .filter((id) => id !== assetId),
          });
        }
        if (input.value && current?.kitId !== input.value) {
          await updateKitAssets({
            kitId: input.value,
            organizationId,
            userId,
            request,
            assetIds: [assetId],
            addOnly: true,
          });
        }
        break;
      }
      case "status":
        if (input.value === "SOLD") {
          const soldOn =
            input.soldOn && /^\d{4}-\d{2}-\d{2}$/.test(input.soldOn)
              ? new Date(`${input.soldOn}T00:00:00.000Z`)
              : new Date();
          const price = input.price?.trim()
            ? Math.max(0, Number(input.price) || 0)
            : null;
          await markAssetsSold({
            organizationId,
            assetIds: [assetId],
            soldOn,
            price,
            userId,
          });
        } else {
          await markAssetsNotSold({
            organizationId,
            assetIds: [assetId],
            userId,
          });
        }
        break;
      case "soldPrice": {
        const sale = await db.assetSale.findFirst({
          where: { assetId, organizationId },
          select: { soldOn: true },
        });
        if (!sale) throw bad("This asset isn't marked as sold.");
        const price =
          input.value.trim() === ""
            ? null
            : Math.max(0, Number(input.value) || 0);
        await markAssetsSold({
          organizationId,
          assetIds: [assetId],
          soldOn: sale.soldOn,
          price,
          userId,
        });
        break;
      }
    }
    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

function bad(message: string) {
  return new ShelfError({
    cause: null,
    message,
    status: 400,
    label: "Assets",
    shouldBeCaptured: false,
  });
}
