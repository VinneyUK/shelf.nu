/**
 * Drop zone for attachments, shared by the Attachments tab and the asset form.
 * Part of the attachments feature; not in upstream Shelf.
 *
 * The file input has no name on purpose: inside the asset form it must not be
 * submitted with the form, because files go up through their own request.
 */
import { useCallback } from "react";
import type { FileRejection } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import { FileUploadIcon } from "~/components/icons/library";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_TYPES_DESCRIPTION,
} from "~/modules/asset-attachment/constants";
import { tw } from "~/utils/tw";

/** The limit is set in MB (of 1,048,576 bytes), so show it that way: 100 MB, not 105. */
function formatLimit(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function AttachmentDropzone({
  maxBytes,
  disabled,
  onFiles,
  onReject,
}: {
  maxBytes: number;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onReject: (message: string) => void;
}) {
  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      const first = rejections[0];
      const code = first?.errors[0]?.code;
      const reason =
        code === "file-too-large"
          ? `is bigger than ${formatLimit(maxBytes)}`
          : code === "file-invalid-type"
          ? `isn't a ${ATTACHMENT_TYPES_DESCRIPTION} file`
          : "can't be uploaded";
      onReject(`"${first?.file.name}" ${reason}.`);
    },
    [maxBytes, onReject]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted: onFiles,
    onDropRejected,
    accept: ATTACHMENT_ACCEPT,
    maxSize: maxBytes,
    multiple: true,
    disabled,
  });

  return (
    <div
      {...getRootProps({
        className: tw(
          "flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-gray-200 p-4 text-center",
          isDragActive && "border-solid border-primary bg-gray-50",
          disabled && "opacity-60"
        ),
      })}
    >
      <input {...getInputProps()} />
      <FileUploadIcon />
      <p className="text-sm">
        <span className="font-semibold text-primary-700 hover:cursor-pointer hover:text-primary-800">
          Click to upload
        </span>{" "}
        or drag and drop
      </p>
      <p className="text-xs text-gray-500">
        {ATTACHMENT_TYPES_DESCRIPTION}, up to {formatLimit(maxBytes)} each
      </p>
    </div>
  );
}
