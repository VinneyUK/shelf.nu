/**
 * Workspace settings → Customise: switch features off and hide menu items.
 * Part of the customise feature; not in upstream Shelf.
 */
import { useEffect, useState } from "react";
import {
  data,
  useFetcher,
  useLoaderData,
  type MetaFunction,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { Switch } from "~/components/forms/switch";
import type { HeaderData } from "~/components/layout/header/types";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { HIDEABLE_MENU_ITEMS } from "~/modules/customisation/catalogue";
import {
  getCustomisePageSettings,
  saveCustomisePageSettings,
} from "~/modules/customisation/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import type { DataOrErrorResponse } from "~/utils/http.server";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export const handle = { breadcrumb: () => "Customise" };

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.read,
    });
    const header: HeaderData = { title: "Customise" };
    return payload({
      header,
      settings: await getCustomisePageSettings(organizationId),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

const flag = z.enum(["true", "false"]).transform((v) => v === "true");

const CustomiseSchema = z.object({
  bookingsEnabled: flag,
  remindersEnabled: flag,
  auditsEnabled: flag,
  barcodesEnabled: flag,
  hiddenMenuItems: z.string().transform((v) => (v ? v.split(",") : [])),
  imagePreviewOnHover: flag,
  labelsEnabled: flag,
  custodyEnabled: flag,
});

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.update,
    });
    const settings = parseData(await request.formData(), CustomiseSchema);
    await saveCustomisePageSettings(organizationId, settings);
    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

const FEATURES = [
  {
    name: "bookingsEnabled",
    title: "Bookings",
    description:
      "Booking assets out, the calendar, and booking settings. Switching this off hides them everywhere; existing bookings are kept.",
  },
  {
    name: "remindersEnabled",
    title: "Reminders",
    description:
      "Reminders on assets. Switching this off hides them; existing reminders are kept.",
  },
  {
    name: "custodyEnabled",
    title: "Custody",
    description:
      "Assigning assets to people. Switching this off hides custody on assets and kits, in bulk actions, the scanner and Home; existing custody is kept.",
  },
  {
    name: "auditsEnabled",
    title: "Audits",
    description: "Checking your assets against where they should be.",
  },
  {
    name: "barcodesEnabled",
    title: "Barcodes",
    description:
      "Barcode fields on assets (Code 128, EAN-13 and others), alongside Shelf's QR codes.",
  },
  {
    name: "labelsEnabled",
    title: "Labels",
    description:
      "Printing QR code labels on a Niimbot through Home Assistant: the Labels page, Print label buttons and the Labelled badge. Switching this off also stops printing by tag.",
  },
] as const;

type FeatureName = (typeof FEATURES)[number]["name"];

export default function CustomiseSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<DataOrErrorResponse>();
  const isSaving = isFormProcessing(fetcher.state);

  const [features, setFeatures] = useState<Record<FeatureName, boolean>>({
    bookingsEnabled: settings.bookingsEnabled,
    remindersEnabled: settings.remindersEnabled,
    auditsEnabled: settings.auditsEnabled,
    barcodesEnabled: settings.barcodesEnabled,
    labelsEnabled: settings.labelsEnabled,
    custodyEnabled: settings.custodyEnabled,
  });
  const [hidden, setHidden] = useState<string[]>(settings.hiddenMenuItems);
  const [imagePreview, setImagePreview] = useState<boolean>(
    settings.imagePreviewOnHover
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setSaved(!fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  const changed = () => setSaved(false);
  const serverError = (
    fetcher.data as { error?: { message: string } } | undefined
  )?.error?.message;

  return (
    <fetcher.Form method="post" className="flex flex-col">
      {FEATURES.map((f) => (
        <input
          key={f.name}
          type="hidden"
          name={f.name}
          value={String(features[f.name])}
        />
      ))}
      <input type="hidden" name="hiddenMenuItems" value={hidden.join(",")} />
      <input
        type="hidden"
        name="imagePreviewOnHover"
        value={String(imagePreview)}
      />

      <Card className="mt-0">
        <h3 className="text-text-lg font-semibold text-gray-900">Features</h3>
        <p className="mb-2 text-sm text-gray-600">
          Switch off what you don't use. Nothing is deleted — switch a feature
          back on and everything is where you left it.
        </p>
        <ul className="divide-y">
          {FEATURES.map((f) => (
            <li key={f.name} className="flex items-start gap-4 py-4">
              <Switch
                id={f.name}
                checked={features[f.name]}
                onCheckedChange={(checked) => {
                  setFeatures((prev) => ({ ...prev, [f.name]: checked }));
                  changed();
                }}
                aria-labelledby={`${f.name}-label`}
                aria-describedby={`${f.name}-desc`}
              />
              <div>
                <label
                  id={`${f.name}-label`}
                  htmlFor={f.name}
                  className="font-medium text-gray-900"
                >
                  {f.title}
                </label>
                <p id={`${f.name}-desc`} className="text-sm text-gray-600">
                  {f.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="text-text-lg font-semibold text-gray-900">
          Assets list
        </h3>
        <div className="flex items-start gap-4 py-4">
          <Switch
            id="imagePreviewOnHover"
            checked={imagePreview}
            onCheckedChange={(checked) => {
              setImagePreview(checked);
              changed();
            }}
            aria-labelledby="imagePreviewOnHover-label"
            aria-describedby="imagePreviewOnHover-desc"
          />
          <div>
            <label
              id="imagePreviewOnHover-label"
              htmlFor="imagePreviewOnHover"
              className="font-medium text-gray-900"
            >
              Image preview on hover
            </label>
            <p id="imagePreviewOnHover-desc" className="text-sm text-gray-600">
              Show a larger image when you hover over an asset's thumbnail in
              the assets list.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-text-lg font-semibold text-gray-900">Menu</h3>
        <p className="mb-2 text-sm text-gray-600">
          Choose what shows in the sidebar. Hidden pages still work if you go to
          them directly.
        </p>
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {HIDEABLE_MENU_ITEMS.map((item) => {
            const visible = !hidden.includes(item.key);
            return (
              <li key={item.key} className="flex items-center gap-3 py-2">
                <input
                  id={`menu-${item.key}`}
                  type="checkbox"
                  className="size-4 rounded border-gray-300 text-primary-600"
                  checked={visible}
                  onChange={(e) => {
                    setHidden((prev) =>
                      e.target.checked
                        ? prev.filter((k) => k !== item.key)
                        : [...prev, item.key]
                    );
                    changed();
                  }}
                />
                <label htmlFor={`menu-${item.key}`} className="text-gray-900">
                  {item.label}
                </label>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {serverError ? (
          <p role="alert" className="text-sm text-error-500">
            {serverError}
          </p>
        ) : saved ? (
          <p role="status" className="text-sm text-gray-600">
            Saved.
          </p>
        ) : null}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
