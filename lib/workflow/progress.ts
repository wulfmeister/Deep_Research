import { ResearchStats } from "../venice/stats";

export type ProgressStepId = "brief" | "draft" | "research" | "final";

export type ProgressEvent =
  | { type: "ack"; message: string; timestamp: number }
  | { type: "step_start"; step: ProgressStepId; message?: string }
  | { type: "step_complete"; step: ProgressStepId }
  | { type: "substep"; step: ProgressStepId; message: string }
  | {
      type: "topic_start";
      topic: string;
      topicIndex: number;
      totalTopics: number;
    }
  | {
      type: "topic_search";
      topic: string;
      searchIndex: number;
      query: string;
    }
  | { type: "topic_complete"; topic: string; searchCount: number }
  | { type: "error"; message: string }
  | { type: "complete"; report: string; topics: string[]; stats: ResearchStats };

export type ProgressCallback = (event: ProgressEvent) => void;

export function formatSseEvent(event: ProgressEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}
