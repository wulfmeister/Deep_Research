import { ChatCompletionRequest, ChatCompletionResponse } from "./types";

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

export async function createChatCompletion(
  payload: ChatCompletionRequest
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

  return (await response.json()) as ChatCompletionResponse;
}
