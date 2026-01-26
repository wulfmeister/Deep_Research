import { createChatCompletion } from "../venice/client";
import { ResearchStats } from "../venice/stats";
import { finalReportGenerationPrompt } from "../prompts";
import { finalReportGenerationPrompt as originalFinalReportGenerationPrompt } from "../prompts.original";
import { DEFAULT_MODEL } from "./config";
import { formatPrompt, getTodayStr } from "./utils";

export async function generateFinalReport({
  researchBrief,
  findings,
  draftReport,
  model = DEFAULT_MODEL,
  stats,
  useOriginalPrompts = false
}: {
  researchBrief: string;
  findings: string;
  draftReport: string;
  model?: string;
  stats?: ResearchStats;
  useOriginalPrompts?: boolean;
}) {
  const promptTemplate = useOriginalPrompts
    ? originalFinalReportGenerationPrompt
    : finalReportGenerationPrompt;

  const prompt = formatPrompt(promptTemplate, {
    research_brief: researchBrief,
    findings,
    draft_report: draftReport,
    date: getTodayStr()
  });

  try {
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

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Venice returned empty response for final report");
    }

    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Final report generation failed: ${message}`);
  }
}
