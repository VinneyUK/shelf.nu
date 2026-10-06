/**
 * Totals for the Categories, Places and Boxes lists (fork): the figures per row,
 * and the totals row, which covers every row matching the search, not just the page.
 * Part of the fork; not in upstream Shelf.
 */
import type { Prisma } from "@prisma/client";
import { db } from "~/database/db.server";
import { type Figures, NO_FIGURES, roundMoney, sumFigures } from "./figures";
import {
  BOX_FIGURES_SQL,
  CATEGORY_FIGURES_SQL,
  PLACE_FIGURES_SQL,
  UNCATEGORISED_FIGURES_SQL,
} from "./sql";

type Row = {
  id: string | null;
  assets: number;
  recorded: number;
  sold_for: number;
  difference: number;
};

const toFigures = (r: Row): Figures => ({
  assets: Number(r.assets),
  recorded: roundMoney(Number(r.recorded)),
  soldFor: roundMoney(Number(r.sold_for)),
  difference: roundMoney(Number(r.difference)),
});

async function figuresById(sql: string, ...params: unknown[]) {
  const rows = await db.$queryRawUnsafe<Row[]>(sql, ...params);
  return new Map(
    rows.filter((r) => r.id !== null).map((r) => [r.id as string, toFigures(r)])
  );
}

export const categoryFigures = (organizationId: string) =>
  figuresById(CATEGORY_FIGURES_SQL, organizationId);
export const placeFigures = (organizationId: string) =>
  figuresById(PLACE_FIGURES_SQL, organizationId);
export const boxFigures = (organizationId: string, boxIds: string[]) =>
  boxIds.length > 0
    ? figuresById(BOX_FIGURES_SQL, organizationId, boxIds)
    : Promise.resolve(new Map<string, Figures>());

/** Assets that have no category, so the Categories total can say what it leaves out. */
export async function uncategorisedFigures(
  organizationId: string
): Promise<Figures> {
  const [row] = await db.$queryRawUnsafe<Row[]>(
    UNCATEGORISED_FIGURES_SQL,
    organizationId
  );
  return row ? toFigures(row) : NO_FIGURES;
}

/** The Categories list's search, exactly as `getCategories` applies it. */
function categoryWhere(
  organizationId: string,
  search?: string | null
): Prisma.CategoryWhereInput {
  return {
    organizationId,
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };
}

/** The Places list's search, exactly as `getLocations` applies it. */
function placeWhere(
  organizationId: string,
  search?: string | null
): Prisma.LocationWhereInput {
  return {
    organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { address: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

/** The Categories totals row: every category matching the search, across all pages. */
export async function categoryTotals({
  organizationId,
  search,
}: {
  organizationId: string;
  search?: string | null;
}) {
  const [categories, figures, uncategorised] = await Promise.all([
    db.category.findMany({
      where: categoryWhere(organizationId, search),
      select: { id: true },
    }),
    categoryFigures(organizationId),
    uncategorisedFigures(organizationId),
  ]);
  return {
    figures,
    totals: sumFigures(categories.map((c) => figures.get(c.id) ?? NO_FIGURES)),
    // only worth mentioning when nothing is being searched for
    uncategorised: search ? NO_FIGURES : uncategorised,
  };
}

/** The Places totals row: every place matching the search, across all pages. */
export async function placeTotals({
  organizationId,
  search,
}: {
  organizationId: string;
  search?: string | null;
}) {
  const [places, figures] = await Promise.all([
    db.location.findMany({
      where: placeWhere(organizationId, search),
      select: { id: true, _count: { select: { children: true, kits: true } } },
    }),
    placeFigures(organizationId),
  ]);
  return {
    figures,
    totals: sumFigures(places.map((p) => figures.get(p.id) ?? NO_FIGURES)),
    children: places.reduce((n, p) => n + p._count.children, 0),
    boxes: places.reduce((n, p) => n + p._count.kits, 0),
  };
}
