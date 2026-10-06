/**
 * Claude, from the server (fork). One call: send images, PDFs or text, and get
 * back a structured result through a forced tool call, so there's no JSON to
 * parse out of prose. Plain fetch against the Messages API; no SDK, so no new
 * dependency to carry through Shelf updates.
 *
 * Part of the AI feature; not in upstream Shelf.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
/** The longest one request may take. A stalled call must not hold a drafting slot for ever. */
export const CLAUDE_TIMEOUT_MS = 90_000;

/** Whether a failed fetch was our own timeout. */
export const isTimeout = (cause: unknown) =>
  cause instanceof Error &&
  (cause.name === "TimeoutError" || cause.name === "AbortError");
const API_VERSION = "2023-06-01";

import { DEFAULT_MODEL, MODELS } from "./models";

export { DEFAULT_MODEL, MODELS };

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

export type Tool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** An error whose message is fit to show the person as it is. */
export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}

export const imageBlock = (
  bytes: Uint8Array,
  mediaType: string
): ContentBlock => ({
  type: "image",
  source: {
    type: "base64",
    media_type: mediaType,
    data: Buffer.from(bytes).toString("base64"),
  },
});
export const pdfBlock = (bytes: Uint8Array): ContentBlock => ({
  type: "document",
  source: {
    type: "base64",
    media_type: "application/pdf",
    data: Buffer.from(bytes).toString("base64"),
  },
});

/** What a failed call means, in words for the person. */
export function explainFailure(
  status: number,
  apiMessage: string
): ClaudeError {
  switch (status) {
    case 401:
      return new ClaudeError(
        "Anthropic rejected the API key. Check it was copied in full, and that it's still active.",
        status
      );
    case 403:
      return new ClaudeError(
        "This API key isn't allowed to use that model or feature.",
        status
      );
    case 404:
      return new ClaudeError(
        `Anthropic doesn't know that model. Pick another in Settings → AI. (${apiMessage})`,
        status
      );
    case 400:
      if (
        /not scoped to a workspace|anthropic-workspace-id/i.test(apiMessage)
      ) {
        return new ClaudeError(
          "This API key isn't tied to one Anthropic workspace, so Anthropic needs to be told which. Either create the key inside a workspace (Console → Settings → API keys → Create key → choose a workspace), or enter that workspace's ID (it starts with wrkspc_) in Settings → AI.",
          status
        );
      }
      if (/credit balance|billing/i.test(apiMessage)) {
        return new ClaudeError(
          "The Anthropic account is out of credit. Add some under Billing at console.anthropic.com.",
          status
        );
      }
      return new ClaudeError(
        `Anthropic couldn't process that: ${apiMessage}`,
        status
      );
    case 413:
      return new ClaudeError(
        "That file is too large for Claude to read.",
        status
      );
    case 429:
      return new ClaudeError(
        "Anthropic is rate-limiting requests. Wait a minute and try again.",
        status,
        true
      );
    case 529:
      return new ClaudeError(
        "Anthropic is overloaded at the moment. Try again shortly.",
        status,
        true
      );
    default:
      return new ClaudeError(
        status >= 500
          ? `Anthropic had a problem (${status}). Try again shortly.`
          : `Anthropic returned an error (${status}): ${apiMessage}`,
        status,
        status >= 500
      );
  }
}

export type CallArgs = {
  apiKey: string;
  model: string;
  system: string;
  content: ContentBlock[];
  tool: Tool;
  maxTokens?: number;
  /** For API keys not tied to one workspace: sent as anthropic-workspace-id */
  workspaceId?: string;
  /** Injected in tests */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/** Sends the content and returns the forced tool call's input. Retries busy/rate-limit errors twice. */
export async function callClaude({
  apiKey,
  model,
  system,
  content,
  tool,
  maxTokens = 4096,
  workspaceId,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}: CallArgs): Promise<Record<string, unknown>> {
  if (!apiKey)
    throw new ClaudeError("No API key is saved yet. Add one in Settings → AI.");
  // Newer models (Sonnet 5.5, Opus 5.5 and later) refuse a forced tool_choice
  // with a 400. So the model chooses, and is told plainly to answer by calling
  // the tool; if it answers in prose anyway it's reminded once.
  const instruction = `Give your answer by calling the ${tool.name} tool. Do not answer in plain text.`;
  const buildBody = (insist: boolean) =>
    JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            ...content,
            {
              type: "text",
              text: insist
                ? `${instruction} You must call it now, with the answer as its input.`
                : instruction,
            },
          ],
        },
      ],
    });
  let body = buildBody(false);
  let reminded = false;

  let lastError: ClaudeError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt * 2500);
    let response: Response;
    try {
      response = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          ...(workspaceId?.trim()
            ? { "anthropic-workspace-id": workspaceId.trim() }
            : {}),
        },
        body,
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
      });
    } catch (cause) {
      if (isTimeout(cause)) {
        // not retried: a second attempt would only make the wait longer
        lastError = new ClaudeError(
          "Anthropic took too long to answer. Try again.",
          undefined,
          false
        );
        break;
      }
      lastError = new ClaudeError(
        "Couldn't reach Anthropic. Check the server's internet connection.",
        undefined,
        true
      );
      continue;
    }
    if (!response.ok) {
      let apiMessage = "";
      try {
        apiMessage =
          ((await response.json()) as { error?: { message?: string } }).error
            ?.message ?? "";
      } catch {
        /* no body */
      }
      lastError = explainFailure(response.status, apiMessage);
      if (!lastError.retryable) throw lastError;
      continue;
    }
    const result = (await response.json()) as {
      content?: {
        type: string;
        name?: string;
        input?: Record<string, unknown>;
      }[];
      stop_reason?: string;
    };
    const block = result.content?.find(
      (b) => b.type === "tool_use" && b.name === tool.name
    );
    if (!block?.input) {
      if (!reminded && result.stop_reason !== "max_tokens") {
        reminded = true;
        body = buildBody(true);
        lastError = new ClaudeError(
          "Claude didn't give a usable answer. Try again."
        );
        continue;
      }
      throw new ClaudeError(
        result.stop_reason === "max_tokens"
          ? "Claude's answer was cut off. Try again."
          : "Claude didn't give a usable answer. Try again."
      );
    }
    return block.input;
  }
  throw lastError ?? new ClaudeError("Couldn't get an answer from Claude.");
}
