/**
 * What the fork's features write into an asset's activity (fork).
 *
 * `addAssetActivity` writes these as notes, and the Asset Activity Summary finds
 * them again by their wording. The wording and its report type live here, in one
 * place, so the two can't drift apart: fork-activity.test.ts reads every place
 * the fork writes activity and fails if one isn't listed.
 *
 * Order matters: the first match wins, so the more specific wording goes first
 * (an emailed receipt is also an attachment).
 *
 * Part of the fork; not in upstream Shelf.
 */
export type ForkActivityType =
  | "SOLD"
  | "LABEL"
  | "ATTACHMENT"
  | "RECEIPT"
  | "AI_DRAFT";

/**
 * Written exactly as stored, bold markers included ("printed a **label**"),
 * because the report finds the notes with a database text search. Classifying
 * ignores the markers, so a formatting tweak can't make a note unrecognisable.
 */
export const FORK_ACTIVITY: { type: ForkActivityType; phrases: string[] }[] = [
  { type: "RECEIPT", phrases: ["from an emailed receipt"] },
  { type: "AI_DRAFT", phrases: ["with Claude's suggestions"] },
  {
    type: "SOLD",
    phrases: [
      "marked this asset as **sold**",
      "marked this asset as **not sold**",
    ],
  },
  { type: "LABEL", phrases: ["printed a **label**", "removed the **label**"] },
  {
    type: "ATTACHMENT",
    phrases: ["added the attachment **", "deleted the attachment **"],
  },
];

/** Every phrase, for finding the notes in the first place. */
export const FORK_ACTIVITY_PHRASES = FORK_ACTIVITY.flatMap((a) => a.phrases);

const plain = (text: string) => text.replace(/\*\*/g, "");

/** Which kind of fork activity a note is, or null if it isn't one of ours. */
export function classifyForkNote(content: string): ForkActivityType | null {
  const text = plain(content);
  const match = FORK_ACTIVITY.find((a) =>
    a.phrases.some((phrase) => text.includes(plain(phrase)))
  );
  return match?.type ?? null;
}
