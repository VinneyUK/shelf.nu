-- IoT (fork): a device's protocol (Matter, Zigbee, Z-Wave, Thread, Wi-Fi,
-- Bluetooth, Ethernet), what it is (its type), and the details the other
-- protocols need. Only adds columns; every device so far is Matter.

-- AlterTable
ALTER TABLE "MatterDevice" ADD COLUMN "protocol" TEXT NOT NULL DEFAULT 'Matter';
ALTER TABLE "MatterDevice" ADD COLUMN "deviceType" TEXT;
ALTER TABLE "MatterDevice" ADD COLUMN "address" TEXT;
ALTER TABLE "MatterDevice" ADD COLUMN "secret" TEXT;
ALTER TABLE "MatterDevice" ADD COLUMN "ip" TEXT;
ALTER TABLE "MatterDevice" ADD COLUMN "network" TEXT;
