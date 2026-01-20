import { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import { recordUsage, ResearchStats } from "./stats";

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes for long research operations

export class TimeoutError extends Error {
  constructor(message: string = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number) {
  return status === 429 || status === 503 || status === 504;
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout")
    );
  }
  return false;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function createChatCompletion(
  payload: ChatCompletionRequest,
  stats?: ResearchStats,
  options?: RequestOptions
): Promise<ChatCompletionResponse> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VENICE_API_KEY in environment");
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let response: Response | undefined;
  let errorText = "";
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Link external signal to our controller if provided
    const abortHandler = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        throw new Error("Request was cancelled");
      }
      options.signal.addEventListener("abort", abortHandler);
    }

    try {
      response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      options?.signal?.removeEventListener("abort", abortHandler);

      if (response.ok) {
        break;
      }

      errorText = await response.text();
      if (!shouldRetry(response.status) || attempt === MAX_RETRIES) {
        break;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      options?.signal?.removeEventListener("abort", abortHandler);

      if (options?.signal?.aborted) {
        throw new Error("Request was cancelled");
      }

      if (controller.signal.aborted) {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableNetworkError(error) || attempt === MAX_RETRIES) {
        throw lastError;
      }
    }

    const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
    await delay(delayMs);
  }

  if (!response || !response.ok) {
    const status = response ? response.status : 0;
    throw new Error(`Venice API error (${status}): ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;

  if (stats) {
    const searchEnabled =
      payload.venice_parameters?.enable_web_search === "on" ||
      payload.venice_parameters?.enable_web_search === "auto";
    const scrapingEnabled = payload.venice_parameters?.enable_web_scraping === true;

    recordUsage({
      stats,
      model: payload.model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      searchEnabled,
      scrapingEnabled
    });
  }

  return data;
}
