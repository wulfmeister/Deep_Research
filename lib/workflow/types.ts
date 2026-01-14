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

export interface SupervisorResult {
  supervisorMessages: Message[];
  researchIterations: number;
  notes: string[];
  rawNotes: string[];
  draftReport: string;
  topics: string[];
}

export interface ResearcherResult {
  compressedResearch: string;
  rawNotes: string[];
  searchCount: number;
}

// Tool call parsed from researcher agent responses
export interface ResearcherToolCall {
  id: string;
  name: "web_search" | "think_tool";
  arguments: Record<string, unknown>;
}

// Tool definitions for the researcher agent
export const researcherTools = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for information. Use specific, targeted queries.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to execute"
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "think_tool",
      description: "Reflect on research progress and plan next steps. Use after each search to assess what you found and what is still missing.",
      parameters: {
        type: "object",
        properties: {
          reflection: {
            type: "string",
            description: "Your reflection on current findings and next steps"
          }
        },
        required: ["reflection"],
        additionalProperties: false
      }
    }
  }
];

export function parseResearcherToolCalls(toolCalls?: ToolCall[]): ResearcherToolCall[] {
  if (!toolCalls) return [];
  return toolCalls
    .map((call) => {
      const parsedArgs = safeJsonParse(call.function.arguments);
      const name = call.function.name;
      if (name !== "web_search" && name !== "think_tool") return null;
      return {
        id: call.id,
        name: name as "web_search" | "think_tool",
        arguments: parsedArgs ?? {}
      };
    })
    .filter((call): call is ResearcherToolCall => call !== null);
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
