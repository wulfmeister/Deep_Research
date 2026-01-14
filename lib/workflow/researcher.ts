import { createChatCompletion } from "../venice/client";
import { Message } from "../venice/types";
import {
  compressResearchHumanMessage,
  compressResearchSystemPrompt,
  researchAgentPrompt
} from "../prompts";
import { DEFAULT_MODEL } from "./config";
import { formatPrompt, getTodayStr } from "./utils";
import { ResearcherResult } from "./types";

export async function runResearcher(
  researchTopic: string,
  model = DEFAULT_MODEL
): Promise<ResearcherResult> {
  const systemPrompt = formatPrompt(researchAgentPrompt, {
    date: getTodayStr()
  });

  const researcherResponse = await createChatCompletion({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: researchTopic }
    ],
    temperature: 0.3,
    venice_parameters: {
      enable_web_search: "on",
      enable_web_citations: true,
      include_venice_system_prompt: false,
      strip_thinking_response: true
    }
  });

  const researchContent = researcherResponse.choices[0]?.message?.content ?? "";

  const compressSystem = formatPrompt(compressResearchSystemPrompt, {
    date: getTodayStr()
  });
  const compressHuman = formatPrompt(compressResearchHumanMessage, {
    research_topic: researchTopic
  });

  const compressMessages: Message[] = [
    { role: "system", content: compressSystem },
    { role: "user", content: researchContent },
    { role: "user", content: compressHuman }
  ];

  const compressedResponse = await createChatCompletion({
    model,
    messages: compressMessages,
    temperature: 0.2,
    venice_parameters: {
      include_venice_system_prompt: false,
      strip_thinking_response: true
    }
  });

  const compressedResearch =
    compressedResponse.choices[0]?.message?.content ?? researchContent;

  return {
    compressedResearch,
    rawNotes: [researchContent]
  };
}
