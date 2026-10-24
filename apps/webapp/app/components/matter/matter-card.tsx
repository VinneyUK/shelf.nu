/**
 * An asset's Matter device (fork): its setup code, kept encrypted and shown
 * only when you ask; the QR drawn from it to re-pair after a reset; and what
 * the device is. Full width on the asset's page.
 */
import { useEffect, useRef, useState } from "react";
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  PrinterIcon,
  QrCodeIcon,
  ScanLineIcon,
  ShieldCheckIcon,
} from "lucide-react";
import QRCode from "qrcode-generator";
import { useFetcher } from "react-router";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { MATTER_LOGO_PATH, MATTER_LOGO_VIEWBOX } from "~/modules/matter/logo";
import { formatManualCode } from "~/modules/matter/payload";
import { isFormProcessing } from "~/utils/form";

type Matter = {
  hasQr: boolean;
  vendorId: number | null;
  productId: number | null;
  vendorName: string | null;
  productName: string | null;
  transport: string | null;
  firmware: string | null;
  mac: string | null;
  controllers: string[];
  createdAt: string;
} | null;

type Revealed = { manualCode: string; payload: string | null };

/** The Matter logo (the SVG Ant supplied), in the text colour. */
export function MatterMark({
  className = "h-4 w-auto",
}: {
  className?: string;
}) {
  return (
    <svg viewBox={MATTER_LOGO_VIEWBOX} className={className} aria-hidden="true">
      <path d={MATTER_LOGO_PATH} fill="currentColor" />
    </svg>
  );
}

