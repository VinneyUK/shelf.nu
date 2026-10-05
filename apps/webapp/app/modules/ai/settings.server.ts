/**
 * The AI settings: switch, API key (encrypted), model, and a connection test.
 * Part of the AI feature; not in upstream Shelf.
 */
import { db } from "~/database/db.server";
import { decryptSecret, encryptSecret } from "~/utils/secret-box.server";
import { callClaude, ClaudeError, DEFAULT_MODEL } from "./claude.server";
import { PHOTO_TOOL } from "./prompts";

/** The row, with the key decrypted. Server use only: never send this to the browser. */
export async function getAiSettingsRow(organizationId: string) {
  const row = await db.aiSettings.findUnique({ where: { organizationId } });
  return {
    enabled: row?.enabled ?? false,
    apiKey: decryptSecret(row?.apiKey ?? ""),
    model: row?.model || DEFAULT_MODEL,
    workspaceId: row?.workspaceId ?? "",
    draftReceipts: row?.draftReceipts ?? true,
    lastError: row?.lastError ?? null,
  };
}

/** Settings safe for the browser: the key never leaves the server. */
export async function getAiSettings(organizationId: string) {
  const { apiKey, ...rest } = await getAiSettingsRow(organizationId);
  return { ...rest, hasKey: apiKey.length > 0 };
}

/** On and with a key: the drafts features work. */
export async function isAiReady(organizationId: string) {
  const s = await getAiSettingsRow(organizationId);
  return s.enabled && s.apiKey.length > 0;
}

export async function saveAiSettings(
  organizationId: string,
  input: {
    enabled: boolean;
    apiKey: string;
    model: string;
    workspaceId: string;
    draftReceipts: boolean;
  }
) {
  const key = input.apiKey.replace(/\s+/g, "");
  const data = {
    enabled: input.enabled,
    model: input.model.trim() || DEFAULT_MODEL,
    workspaceId: input.workspaceId.trim(),
    draftReceipts: input.draftReceipts,
    // Blank keeps the saved key
    ...(key ? { apiKey: encryptSecret(key), lastError: null } : {}),
  };
  await db.aiSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
}

/** A tiny real call, so a wrong key or model shows up here and not on the first photo. */
export async function testAiConnection(
  organizationId: string,
  call: typeof callClaude = callClaude
): Promise<{ ok: true; model: string } | { ok: false; message: string }> {
  const s = await getAiSettingsRow(organizationId);
  try {
    await call({
      apiKey: s.apiKey,
      model: s.model,
      workspaceId: s.workspaceId,
      system: "This is a connection test. Record an empty list of items.",
      content: [{ type: "text", text: "Connection test: record no items." }],
      tool: PHOTO_TOOL,
      maxTokens: 1024,
    });
    await db.aiSettings.updateMany({
      where: { organizationId },
      data: { lastError: null },
    });
    return { ok: true, model: s.model };
  } catch (cause) {
    const message =
      cause instanceof ClaudeError ? cause.message : "The test call failed.";
    await db.aiSettings.updateMany({
      where: { organizationId },
      data: { lastError: message },
    });
    return { ok: false, message };
  }
}
