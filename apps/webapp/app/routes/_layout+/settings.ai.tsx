/**
 * Settings → AI (fork): the Anthropic API key, the model, and a connection test.
 * Claude reads photos and receipts and proposes assets (see Drafts).
 * Part of the AI feature; not in upstream Shelf.
 */
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { z } from "zod";
import { Switch } from "~/components/forms/switch";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DESCRIPTION_LENGTH, MODELS } from "~/modules/ai/models";
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  testWebSearch,
} from "~/modules/ai/settings.server";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const handle = { breadcrumb: () => "AI" };

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.read,
    });
    return payload({ settings: await getAiSettings(organizationId) });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

const SaveSchema = z.object({
  intent: z.literal("save"),
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
  draftReceipts: z.enum(["true", "false"]).transform((v) => v === "true"),
  webSearch: z.enum(["true", "false"]).transform((v) => v === "true"),
  descriptionLength: z.coerce
    .number({
      invalid_type_error: "Enter the length as a number of characters.",
    })
    .int("Enter a whole number of characters.")
    .min(
      DESCRIPTION_LENGTH.min,
      `At least ${DESCRIPTION_LENGTH.min} characters.`
    )
    .max(
      DESCRIPTION_LENGTH.max,
      `At most ${DESCRIPTION_LENGTH.max} characters.`
    ),
  apiKey: z.string().default(""),
  model: z.string().trim().min(1, "Choose a model.").max(100),
  workspaceId: z
    .string()
    .trim()
    .regex(
      /^(wrkspc_[A-Za-z0-9]+)?$/,
      "A workspace ID starts with wrkspc_. Leave it blank if your key is tied to one workspace."
    )
    .default(""),
});

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.update,
    });
    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");
    if (intent === "save") {
      const { intent: _intent, ...rest } = parseData(formData, SaveSchema);
      await saveAiSettings(organizationId, rest);
      return payload({ message: "Saved." });
    }
    if (intent === "test") {
      const result = await testAiConnection(organizationId);
      return payload({
        message: result.ok
          ? `Connected. Claude (${result.model}) answered.`
          : `Not working: ${result.message}`,
        failed: !result.ok,
      });
    }
    if (intent === "test-web") {
      const result = await testWebSearch(organizationId);
      return payload({
        message: result.ok ? result.message : `Not working: ${result.message}`,
        failed: !result.ok,
      });
    }
    return payload({ message: "Unknown action." });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

type Result = {
  error?: { message: string } | null;
  message?: string;
  failed?: boolean;
};

