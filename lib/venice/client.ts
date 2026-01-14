import { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import { recordUsage, ResearchStats } from "./stats";

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

export async function createChatCompletion(
  payload: ChatCompletionRequest,
  stats?: ResearchStats
): Promise<ChatCompletionResponse> {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VENICE_API_KEY in environment");
  }

  const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Venice API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;

  if (stats) {
    const searchEnabled =
      payload.venice_parameters?.enable_web_search === "on" ||
      payload.venice_parameters?.enable_web_search === "auto";

    recordUsage({
      stats,
      model: payload.model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      searchEnabled
    });
  }

  return data;
}
