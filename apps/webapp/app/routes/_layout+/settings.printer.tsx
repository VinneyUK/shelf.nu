/**
 * Settings > Printer (fork): the Bambu printer Shelf reads the AMS from. Its
 * address, serial and access code (kept encrypted, never shown again), a
 * switch to read the AMS, a Test button that shows what the AMS holds, and
 * when the printer last reported.
 */
import { useEffect, useRef } from "react";
import { data, useFetcher, useLoaderData } from "react-router";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { z } from "zod";
import { Switch } from "~/components/forms/switch";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { daysAgo } from "~/modules/filament/catalogue";
import {
  ensureAmsWatcher,
  getPrinterSettings,
  getPrinterSettingsForPage,
  probePrinter,
  savePrinterSettings,
} from "~/modules/filament/printer.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { withPopups } from "~/utils/fork-notify.server";
import { isFormProcessing } from "~/utils/form";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction<typeof loader> = () => [
  { title: appendToMetaTitle("Printer") },
];
export const handle = { breadcrumb: () => "Printer" };

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.read,
    });
    const settings = await getPrinterSettingsForPage(organizationId);
    void ensureAmsWatcher(organizationId);
    return payload({ header: { title: "Printer" }, settings });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

const Form = z.object({
  intent: z.enum(["save", "test"]),
  enabled: z.coerce.boolean().optional(),
  host: z.string().trim().max(100),
  serial: z.string().trim().max(40),
  accessCode: z.string().trim().max(40).optional(),
});

async function runAction({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.update,
    });
    const input = parseData(await request.formData(), Form);
    if (input.intent === "test") {
      const kept = await getPrinterSettings(organizationId);
      const target = {
        host: input.host || kept.host,
        serial: (input.serial || kept.serial).toUpperCase(),
        accessCode: input.accessCode || kept.accessCode,
      };
      if (!target.host || !target.serial || !target.accessCode) {
        return payload({
          failed: true,
          message: "Fill in the address, serial and access code first.",
        });
      }
      const result = await probePrinter(target);
      if (!result.ok) return payload({ failed: true, message: result.error });
      const slots = result.trays.map(
        (t) =>
          `${t.slot}: ${t.colourName ?? t.colourHex} ${t.type}, ${
            t.remainingPercent
          }%`
      );
      return payload({
        message: slots.length
          ? `The AMS has ${slots.length} loaded: ${slots.join("; ")}.`
          : "Connected. The AMS reports no tagged filament loaded.",
      });
    }
    await savePrinterSettings(organizationId, {
      enabled: Boolean(input.enabled),
      host: input.host,
      serial: input.serial,
      accessCode: input.accessCode || null,
    });
    return payload({ message: "Saved." });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

/** Every outcome as Shelf's pop-up (fork). */
export const action = withPopups(runAction, {
  save: {
    ok: "Printer settings saved",
    failed: "Couldn't save the printer settings",
  },
  test: { ok: "The printer answered", failed: "The printer didn't answer" },
});

export default function PrinterSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const save = useFetcher<typeof action>();
  const test = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // after a save, the code box is cleared: the code is kept, never shown
    if (
      save.state === "idle" &&
      save.data &&
      !("error" in (save.data as object))
    ) {
      const box = formRef.current?.elements.namedItem(
        "accessCode"
      ) as HTMLInputElement | null;
      if (box) box.value = "";
    }
  }, [save.state, save.data]);
  const field = "flex flex-col gap-1 text-sm font-medium text-gray-900";
  const input =
    "rounded-md border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900";
  return (
    <>
      <Header />
      <div className="flex max-w-2xl flex-col gap-4">
        <Card className="my-0">
          <h3 className="text-text-md font-semibold text-gray-900">
            Bambu printer
          </h3>
          <p className="mb-4 text-sm text-gray-600">
            Shelf reads the AMS over your local network: whatever the AMS
            recognises appears on the Filament page, waiting for you. The
            printer can stay in cloud mode; nothing on it needs changing.
          </p>
          <save.Form
            ref={formRef}
            method="post"
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="intent" value="save" />
            <div className="flex items-center justify-between gap-3 text-sm font-medium text-gray-900">
              <label htmlFor="read-ams">Read the AMS</label>
              <Switch
                id="read-ams"
                name="enabled"
                value="true"
                defaultChecked={settings.enabled}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={field}>
                Printer address
                <input
                  name="host"
                  defaultValue={settings.host}
                  placeholder="192.168.0.119"
                  className={input}
                  autoComplete="off"
                />
                <span className="text-xs font-normal text-gray-500">
                  On the printer's screen under WLAN, as IP.
                </span>
              </label>
              <label className={field}>
                Serial number
                <input
                  name="serial"
                  defaultValue={settings.serial}
                  placeholder="00M09D4…"
                  className={input}
                  autoComplete="off"
                />
                <span className="text-xs font-normal text-gray-500">
                  Under Device and Serial Number.
                </span>
              </label>
              <label className={field}>
                Access code
                <input
                  name="accessCode"
                  type="password"
                  placeholder={
                    settings.hasCode
                      ? "Kept. Type a new one to change it."
                      : "8 characters, under WLAN"
                  }
                  className={input}
                  autoComplete="new-password"
                />
                <span className="text-xs font-normal text-gray-500">
                  Kept encrypted and never shown again.
                </span>
              </label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                {settings.lastError
                  ? `Last problem: ${settings.lastError}`
                  : settings.lastSeenAt
                  ? `Last report from the printer: ${daysAgo(
                      settings.lastSeenAt
                    )}.`
                  : settings.enabled
                  ? "No report from the printer yet."
                  : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isFormProcessing(test.state)}
                  onClick={() => {
                    const form = formRef.current;
                    if (!form) return;
                    const body = new FormData(form);
                    body.set("intent", "test");
                    void test.submit(body, { method: "post" });
                  }}
                >
                  {isFormProcessing(test.state)
                    ? "Asking the printer…"
                    : "Test"}
                </Button>
                <Button type="submit" disabled={isFormProcessing(save.state)}>
                  Save
                </Button>
              </div>
            </div>
          </save.Form>
        </Card>
        <Card className="my-0">
          <h3 className="text-text-md font-semibold text-gray-900">
            What happens
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
            <li>
              Filament Shelf already knows (by its tag) shows which slot it's in
              and how much is left, as the printer says.
            </li>
            <li>
              A spool the AMS recognises that Shelf hasn't seen goes to Waiting
              for you, with its slot, line and colour filled in.
            </li>
            <li>
              Filament taken out of the AMS goes back to Opened. Retired
              filament is left retired.
            </li>
            <li>Third-party spools without a Bambu tag are ignored.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
