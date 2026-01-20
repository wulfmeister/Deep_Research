import { createChatCompletion } from "../venice/client";
import { Message } from "../venice/types";
import { ResearchStats } from "../venice/stats";
import { leadResearcherPrompt, reportGenerationWithDraftInsightPrompt } from "../prompts";
import { DEFAULT_MODEL } from "./config";
import { formatPrompt, getTodayStr } from "./utils";
import { ProgressCallback } from "./progress";
import {
  parseToolCalls,
  ResearcherResult,
  SupervisorResult,
  SupervisorState
} from "./types";
import { runResearcher } from "./researcher";

export interface SupervisorConfig {
  maxIterations: number;
  maxConcurrentResearchers: number;
  enableWebScraping?: boolean;
  model?: string;
}

const supervisorTools = [
  {
    type: "function" as const,
    function: {
      name: "ConductResearch",
      description: "Delegate research to a sub-agent",
      parameters: {
        type: "object",
        properties: {
          research_topic: { type: "string" }
        },
        required: ["research_topic"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "ResearchComplete",
      description: "Signal that research is complete",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "think_tool",
      description: "Reflect on research progress",
      parameters: {
        type: "object",
        properties: { reflection: { type: "string" } },
        required: ["reflection"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "refine_draft_report",
      description: "Refine draft report using findings",
      parameters: {
        type: "object",
        properties: {
          research_brief: { type: "string" },
          findings: { type: "string" },
          draft_report: { type: "string" }
        },
        required: ["research_brief", "findings", "draft_report"],
        additionalProperties: false
      }
    }
  }
];

export async function runSupervisor(
  state: SupervisorState,
  config: SupervisorConfig,
  stats?: ResearchStats,
  onProgress?: ProgressCallback
): Promise<SupervisorResult> {
  const model = config.model ?? DEFAULT_MODEL;

  let supervisorMessages = state.supervisorMessages;
  let researchIterations = state.researchIterations;
  let notes = state.notes;
  let rawNotes = state.rawNotes;
  let draftReport = state.draftReport ?? "";
  let topics: string[] = [];

  while (researchIterations < config.maxIterations) {
    const systemPrompt = formatPrompt(leadResearcherPrompt, {
      date: getTodayStr(),
      max_concurrent_research_units: String(config.maxConcurrentResearchers),
      max_researcher_iterations: String(config.maxIterations)
    });

    const response = await createChatCompletion(
      {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...supervisorMessages
        ],
        tools: supervisorTools,
        temperature: 0.3,
        parallel_tool_calls: true,
        venice_parameters: {
          include_venice_system_prompt: false,
          strip_thinking_response: true
        }
      },
      stats
    );

    const assistantMessage = response.choices[0]?.message;
    const toolCalls = parseToolCalls(assistantMessage?.tool_calls);
    if (!assistantMessage || toolCalls.length === 0) {
      break;
    }

    if (toolCalls.some((call) => call.name === "ResearchComplete")) {
      break;
    }

    const toolMessages: Message[] = [];

    const conductCalls = toolCalls.filter(
      (call) => call.name === "ConductResearch"
    );
    if (conductCalls.length > 0) {
      const totalTopics = conductCalls.length;
      for (
        let index = 0;
        index < conductCalls.length;
        index += config.maxConcurrentResearchers
      ) {
        const batch = conductCalls.slice(
          index,
          index + config.maxConcurrentResearchers
        );

        onProgress?.({
          type: "substep",
          step: "research",
          message: `Spinning up ${batch.length} researcher agent${
            batch.length === 1 ? "" : "s"
          }`
        });

        const researchResults = await Promise.all(
          batch.map(async (call, batchIndex) => {
            const researchTopic = String(call.arguments.research_topic ?? "");
            if (!researchTopic) {
              return {
                call,
                result: {
                  compressedResearch: "Missing research topic",
                  rawNotes: [],
                  searchCount: 0
                } as ResearcherResult
              };
            }

            const topicIndex = index + batchIndex + 1;
            topics = [...topics, researchTopic];
            onProgress?.({
              type: "topic_start",
              topic: researchTopic,
              topicIndex,
              totalTopics
            });

            const result = await runResearcher(
              researchTopic,
              model,
              stats,
              onProgress,
              config.enableWebScraping
            );

            onProgress?.({
              type: "topic_complete",
              topic: researchTopic,
              searchCount: result.searchCount
            });

            return { call, result };
          })
        );

        for (const { call, result } of researchResults) {
          notes = [...notes, result.compressedResearch];
          rawNotes = [...rawNotes, ...result.rawNotes];
          toolMessages.push({
            role: "tool",
            name: call.name,
            tool_call_id: call.id,
            content: result.compressedResearch
          });
        }
      }
    }

    for (const call of toolCalls) {
      if (call.name === "think_tool") {
        toolMessages.push({
          role: "tool",
          name: call.name,
          tool_call_id: call.id,
          content: "Reflection recorded."
        });
      }

      if (call.name === "refine_draft_report") {
        const findings = notes.join("\n");
        const refined = await refineDraftReport({
          model,
          researchBrief: state.researchBrief,
          findings,
          draftReport,
          stats
        });
        draftReport = refined;

        toolMessages.push({
          role: "tool",
          name: call.name,
          tool_call_id: call.id,
          content: refined
        });
      }
    }

    supervisorMessages = [...supervisorMessages, assistantMessage, ...toolMessages];
    researchIterations += 1;
  }

  return {
    supervisorMessages,
    researchIterations,
    notes,
    rawNotes,
    draftReport,
    topics
  };
}

async function refineDraftReport({
  model,
  researchBrief,
  findings,
  draftReport,
  stats
}: {
  model: string;
  researchBrief: string;
  findings: string;
  draftReport: string;
  stats?: ResearchStats;
}) {
  const prompt = formatPrompt(reportGenerationWithDraftInsightPrompt, {
    research_brief: researchBrief,
    findings,
    draft_report: draftReport,
    date: getTodayStr()
  });

  const response = await createChatCompletion(
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      venice_parameters: {
        include_venice_system_prompt: false,
        strip_thinking_response: true
      }
    },
    stats
  );

  return response.choices[0]?.message?.content ?? draftReport;
}
