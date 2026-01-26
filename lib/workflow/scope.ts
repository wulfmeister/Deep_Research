import { createChatCompletion } from "../venice/client";
import { Message } from "../venice/types";
import { ResearchStats } from "../venice/stats";
import {
  draftReportGenerationPrompt,
  transformMessagesIntoResearchTopicPrompt
} from "../prompts";
import {
  draftReportGenerationPrompt as originalDraftReportGenerationPrompt
} from "../prompts.original";
import { DEFAULT_MODEL } from "./config";
import { formatPrompt, getTodayStr } from "./utils";

function jsonSchemaResponse(name: string, schema: Record<string, unknown>) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name,
      strict: true,
      schema: {
        ...schema,
        additionalProperties: false
      }
    }
  };
}

export async function writeResearchBrief(
  messages: Message[],
  model = DEFAULT_MODEL,
  stats?: ResearchStats
) {
  const prompt = formatPrompt(transformMessagesIntoResearchTopicPrompt, {
    messages: messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
    date: getTodayStr()
  });

  const response = await createChatCompletion(
    {
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: jsonSchemaResponse("research_brief", {
        type: "object",
        properties: {
          research_brief: { type: "string" }
        },
        required: ["research_brief"]
      })
    },
    stats
  );

  const content = response.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(content) as { research_brief: string };
  return parsed.research_brief;
}

export async function writeDraftReport(
  researchBrief: string,
  model = DEFAULT_MODEL,
  stats?: ResearchStats,
  useOriginalPrompts = false
) {
  const promptTemplate = useOriginalPrompts
    ? originalDraftReportGenerationPrompt
    : draftReportGenerationPrompt;

  const prompt = formatPrompt(promptTemplate, {
    research_brief: researchBrief,
    date: getTodayStr()
  });

  try {
    const response = await createChatCompletion(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: jsonSchemaResponse("draft_report", {
          type: "object",
          properties: {
            draft_report: { type: "string" }
          },
          required: ["draft_report"]
        })
      },
      stats
    );

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Venice returned empty response for draft report");
    }

    let parsed: { draft_report: string };
    try {
      parsed = JSON.parse(content) as { draft_report: string };
    } catch {
      throw new Error("Venice returned invalid JSON for draft report");
    }

    if (!parsed.draft_report) {
      throw new Error("Venice response missing draft_report field");
    }

    return parsed.draft_report;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Draft report generation failed: ${message}`);
  }
}