function ResultLine({
  fetcher,
}: {
  fetcher: { state: string; data?: Result };
}) {
  if (isFormProcessing(fetcher.state as never))
    return <p className="text-sm text-gray-600">Working…</p>;
  if (fetcher.state !== "idle" || !fetcher.data) return null;
  const bad = Boolean(fetcher.data.error) || fetcher.data.failed;
  return (
    <p
      role={bad ? "alert" : "status"}
      className={bad ? "text-sm text-error-600" : "text-sm text-gray-600"}
    >
      {fetcher.data.error?.message ?? fetcher.data.message}
    </p>
  );
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100";

export default function AiSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const save = useFetcher<Result>();
  const test = useFetcher<Result>();
  const testWeb = useFetcher<Result>();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [webSearch, setWebSearch] = useState(settings.webSearch);
  const [draftReceipts, setDraftReceipts] = useState(settings.draftReceipts);
  useEffect(() => setEnabled(settings.enabled), [settings.enabled]);
  useEffect(() => setWebSearch(settings.webSearch), [settings.webSearch]);
  useEffect(
    () => setDraftReceipts(settings.draftReceipts),
    [settings.draftReceipts]
  );
  const known = MODELS.some((m) => m.id === settings.model);

  return (
    <div className="flex flex-col gap-4">
      <Card className="my-0">
        <h3 className="text-text-lg font-semibold text-gray-900">AI</h3>
        <p className="text-sm text-gray-600">
          Add photos of your things, or send in receipts, and Claude suggests
          the name, description, estimated value and category. They land in{" "}
          <strong>Drafts</strong> for you to check; nothing becomes an asset
          until you say so.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Photos and receipts you add are sent to Anthropic to be read. Nothing
          is sent unless you add it, or forward a receipt while this is on.
          Usage is charged to your own Anthropic account, usually a penny or two
          for a photo.
        </p>
        {settings.lastError ? (
          <p role="alert" className="mt-2 text-sm text-error-600">
            Last problem: {settings.lastError}
          </p>
        ) : null}
      </Card>

      <save.Form method="post">
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="enabled" value={String(enabled)} />
        <input type="hidden" name="webSearch" value={String(webSearch)} />
        <input
          type="hidden"
          name="draftReceipts"
          value={String(draftReceipts)}
        />
        <Card className="my-0 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-labelledby="enabled-label"
            />
            <label
              id="enabled-label"
              htmlFor="enabled"
              className="font-medium text-gray-900"
            >
              Use Claude to draft assets from photos and receipts
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Anthropic API key
            <input
              name="apiKey"
              type="password"
              autoComplete="new-password"
              placeholder={
                settings.hasKey ? "Saved — leave blank to keep it" : "sk-ant-…"
              }
              className={inputClass}
            />
            <span className="font-normal text-gray-600">
              Make one at console.anthropic.com → API keys. It's stored
              encrypted and never shown again.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Model
            <select
              name="model"
              defaultValue={settings.model}
              className={inputClass}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {known ? null : (
                <option value={settings.model}>{settings.model}</option>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Description length (characters)
            <input
              name="descriptionLength"
              type="number"
              min={DESCRIPTION_LENGTH.min}
              max={DESCRIPTION_LENGTH.max}
              step={50}
              defaultValue={settings.descriptionLength}
              className={inputClass}
            />
            <span className="font-normal text-gray-600">
              The longest a drafted description may be. About 150 is a single
              short line, 300 is two or three sentences, 600 is a short
              paragraph. Claude is told to keep to it, and anything longer is
              trimmed at the end of a sentence. Between {DESCRIPTION_LENGTH.min}{" "}
              and {DESCRIPTION_LENGTH.max}.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Workspace ID (only if Anthropic asks for it)
            <input
              name="workspaceId"
              defaultValue={settings.workspaceId}
              placeholder="wrkspc_…"
              className={inputClass}
              autoComplete="off"
            />
            <span className="font-normal text-gray-600">
              If the test says the key "is not scoped to a workspace", either
              make a new key inside a workspace (Console → Settings → API keys →
              Create key → choose a workspace) and leave this blank, or enter
              that workspace's ID here.
            </span>
          </label>
          <div className="flex items-start gap-4">
            <Switch
              id="webSearch"
              checked={webSearch}
              onCheckedChange={setWebSearch}
              aria-labelledby="webSearch-label"
              aria-describedby="webSearch-desc"
            />
            <div>
              <label
                id="webSearch-label"
                htmlFor="webSearch"
                className="font-medium text-gray-900"
              >
                Look up prices on the web (photos)
              </label>
              <p id="webSearch-desc" className="text-sm text-gray-600">
                Before drafting a photo, Claude searches UK retailers for what
                the item costs new today, so the estimate is anchored to real
                prices instead of memory. The draft's note says what it was
                based on. It adds a few seconds per photo and costs about a
                penny or two in searches, on top of the usual charge. Anthropic
                requires an admin of your Anthropic organisation to enable web
                search in the Claude Console first; use Test web search below to
                check. If a lookup ever fails, the draft still gets made from
                Claude's own knowledge and says so.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Switch
              id="draftReceipts"
              checked={draftReceipts}
              onCheckedChange={setDraftReceipts}
              aria-labelledby="draftReceipts-label"
            />
            <div>
              <label
                id="draftReceipts-label"
                htmlFor="draftReceipts"
                className="font-medium text-gray-900"
              >
                Turn emailed receipts with no asset ID into drafts
              </label>
              <p className="text-sm text-gray-600">
                A forwarded receipt that names no asset is read by Claude and
                becomes drafts, with the receipt attached when you create them.
                Receipts that name an asset (like SAM-0017) are attached as
                before.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <ResultLine fetcher={save} />
            <Button type="submit" disabled={isFormProcessing(save.state)}>
              Save
            </Button>
          </div>
        </Card>
      </save.Form>

      <Card className="my-0">
        <test.Form method="post" className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="intent" value="test" />
          <Button
            type="submit"
            variant="secondary"
            disabled={!settings.hasKey || isFormProcessing(test.state)}
          >
            Test connection
          </Button>
          <ResultLine fetcher={test} />
        </test.Form>
        <testWeb.Form
          method="post"
          className="mt-3 flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="intent" value="test-web" />
          <Button
            type="submit"
            variant="secondary"
            disabled={!settings.hasKey || isFormProcessing(testWeb.state)}
          >
            Test web search
          </Button>
          <ResultLine fetcher={testWeb} />
        </testWeb.Form>
        <p className="mt-2 text-sm text-gray-600">
          Both tests use the saved settings, so save changes first. Testing web
          search makes one real search.
        </p>
      </Card>
    </div>
  );
}
