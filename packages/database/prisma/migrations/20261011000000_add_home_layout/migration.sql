-- Home page layout (home layout feature). Only adds a table.

-- CreateTable
CREATE TABLE "HomeLayout" (
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "order" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hidden" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeLayout_pkey" PRIMARY KEY ("userId","organizationId")
);

-- AddForeignKey
ALTER TABLE "HomeLayout" ADD CONSTRAINT "HomeLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeLayout" ADD CONSTRAINT "HomeLayout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match Shelf's other tables: no direct access through Supabase's public API
ALTER TABLE "HomeLayout" ENABLE row level security;
