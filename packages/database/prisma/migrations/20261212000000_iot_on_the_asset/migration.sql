-- IoT (fork): an IoT asset's type and protocol are set on the asset, and its
-- devices take them. Only adds two columns, filled in for assets that
-- already have devices: the protocol and type most of their devices have.

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "iotType" TEXT;
ALTER TABLE "Asset" ADD COLUMN "iotProtocol" TEXT;

-- From the devices already added
UPDATE "Asset" a SET "iotProtocol" = p.protocol
FROM (
  SELECT DISTINCT ON ("assetId") "assetId", "protocol"
  FROM "MatterDevice"
  GROUP BY "assetId", "protocol"
  ORDER BY "assetId", COUNT(*) DESC, "protocol"
) p
WHERE a.id = p."assetId";

UPDATE "Asset" a SET "iotType" = d."deviceType"
FROM (
  SELECT DISTINCT ON ("assetId") "assetId", "deviceType"
  FROM "MatterDevice"
  WHERE "deviceType" IS NOT NULL
  GROUP BY "assetId", "deviceType"
  ORDER BY "assetId", COUNT(*) DESC, "deviceType"
) d
WHERE a.id = d."assetId";
