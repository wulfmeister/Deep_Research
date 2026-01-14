export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
      strict?: boolean;
    };
  }>;
  tool_choice?: {
    type: "function" | "auto" | "none";
    function?: { name: string };
  };
  parallel_tool_calls?: boolean;
  response_format?: {
    type: "json_schema" | "json_object";
    json_schema?: {
      name?: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
  temperature?: number;
  max_completion_tokens?: number;
  venice_parameters?: {
    enable_web_search?: "off" | "on" | "auto";
    enable_web_citations?: boolean;
    enable_web_scraping?: boolean;
    include_venice_system_prompt?: boolean;
    strip_thinking_response?: boolean;
    disable_thinking?: boolean;
  };
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: Message & { tool_calls?: ToolCall[] };
  }>;
}
