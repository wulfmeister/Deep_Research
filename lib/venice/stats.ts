export interface ResearchStats {
  apiCalls: number;
  searchCalls: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  pricingIncludesModel: boolean;
}

const WEB_SEARCH_COST_PER_CALL = 0.01;

const MODEL_PRICING_PER_1K: Record<string, { input: number; output: number }> = {};

export function createResearchStats(): ResearchStats {
  return {
    apiCalls: 0,
    searchCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCost: 0,
    pricingIncludesModel: false
  };
}

export function mergeResearchStats(
  current: ResearchStats,
  incoming: ResearchStats
): ResearchStats {
  return {
    apiCalls: current.apiCalls + incoming.apiCalls,
    searchCalls: current.searchCalls + incoming.searchCalls,
    promptTokens: current.promptTokens + incoming.promptTokens,
    completionTokens: current.completionTokens + incoming.completionTokens,
    estimatedCost: current.estimatedCost + incoming.estimatedCost,
    pricingIncludesModel:
      current.pricingIncludesModel || incoming.pricingIncludesModel
  };
}

export function recordUsage({
  stats,
  model,
  promptTokens,
  completionTokens,
  searchEnabled
}: {
  stats: ResearchStats;
  model: string;
  promptTokens: number;
  completionTokens: number;
  searchEnabled: boolean;
}) {
  stats.apiCalls += 1;
  stats.promptTokens += promptTokens;
  stats.completionTokens += completionTokens;

  if (searchEnabled) {
    stats.searchCalls += 1;
    stats.estimatedCost += WEB_SEARCH_COST_PER_CALL;
  }

  const pricing = MODEL_PRICING_PER_1K[model];
  if (pricing) {
    stats.pricingIncludesModel = true;
    stats.estimatedCost += (promptTokens / 1000) * pricing.input;
    stats.estimatedCost += (completionTokens / 1000) * pricing.output;
  }
}
