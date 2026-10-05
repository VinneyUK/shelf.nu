/**
 * Add photos or receipts for Claude to read. Uploads in small batches so a big
 * selection shows progress, then the Drafts page fills in as each is read.
 * Part of the AI feature; not in upstream Shelf.
 */
import { useRef, useState } from "react";
import { CameraIcon, ReceiptTextIcon } from "lucide-react";
import { Button } from "~/components/shared/button";
import { shrinkImage } from "./shrink-image";

const BATCH = 4;

type Props = {
  source: "photo" | "receipt";
  onAdded: () => void;
  disabled?: boolean;
};

export function DraftDropzone({ source, onAdded, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const isPhoto = source === "photo";

  const upload = async (picked: File[]) => {
    if (picked.length === 0) return;
    setBusy(true);
    setMessage(null);
    let queued = 0;
    let failed = 0;
    try {
      for (let i = 0; i < picked.length; i += BATCH) {
        const slice = picked.slice(i, i + BATCH);
        setMessage(
          `Uploading ${Math.min(i + BATCH, picked.length)} of ${picked.length}…`
        );
        const files = await Promise.all(
          slice.map((f) => shrinkImage(f, isPhoto ? 1600 : 2200))
        );
        const body = new FormData();
        body.set("source", source);
        files.forEach((f) => body.append("files", f));
        const res = await fetch("/api/drafts/upload", { method: "POST", body });
        const json = (await res.json()) as {
          queued?: number;
          failed?: number;
          error?: { message: string };
        };
        if (!res.ok)
          throw new Error(json.error?.message ?? "The upload failed.");
        queued += json.queued ?? 0;
        failed += json.failed ?? 0;
        onAdded(); // the list fills in as batches land
      }
      setMessage(
        failed
          ? `${queued} queued for Claude, ${failed} couldn't be used (shown below).`
          : `${queued} queued. Claude is reading them now.`
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const Icon = isPhoto ? CameraIcon : ReceiptTextIcon;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && !busy) void upload([...e.dataTransfer.files]);
      }}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${
        over ? "border-primary-400 bg-primary-25" : "border-gray-300"
      }`}
    >
      <Icon className="size-6 text-gray-500" />
      <p className="font-medium text-gray-900">
        {isPhoto ? "Add photos of your things" : "Add receipts"}
      </p>
      <p className="text-sm text-gray-600">
        {isPhoto
          ? "Take photos or choose them from your library. One item per photo works best."
          : "A PDF or a photo of a receipt or invoice. Several items on one receipt become several drafts."}
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept={isPhoto ? "image/*" : "image/*,application/pdf"}
        className="hidden"
        onChange={(e) => void upload([...(e.target.files ?? [])])}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Working…" : isPhoto ? "Choose photos" : "Choose receipts"}
      </Button>
      {message ? (
        <p role="status" className="text-sm text-gray-600">
          {message}
        </p>
      ) : null}
    </div>
  );
}
