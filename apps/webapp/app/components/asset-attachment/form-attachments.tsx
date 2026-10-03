/**
 * Attachments section in the add/edit asset form.
 * Part of the attachments feature; not in upstream Shelf.
 *
 * Files upload straight away to a holding area (STAGE_ATTACHMENTS_URL), and
 * the form carries their ids in hidden fields. Saving the form claims them for
 * the asset. Uploading separately keeps big files out of Shelf's own form
 * handling, which only allows image-sized files.
 */
import { useCallback, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import FormRow from "~/components/forms/form-row";
import { Button } from "~/components/shared/button";
import {
  DEFAULT_ATTACHMENT_MAX_SIZE_MB,
  STAGE_ATTACHMENTS_URL,
  STAGED_ATTACHMENTS_FIELD,
  attachmentTypeLabel,
} from "~/modules/asset-attachment/constants";
import { isFormProcessing } from "~/utils/form";
import { formatBytes } from "~/utils/format-bytes";
import { tw } from "~/utils/tw";
import { AttachmentDropzone } from "./attachment-dropzone";

type Staged = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
};
type StageResponse = {
  error?: { message: string } | null;
  staged?: Staged[] | null;
  maxBytes?: number;
};

export function FormAttachments({ editing }: { editing: boolean }) {
  const action = `${STAGE_ATTACHMENTS_URL}${editing ? "?mode=edit" : ""}`;

  // Ask the server for the current size limit once
  const limits = useFetcher<StageResponse>();
  useEffect(() => {
    if (limits.state === "idle" && !limits.data) void limits.load(action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const maxBytes =
    limits.data?.maxBytes ?? DEFAULT_ATTACHMENT_MAX_SIZE_MB * 1024 * 1024;

  const upload = useFetcher<StageResponse>();
  const remove = useFetcher();
  const isUploading = isFormProcessing(upload.state);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (upload.state !== "idle" || !upload.data) return;
    if (upload.data.error) {
      setMessage({ text: upload.data.error.message, error: true });
    } else if (upload.data.staged?.length) {
      const added = upload.data.staged;
      setStaged((prev) => [
        ...prev,
        ...added.filter((file) => !prev.some((p) => p.id === file.id)),
      ]);
      setMessage(null);
    }
  }, [upload.state, upload.data]);

  const onFiles = useCallback(
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
      void upload.submit(formData, {
        method: "post",
        action,
        encType: "multipart/form-data",
      });
    },
    [upload, action]
  );

  const removeStaged = (id: string) => {
    setStaged((prev) => prev.filter((file) => file.id !== id));
    void remove.submit(
      { intent: "delete", attachmentId: id },
      { method: "post", action }
    );
  };

  return (
    <FormRow
      rowLabel="Attachments"
      subHeading={
        editing
          ? "Receipts, warranties, manuals. New files are added when you save; existing ones are on the asset's Attachments tab."
          : "Receipts, warranties, manuals. Files are added to the asset when you save it."
      }
      className="pt-[10px]"
    >
      <div className="flex w-full flex-col gap-2">
        {staged.map((file) => (
          <input
            key={file.id}
            type="hidden"
            name={STAGED_ATTACHMENTS_FIELD}
            value={file.id}
          />
        ))}
        <AttachmentDropzone
          maxBytes={maxBytes}
          disabled={isUploading}
          onFiles={onFiles}
          onReject={(text) => setMessage({ text, error: true })}
        />
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
        {staged.length > 0 ? (
          <ul className="divide-y rounded border">
            {staged.map((file) => (
              <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {file.fileName}
                  </span>
                  <span className="text-xs text-gray-500">
                    {attachmentTypeLabel(file.contentType)} ·{" "}
                    {formatBytes(file.size, 1)} · added when you save
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon="trash"
                  onClick={() => removeStaged(file.id)}
                  aria-label={`Remove ${file.fileName}`}
                >
                  <span className="sr-only">Remove</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FormRow>
  );
}
