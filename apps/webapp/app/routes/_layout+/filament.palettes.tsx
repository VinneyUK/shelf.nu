/**
 * Filament › Palettes (fork): colour palettes from the filament you have.
 * Generate (with harmony rules, locks and the space bar), Describe it (AI),
 * From a photo, Trending (a starter set matched to your stock), Saved, and
 * What to buy next. The same filters everywhere: how many colours, open /
 * sealed / both, line, finish, and a nudge towards what's in the AMS.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkIcon,
  CheckIcon,
  CircleDashedIcon,
  CpuIcon,
  ExternalLinkIcon,
  FlameIcon,
  ImageIcon,
  LayersIcon,
  LockIcon,
  PackageIcon,
  PackageOpenIcon,
  PaletteIcon,
  PrinterIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  SparklesIcon,
  Trash2Icon,
  UnlockIcon,
  WandIcon,
  XIcon,
} from "lucide-react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { ErrorContent } from "~/components/errors";
import { useSearchParams } from "~/hooks/search-params";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import { isAiReady } from "~/modules/ai/settings.server";
import { done } from "~/modules/filament/notify.server";
import {
  colourGaps,
  coolorsUrl,
  generatePalette,
  HARMONIES,
  lch,
  mainColours,
  matchColours,
  textOn,
  TRENDING_PALETTES,
  type Harmony,
  type PaletteFilament,
  type PaletteItem,
} from "~/modules/filament/palette";
import {
  aiExplainGaps,
  aiPalette,
  deletePalette,
  listPalettes,
  paletteFilaments,
  savePalette,
} from "~/modules/filament/palette.server";
import { queuePaletteCard } from "~/modules/labels/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { error, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    const [filaments, saved, aiReady] = await Promise.all([
      paletteFilaments(organizationId),
      listPalettes(organizationId),
      isAiReady(organizationId),
    ]);
    return payload({
      header: { title: "Palettes" },
      filaments,
      saved,
      aiReady,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });
    const form = await request.formData();
    const keys = form.getAll("keys").map(String).filter(Boolean);
    switch (form.get("intent")) {
      case "save": {
        await savePalette(organizationId, String(form.get("name") ?? ""), keys);
        return done(userId, "Palette saved", String(form.get("name") ?? ""));
      }
      case "delete": {
        await deletePalette(organizationId, String(form.get("id") ?? ""));
        return done(userId, "Palette deleted", "");
      }
      case "ai": {
        const all = await paletteFilaments(organizationId);
        const allowed = new Set(keys);
        const pool = all.filter((f) => allowed.has(f.key));
        const out = await aiPalette(
          organizationId,
          String(form.get("prompt") ?? ""),
          Number(form.get("count") ?? 5),
          pool
        );
        return payload({
          ai: {
            name: out.name,
            items: out.items.map((x) => ({ key: x.f.key, why: x.why })),
          },
        });
      }
      case "explain": {
        const all = await paletteFilaments(organizationId);
        const text = await aiExplainGaps(
          organizationId,
          all,
          form.getAll("gaps").map(String)
        );
        return payload({ explain: text });
      }
      case "print": {
        await queuePaletteCard({
          organizationId,
          userId,
          name: String(form.get("name") ?? "Palette"),
          keys,
        });
        return done(userId, "Palette card queued", "It will print shortly.");
      }
      default:
        return payload({ ok: false });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export const handle = {
  breadcrumb: () => <span className="single-crumb">Palettes</span>,
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

type Mode = "generate" | "describe" | "photo" | "trending" | "saved" | "gaps";
type Fetched = {
  ok?: boolean;
  error?: { message: string };
  ai?: { name: string; items: { key: string; why: string }[] };
  explain?: string;
};

function Seg<T extends string | number>({
  value,
  onChange,
  options,
  small,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string, typeof PaletteIcon?][];
  small?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-gray-300 bg-white p-0.5">
      {options.map(([v, l, Icon]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={tw(
            "inline-flex items-center gap-1.5 rounded-md font-medium",
            small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === v
              ? "bg-primary-500 text-white"
              : "text-gray-700 hover:bg-gray-50"
          )}
        >
          {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
          {l}
        </button>
      ))}
    </div>
  );
}

const stateText = (f: PaletteFilament) =>
  f.state === "ams" ? `AMS ${f.slot}` : f.state === "open" ? "Open" : "Sealed";

/** The Coolors-style strip: one column per colour. */
function Strip({
  items,
  locked,
  onLock,
  onAnother,
  tall = true,
}: {
  items: PaletteItem[];
  locked?: string[];
  onLock?: (key: string) => void;
  onAnother?: () => void;
  tall?: boolean;
}) {
  return (
    <div
      className={tw(
        "flex overflow-hidden rounded-xl border border-gray-200",
        tall ? "h-80" : "h-24"
      )}
    >
      {items.map((it, i) => {
        const fg = textOn(it.f.hex);
        const isLocked = locked?.includes(it.f.key);
        const StateIcon =
          it.f.state === "ams"
            ? CpuIcon
            : it.f.state === "open"
            ? PackageOpenIcon
            : PackageIcon;
        return (
          <div
            key={`${it.f.key}-${i}`}
            className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-5 text-center"
            style={{ background: it.f.hex, color: fg }}
          >
            {tall && onLock ? (
              <span className="absolute top-3 flex gap-1 opacity-70 group-hover:opacity-100">
                <button
                  type="button"
                  title={
                    isLocked ? "Unlock" : "Lock: keep it when you generate"
                  }
                  aria-label={
                    isLocked ? `Unlock ${it.f.name}` : `Lock ${it.f.name}`
                  }
                  onClick={() => onLock(it.f.key)}
                  className="rounded-md bg-white/20 p-1.5"
                >
                  {isLocked ? (
                    <LockIcon className="size-4" />
                  ) : (
                    <UnlockIcon className="size-4" />
                  )}
                </button>
                {onAnother && !isLocked ? (
                  <button
                    type="button"
                    title="Another"
                    aria-label={`Another instead of ${it.f.name}`}
                    onClick={onAnother}
                    className="rounded-md bg-white/20 p-1.5"
                  >
                    <RefreshCwIcon className="size-4" />
                  </button>
                ) : null}
              </span>
            ) : null}
            <span
              className={tw(
                "font-mono font-semibold uppercase",
                tall ? "text-lg" : "text-[11px]"
              )}
            >
              {it.f.hex.replace("#", "")}
            </span>
            <Link
              to={`/filament/${it.f.slug}`}
              className={tw(
                "max-w-full truncate px-1 font-semibold hover:underline",
                tall ? "text-sm" : "text-[11px]"
              )}
            >
              {it.f.name}
            </Link>
            {tall ? (
              <span className="text-xs opacity-80">{it.f.line}</span>
            ) : null}
            {tall ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-semibold text-white">
                <StateIcon className="size-3" aria-hidden="true" />
                {stateText(it.f)}
              </span>
            ) : null}
            {tall && it.match != null ? (
              <span className="text-[11px] opacity-80">{it.match}% match</span>
            ) : null}
            {tall && it.why ? (
              <span className="max-w-[92%] px-2 text-[11px] italic opacity-90">
                {it.why}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function Palettes() {
  const { filaments, saved, aiReady } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const act = useFetcher<Fetched>();
  const ai = useFetcher<Fetched>();
  const explain = useFetcher<Fetched>();
  const [mode, setMode] = useState<Mode>("generate");
  const [count, setCount] = useState(5);
  const [source, setSource] = useState<"open" | "sealed" | "both">("both");
  const [line, setLine] = useState("all");
  const [finish, setFinish] = useState<"all" | "matte" | "silk">("all");
  const [preferAms, setPreferAms] = useState(true);
  const [harmony, setHarmony] = useState<Harmony>("random");
  // "Build a palette around this", from a filament's page
  const [locked, setLocked] = useState<string[]>(() => {
    const keep = params.get("keep");
    return keep ? [keep] : [];
  });
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [prompt, setPrompt] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoHexes, setPhotoHexes] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const lines = useMemo(
    () => [...new Set(filaments.map((f) => f.line))].sort(),
    [filaments]
  );
  const pool = useMemo(
    () =>
      filaments.filter(
        (f) =>
          (source === "both" ||
            (source === "open" ? f.hasOpen : f.hasSealed)) &&
          (line === "all" || f.line === line) &&
          (finish === "all" || f.finish === finish)
      ),
    [filaments, source, line, finish]
  );
  const byKey = useMemo(
    () => new Map(filaments.map((f) => [f.key, f])),
    [filaments]
  );

  const generated = useMemo(
    () => generatePalette({ pool, count, harmony, locked, seed, preferAms }),
    [pool, count, harmony, locked, seed, preferAms]
  );
  const aiItems: PaletteItem[] = (ai.data?.ai?.items ?? [])
    .map((x) => ({ f: byKey.get(x.key)!, match: null, why: x.why }))
    .filter((x) => x.f);
  const photoItems = useMemo(
    () => (photoHexes ? matchColours(photoHexes, pool) : null),
    [photoHexes, pool]
  );
  const trending = useMemo(
    () =>
      TRENDING_PALETTES.map((p) => {
        const items = matchColours(p.hexes, pool);
        return {
          ...p,
          items,
          have: items.filter((x) => (x.match ?? 0) >= 80).length,
        };
      }).sort((a, b) => b.have / b.hexes.length - a.have / a.hexes.length),
    [pool]
  );
  const gaps = useMemo(() => colourGaps(filaments), [filaments]);

  // space for another, as on Coolors
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (
        e.code === "Space" &&
        mode === "generate" &&
        tag !== "input" &&
        tag !== "textarea" &&
        tag !== "select" &&
        tag !== "button"
      ) {
        e.preventDefault();
        setSeed((s) => s + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const onPhoto = (file: File) => {
    const url = URL.createObjectURL(file);
    setPhoto(url);
    const img = new window.Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const x = c.getContext("2d");
      if (!x) return;
      x.drawImage(img, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data;
      const px: [number, number, number][] = [];
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
      setPhotoHexes(mainColours(px, count));
    };
    img.src = url;
  };

  const current: PaletteItem[] =
    mode === "generate"
      ? generated
      : mode === "describe"
      ? aiItems
      : mode === "photo"
      ? photoItems ?? []
      : [];
  const keysOf = (items: PaletteItem[]) => items.map((x) => x.f.key);
  const post = (fields: Record<string, string | string[]>, fetcher = act) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields))
      for (const x of Array.isArray(v) ? v : [v]) form.append(k, x);
    void fetcher.submit(form, { method: "post" });
  };
  const inAms = current.filter((x) => x.f.state === "ams").length;
  const lineCount = new Set(current.map((x) => x.f.line)).size;
  const finishCount = new Set(
    current.map((x) => x.f.finish).filter((f) => f !== "other")
  ).size;

  return (
    <>
      <Header hidePageDescription />
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Seg<Mode>
            value={mode}
            onChange={setMode}
            options={[
              ["generate", "Generate", PaletteIcon],
              ["describe", "Describe it", SparklesIcon],
              ["photo", "From a photo", ImageIcon],
              ["trending", "Trending", FlameIcon],
              ["saved", `Saved (${saved.length})`, BookmarkIcon],
              ["gaps", "What to buy next", CircleDashedIcon],
            ]}
          />
          {mode === "generate" ? (
            <span className="text-xs text-gray-400">
              Press{" "}
              <kbd className="rounded border border-gray-300 px-1.5 py-0.5 font-mono">
                space
              </kbd>{" "}
              for another
            </span>
          ) : null}
        </div>

        {/* the same filters on every mode */}
        <Card className="my-0 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="text-gray-500">Colours</span>
            <Seg<number>
              small
              value={count}
              onChange={setCount}
              options={[2, 3, 4, 5, 6, 7, 8].map((n) => [n, String(n)])}
            />
          </span>
          <span className="flex items-center gap-2">
            <span className="text-gray-500">From</span>
            <Seg
              small
              value={source}
              onChange={setSource}
              options={[
                ["open", "Open"],
                ["sealed", "Sealed"],
                ["both", "Both"],
              ]}
            />
          </span>
          <label className="flex items-center gap-2 text-gray-500">
            Line
            <select
              value={line}
              onChange={(e) => setLine(e.target.value)}
              className="h-8 rounded-lg border border-gray-300 px-2 text-xs text-gray-900"
            >
              <option value="all">Any line</option>
              {lines.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <span className="flex items-center gap-2">
            <span className="text-gray-500">Finish</span>
            <Seg
              small
              value={finish}
              onChange={setFinish}
              options={[
                ["all", "Any"],
                ["matte", "Matte"],
                ["silk", "Silk"],
              ]}
            />
          </span>
          <label className="flex items-center gap-2 text-gray-900">
            <input
              type="checkbox"
              checked={preferAms}
              onChange={(e) => setPreferAms(e.target.checked)}
            />
            <CpuIcon className="size-4" aria-hidden="true" /> Prefer what's in
            the AMS
          </label>
          <span className="ml-auto text-xs text-gray-400">
            {pool.length} {pool.length === 1 ? "colour" : "colours"} to choose
            from
          </span>
        </Card>

        {pool.length < 2 && mode !== "saved" && mode !== "gaps" ? (
          <Card className="my-0 p-6 text-sm text-gray-600">
            Fewer than two colours match these filters. Choose Both, or any line
            or finish.
          </Card>
        ) : null}

        {mode === "generate" && pool.length >= 2 ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-500">Harmony</span>
              <Seg<Harmony>
                small
                value={harmony}
                onChange={setHarmony}
                options={(Object.keys(HARMONIES) as Harmony[]).map((k) => [
                  k,
                  HARMONIES[k].label,
                ])}
              />
              <span className="ml-auto">
                <Button type="button" onClick={() => setSeed((s) => s + 1)}>
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCwIcon className="size-4" aria-hidden="true" />{" "}
                    Generate
                  </span>
                </Button>
              </span>
            </div>
            <Strip
              items={generated}
              locked={locked}
              onLock={(k) =>
                setLocked((l) =>
                  l.includes(k) ? l.filter((x) => x !== k) : [...l, k]
                )
              }
              onAnother={() => setSeed((s) => s + 1)}
            />
          </>
        ) : null}

        {mode === "describe" ? (
          <>
            <Card className="my-0 flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <SparklesIcon
                  className="size-4 text-primary-500"
                  aria-hidden="true"
                />{" "}
                Describe what you're printing
              </div>
              {aiReady ? (
                <>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (prompt.trim())
                        post(
                          {
                            intent: "ai",
                            prompt,
                            count: String(count),
                            keys: pool.map((f) => f.key),
                          },
                          ai
                        );
                    }}
                  >
                    <input
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. Halloween but cute; calm Nordic kitchen; Christmas cards"
                      aria-label="Describe it"
                      className="h-10 flex-1 rounded-lg border border-gray-300 px-3 text-sm"
                    />
                    <Button
                      type="submit"
                      disabled={!prompt.trim() || isFormProcessing(ai.state)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <WandIcon className="size-4" aria-hidden="true" />
                        {isFormProcessing(ai.state) ? "Thinking…" : "Suggest"}
                      </span>
                    </Button>
                  </form>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {[
                      "Halloween but cute",
                      "Cosy Christmas",
                      "Calm Nordic kitchen",
                      "Bright kids' toy",
                    ].map((x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => setPrompt(x)}
                        className="rounded-full border border-gray-300 px-2.5 py-1 text-gray-600 hover:bg-gray-50"
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    Claude is given only the {pool.length} colours that match
                    your filters, so every pick is one you have.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-600">
                  This uses Claude. Turn AI on and add your key in{" "}
                  <Link
                    to="/settings/ai"
                    className="font-semibold text-primary-600 underline"
                  >
                    Settings → AI
                  </Link>
                  .
                </p>
              )}
            </Card>
            {ai.data?.error ? (
              <p className="text-sm text-error-600">{ai.data.error.message}</p>
            ) : null}
            {aiItems.length ? (
              <>
                <div className="text-base font-semibold text-gray-900">
                  {ai.data?.ai?.name}
                </div>
                <Strip items={aiItems} />
              </>
            ) : null}
          </>
        ) : null}

        {mode === "photo" && pool.length >= 2 ? (
          <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
            <Card className="my-0 flex min-h-80 flex-col items-center justify-center gap-3 p-4 text-center">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && onPhoto(e.target.files[0])
                }
              />
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  className="max-h-64 rounded-lg object-contain"
                />
              ) : (
                <ImageIcon
                  className="size-9 text-gray-300"
                  aria-hidden="true"
                />
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
              >
                {photo ? "Another photo" : "Choose a photo"}
              </Button>
              <p className="text-xs text-gray-400">
                A room, an object, a render. Its main colours are found here in
                your browser; nothing is uploaded.
              </p>
            </Card>
            <div className="flex flex-col gap-3">
              {photoItems ? (
                <>
                  <div className="flex h-8 overflow-hidden rounded-lg">
                    {(photoHexes ?? []).map((h, i) => (
                      <div
                        key={i}
                        className="flex flex-1 items-center justify-center font-mono text-[10px]"
                        style={{ background: h, color: textOn(h) }}
                      >
                        in the photo
                      </div>
                    ))}
                  </div>
                  <Strip items={photoItems} />
                </>
              ) : (
                <Card className="my-0 flex h-full items-center justify-center p-6 text-sm text-gray-500">
                  Choose a photo to see its colours matched to your filament
                </Card>
              )}
            </div>
          </div>
        ) : null}

        {mode === "trending" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {trending.map((p) => (
              <Card key={p.name} className="my-0 flex flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {p.name}
                  </span>
                  <span
                    className={tw(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      p.have === p.hexes.length
                        ? "bg-success-50 text-success-700"
                        : "bg-warning-50 text-warning-700"
                    )}
                  >
                    {p.have}/{p.hexes.length} in stock
                  </span>
                  <span className="ml-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={p.items.length < 2}
                      onClick={() =>
                        post({
                          intent: "save",
                          name: p.name,
                          keys: keysOf(p.items),
                        })
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        <BookmarkIcon className="size-3.5" aria-hidden="true" />{" "}
                        Save
                      </span>
                    </Button>
                  </span>
                </div>
                <div className="flex h-5 overflow-hidden rounded-md">
                  {p.hexes.map((h, i) => (
                    <div key={i} className="flex-1" style={{ background: h }} />
                  ))}
                </div>
                <div className="flex h-11 overflow-hidden rounded-md">
                  {p.items.map((x, i) => (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center justify-center px-1 text-center text-[10px] font-semibold"
                      style={{ background: x.f.hex, color: textOn(x.f.hex) }}
                    >
                      <span className="max-w-full truncate">{x.f.name}</span>
                      {(x.match ?? 0) < 80 ? (
                        <span className="opacity-80">closest · {x.match}%</span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-gray-400">
                  Top: the palette · bottom: your closest filament
                </div>
              </Card>
            ))}
          </div>
        ) : null}

        {mode === "saved" ? (
          saved.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {saved.map((p) => {
                const items = p.keys
                  .map((k) => byKey.get(k))
                  .filter((f): f is PaletteFilament => !!f)
                  .map((f) => ({ f, match: null }));
                return (
                  <Card key={p.id} className="my-0 flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {p.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {p.keys.length} colours
                        {items.length < p.keys.length
                          ? ` · ${
                              p.keys.length - items.length
                            } no longer on hand`
                          : ""}
                      </span>
                      <span className="ml-auto flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            post({
                              intent: "print",
                              name: p.name,
                              keys: p.keys,
                            })
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            <PrinterIcon
                              className="size-3.5"
                              aria-hidden="true"
                            />{" "}
                            Print card
                          </span>
                        </Button>
                        <Button
                          to={coolorsUrl(items.map((x) => x.f.hex))}
                          target="_blank"
                          size="sm"
                          variant="secondary"
                        >
                          <span className="inline-flex items-center gap-1">
                            <ExternalLinkIcon
                              className="size-3.5"
                              aria-hidden="true"
                            />{" "}
                            Open in Coolors
                          </span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          aria-label={`Delete ${p.name}`}
                          onClick={() => {
                            if (window.confirm(`Delete "${p.name}"?`))
                              post({ intent: "delete", id: p.id });
                          }}
                        >
                          <Trash2Icon
                            className="size-3.5 text-error-600"
                            aria-hidden="true"
                          />
                        </Button>
                      </span>
                    </div>
                    {items.length ? <Strip items={items} tall={false} /> : null}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="my-0 p-6 text-sm text-gray-600">
              No saved palettes yet. Make one, then Save palette.
            </Card>
          )
        ) : null}

        {mode === "gaps" ? (
          <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
            <Card className="my-0 flex flex-col items-center gap-2 p-4">
              <div className="text-sm font-semibold text-gray-900">
                Your colours on the wheel
              </div>
              <svg
                width="300"
                height="300"
                viewBox="-150 -150 300 300"
                role="img"
                aria-label="Your colours on a colour wheel"
              >
                {Array.from({ length: 72 }, (_, i) => {
                  const a1 = (i * 5 * Math.PI) / 180;
                  const a2 = ((i + 1) * 5 * Math.PI) / 180;
                  return (
                    <path
                      key={i}
                      d={`M0 0 L${130 * Math.cos(a1)} ${
                        130 * Math.sin(a1)
                      } A130 130 0 0 1 ${130 * Math.cos(a2)} ${
                        130 * Math.sin(a2)
                      } Z`}
                      fill={`hsl(${i * 5} 60% 70%)`}
                      opacity="0.25"
                    />
                  );
                })}
                {filaments.map((f) => {
                  const [, C, H] = lch(f.hex);
                  const r = 18 + Math.min(1, C / 0.25) * 112;
                  return (
                    <circle
                      key={f.key}
                      cx={r * Math.cos((H * Math.PI) / 180)}
                      cy={r * Math.sin((H * Math.PI) / 180)}
                      r="7"
                      fill={f.hex}
                      stroke="#fff"
                      strokeWidth="2"
                    >
                      <title>{`${f.name} · ${f.line}`}</title>
                    </circle>
                  );
                })}
              </svg>
              <p className="text-center text-xs text-gray-400">
                Each dot a colour you have: round the wheel by hue, out from the
                middle by how strong it is. Greys sit in the middle.
              </p>
            </Card>
            <div className="flex flex-col gap-3">
              <Card className="my-0 p-4">
                <div className="text-sm font-semibold text-gray-900">
                  Gaps worth filling
                </div>
                {gaps.length ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {gaps.map((g) => (
                      <div
                        key={g.band}
                        className="flex items-center gap-3 rounded-lg border border-gray-200 p-2.5"
                      >
                        <span
                          className="size-9 rounded-md"
                          style={{ background: g.hex }}
                        />
                        <div className="flex-1 text-sm text-gray-900">
                          Nothing near this colour
                          <div className="font-mono text-xs text-gray-500">
                            {g.hex}
                          </div>
                        </div>
                        <Button
                          to={`https://uk.store.bambulab.com/collections/pla?q=${encodeURIComponent(
                            g.hex
                          )}`}
                          target="_blank"
                          size="sm"
                          variant="secondary"
                        >
                          <span className="inline-flex items-center gap-1">
                            <ShoppingCartIcon
                              className="size-3.5"
                              aria-hidden="true"
                            />{" "}
                            Bambu store
                          </span>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">
                    No gaps: you have something in every part of the wheel.
                  </p>
                )}
              </Card>
              <Card className="my-0 flex items-start gap-3 p-4 text-sm text-gray-600">
                <SparklesIcon
                  className="mt-0.5 size-4 shrink-0 text-primary-500"
                  aria-hidden="true"
                />
                <div className="flex-1">
                  {explain.data?.explain ? (
                    <span className="text-gray-900">
                      {explain.data.explain}
                    </span>
                  ) : explain.data?.error ? (
                    <span className="text-error-600">
                      {explain.data.error.message}
                    </span>
                  ) : aiReady ? (
                    <span>
                      Ask Claude what's missing and which few colours would open
                      up the most palettes.
                    </span>
                  ) : (
                    <span>
                      With AI on (Settings → AI), Claude can explain what's
                      missing.
                    </span>
                  )}
                </div>
                {aiReady ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isFormProcessing(explain.state)}
                    onClick={() =>
                      post(
                        { intent: "explain", gaps: gaps.map((g) => g.hex) },
                        explain
                      )
                    }
                  >
                    {isFormProcessing(explain.state) ? "Thinking…" : "Ask AI"}
                  </Button>
                ) : null}
              </Card>
            </div>
          </div>
        ) : null}

        {/* how the palette fits the printer, and what to do with it */}
        {["generate", "describe", "photo"].includes(mode) &&
        current.length >= 2 ? (
          <Card className="my-0 flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-900">
              <CpuIcon className="size-4" aria-hidden="true" /> {inAms} of{" "}
              {current.length} in the AMS
            </span>
            <span className="text-sm text-gray-500">
              {current.filter((x) => x.f.state === "sealed").length} would need
              opening
            </span>
            {lineCount > 1 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700">
                <LayersIcon className="size-3" aria-hidden="true" /> Mixes{" "}
                {lineCount} lines
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-success-700">
                <CheckIcon className="size-3" aria-hidden="true" /> One line
              </span>
            )}
            {finishCount > 1 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700">
                <XIcon className="size-3" aria-hidden="true" /> Matte and silk
                mixed
              </span>
            ) : null}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                to={coolorsUrl(current.map((x) => x.f.hex))}
                target="_blank"
                variant="secondary"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ExternalLinkIcon className="size-4" aria-hidden="true" />{" "}
                  Open in Coolors
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  post({
                    intent: "print",
                    name:
                      name ||
                      (mode === "describe" && ai.data?.ai?.name) ||
                      "Palette",
                    keys: keysOf(current),
                  })
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <PrinterIcon className="size-4" aria-hidden="true" /> Print
                  card
                </span>
              </Button>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  (mode === "describe" && ai.data?.ai?.name) || "Name it"
                }
                aria-label="Palette name"
                className="h-10 w-40 rounded-lg border border-gray-300 px-3 text-sm"
              />
              <Button
                type="button"
                disabled={isFormProcessing(act.state)}
                onClick={() => {
                  post({
                    intent: "save",
                    name:
                      name ||
                      (mode === "describe" && ai.data?.ai?.name) ||
                      `Palette ${saved.length + 1}`,
                    keys: keysOf(current),
                  });
                  setName("");
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <BookmarkIcon className="size-4" aria-hidden="true" /> Save
                  palette
                </span>
              </Button>
            </span>
          </Card>
        ) : null}
        {act.data?.error ? (
          <p className="text-sm text-error-600">{act.data.error.message}</p>
        ) : null}
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
