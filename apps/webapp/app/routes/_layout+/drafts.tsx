/**
 * Drafts (fork): what Claude read from photos and receipts, waiting for the
 * person to check it. Create makes the asset; nothing is made before that.
 * Part of the AI feature; not in upstream Shelf.
 */
import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  data,
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";
import { z } from "zod";
import { DraftDropzone } from "~/components/drafts/draft-dropzone";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { db } from "~/database/db.server";
import {
  createAssetFromDraft,
  discardDrafts,
  hasPendingDrafts,
  kickDraftProcessing,
  listDrafts,
  retryDraft,
  updateDraft,
} from "~/modules/ai/drafts.server";
import { getAiSettings } from "~/modules/ai/settings.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const handle = { breadcrumb: () => "Drafts" };

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId, currentOrganization } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.create,
    });
    const [settings, drafts, categories, pending] = await Promise.all([
      getAiSettings(organizationId),
      listDrafts(organizationId),
      db.category.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      hasPendingDrafts(organizationId),
    ]);
    // Anything left pending (a restart, a missed kick) is picked up whenever the page is open
    if (pending) kickDraftProcessing();
    return payload({
      header: {
        title: "Drafts",
        subHeading:
          "What Claude read from your photos and receipts, for you to check.",
      },
      settings,
      drafts,
      categories,
      pending,
      currency: currentOrganization.currency,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

const Edit = z.object({
  draftId: z.string().min(1),
  name: z.string().default(""),
  description: z.string().default(""),
  valuation: z.string().default(""),
  categoryId: z.string().default(""),
  purchasedOn: z.string().default(""),
  vendor: z.string().default(""),
});

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.create,
    });
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "");

    if (intent === "save" || intent === "create" || intent === "create-label") {
      const { draftId, ...fields } = parseData(form, Edit);
      await updateDraft(organizationId, draftId, fields);
      if (intent === "save") return payload({ message: "Saved." });
      const made = await createAssetFromDraft({
        organizationId,
        userId,
        draftId,
        printLabel: intent === "create-label",
      });
      return payload({
        created: made.sequentialId ?? "the asset",
        assetId: made.assetId,
        message: `Created ${made.sequentialId ?? "the asset"}.${
          made.warnings.length ? " " + made.warnings.join(" ") : ""
        }`,
      });
    }
    if (intent === "discard") {
      await discardDrafts(organizationId, [
        parseData(form, z.object({ draftId: z.string() })).draftId,
      ]);
      return payload({ message: "Discarded." });
    }
    if (intent === "retry") {
      await retryDraft(
        organizationId,
        parseData(form, z.object({ draftId: z.string() })).draftId
      );
      return payload({ message: "Reading it again…" });
    }
    if (intent === "discard-failed") {
      const failed = (await listDrafts(organizationId))
        .filter((d) => d.status === "failed")
        .map((d) => d.id);
      await discardDrafts(organizationId, failed);
      return payload({ message: `Discarded ${failed.length}.` });
    }
    if (intent === "create-all") {
      const ready = (await listDrafts(organizationId)).filter(
        (d) => d.status === "ready" && d.name.trim()
      );
      let made = 0;
      const problems: string[] = [];
      for (const d of ready) {
        try {
          await createAssetFromDraft({
            organizationId,
            userId,
            draftId: d.id,
            printLabel: false,
          });
          made += 1;
        } catch (cause) {
          problems.push(
            `${d.name}: ${makeShelfError(cause, { userId }).message}`
          );
        }
      }
      return payload({
        message: `Created ${made}.${
          problems.length ? " Not created: " + problems.join("; ") : ""
        }`,
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
  created?: string;
  assetId?: string;
};
const inputClass =
  "w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100";

export default function DraftsPage() {
  const { settings, drafts, categories, pending, currency } =
    useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const bulk = useFetcher<Result>();
  const ready = drafts.filter(
    (d) => d.status === "ready" && d.name.trim()
  ).length;
  const failed = drafts.filter((d) => d.status === "failed").length;
  const aiReady = settings.enabled && settings.hasKey;

  // While Claude is reading, look again every few seconds
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void revalidator.revalidate(), 3000);
    return () => clearInterval(timer);
  }, [pending, revalidator]);

  return (
    <>
      <Header />
      <div className="mt-4 flex flex-col gap-4">
        {!aiReady ? (
          <Card className="my-0">
            <p className="font-medium text-gray-900">AI isn't set up yet.</p>
            <p className="mt-1 text-sm text-gray-600">
              Add your Anthropic API key and switch it on in{" "}
              <Link to="/settings/ai" className="text-primary-500 underline">
                Settings → AI
              </Link>
              , then come back to add photos and receipts.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <DraftDropzone
              source="photo"
              onAdded={() => void revalidator.revalidate()}
            />
            <DraftDropzone
              source="receipt"
              onAdded={() => void revalidator.revalidate()}
            />
          </div>
        )}

        {drafts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-600">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"}
              {pending ? " · Claude is reading…" : ""}
              {failed ? ` · ${failed} couldn't be read` : ""}
            </p>
            <div className="ml-auto flex gap-2">
              {failed > 0 ? (
                <bulk.Form method="post">
                  <input type="hidden" name="intent" value="discard-failed" />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={isFormProcessing(bulk.state)}
                  >
                    Discard the {failed} that failed
                  </Button>
                </bulk.Form>
              ) : null}
              {ready > 0 ? (
                <bulk.Form
                  method="post"
                  onSubmit={(e) => {
                    if (
                      !window.confirm(
                        `Create ${ready} asset${
                          ready === 1 ? "" : "s"
                        } as shown? Check them first.`
                      )
                    )
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="create-all" />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isFormProcessing(bulk.state)}
                  >
                    Create all {ready}
                  </Button>
                </bulk.Form>
              ) : null}
            </div>
          </div>
        ) : aiReady ? (
          <p className="text-sm text-gray-600">
            No drafts. Add some photos or receipts above.
          </p>
        ) : null}
        {bulk.data?.message ? (
          <p
            role={bulk.data.error ? "alert" : "status"}
            className="text-sm text-gray-600"
          >
            {bulk.data.error?.message ?? bulk.data.message}
          </p>
        ) : null}

        {drafts.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            categories={categories}
            currency={currency}
          />
        ))}
      </div>
    </>
  );
}

