/**
 * Workspace customisations: loading and saving.
 * Part of the customise feature; not in upstream Shelf.
 *
 * Bookings, reminders and hidden menu items live in WorkspaceCustomisation.
 * Audits and barcodes are switches Shelf already keeps on the workspace
 * itself (normally only changeable from its admin area), so those are read and
 * written there and Shelf's own code does the rest. Shelf branding and QR
 * codes on PDFs are left on Shelf's General settings page, where they live.
 */
import { db } from "~/database/db.server";
import {
  type Customisations,
  DEFAULT_CUSTOMISATIONS,
  cleanHiddenMenuItems,
} from "./catalogue";

type OrganizationFlags = { auditsEnabled: boolean | null };

/** Customisations for a workspace, falling back to Shelf as it ships. */
export async function getWorkspaceCustomisations(
  organizationId: string,
  organization: OrganizationFlags
): Promise<Customisations> {
  const row = await db.workspaceCustomisation.findUnique({
    where: { organizationId },
  });
  return {
    bookingsEnabled:
      row?.bookingsEnabled ?? DEFAULT_CUSTOMISATIONS.bookingsEnabled,
    remindersEnabled:
      row?.remindersEnabled ?? DEFAULT_CUSTOMISATIONS.remindersEnabled,
    auditsEnabled: organization.auditsEnabled ?? false,
    hiddenMenuItems: cleanHiddenMenuItems(row?.hiddenMenuItems ?? []),
  };
}

/** Everything the Customise page shows, including Shelf's own switches. */
export async function getCustomisePageSettings(organizationId: string) {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      auditsEnabled: true,
      barcodesEnabled: true,
    },
  });
  const customisations = await getWorkspaceCustomisations(
    organizationId,
    organization
  );
  return {
    ...customisations,
    barcodesEnabled: organization.barcodesEnabled,
  };
}

export type CustomisePageSettings = Awaited<
  ReturnType<typeof getCustomisePageSettings>
>;

export async function saveCustomisePageSettings(
  organizationId: string,
  settings: CustomisePageSettings
) {
  const current = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { auditsEnabled: true, barcodesEnabled: true },
  });
  const now = new Date();
  const hiddenMenuItems = cleanHiddenMenuItems(settings.hiddenMenuItems);

  await db.$transaction([
    db.workspaceCustomisation.upsert({
      where: { organizationId },
      create: {
        organizationId,
        bookingsEnabled: settings.bookingsEnabled,
        remindersEnabled: settings.remindersEnabled,
        hiddenMenuItems,
      },
      update: {
        bookingsEnabled: settings.bookingsEnabled,
        remindersEnabled: settings.remindersEnabled,
        hiddenMenuItems,
      },
    }),
    db.organization.update({
      where: { id: organizationId },
      data: {
        auditsEnabled: settings.auditsEnabled,
        // Shelf records when each was switched on
        ...(settings.auditsEnabled && !current.auditsEnabled
          ? { auditsEnabledAt: now }
          : {}),
        barcodesEnabled: settings.barcodesEnabled,
        ...(settings.barcodesEnabled && !current.barcodesEnabled
          ? { barcodesEnabledAt: now }
          : {}),
      },
    }),
  ]);
}