/** A QR drawn as an SVG path from the code's text. */
export function QrSvg({ text, size = 140 }: { text: string; size?: number }) {
  const code = QRCode(0, "M");
  code.addData(text);
  code.make();
  const n = code.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (code.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return (
    <svg
      viewBox={`-2 -2 ${n + 4} ${n + 4}`}
      width={size}
      height={size}
      role="img"
      aria-label="Matter QR code"
      style={{ background: "#ffffff" }}
    >
      <path d={d} fill="#101828" />
    </svg>
  );
}

const hex = (n: number | null) =>
  n === null ? "—" : `0x${n.toString(16).toUpperCase().padStart(4, "0")}`;

export function MatterCard({ assetId }: { assetId: string }) {
  const url = `/api/assets/${assetId}/matter`;
  const info = useFetcher<{ matter: Matter }>();
  const reveal = useFetcher<{ code?: Revealed }>();
  const act = useFetcher<{ ok?: boolean; error?: { message: string } }>();
  const [shown, setShown] = useState(false);
  const [repair, setRepair] = useState(false);
  const [editing, setEditing] = useState(false);

  // what's known, and again after any change
  useEffect(() => {
    if (info.state === "idle" && !info.data) void info.load(url);
  }, [info, url]);
  useEffect(() => {
    if (act.state === "idle" && act.data?.ok) {
      void info.load(url);
      setShown(false);
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.state, act.data]);

  const matter = info.data?.matter ?? null;
  const code = reveal.data?.code;
  const showCode = (then?: () => void) => {
    if (!code)
      void reveal.submit({ intent: "reveal" }, { method: "post", action: url });
    setShown(true);
    then?.();
  };

  if (!info.data) return null;
  if (!matter) return <MatterEmpty url={url} act={act} />;

  const name = [matter.vendorName, matter.productName]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card className="my-3 md:border">
      <div className="flex flex-wrap gap-6">
        {matter.hasQr ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative rounded-lg border border-gray-200 p-2">
              <div
                style={{
                  filter: shown && code?.payload ? "none" : "blur(6px)",
                }}
              >
                <QrSvg
                  text={code?.payload ?? "MT:0000000000000000000"}
                  size={132}
                />
              </div>
              {!(shown && code) ? (
                <button
                  type="button"
                  onClick={() => showCode()}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow">
                    Reveal
                  </span>
                </button>
              ) : null}
            </div>
            <span className="text-xs text-gray-400">
              Scan with your phone to re-pair
            </span>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <MatterMark className="h-4 w-auto text-gray-900" />
            <h3 className="sr-only">Matter</h3>
            {name ? (
              <span className="text-sm text-gray-600">{name}</span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-xs text-success-700">
              <ShieldCheckIcon className="size-3.5" aria-hidden="true" /> Stored
              encrypted
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  showCode(
                    () =>
                      void (
                        code && navigator.clipboard?.writeText(code.manualCode)
                      )
                  )
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <CopyIcon className="size-4" aria-hidden="true" /> Copy code
                </span>
              </Button>
              {matter.hasQr ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => showCode(() => setRepair(true))}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <QrCodeIcon className="size-4" aria-hidden="true" /> Re-pair
                  </span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => (shown ? setShown(false) : showCode())}
              >
                <span className="inline-flex items-center gap-1.5">
                  {shown ? (
                    <EyeOffIcon className="size-4" aria-hidden="true" />
                  ) : (
                    <EyeIcon className="size-4" aria-hidden="true" />
                  )}
                  {shown ? "Hide" : "Reveal"}
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isFormProcessing(act.state)}
                onClick={() =>
                  void act.submit(
                    { intent: "print" },
                    { method: "post", action: url }
                  )
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <PrinterIcon className="size-4" aria-hidden="true" /> Print
                  label
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditing(!editing)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <PencilIcon className="size-4" aria-hidden="true" /> Details
                </span>
              </Button>
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-xs font-medium text-gray-500">
              Setup code
            </span>
            <span className="font-mono text-lg font-semibold tracking-wider text-gray-900">
              {shown && code
                ? formatManualCode(code.manualCode)
                : "••••-•••-••••"}
            </span>
          </div>
          {editing ? (
            <MatterDetailsForm url={url} matter={matter} act={act} />
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Connects over", matter.transport ?? "—"],
                ["Vendor ID", hex(matter.vendorId)],
                ["Product ID", hex(matter.productId)],
                ["Firmware", matter.firmware ?? "—"],
                ["MAC", matter.mac ?? "—"],
                [
                  "Paired with",
                  matter.controllers.length
                    ? matter.controllers.join(", ")
                    : "—",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-medium text-gray-500">{k}</dt>
                  <dd className="text-sm font-semibold text-gray-900">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {repair && code?.payload ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
          onClick={() => setRepair(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label="Re-pair"
            className="flex w-[380px] flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-gray-900">
              <MatterMark className="h-5 w-auto" />
              <span className="text-lg font-semibold">
                {matter.productName ?? "Matter device"}
              </span>
            </div>
            <QrSvg text={code.payload} size={240} />
            <div className="font-mono text-2xl font-bold tracking-wider text-gray-900">
              {formatManualCode(code.manualCode)}
            </div>
            <p className="text-sm text-gray-600">
              Put the device in pairing mode, then in your Home app choose to
              add an accessory and scan this.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRepair(false)}
            >
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** Before it has a code: scan it (a photo of the QR) or type it. */
function MatterEmpty({
  url,
  act,
}: {
  url: string;
  act: ReturnType<
    typeof useFetcher<{ ok?: boolean; error?: { message: string } }>
  >;
}) {
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const save = (code: string) =>
    void act.submit({ intent: "save", code }, { method: "post", action: url });
  const fromPhoto = async (f: File) => {
    setReading(true);
    setProblem(null);
    try {
      const { readBarcodes } = await import("zxing-wasm/reader");
      const found = await readBarcodes(f, {
        formats: ["QRCode"],
        tryHarder: true,
      });
      const mt = found.map((r) => r.text).find((x) => /^MT:/i.test(x));
      if (mt) save(mt);
      else
        setProblem(
          "No Matter QR code found in that picture. Try closer, or type the 11 digits."
        );
    } catch {
      setProblem("Couldn't read that picture. Type the 11 digits instead.");
    } finally {
      setReading(false);
    }
  };
  return (
    <Card className="my-3 md:border">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MatterMark className="h-4 w-auto text-gray-900" />
          <h3 className="sr-only">Matter</h3>
        </div>
        <p className="text-sm text-gray-600">
          Keep this device's setup code safe: you'll need it to pair it again
          after a reset.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={file}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void fromPhoto(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            onClick={() => file.current?.click()}
            disabled={reading || isFormProcessing(act.state)}
          >
            <span className="inline-flex items-center gap-1.5">
              <ScanLineIcon className="size-4" aria-hidden="true" />{" "}
              {reading ? "Reading…" : "Scan the QR"}
            </span>
          </Button>
          <span className="text-sm text-gray-400">or</span>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) save(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="The 11 digits, or the MT:… text"
              className="h-10 w-72 rounded-lg border border-gray-300 px-3 font-mono text-sm"
              aria-label="Matter setup code"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={!text.trim() || isFormProcessing(act.state)}
            >
              Save
            </Button>
          </form>
        </div>
        {problem || act.data?.error ? (
          <p className="text-sm text-error-600">
            {problem ?? act.data?.error?.message}
          </p>
        ) : null}
        <p className="text-xs text-gray-400">
          On a phone, Scan opens the camera; on a computer, choose a photo of
          the label.
        </p>
      </div>
    </Card>
  );
}

/** How it connects, its firmware and MAC, and what it's paired with. */
function MatterDetailsForm({
  url,
  matter,
  act,
}: {
  url: string;
  matter: NonNullable<Matter>;
  act: ReturnType<typeof useFetcher<{ ok?: boolean }>>;
}) {
  const input = "h-9 rounded-lg border border-gray-300 px-2.5 text-sm";
  const [controllers, setControllers] = useState(matter.controllers.join(", "));
  return (
    <act.Form
      method="post"
      action={url}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="intent" value="details" />
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Connects over
        <select
          name="transport"
          defaultValue={matter.transport ?? ""}
          className={input}
        >
          <option value="">—</option>
          <option>Thread</option>
          <option>Wi-Fi</option>
          <option>Ethernet</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Firmware
        <input
          name="firmware"
          defaultValue={matter.firmware ?? ""}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        MAC
        <input
          name="mac"
          defaultValue={matter.mac ?? ""}
          className={`${input} font-mono`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Paired with (commas between)
        <input
          value={controllers}
          onChange={(e) => setControllers(e.target.value)}
          placeholder="Apple Home, Home Assistant"
          className={`${input} w-64`}
        />
      </label>
      {controllers
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => (
          <input key={c} type="hidden" name="controllers" value={c} />
        ))}
      <Button type="submit" size="sm" disabled={isFormProcessing(act.state)}>
        Save
      </Button>
      <button
        type="submit"
        name="intent"
        value="remove"
        className="text-sm font-semibold text-error-600 hover:text-error-700"
        onClick={(e) => {
          if (!window.confirm("Forget this device's Matter code?"))
            e.preventDefault();
        }}
      >
        Remove code
      </button>
    </act.Form>
  );
}
