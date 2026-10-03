/**
 * Labels → Settings: the Home Assistant connection, label size and the queue
 * tag, with a test print. Part of the labels feature; not in upstream Shelf.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  data,
  useFetcher,
  useLoaderData,
  type MetaFunction,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { LabelPreview } from "~/components/labels/label-preview";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { LABEL_SIZE_PRESETS } from "~/modules/labels/layout";
import {
  getLabelSettings,
  printTestLabel,
  saveLabelSettings,
} from "~/modules/labels/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { SERVER_URL } from "~/utils/env";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction = () => [
  { title: appendToMetaTitle("Label settings") },
];

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
    return payload({
      settings: await getLabelSettings(organizationId),
      sampleQrUrl: `${SERVER_URL}/labels`,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

const SettingsSchema = z.object({
  intent: z.literal("save"),
  haUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\/[^\s/]+/i.test(v), {
      message: "Enter an address starting with http:// or https://",
    }),
  haToken: z.string().default(""),
  deviceId: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z0-9]+$/.test(v), {
      message: "The device ID is letters and numbers only",
    }),
  labelWidth: z.coerce.number().int().min(150).max(800),
  leftMargin: z.coerce.number().int().min(0).max(40),
  rotate: z.coerce.number().refine((v) => v === 90 || v === 270),
  density: z
    .string()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1).max(5).nullable()),
  queueTagName: z.string().trim().max(50).default(""),
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
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === "test" || intent === "preview") {
      await printTestLabel(organizationId, intent === "preview");
      return payload({
        success: true,
        message:
          intent === "preview"
            ? "Sent. Look at the Niimbot's Last Label Made image in Home Assistant."
            : "Test label sent to the printer.",
      });
    }
    const { intent: _intent, ...settings } = parseData(
      formData,
      SettingsSchema
    );
    await saveLabelSettings(organizationId, settings);
    return payload({ success: true, message: "Saved." });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100";

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-gray-200 py-4 last:border-b-0 lg:flex-row lg:gap-8">
      <div className="lg:w-[280px] lg:shrink-0">
        <label htmlFor={htmlFor} className="text-sm font-medium text-gray-900">
          {label}
        </label>
        {hint ? <p className="text-xs text-gray-600">{hint}</p> : null}
      </div>
      <div className="w-full max-w-[512px]">{children}</div>
    </div>
  );
}

export default function LabelSettingsPage() {
  const { settings, sampleQrUrl } = useLoaderData<typeof loader>();
  const save = useFetcher<{ error?: { message: string }; message?: string }>();
  const test = useFetcher<{ error?: { message: string }; message?: string }>();

  const presetWidths = LABEL_SIZE_PRESETS.map((p) => p.width as number);
  const [width, setWidth] = useState(settings.labelWidth);
  const [custom, setCustom] = useState(
    !presetWidths.includes(settings.labelWidth)
  );
  const [margin, setMargin] = useState(settings.leftMargin);

  const [saveMessage, setSaveMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (save.state === "idle" && save.data) {
      setSaveMessage(
        save.data.error
          ? { text: save.data.error.message, error: true }
          : { text: save.data.message ?? "Saved.", error: false }
      );
    }
  }, [save.state, save.data]);

  return (
    <div className="flex flex-col gap-4">
      <save.Form method="post" onChange={() => setSaveMessage(null)}>
        <input type="hidden" name="intent" value="save" />
        <Card className="my-0">
          <h3 className="text-text-md font-semibold text-gray-900">
            Home Assistant
          </h3>
          <p className="text-sm text-gray-600">
            Shelf prints through the Niimbot integration in Home Assistant.
          </p>
          <Field
            label="Address"
            hint="As you'd type it in a browser"
            htmlFor="haUrl"
          >
            <input
              id="haUrl"
              name="haUrl"
              defaultValue={settings.haUrl}
              placeholder="http://192.168.0.100:8123"
              className={inputClass}
            />
          </Field>
          <Field
            label="Access token"
            hint="Your profile in Home Assistant → Security → Long-lived access tokens"
            htmlFor="haToken"
          >
            <input
              id="haToken"
              name="haToken"
              type="password"
              autoComplete="off"
              placeholder={
                settings.hasToken
                  ? "Saved — leave blank to keep it"
                  : "Paste the token"
              }
              className={inputClass}
            />
          </Field>
          <Field
            label="Printer's device ID"
            hint="Settings → Devices & services → Devices → your Niimbot; the string at the end of the address"
            htmlFor="deviceId"
          >
            <input
              id="deviceId"
              name="deviceId"
              defaultValue={settings.deviceId}
              className={inputClass}
            />
          </Field>
        </Card>

        <Card>
          <h3 className="text-text-md font-semibold text-gray-900">Label</h3>
          <Field
            label="Label size"
            hint="The length matters; the printhead always prints 12 mm high"
            htmlFor="labelSize"
          >
            <select
              id="labelSize"
              className={inputClass}
              value={custom ? "custom" : String(width)}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setCustom(true);
                } else {
                  setCustom(false);
                  setWidth(Number(e.target.value));
                }
              }}
            >
              {LABEL_SIZE_PRESETS.map((p) => (
                <option key={p.width} value={p.width}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom length…</option>
            </select>
            {custom ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="number"
                  min={150}
                  max={800}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value) || 240)}
                  className={`${inputClass} w-28`}
                  aria-label="Label length in dots"
                />
                dots long (8 per mm)
              </div>
            ) : null}
            <input type="hidden" name="labelWidth" value={width} />
          </Field>
          <Field
            label="Space before the QR code"
            hint="8 dots is 1 mm"
            htmlFor="leftMargin"
          >
            <input
              id="leftMargin"
              name="leftMargin"
              type="number"
              min={0}
              max={40}
              value={margin}
              onChange={(e) =>
                setMargin(Math.max(0, Number(e.target.value) || 0))
              }
              className={`${inputClass} w-28`}
            />
          </Field>
          <Field label="Orientation" htmlFor="rotate">
            <select
              id="rotate"
              name="rotate"
              defaultValue={String(settings.rotate)}
              className={inputClass}
            >
              <option value="90">Normal</option>
              <option value="270">
                Upside down (if labels print the wrong way round)
              </option>
            </select>
          </Field>
          <Field label="Darkness" htmlFor="density">
            <select
              id="density"
              name="density"
              defaultValue={settings.density ? String(settings.density) : ""}
              className={inputClass}
            >
              <option value="">Printer's default</option>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preview" htmlFor="preview">
            <div id="preview">
              <LabelPreview
                sequentialId="SAM-0000"
                title="Bosch Professional GBH 2-28 Hammer Drill"
                qrUrl={sampleQrUrl}
                settings={{ labelWidth: width, leftMargin: margin }}
              />
            </div>
          </Field>
        </Card>

        <Card>
          <h3 className="text-text-md font-semibold text-gray-900">
            Printing by tag
          </h3>
          <Field
            label="Queue tag"
            hint="Give an asset this tag and its label prints within a minute, then the tag is removed. Leave blank to switch this off."
            htmlFor="queueTagName"
          >
            <input
              id="queueTagName"
              name="queueTagName"
              defaultValue={settings.queueTagName}
              className={`${inputClass} w-48`}
            />
          </Field>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {saveMessage ? (
            <p
              role={saveMessage.error ? "alert" : "status"}
              className={`text-sm ${
                saveMessage.error ? "text-error-600" : "text-gray-600"
              }`}
            >
              {saveMessage.text}
            </p>
          ) : null}
          <Button type="submit" disabled={isFormProcessing(save.state)}>
            {isFormProcessing(save.state) ? "Saving…" : "Save"}
          </Button>
        </div>
      </save.Form>

      <Card className="my-0">
        <h3 className="text-text-md font-semibold text-gray-900">Test</h3>
        <p className="mb-3 text-sm text-gray-600">
          Uses the saved settings, so save any changes first.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <test.Form method="post">
            <input type="hidden" name="intent" value="test" />
            <Button
              type="submit"
              disabled={isFormProcessing(test.state) || !settings.isConfigured}
            >
              Print a test label
            </Button>
          </test.Form>
          <test.Form method="post">
            <input type="hidden" name="intent" value="preview" />
            <Button
              type="submit"
              variant="secondary"
              disabled={isFormProcessing(test.state) || !settings.isConfigured}
            >
              Preview in Home Assistant
            </Button>
          </test.Form>
          {test.state === "idle" && test.data ? (
            <p
              role={test.data.error ? "alert" : "status"}
              className={`text-sm ${
                test.data.error ? "text-error-600" : "text-gray-600"
              }`}
            >
              {test.data.error ? test.data.error.message : test.data.message}
            </p>
          ) : isFormProcessing(test.state) ? (
            <p className="text-sm text-gray-600">Sending…</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
