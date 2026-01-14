import { createChatCompletion } from "../venice/client";
import { ChatCompletionResponse, Message, VeniceCitation } from "../venice/types";
import { ResearchStats } from "../venice/stats";
import {
  compressResearchHumanMessage,
  compressResearchSystemPrompt,
  researchAgentPrompt
} from "../prompts";
import { DEFAULT_MODEL, MAX_SEARCH_ITERATIONS } from "./config";
import { formatPrompt, getTodayStr } from "./utils";
import {
  ResearcherResult,
  ResearcherToolCall,
  researcherTools,
  parseResearcherToolCalls
} from "./types";

interface SearchResult {
  query: string;
  content: string;
  citations: VeniceCitation[];
}

/**
 * Execute a single web search using Venice API
 */
async function executeWebSearch(
  query: string,
  model: string,
  stats?: ResearchStats
): Promise<SearchResult> {
  if (process.env.VENICE_DEBUG === "1") {
    console.log(`[venice] web_search query: "${query}"`);
  }

  const response = await createChatCompletion(
    {
      model,
      messages: [
        {
          role: "system",
          content: `You are a research assistant. Search for information about the given query and provide a comprehensive summary of what you find. Include specific facts, statistics, names, dates, and details. Today's date is ${getTodayStr()}.`
        },
        {
          role: "user",
          content: query
        }
      ],
      temperature: 0.3,
      venice_parameters: {
        enable_web_search: "on",
        enable_web_citations: true,
        include_venice_system_prompt: false,
        strip_thinking_response: true
      }
    },
    stats
  );

  const content = response.choices[0]?.message?.content ?? "";
  const citations = extractVeniceCitations(response);

  if (process.env.VENICE_DEBUG === "1") {
    console.log(`[venice] search returned ${citations.length} citations`);
  }

  return {
    query,
    content,
    citations
  };
}

/**
 * Run the researcher agent loop with multiple search iterations
 */
async function runResearcherLoop(
  researchTopic: string,
  model: string,
  stats?: ResearchStats
): Promise<{ messages: Message[]; allCitations: VeniceCitation[]; searchCount: number }> {
  const systemPrompt = formatPrompt(researchAgentPrompt, {
    date: getTodayStr()
  });

  // Initialize conversation with system prompt and user topic
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: researchTopic }
  ];

  const allCitations: VeniceCitation[] = [];
  let searchCount = 0;
  let iterations = 0;

  while (iterations < MAX_SEARCH_ITERATIONS) {
    iterations++;

    if (process.env.VENICE_DEBUG === "1") {
      console.log(`[venice] researcher iteration ${iterations}/${MAX_SEARCH_ITERATIONS}`);
    }

    // Call the model with tools
    const response = await createChatCompletion(
      {
        model,
        messages,
        tools: researcherTools,
        temperature: 0.3,
        venice_parameters: {
          include_venice_system_prompt: false,
          strip_thinking_response: true
        }
      },
      stats
    );

    const assistantMessage = response.choices[0]?.message;
    if (!assistantMessage) {
      break;
    }

    // Add assistant message to conversation
    messages.push({
      role: "assistant",
      content: assistantMessage.content ?? "",
      tool_calls: assistantMessage.tool_calls
    });

    // Parse tool calls
    const toolCalls = parseResearcherToolCalls(assistantMessage.tool_calls);

    // If no tool calls, the agent is done researching
    if (toolCalls.length === 0) {
      if (process.env.VENICE_DEBUG === "1") {
        console.log("[venice] researcher done (no tool calls)");
      }
      break;
    }

    // Execute each tool call
    for (const toolCall of toolCalls) {
      if (toolCall.name === "web_search") {
        const query = String(toolCall.arguments.query ?? "");
        if (!query) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: "Error: No search query provided"
          });
          continue;
        }

        // Execute the search
        const searchResult = await executeWebSearch(query, model, stats);
        searchCount++;

        // Collect citations
        allCitations.push(...searchResult.citations);

        // Format the search result with citations
        const citationInfo = searchResult.citations.length > 0
          ? `\n\nSources found:\n${searchResult.citations.map((c, i) => `[${i + 1}] ${c.title || "Source"}: ${c.url}`).join("\n")}`
          : "";

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Search results for "${query}":\n\n${searchResult.content}${citationInfo}`
        });
      } else if (toolCall.name === "think_tool") {
        const reflection = String(toolCall.arguments.reflection ?? "");
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Reflection recorded: ${reflection}`
        });

        if (process.env.VENICE_DEBUG === "1") {
          console.log(`[venice] think_tool: ${reflection.slice(0, 100)}...`);
        }
      }
    }
  }

  if (process.env.VENICE_DEBUG === "1") {
    console.log(`[venice] researcher completed with ${searchCount} searches, ${allCitations.length} total citations`);
  }

  return { messages, allCitations, searchCount };
}

/**
 * Main researcher entry point - runs the research loop and compresses findings
 */
export async function runResearcher(
  researchTopic: string,
  model = DEFAULT_MODEL,
  stats?: ResearchStats
): Promise<ResearcherResult> {
  // Run the research loop
  const { messages, allCitations, searchCount } = await runResearcherLoop(
    researchTopic,
    model,
    stats
  );

  // Extract raw research content from messages
  const rawContent = messages
    .filter((m) => m.role === "tool" || (m.role === "assistant" && m.content))
    .map((m) => m.content)
    .join("\n\n---\n\n");

  // Format citation block for compression
  const citationBlock = formatCitationBlock(allCitations);

  // Compress the research
  const compressSystem = formatPrompt(compressResearchSystemPrompt, {
    date: getTodayStr()
  });
  const compressHuman = formatPrompt(compressResearchHumanMessage, {
    research_topic: researchTopic
  });

  const compressMessages: Message[] = [
    { role: "system", content: compressSystem },
    { role: "user", content: rawContent },
    ...(citationBlock ? [{ role: "user" as const, content: citationBlock }] : []),
    { role: "user", content: compressHuman }
  ];

  const compressedResponse = await createChatCompletion(
    {
      model,
      messages: compressMessages,
      temperature: 0.2,
      venice_parameters: {
        include_venice_system_prompt: false,
        strip_thinking_response: true
      }
    },
    stats
  );

  const compressedResearch =
    compressedResponse.choices[0]?.message?.content ?? rawContent;

  return {
    compressedResearch,
    rawNotes: [rawContent],
    searchCount
  };
}

function extractVeniceCitations(
  response: ChatCompletionResponse
): VeniceCitation[] {
  const citations = response.venice_parameters?.web_search_citations ?? [];
  return citations
    .map((citation) => {
      if (typeof citation === "string") {
        return { url: citation };
      }
      if (!citation) return null;

      const record = citation as unknown as Record<string, unknown>;
      const url =
        (record.url as string | undefined) ||
        (record.link as string | undefined) ||
        (record.source_url as string | undefined);
      if (!url) return null;

      const title =
        (record.title as string | undefined) ||
        (record.source as string | undefined) ||
        (record.name as string | undefined);

      return { url, title };
    })
    .filter((citation): citation is VeniceCitation => Boolean(citation));
}

function formatCitationBlock(citations: VeniceCitation[]) {
  if (citations.length === 0) return "";

  // Deduplicate citations by URL
  const seen = new Set<string>();
  const uniqueCitations = citations.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  const lines = uniqueCitations.map((citation, index) => {
    const title = citation.title ? citation.title : "Source";
    return `[${index + 1}] ${title}: ${citation.url}`;
  });

  return `Web search citations:\n${lines.join("\n")}`;
}
