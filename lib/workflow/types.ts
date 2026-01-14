import { Message, ToolCall } from "../venice/types";

export interface AgentState {
  messages: Message[];
  researchBrief?: string;
  supervisorMessages: Message[];
  rawNotes: string[];
  notes: string[];
  draftReport?: string;
  finalReport?: string;
}

export interface SupervisorState {
  supervisorMessages: Message[];
  researchBrief: string;
  notes: string[];
  researchIterations: number;
  rawNotes: string[];
  draftReport?: string;
}

export interface ResearcherResult {
  compressedResearch: string;
  rawNotes: string[];
}

export interface SupervisorToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export function parseToolCalls(toolCalls?: ToolCall[]): SupervisorToolCall[] {
  if (!toolCalls) return [];
  return toolCalls.map((call) => {
    const parsedArgs = safeJsonParse(call.function.arguments);
    return {
      id: call.id,
      name: call.function.name,
      arguments: parsedArgs ?? {}
    };
  });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
