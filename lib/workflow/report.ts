import { createChatCompletion } from "../venice/client";
import { ResearchStats } from "../venice/stats";
import { finalReportGenerationPrompt } from "../prompts";
import { DEFAULT_MODEL } from "./config";
import { formatPrompt, getTodayStr } from "./utils";

export async function generateFinalReport({
  researchBrief,
  findings,
  draftReport,
  model = DEFAULT_MODEL,
  stats
}: {
  researchBrief: string;
  findings: string;
  draftReport: string;
  model?: string;
  stats?: ResearchStats;
}) {
  const prompt = formatPrompt(finalReportGenerationPrompt, {
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

  return response.choices[0]?.message?.content ?? "";
}
