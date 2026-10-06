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
  const [row, ai] = await Promise.all([
    db.workspaceCustomisation.findUnique({ where: { organizationId } }),
    // AI feature: Drafts shows in the menu once AI is on and has a key
    db.aiSettings.findUnique({
      where: { organizationId },
      select: { enabled: true, apiKey: true },
    }),
  ]);
  return {
    aiEnabled: Boolean(ai?.enabled && ai.apiKey),
    bookingsEnabled:
      row?.bookingsEnabled ?? DEFAULT_CUSTOMISATIONS.bookingsEnabled,
    remindersEnabled:
      row?.remindersEnabled ?? DEFAULT_CUSTOMISATIONS.remindersEnabled,
    auditsEnabled: organization.auditsEnabled ?? false,
    hiddenMenuItems: cleanHiddenMenuItems(row?.hiddenMenuItems ?? []),
    imagePreviewOnHover:
      row?.imagePreviewOnHover ?? DEFAULT_CUSTOMISATIONS.imagePreviewOnHover,
    labelsEnabled: row?.labelsEnabled ?? DEFAULT_CUSTOMISATIONS.labelsEnabled,
    custodyEnabled:
      row?.custodyEnabled ?? DEFAULT_CUSTOMISATIONS.custodyEnabled,
    locationsEnabled:
      row?.locationsEnabled ?? DEFAULT_CUSTOMISATIONS.locationsEnabled,
    kitsEnabled: row?.kitsEnabled ?? DEFAULT_CUSTOMISATIONS.kitsEnabled,
    assetModelsEnabled:
      row?.assetModelsEnabled ?? DEFAULT_CUSTOMISATIONS.assetModelsEnabled,
    qrDownloadsEnabled:
      row?.qrDownloadsEnabled ?? DEFAULT_CUSTOMISATIONS.qrDownloadsEnabled,
    showTimesInDates:
      row?.showTimesInDates ?? DEFAULT_CUSTOMISATIONS.showTimesInDates,
    reuseLatestNumber:
      row?.reuseLatestNumber ?? DEFAULT_CUSTOMISATIONS.reuseLatestNumber,
    soldBoxEnabled:
      row?.soldBoxEnabled ?? DEFAULT_CUSTOMISATIONS.soldBoxEnabled,
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
  // aiEnabled is set from Settings → AI, not on this page
  settings: Omit<CustomisePageSettings, "aiEnabled">
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
        imagePreviewOnHover: settings.imagePreviewOnHover,
        labelsEnabled: settings.labelsEnabled,
        custodyEnabled: settings.custodyEnabled,
        locationsEnabled: settings.locationsEnabled,
        kitsEnabled: settings.kitsEnabled,
        assetModelsEnabled: settings.assetModelsEnabled,
        qrDownloadsEnabled: settings.qrDownloadsEnabled,
        showTimesInDates: settings.showTimesInDates,
        reuseLatestNumber: settings.reuseLatestNumber,
        soldBoxEnabled: settings.soldBoxEnabled,
      },
      update: {
        bookingsEnabled: settings.bookingsEnabled,
        remindersEnabled: settings.remindersEnabled,
        hiddenMenuItems,
        imagePreviewOnHover: settings.imagePreviewOnHover,
        labelsEnabled: settings.labelsEnabled,
        custodyEnabled: settings.custodyEnabled,
        locationsEnabled: settings.locationsEnabled,
        kitsEnabled: settings.kitsEnabled,
        assetModelsEnabled: settings.assetModelsEnabled,
        qrDownloadsEnabled: settings.qrDownloadsEnabled,
        showTimesInDates: settings.showTimesInDates,
        reuseLatestNumber: settings.reuseLatestNumber,
        soldBoxEnabled: settings.soldBoxEnabled,
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

/**
 * For background jobs: is this feature switched off for the workspace? Used
 * to stop reminder and booking emails while their feature is off.
 */
export async function isFeatureSwitchedOff(
  organizationId: string,
  feature: "bookingsEnabled" | "remindersEnabled"
) {
  // A failed check must never stop a job, so when unsure, say "not switched off"
  try {
    const row = await db.workspaceCustomisation.findUnique({
      where: { organizationId },
      select: { bookingsEnabled: true, remindersEnabled: true },
    });
    return row ? !row[feature] : false;
  } catch {
    return false;
  }
}

/** For the booking worker: are bookings switched off for this booking's workspace? False if unsure. */
export async function bookingsSwitchedOffForBooking(bookingId: string) {
  try {
    const booking = await db.booking.findFirst({
      // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: background pg-boss job with no request context; the booking id comes from the scheduler queue, and only its organizationId is read
      where: { id: bookingId },
      select: { organizationId: true },
    });
    return booking
      ? await isFeatureSwitchedOff(booking.organizationId, "bookingsEnabled")
      : false;
  } catch {
    return false;
  }
}
