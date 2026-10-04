/**
 * Home page layout: which tiles each user shows, and in what order.
 * Part of the home layout feature; not in upstream Shelf.
 */
import { db } from "~/database/db.server";

export type HomeLayoutData = { order: string[]; hidden: string[] };

export async function getHomeLayout({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}): Promise<HomeLayoutData> {
  const row = await db.homeLayout.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { order: true, hidden: true },
  });
  return { order: row?.order ?? [], hidden: row?.hidden ?? [] };
}

export async function saveHomeLayout({
  userId,
  organizationId,
  order,
  hidden,
}: { userId: string; organizationId: string } & HomeLayoutData) {
  const clean = (ids: string[]) => [
    ...new Set(ids.filter((id) => /^[a-z-]{1,40}$/.test(id))),
  ];
  await db.homeLayout.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: {
      userId,
      organizationId,
      order: clean(order),
      hidden: clean(hidden),
    },
    update: { order: clean(order), hidden: clean(hidden) },
  });
}
