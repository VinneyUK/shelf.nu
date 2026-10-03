/**
 * Workspace settings → Email receipts: the mailbox Shelf checks for forwarded
 * receipts, the Unmatched list, and a log. Part of the email receipts feature;
 * not in upstream Shelf.
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
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import { attachmentTypeLabel } from "~/modules/asset-attachment/constants";
import { parseAllowedSenders } from "~/modules/email-receipts/match";
import {
  assignEmailReceipt,
  checkMailbox,
  discardEmailReceipt,
  getEmailReceipts,
  getEmailReceiptSettings,
  saveEmailReceiptSettings,
  testEmailConnection,
} from "~/modules/email-receipts/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { formatBytes } from "~/utils/format-bytes";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction = () => [
  { title: appendToMetaTitle("Email receipts") },
];
export const handle = { breadcrumb: () => "Email receipts" };

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
    const [settings, receipts] = await Promise.all([
      getEmailReceiptSettings(organizationId),
      getEmailReceipts(organizationId),
    ]);
    return payload({ settings, ...receipts });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

const SaveSchema = z.object({
  intent: z.literal("save"),
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
  username: z.string().trim().max(200),
  password: z.string().default(""),
  allowedSenders: z.string().default(""),
  host: z.string().trim().min(1, "Enter the mail server.").max(200),
  port: z.coerce.number().int().min(1).max(65535),
  mailbox: z.string().trim().max(100).default("INBOX"),
  processedFolder: z.string().trim().max(100).default("Shelf"),
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
    const intent = String(formData.get("intent") ?? "");

    if (intent === "save") {
      const {
        intent: _intent,
        allowedSenders,
        ...rest
      } = parseData(formData, SaveSchema);
      await saveEmailReceiptSettings(organizationId, {
        ...rest,
        allowedSenders: parseAllowedSenders(allowedSenders),
      });
      return payload({ success: true, message: "Saved." });
    }
    if (intent === "test") {
      const waiting = await testEmailConnection(organizationId);
      return payload({
        success: true,
        message: `Connected. ${waiting} email${
          waiting === 1 ? "" : "s"
        } waiting in the mailbox.`,
      });
    }
    if (intent === "check") {
      const { handled } = await checkMailbox(organizationId);
      return payload({
        success: true,
        message: handled
          ? `Handled ${handled} email${handled === 1 ? "" : "s"}.`
          : "No new email.",
      });
    }
    if (intent === "assign") {
      const { receiptId, assetCode } = parseData(
        formData,
        z.object({ receiptId: z.string().min(1), assetCode: z.string() })
      );
      const code = await assignEmailReceipt(
        organizationId,
        receiptId,
        assetCode
      );
      return payload({
        success: true,
        message: code ? `Attached to ${code}.` : "Already dealt with.",
      });
    }
    if (intent === "discard") {
      const { receiptId } = parseData(
        formData,
        z.object({ receiptId: z.string().min(1) })
      );
      await discardEmailReceipt(organizationId, receiptId);
      return payload({ success: true, message: "Discarded." });
    }
    return payload({ success: false, message: "Unknown action." });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

type Result = { error?: { message: string } | null; message?: string };

function ResultLine({
  fetcher,
}: {
  fetcher: { state: string; data?: Result };
}) {
  if (isFormProcessing(fetcher.state as never))
    return <p className="text-sm text-gray-600">Working…</p>;
  if (fetcher.state !== "idle" || !fetcher.data) return null;
  return fetcher.data.error ? (
    <p role="alert" className="text-sm text-error-600">
      {fetcher.data.error.message}
    </p>
  ) : (
    <p role="status" className="text-sm text-gray-600">
      {fetcher.data.message}
    </p>
  );
}

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100";

const STATUS_TEXT: Record<string, string> = {
  attached: "Attached",
  ignored: "Ignored",
  discarded: "Discarded",
};

export default function EmailReceiptsSettings() {
  const { settings, unmatched, recent } = useLoaderData<typeof loader>();
  const save = useFetcher<Result>();
  const tools = useFetcher<Result>();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [showAdvanced, setShowAdvanced] = useState(
    settings.host !== "imap.gmail.com" || settings.port !== 993
  );
  useEffect(() => setEnabled(settings.enabled), [settings.enabled]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="my-0">
        <h3 className="text-text-lg font-semibold text-gray-900">
          Email receipts
        </h3>
        <p className="text-sm text-gray-600">
          Forward a receipt to the mailbox below with an asset ID in the subject
          — like <strong>Fwd: Your order SAM-0017</strong> — and Shelf attaches
          the email and its PDFs and photos to that asset within a minute.
          Emails without a known ID wait under Unmatched.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          {settings.lastCheckedAt ? (
            <>
              Last checked <DateS date={settings.lastCheckedAt} includeTime />.{" "}
            </>
          ) : (
            "Not checked yet. "
          )}
          {settings.lastError ? (
            <span className="text-error-600">{settings.lastError}</span>
          ) : null}
        </p>
      </Card>

      <save.Form method="post">
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="enabled" value={String(enabled)} />
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
              Check this mailbox every minute
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Mailbox address
            <input
              name="username"
              type="email"
              defaultValue={settings.username}
              placeholder="you.receipts@gmail.com"
              className={inputClass}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            App password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder={
                settings.hasPassword
                  ? "Saved — leave blank to keep it"
                  : "The 16-character app password"
              }
              className={inputClass}
            />
            <span className="font-normal text-gray-600">
              For Gmail: myaccount.google.com/apppasswords, with 2-Step
              Verification on. Not your normal password.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
            Allowed senders
            <textarea
              name="allowedSenders"
              rows={3}
              defaultValue={settings.allowedSenders.join("\n")}
              placeholder={"you@example.com\nyou@icloud.com"}
              className={inputClass}
            />
            <span className="font-normal text-gray-600">
              The addresses you'll forward from, one per line. Email from anyone
              else is ignored.
            </span>
          </label>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="self-start text-sm font-semibold text-primary-700"
          >
            {showAdvanced ? "Hide" : "Show"} server settings
          </button>
          <div
            className={showAdvanced ? "grid gap-4 sm:grid-cols-2" : "hidden"}
          >
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              IMAP server
              <input
                name="host"
                defaultValue={settings.host}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Port
              <input
                name="port"
                type="number"
                defaultValue={settings.port}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Check folder
              <input
                name="mailbox"
                defaultValue={settings.mailbox}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Move handled emails to
              <input
                name="processedFolder"
                defaultValue={settings.processedFolder}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <ResultLine fetcher={save} />
            <Button type="submit" disabled={isFormProcessing(save.state)}>
              Save
            </Button>
          </div>
        </Card>
      </save.Form>

      <Card className="my-0">
        <div className="flex flex-wrap items-center gap-3">
          <tools.Form method="post">
            <input type="hidden" name="intent" value="test" />
            <Button
              type="submit"
              variant="secondary"
              disabled={isFormProcessing(tools.state) || !settings.hasPassword}
            >
              Test connection
            </Button>
          </tools.Form>
          <tools.Form method="post">
            <input type="hidden" name="intent" value="check" />
            <Button
              type="submit"
              variant="secondary"
              disabled={isFormProcessing(tools.state) || !settings.hasPassword}
            >
              Check now
            </Button>
          </tools.Form>
          <ResultLine fetcher={tools} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Both use the saved settings, so save changes first.
        </p>
      </Card>

      <Card className="my-0">
        <h3 className="mb-2 text-text-md font-semibold text-gray-900">
          Unmatched{unmatched.length ? ` (${unmatched.length})` : ""}
        </h3>
        {unmatched.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing waiting.</p>
        ) : (
          <ul className="divide-y">
            {unmatched.map((receipt) => (
              <UnmatchedRow key={receipt.id} receipt={receipt} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="my-0">
        <h3 className="mb-2 text-text-md font-semibold text-gray-900">
          Recent
        </h3>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">No emails yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500">
                <tr className="border-b">
                  <th className="py-2 pr-4 font-medium">Received</th>
                  <th className="py-2 pr-4 font-medium">From</th>
                  <th className="py-2 pr-4 font-medium">Subject</th>
                  <th className="py-2 font-medium">What happened</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap py-2 pr-4 text-gray-600">
                      <DateS date={r.receivedAt ?? r.createdAt} includeTime />
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{r.fromAddress}</td>
                    <td className="py-2 pr-4 text-gray-900">{r.subject}</td>
                    <td className="py-2 text-gray-600">
                      {STATUS_TEXT[r.status] ?? r.status}
                      {r.attachedTo.length
                        ? ` to ${r.attachedTo.join(", ")}`
                        : ""}
                      {r.reason ? (
                        <span className="block text-xs text-gray-500">
                          {r.reason}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function UnmatchedRow({
  receipt,
}: {
  receipt: {
    id: string;
    fromAddress: string;
    subject: string;
    receivedAt: string | Date | null;
    createdAt: string | Date;
    reason: string | null;
    files: {
      id: string;
      fileName: string;
      contentType: string;
      size: number;
      openUrl: string | null;
    }[];
  };
}) {
  const fetcher = useFetcher<Result>();
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="text-sm">
        <p className="font-medium text-gray-900">
          {receipt.subject || "(no subject)"}
        </p>
        <p className="text-gray-500">
          From {receipt.fromAddress},{" "}
          <DateS date={receipt.receivedAt ?? receipt.createdAt} includeTime />
          {receipt.reason ? ` — ${receipt.reason}` : ""}
        </p>
      </div>
      {receipt.files.length ? (
        <ul className="flex flex-wrap gap-2">
          {receipt.files.map((file) => (
            <li key={file.id}>
              <a
                href={file.openUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                {file.fileName}
                <span className="text-gray-400">
                  {attachmentTypeLabel(file.contentType)} ·{" "}
                  {formatBytes(file.size, 0)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <fetcher.Form method="post" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="assign" />
          <input type="hidden" name="receiptId" value={receipt.id} />
          <input
            name="assetCode"
            placeholder="Asset ID, e.g. SAM-0017"
            aria-label="Asset ID"
            className={`${inputClass} w-48`}
            required
          />
          <Button
            type="submit"
            size="sm"
            disabled={isFormProcessing(fetcher.state)}
          >
            Attach
          </Button>
        </fetcher.Form>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="discard" />
          <input type="hidden" name="receiptId" value={receipt.id} />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={isFormProcessing(fetcher.state)}
          >
            Discard
          </Button>
        </fetcher.Form>
        <ResultLine fetcher={fetcher} />
      </div>
    </li>
  );
}
