-- Matter (fork): a device's Matter record belongs to its asset, and goes with
-- it when the asset is deleted. Only adds a constraint.

-- AddForeignKey
ALTER TABLE "AssetMatter" ADD CONSTRAINT "AssetMatter_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
