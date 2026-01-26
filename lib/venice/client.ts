import { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import { recordUsage, ResearchStats } from "./stats";

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes for long research operations
const STREAMING_TIMEOUT_MS = 900000; // 15 minutes for streaming operations

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

/**
 * Streaming version of createChatCompletion for long-running requests.
 * Uses Venice streaming API to avoid 504 timeouts.
 */
export async function createChatCompletionStreaming(
  payload: ChatCompletionRequest,
  stats?: ResearchStats,
  options?: RequestOptions
): Promise<ChatCompletionResponse> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VENICE_API_KEY in environment");
  }

  const timeoutMs = options?.timeoutMs ?? STREAMING_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const abortHandler = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error("Request was cancelled");
    }
    options.signal.addEventListener("abort", abortHandler);
  }

  try {
    const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    options?.signal?.removeEventListener("abort", abortHandler);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Venice API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response body from Venice streaming API");
    }

    // Read and accumulate streamed chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let content = "";
    let buffer = "";
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
          }
          // Capture usage from final chunk if present
          if (json.usage) {
            usage = json.usage;
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // Build response in same format as non-streaming
    const result: ChatCompletionResponse = {
      choices: [
        {
          message: { role: "assistant", content }
        }
      ],
      usage
    };

    if (stats) {
      const searchEnabled =
        payload.venice_parameters?.enable_web_search === "on" ||
        payload.venice_parameters?.enable_web_search === "auto";
      const scrapingEnabled = payload.venice_parameters?.enable_web_scraping === true;

      recordUsage({
        stats,
        model: payload.model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        searchEnabled,
        scrapingEnabled
      });
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    options?.signal?.removeEventListener("abort", abortHandler);

    if (options?.signal?.aborted) {
      throw new Error("Request was cancelled");
    }

    if (controller.signal.aborted) {
      throw new TimeoutError(`Streaming request timed out after ${timeoutMs}ms`);
    }

    throw error;
  }
}
