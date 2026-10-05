/**
 * Giving back the latest asset number (fork).
 *
 * Shelf numbers assets from a counter that only counts up, so deleting
 * SAM-0020 left the next asset as SAM-0021. With this on, deleting the most
 * recent asset puts the counter back, so the next one is SAM-0020 again.
 *
 * Only numbers at the top are given back: the counter is set to the highest
 * number still in use. A deleted number below it (SAM-0010 while SAM-0015
 * exists) is never reused, so old references to it can't land on a different
 * asset. Deleting several of the latest in a row gives all of them back.
 *
 * Part of the customise feature; not in upstream Shelf.
 */
import { db } from "~/database/db.server";

/**
 * Returns whether the counter was moved back. Never throws: failing to give a
 * number back must not stop an asset being deleted. If a new asset is created
 * at the very moment of a rollback and the numbers collide, Shelf's createAsset
 * already retries with the next one.
 */
export async function releaseTrailingAssetNumbers(
  organizationId: string
): Promise<boolean> {
  try {
    const setting = await db.workspaceCustomisation.findUnique({
      where: { organizationId },
      select: { reuseLatestNumber: true },
    });
    if (setting?.reuseLatestNumber === false) return false;

    // One statement: the highest number still in use, and the counter set to it
    // only if the counter is beyond it. The sequence is looked up exactly as
    // Shelf's get_next_sequential_id does.
    const moved = await db.$queryRaw<{ v: string }[]>`
      SELECT setval(
        ('org_' || ${organizationId} || '_asset_sequence')::regclass,
        GREATEST(m.max_num, 1),
        m.max_num > 0
      )::text AS v
      FROM (
        SELECT COALESCE(MAX(
          CASE WHEN "sequentialId" ~ '^[A-Z]+-[0-9]+$'
               THEN CAST(SPLIT_PART("sequentialId", '-', 2) AS BIGINT)
               ELSE 0 END
        ), 0) AS max_num
        FROM "Asset"
        WHERE "organizationId" = ${organizationId}
          AND "sequentialId" IS NOT NULL
      ) m
      WHERE EXISTS (
        SELECT 1 FROM pg_sequences
        WHERE schemaname = 'public'
          AND sequencename = 'org_' || ${organizationId} || '_asset_sequence'
          AND last_value IS NOT NULL
          AND last_value > m.max_num
      )
    `;
    return moved.length > 0;
  } catch {
    return false;
  }
}
