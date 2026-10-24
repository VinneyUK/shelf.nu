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
  PlusIcon,
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

type Device = {
  id: string;
  number: number;
  hasQr: boolean;
  vendorId: number | null;
  productId: number | null;
  vendorName: string | null;
  productName: string | null;
  place: string | null;
  transport: string | null;
  firmware: string | null;
  mac: string | null;
  controllers: string[];
  labelPrintedAt: string | null;
};
type Revealed = { manualCode: string; payload: string | null };
type Act = { ok?: boolean; error?: { message: string } };

/**
 * An IoT asset's Matter devices (fork): each device's code, kept encrypted
 * and shown when you ask; its QR to re-pair after a reset; its details; and
 * its Matter label. As a table or as cards, chosen in Settings → Customise.
 */
export function MatterCard({ assetId }: { assetId: string }) {
  const url = `/api/assets/${assetId}/matter`;
  const info = useFetcher<{ devices: Device[]; layout: "table" | "cards" }>();
  const act = useFetcher<Act>();
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (info.state === "idle" && !info.data) void info.load(url);
  }, [info, url]);
  useEffect(() => {
    if (act.state === "idle" && act.data?.ok) {
      void info.load(url);
      setAdding(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.state, act.data]);
  if (!info.data) return null;
  const { devices, layout } = info.data;
  const first = devices[0];
  const maker = first
    ? [first.vendorName, first.productName].filter(Boolean).join(" · ")
    : "";
  const missing = devices.filter((d) => !d.labelPrintedAt).length;
  const print = (which: "all" | "missing") =>
    void act.submit(
      { intent: "print", which },
      { method: "post", action: url }
    );
  return (
    <Card className="my-3 p-0 md:border">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-5 py-3.5">
        <h3 className="sr-only">Matter</h3>
        <MatterMark className="h-4 w-auto text-gray-900" />
        {maker ? <span className="text-sm text-gray-600">{maker}</span> : null}
        {devices.length ? (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {devices.length} {devices.length === 1 ? "device" : "devices"}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 text-xs text-success-700">
          <ShieldCheckIcon className="size-3.5" aria-hidden="true" /> Stored
          encrypted
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {devices.length ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isFormProcessing(act.state)}
              onClick={() =>
                print(missing && missing < devices.length ? "missing" : "all")
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <PrinterIcon className="size-4" aria-hidden="true" />
                {missing && missing < devices.length
                  ? `Print the ${missing} missing ${
                      missing === 1 ? "label" : "labels"
                    }`
                  : devices.length === 1
                  ? "Print label"
                  : "Print all labels"}
              </span>
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={() => setAdding(!adding)}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="size-4" aria-hidden="true" /> Add device
            </span>
          </Button>
        </span>
      </div>
      {adding || devices.length === 0 ? (
        <AddDevice url={url} act={act} first={devices.length === 0} />
      ) : null}
      {devices.length === 0 ? null : layout === "cards" ? (
        <div className="flex flex-col gap-3 p-4">
          {devices.map((d) => (
            <DeviceCard key={d.id} d={d} url={url} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-25">
              <tr>
                {[
                  "#",
                  "Setup code",
                  "Where",
                  "Connects",
                  "Paired with",
                  "Label",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-2 text-left text-xs font-medium text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {devices.map((d) => (
                <DeviceRow key={d.id} d={d} url={url} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Reveal, copy, re-pair, print and edit, for one device. */
function useDevice(d: Device, url: string) {
  const reveal = useFetcher<{ id?: string; code?: Revealed }>();
  const act = useFetcher<Act>();
  const [shown, setShown] = useState(false);
  const [repair, setRepair] = useState(false);
  const [editing, setEditing] = useState(false);
  const code = reveal.data?.code;
  const ask = (then?: () => void) => {
    if (!code)
      void reveal.submit(
        { intent: "reveal", id: d.id },
        { method: "post", action: url }
      );
    setShown(true);
    then?.();
  };
  return {
    reveal,
    act,
    shown,
    setShown,
    repair,
    setRepair,
    editing,
    setEditing,
    code,
    ask,
  };
}

function DeviceButtons({
  d,
  url,
  s,
}: {
  d: Device;
  url: string;
  s: ReturnType<typeof useDevice>;
}) {
  const icon = (label: string, Icon: typeof EyeIcon, onClick: () => void) => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="p-2"
      aria-label={label}
      tooltip={label}
      onClick={onClick}
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
  return (
    <span className="inline-flex gap-1.5">
      {icon(s.shown ? "Hide" : "Reveal", s.shown ? EyeOffIcon : EyeIcon, () =>
        s.shown ? s.setShown(false) : s.ask()
      )}
      {icon("Copy code", CopyIcon, () =>
        s.ask(
          () =>
            void (s.code && navigator.clipboard?.writeText(s.code.manualCode))
        )
      )}
      {d.hasQr
        ? icon("Re-pair", QrCodeIcon, () => s.ask(() => s.setRepair(true)))
        : null}
      {icon(
        "Print its label",
        PrinterIcon,
        () =>
          void s.act.submit(
            { intent: "print", id: d.id },
            { method: "post", action: url }
          )
      )}
      {icon("Details", PencilIcon, () => s.setEditing(!s.editing))}
    </span>
  );
}

const printedBadge = (d: Device) =>
  d.labelPrintedAt ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
      Label printed
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
      No label yet
    </span>
  );

const codeText = (s: ReturnType<typeof useDevice>) =>
  s.shown && s.code ? formatManualCode(s.code.manualCode) : "••••-•••-••••";

function DeviceRow({ d, url }: { d: Device; url: string }) {
  const s = useDevice(d, url);
  const cell = "px-5 py-2.5 align-middle text-sm";
  return (
    <>
      <tr>
        <td className={`${cell} text-gray-400`}>{d.number}</td>
        <td
          className={`${cell} font-mono font-semibold tracking-wide text-gray-900`}
        >
          {codeText(s)}
        </td>
        <td className={`${cell} text-gray-900`}>{d.place ?? "—"}</td>
        <td className={`${cell} text-gray-600`}>{d.transport ?? "—"}</td>
        <td className={`${cell} text-gray-600`}>
          {d.controllers.join(", ") || "—"}
        </td>
        <td className={cell}>{printedBadge(d)}</td>
        <td className={`${cell} text-right`}>
          <DeviceButtons d={d} url={url} s={s} />
        </td>
      </tr>
      {s.editing ? (
        <tr>
          <td colSpan={7} className="bg-gray-25 px-5 py-3">
            <DetailsForm d={d} url={url} act={s.act} />
          </td>
        </tr>
      ) : null}
      {s.repair && s.code?.payload ? (
        <Repair d={d} code={s.code} onClose={() => s.setRepair(false)} />
      ) : null}
    </>
  );
}

function DeviceCard({ d, url }: { d: Device; url: string }) {
  const s = useDevice(d, url);
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-4">
        {d.hasQr ? (
          <div
            className="rounded-md border border-gray-200 p-1"
            style={{
              filter: s.shown && s.code?.payload ? "none" : "blur(4px)",
            }}
          >
            <QrSvg
              text={s.code?.payload ?? "MT:0000000000000000000"}
              size={56}
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              Device {d.number}
            </span>
            {d.place ? (
              <span className="text-sm text-gray-600">{d.place}</span>
            ) : null}
            {printedBadge(d)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <span className="font-mono text-sm font-semibold tracking-wide text-gray-900">
              {codeText(s)}
            </span>
            {d.transport ? <span>{d.transport}</span> : null}
            {d.controllers.length ? (
              <span>{d.controllers.join(", ")}</span>
            ) : null}
            <span className="text-gray-400">
              {hex(d.vendorId)} / {hex(d.productId)}
            </span>
          </div>
        </div>
        <DeviceButtons d={d} url={url} s={s} />
      </div>
      {s.editing ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <DetailsForm d={d} url={url} act={s.act} />
        </div>
      ) : null}
      {s.repair && s.code?.payload ? (
        <Repair d={d} code={s.code} onClose={() => s.setRepair(false)} />
      ) : null}
    </div>
  );
}

/** The QR large, with the code under it, to scan from a Home app after a reset. */
function Repair({
  d,
  code,
  onClose,
}: {
  d: Device;
  code: Revealed;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="Re-pair"
        className="flex w-[380px] flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <MatterMark className="h-5 w-auto text-gray-900" />
        <div className="text-lg font-semibold text-gray-900">
          {d.place ?? `Device ${d.number}`}
        </div>
        <QrSvg text={code.payload ?? ""} size={240} />
        <div className="font-mono text-2xl font-bold tracking-wider text-gray-900">
          {formatManualCode(code.manualCode)}
        </div>
        <p className="text-sm text-gray-600">
          Put the device in pairing mode, then in your Home app choose to add an
          accessory and scan this.
        </p>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** Add a device: scan its QR (a photo of the label) or type its code. */
function AddDevice({
  url,
  act,
  first,
}: {
  url: string;
  act: ReturnType<typeof useFetcher<Act>>;
  first: boolean;
}) {
  const [text, setText] = useState("");
  const [place, setPlace] = useState("");
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const save = (code: string) =>
    void act.submit(
      { intent: "add", code, place },
      { method: "post", action: url }
    );
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
    <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4">
      {first ? (
        <p className="text-sm text-gray-600">
          Keep each device's setup code safe: you'll need it to pair it again
          after a reset. Each device you add counts towards the quantity.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Where it is (optional): Kitchen · kettle"
          className="h-10 w-64 rounded-lg border border-gray-300 px-3 text-sm"
          aria-label="Where it is"
        />
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
            className="h-10 w-64 rounded-lg border border-gray-300 px-3 font-mono text-sm"
            aria-label="Matter setup code"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!text.trim() || isFormProcessing(act.state)}
          >
            Add
          </Button>
        </form>
      </div>
      {problem || act.data?.error ? (
        <p className="text-sm text-error-600">
          {problem ?? act.data?.error?.message}
        </p>
      ) : null}
    </div>
  );
}

/** Where it is, how it connects, its firmware and MAC, and what it's paired with. */
function DetailsForm({
  d,
  url,
  act,
}: {
  d: Device;
  url: string;
  act: ReturnType<typeof useFetcher<Act>>;
}) {
  const input = "h-9 rounded-lg border border-gray-300 px-2.5 text-sm";
  const [controllers, setControllers] = useState(d.controllers.join(", "));
  return (
    <act.Form
      method="post"
      action={url}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="intent" value="details" />
      <input type="hidden" name="id" value={d.id} />
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Where it is
        <input name="place" defaultValue={d.place ?? ""} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Connects over
        <select
          name="transport"
          defaultValue={d.transport ?? ""}
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
          defaultValue={d.firmware ?? ""}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        MAC
        <input
          name="mac"
          defaultValue={d.mac ?? ""}
          className={`${input} font-mono`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        Paired with (commas between)
        <input
          value={controllers}
          onChange={(e) => setControllers(e.target.value)}
          placeholder="Apple Home, Home Assistant"
          className={`${input} w-56`}
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
          if (
            !window.confirm(
              "Forget this device's Matter code? The quantity goes down by one."
            )
          )
            e.preventDefault();
        }}
      >
        Remove device
      </button>
    </act.Form>
  );
}
