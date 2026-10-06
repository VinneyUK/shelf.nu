/**
 * Looking a price up on the web (fork), for photo drafts.
 *
 * A separate request from the draft itself, on purpose. Anthropic's web search
 * is a server tool; when it's offered alongside a tool of ours in the same
 * turn the model can call both at once and the search is then skipped. So the
 * price is researched first, in plain text, and handed to the draft request as
 * context. If anything here fails the draft carries on from the model's own
 * knowledge, and says so.
 *
 * Uses the basic web search tool (web_search_20250305): the newer versions need
 * code execution as well. Part of the AI feature; not in upstream Shelf.
 */
import {
  ClaudeError,
  explainFailure,
  isTimeout,
  type ContentBlock,
} from "./claude.server";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
/** The longest one search request may take (a search turn is slower than a plain answer). */
export const RESEARCH_TIMEOUT_MS = 120_000;
/** Searches allowed per photo. Two or three is plenty to price one item. */
export const MAX_SEARCHES = 3;
/** Times a long search turn may be paused and continued */
const MAX_CONTINUATIONS = 3;

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: MAX_SEARCHES,
  // UK retailers first
  user_location: {
    type: "approximate",
    country: "GB",
    timezone: "Europe/London",
  },
} as const;

export type ResearchResult = {
  /** What Claude found, in plain text. Null if it found nothing or couldn't search. */
  text: string | null;
  searches: number;
  /** Why the lookup didn't work, in words for the person. Null if it did. */
  error: string | null;
};

type Block = { type: string; text?: string; name?: string; content?: unknown };

/** What a web-search error code means. Anthropic reports these inside a 200 response. */
export function explainSearchError(code: string): string {
  switch (code) {
    case "too_many_requests":
      return "Anthropic's web search is rate-limited right now.";
    case "unavailable":
      return "Anthropic's web search is unavailable right now.";
    case "max_uses_exceeded":
      return "Claude tried to search more than allowed.";
    case "query_too_long":
    case "invalid_input":
      return "Claude's search wasn't accepted.";
    default:
      return `Web search failed (${code}).`;
  }
}

/** The failure to show for a request Anthropic refused outright; web search not being enabled is the likely one. */
function explainRefusal(status: number, apiMessage: string): ClaudeError {
  if ((status === 400 || status === 403) && /web.?search/i.test(apiMessage)) {
    return new ClaudeError(
      "Web search isn't switched on for this Anthropic account. An admin of the Anthropic organisation can enable it in the Claude Console; or turn off “Look up prices on the web” here.",
      status
    );
  }
  return explainFailure(status, apiMessage);
}

export type ResearchArgs = {
  apiKey: string;
  model: string;
  system: string;
  content: ContentBlock[];
  workspaceId?: string;
  maxTokens?: number;
  /** Injected in tests */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/** Runs the search request, continuing a paused turn if needed. Never throws: a failure is returned. */
export async function researchPrice({
  apiKey,
  model,
  system,
  content,
  workspaceId,
  maxTokens = 2048,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}: ResearchArgs): Promise<ResearchResult> {
  if (!apiKey)
    return { text: null, searches: 0, error: "No API key is saved yet." };

  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    ...(workspaceId?.trim()
      ? { "anthropic-workspace-id": workspaceId.trim() }
      : {}),
  };
  const messages: { role: "user" | "assistant"; content: unknown }[] = [
    { role: "user", content },
  ];
  let searches = 0;
  let toolError: string | null = null;

  for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
    // One request, retried twice if Anthropic is busy
    let blocks: Block[] | null = null;
    let stopReason: string | undefined;
    let failure: ClaudeError | null = null;
    for (let attempt = 0; attempt < 3 && !blocks; attempt++) {
      if (attempt > 0) await sleep(attempt * 2500);
      let response: Response;
      try {
        response = await fetchImpl(API_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            tools: [WEB_SEARCH_TOOL],
            messages,
          }),
          signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        });
      } catch (cause) {
        if (isTimeout(cause)) {
          failure = new ClaudeError(
            "The price lookup took too long.",
            undefined,
            false
          );
          break;
        }
        failure = new ClaudeError("Couldn't reach Anthropic.", undefined, true);
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
        failure = explainRefusal(response.status, apiMessage);
        if (!failure.retryable) break;
        continue;
      }
      const json = (await response.json()) as {
        content?: Block[];
        stop_reason?: string;
      };
      blocks = json.content ?? [];
      stopReason = json.stop_reason;
    }
    if (!blocks)
      return {
        text: null,
        searches,
        error: failure?.message ?? "The price lookup failed.",
      };

    for (const b of blocks) {
      if (b.type === "server_tool_use" && b.name === "web_search")
        searches += 1;
      if (
        b.type === "web_search_tool_result" &&
        b.content &&
        !Array.isArray(b.content)
      ) {
        const err = b.content as { type?: string; error_code?: string };
        if (err.type === "web_search_tool_result_error" && err.error_code)
          toolError = explainSearchError(err.error_code);
      }
    }

    if (stopReason === "pause_turn") {
      // A long turn was paused: hand the model's own work back and let it carry on
      messages.push({ role: "assistant", content: blocks });
      continue;
    }
    const text = blocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("")
      .trim();
    // An answer with a search error alongside it is kept, with the warning
    return {
      text: text || null,
      searches,
      error: text ? toolError : toolError ?? "The price lookup found nothing.",
    };
  }
  return { text: null, searches, error: "The price lookup took too long." };
}
