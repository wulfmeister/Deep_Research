export function getTodayStr() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatPrompt(
  template: string,
  variables: Record<string, string>
) {
  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template
  );
}

/**
 * Estimate token count using chars/4 approximation.
 * This is a rough estimate; actual tokenization varies by model.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens for an array of messages.
 */
export function estimateMessagesTokenCount(
  messages: Array<{ role: string; content?: string | null }>
): number {
  let total = 0;
  for (const msg of messages) {
    total += 4; // overhead per message
    total += estimateTokenCount(msg.role);
    if (msg.content) {
      total += estimateTokenCount(msg.content);
    }
  }
  return total;
}
