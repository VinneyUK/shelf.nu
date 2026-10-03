/**
 * Attachments tab on the asset page: upload, list, open, download and delete
 * receipts, warranties, manuals and so on.
 * Part of the attachments feature; not in upstream Shelf.
 */
import { useCallback, useEffect, useState } from "react";
import type { FileRejection } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import {
  data,
  useFetcher,
  useLoaderData,
  type MetaFunction,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { FileUploadIcon, TrashIcon } from "~/components/icons/library";
import type { HeaderData } from "~/components/layout/header/types";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { DateS } from "~/components/shared/date";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/shared/modal";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_TYPES_DESCRIPTION,
  attachmentTypeLabel,
} from "~/modules/asset-attachment/constants";
import {
  assertAssetInOrganization,
  cleanUpDeletedAssetAttachments,
  deleteAssetAttachment,
  getAssetAttachments,
  getAttachmentMaxBytes,
  uploadAssetAttachments,
} from "~/modules/asset-attachment/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { formatBytes } from "~/utils/format-bytes";
import type { DataOrErrorResponse } from "~/utils/http.server";
import { error, getParams, parseData, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator.client";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const userId = authSession.userId;
  const { assetId } = getParams(params, z.object({ assetId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    await assertAssetInOrganization({ assetId, organizationId });

    // Quietly remove files left behind by assets deleted since last time
    void cleanUpDeletedAssetAttachments(organizationId);

    const attachments = await getAssetAttachments({ assetId, organizationId });
    const header: HeaderData = { title: "Attachments" };
    return payload({ header, attachments, maxBytes: getAttachmentMaxBytes() });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, assetId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request, params }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const userId = authSession.userId;
  const { assetId } = getParams(params, z.object({ assetId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    await assertAssetInOrganization({ assetId, organizationId });

    const isUpload = (request.headers.get("content-type") ?? "").startsWith(
      "multipart/form-data"
    );
    if (isUpload) {
      const saved = await uploadAssetAttachments({
        request,
        assetId,
        organizationId,
        userId,
      });
      return payload({ success: true, uploaded: saved, deleted: null });
    }

    const { attachmentId } = parseData(
      await request.formData(),
      z.object({ intent: z.literal("delete"), attachmentId: z.string().min(1) })
    );
    const deleted = await deleteAssetAttachment({
      attachmentId,
      assetId,
      organizationId,
    });
    return payload({ success: true, uploaded: null, deleted });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, assetId });
    return data(error(reason), { status: reason.status });
  }
}

type Attachment = Awaited<ReturnType<typeof getAssetAttachments>>[number];

export default function AssetAttachments() {
  const { attachments, maxBytes } = useLoaderData<typeof loader>();
  const { roles } = useUserRoleHelper();
  const canEdit = userHasPermission({
    roles,
    entity: PermissionEntity.asset,
    action: PermissionAction.update,
  });

  return (
    <Card className="mt-0">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="text-text-lg font-semibold text-gray-900">
          Attachments
        </h3>
        <p className="text-sm text-gray-600">
          Receipts, warranties, manuals and other files for this asset.
        </p>
      </div>

      {canEdit ? <AttachmentUpload maxBytes={maxBytes} /> : null}

      {attachments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          No attachments yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y border-t">
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment as unknown as Attachment}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AttachmentUpload({ maxBytes }: { maxBytes: number }) {
  const fetcher = useFetcher<DataOrErrorResponse>();
  const isPending = isFormProcessing(fetcher.state);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  // Show what the server said once the upload finishes
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const result = fetcher.data as {
      error?: { message: string };
      uploaded?: string[] | null;
    };
    if (result.error) {
      setMessage({ text: result.error.message, error: true });
    } else if (result.uploaded?.length) {
      setMessage({
        text:
          result.uploaded.length === 1
            ? `Uploaded ${result.uploaded[0]}.`
            : `Uploaded ${result.uploaded.length} files.`,
        error: false,
      });
    }
  }, [fetcher.state, fetcher.data]);

  const onDropAccepted = useCallback(
    (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append("file", file));
      setMessage({
        text:
          files.length === 1
            ? `Uploading ${files[0].name}…`
            : `Uploading ${files.length} files…`,
        error: false,
      });
      void fetcher.submit(formData, {
        method: "post",
        encType: "multipart/form-data",
      });
    },
    [fetcher]
  );

  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      const first = rejections[0];
      const reason =
        first?.errors[0]?.code === "file-too-large"
          ? `is bigger than ${formatBytes(maxBytes, 0)}`
          : first?.errors[0]?.code === "file-invalid-type"
          ? `isn't a ${ATTACHMENT_TYPES_DESCRIPTION} file`
          : "can't be uploaded";
      setMessage({ text: `"${first?.file.name}" ${reason}.`, error: true });
    },
    [maxBytes]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted,
    onDropRejected,
    accept: ATTACHMENT_ACCEPT,
    maxSize: maxBytes,
    multiple: true,
    disabled: isPending,
  });

  return (
    <div className="flex flex-col gap-2">
      <div
        {...getRootProps({
          className: tw(
            "flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-gray-200 p-4 text-center",
            isDragActive && "border-solid border-primary bg-gray-50",
            isPending && "opacity-60"
          ),
        })}
      >
        <input {...getInputProps()} name="file" />
        <FileUploadIcon />
        <p className="text-sm">
          <span className="font-semibold text-primary-700 hover:cursor-pointer hover:text-primary-800">
            Click to upload
          </span>{" "}
          or drag and drop
        </p>
        <p className="text-xs text-gray-500">
          {ATTACHMENT_TYPES_DESCRIPTION}, up to {formatBytes(maxBytes, 0)} each
        </p>
      </div>
      {message ? (
        <p
          role={message.error ? "alert" : "status"}
          className={tw(
            "text-sm",
            message.error ? "text-error-500" : "text-gray-600"
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function AttachmentRow({
  attachment,
  canEdit,
}: {
  attachment: Attachment;
  canEdit: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <div className="min-w-0 flex-1">
        {attachment.openUrl ? (
          <a
            href={attachment.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-medium text-gray-900 hover:text-primary-700 hover:underline"
          >
            {attachment.fileName}
          </a>
        ) : (
          <span className="block truncate font-medium text-gray-900">
            {attachment.fileName}
          </span>
        )}
        <span className="text-xs text-gray-500">
          {attachmentTypeLabel(attachment.contentType)} ·{" "}
          {formatBytes(attachment.size, 1)} · added{" "}
          <DateS date={attachment.createdAt} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        {attachment.downloadUrl ? (
          <Button
            to={attachment.downloadUrl}
            variant="secondary"
            size="sm"
            icon="download"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download
          </Button>
        ) : null}
        {canEdit ? <DeleteAttachment attachment={attachment} /> : null}
      </div>
    </li>
  );
}

function DeleteAttachment({ attachment }: { attachment: Attachment }) {
  const fetcher = useFetcher();
  const isPending = isFormProcessing(fetcher.state);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon="trash"
          disabled={isPending}
          aria-label={`Delete ${attachment.fileName}`}
        >
          <span className="sr-only">Delete</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
            <TrashIcon />
          </span>
          <AlertDialogTitle>Delete attachment</AlertDialogTitle>
          <AlertDialogDescription>
            Delete "{attachment.fileName}"? This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="secondary" disabled={isPending}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="attachmentId" value={attachment.id} />
            <Button type="submit" variant="danger" disabled={isPending}>
              Delete
            </Button>
          </fetcher.Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
