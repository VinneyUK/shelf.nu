/**
 * The Claude models offered in Settings → AI. A plain file (not .server), because
 * the settings page uses the list while rendering in the browser.
 * Part of the AI feature; not in upstream Shelf.
 */
export const MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (recommended)" },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5 (most capable, costs more)",
  },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (cheapest)" },
] as const;
export const DEFAULT_MODEL = MODELS[0].id;

/** How long a drafted description may be, in characters (Settings → AI). */
export const DESCRIPTION_LENGTH = {
  min: 100,
  max: 1000,
  default: 300,
} as const;