type DraftView = ReturnType<
  typeof useLoaderData<typeof loader>
>["drafts"][number];

function DraftCard({
  draft,
  categories,
  currency,
}: {
  draft: DraftView;
  categories: { id: string; name: string }[];
  currency: string;
}) {
  const fetcher = useFetcher<Result>();
  const revalidator = useRevalidator();
  const busy = isFormProcessing(fetcher.state);
  const reading = draft.status === "pending" || draft.status === "working";
  const isReceipt = draft.source === "receipt";
  const isPdf = draft.fileType === "application/pdf";
  const symbol =
    new Intl.NumberFormat("en-GB", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error)
      void revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);

  return (
    <Card className="my-0">
      <fetcher.Form
        method="post"
        className="grid gap-4 md:grid-cols-[160px_1fr]"
      >
        <input type="hidden" name="draftId" value={draft.id} />
        <div className="flex flex-col items-center gap-2">
          {draft.hasFile && !isPdf ? (
            <a
              href={`/api/drafts/${draft.id}/image`}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={`/api/drafts/${draft.id}/image`}
                alt={draft.fileName ?? "Photo"}
                className="max-h-40 w-40 rounded border border-gray-200 object-contain"
              />
            </a>
          ) : draft.hasFile ? (
            <a
              href={`/api/drafts/${draft.id}/image`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary-500 underline"
            >
              {draft.fileName ?? "Receipt"} (PDF)
            </a>
          ) : (
            <p className="text-sm text-gray-500">
              {isReceipt ? "Read from the email's text" : "No file"}
            </p>
          )}
          <span className="text-xs text-gray-500">
            {isReceipt ? "From a receipt" : "From a photo"}
          </span>
        </div>

        {reading ? (
          <p className="self-center text-sm text-gray-600">
            Claude is reading this…
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {draft.status === "failed" && draft.error ? (
              <p role="alert" className="text-sm text-error-600">
                {draft.error}
              </p>
            ) : null}
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Name
              <input
                name="name"
                defaultValue={draft.name}
                className={inputClass}
                maxLength={120}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Description
              <textarea
                name="description"
                defaultValue={draft.description}
                rows={7}
                maxLength={1000}
                className={inputClass}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
                <span>
                  {isReceipt ? "Price paid" : "Value"} ({symbol})
                  {draft.valueEstimated ? (
                    <span className="ml-1 rounded bg-warning-50 px-1.5 py-0.5 text-xs font-medium text-warning-700">
                      {isReceipt ? "Estimated" : "Estimated new"}
                    </span>
                  ) : null}
                </span>
                <input
                  name="valuation"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={draft.valuation ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
                Category
                <select
                  name="categoryId"
                  defaultValue={draft.categoryId ?? ""}
                  className={inputClass}
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {isReceipt ? (
                <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
                  Bought on
                  <input
                    name="purchasedOn"
                    type="date"
                    defaultValue={
                      draft.purchasedOn
                        ? String(draft.purchasedOn).slice(0, 10)
                        : ""
                    }
                    className={inputClass}
                  />
                </label>
              ) : (
                <input type="hidden" name="purchasedOn" value="" />
              )}
            </div>
            {isReceipt ? (
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
                Bought from
                <input
                  name="vendor"
                  defaultValue={draft.vendor ?? ""}
                  className={inputClass}
                  maxLength={80}
                />
              </label>
            ) : (
              <input type="hidden" name="vendor" value="" />
            )}
            {draft.notes ? (
              <p className="text-sm text-gray-600">Claude: {draft.notes}</p>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
          {fetcher.data?.message || fetcher.data?.error ? (
            <p
              role={fetcher.data.error ? "alert" : "status"}
              className="mr-auto text-sm text-gray-600"
            >
              {fetcher.data.error?.message ?? fetcher.data.message}{" "}
              {fetcher.data.assetId ? (
                <Link
                  to={`/assets/${fetcher.data.assetId}`}
                  className="text-primary-500 underline"
                >
                  Open it
                </Link>
              ) : null}
            </p>
          ) : null}
          <Button
            type="submit"
            name="intent"
            value="discard"
            variant="secondary"
            size="sm"
            disabled={busy}
            formNoValidate
          >
            Discard
          </Button>
          {draft.status === "failed" && (draft.hasFile || draft.error) ? (
            <Button
              type="submit"
              name="intent"
              value="retry"
              variant="secondary"
              size="sm"
              disabled={busy}
              formNoValidate
            >
              Read again
            </Button>
          ) : null}
          {!reading ? (
            <>
              <Button
                type="submit"
                name="intent"
                value="save"
                variant="secondary"
                size="sm"
                disabled={busy}
              >
                Save changes
              </Button>
              <Button
                type="submit"
                name="intent"
                value="create-label"
                variant="secondary"
                size="sm"
                disabled={busy}
              >
                Create and print label
              </Button>
              <Button
                type="submit"
                name="intent"
                value="create"
                size="sm"
                disabled={busy}
              >
                Create asset
              </Button>
            </>
          ) : null}
        </div>
      </fetcher.Form>
    </Card>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
