/**
 * The main image of an asset or a box (fork): click to choose or drag a
 * picture in, as with attachments. A big photo is shrunk in the browser first
 * (longest side 2560 px), so there's no size to worry about.
 *
 * The picked file goes into an ordinary named file input, so the form submits
 * it exactly as before, and Shelf's own check of the file still runs.
 */
import { useCallback, useRef, useState, type ChangeEvent } from "react";
import type { FileRejection } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import { FileUploadIcon } from "~/components/icons/library";
import { ACCEPT_SUPPORTED_IMAGES } from "~/utils/constants";
import { shrinkImage } from "~/utils/shrink-image";
import { tw } from "~/utils/tw";

const ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function MainImageDropzone({
  name,
  disabled,
  error,
  onValidate,
}: {
  /** The form field the picture is submitted as ("mainImage", "image") */
  name: string;
  disabled?: boolean;
  /** A message to show under it (the server's, or Shelf's file check) */
  error?: string;
  /** Shelf's own file check, run on the input once the picture is in it */
  onValidate: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<{
    name: string;
    from: number;
    to: number;
  } | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  const onFiles = useCallback(
    async (files: File[]) => {
      const original = files[0];
      if (!original || !input.current) return;
      setRejected(null);
      setBusy(true);
      const file = await shrinkImage(original);
      setBusy(false);
      const box = new DataTransfer();
      box.items.add(file);
      input.current.files = box.files;
      onValidate({
        target: input.current,
        currentTarget: input.current,
      } as ChangeEvent<HTMLInputElement>);
      setChosen({ name: file.name, from: original.size, to: file.size });
    },
    [onValidate]
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const first = rejections[0];
    setRejected(`"${first?.file.name}" isn't a PNG, JPG or WebP picture.`);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted: (files) => void onFiles(files),
    onDropRejected,
    accept: ACCEPT,
    multiple: false,
    disabled: disabled || busy,
  });

  const message = rejected ?? error;
  return (
    <div className="mt-2">
      <div
        {...getRootProps({
          className: tw(
            "flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-gray-200 p-4 text-center",
            isDragActive && "border-solid border-primary bg-gray-50",
            (disabled || busy) && "opacity-60"
          ),
        })}
      >
        <input {...getInputProps()} aria-label="Choose a picture" />
        <FileUploadIcon />
        <p className="text-sm">
          <span className="font-semibold text-primary-700 hover:cursor-pointer hover:text-primary-800">
            Click to upload
          </span>{" "}
          or drag and drop
        </p>
        <p className="text-xs text-gray-500">
          PNG, JPG or WebP, any size: big photos are shrunk before upload
        </p>
        {busy ? (
          <p className="text-xs text-gray-600">Shrinking the picture…</p>
        ) : chosen ? (
          <p className="text-xs text-gray-700">
            {chosen.name}
            {chosen.to < chosen.from
              ? ` (shrunk from ${mb(chosen.from)} to ${mb(chosen.to)})`
              : ` (${mb(chosen.to)})`}
          </p>
        ) : null}
      </div>
      {/* what the form submits */}
      <input
        ref={input}
        type="file"
        name={name}
        accept={ACCEPT_SUPPORTED_IMAGES}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      {message ? (
        <p className="mt-1 text-sm text-error-500">{message}</p>
      ) : null}
    </div>
  );
}
