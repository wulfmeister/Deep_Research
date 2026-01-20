import { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import { recordUsage, ResearchStats } from "./stats";

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number) {
  return status === 429 || status === 503 || status === 504;
}

export async function createChatCompletion(
  payload: ChatCompletionRequest,
  stats?: ResearchStats
): Promise<ChatCompletionResponse> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VENICE_API_KEY in environment");
  }

  let response: Response | undefined;
  let errorText = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      break;
    }

    errorText = await response.text();
    if (!shouldRetry(response.status) || attempt === MAX_RETRIES) {
      break;
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
