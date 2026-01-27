"use client";

import { useEffect, useRef } from "react";
import type { ProgressEvent } from "../lib/workflow/progress";

export interface ResearchStreamConfig {
  prompt: string;
  maxIterations: number;
  maxConcurrentResearchers: number;
  enableWebScraping: boolean;
}

interface ResearchStreamOptions {
  onEvent: (event: ProgressEvent) => void;
  onFallback: () => void;
}

const STREAM_ENDPOINT = "/api/research/stream";
const STREAM_ERROR_MESSAGE = "Streaming connection lost. Please retry.";
const STREAM_PARSE_ERROR_MESSAGE = "Invalid streaming data received.";

export function useResearchStream({ onEvent, onFallback }: ResearchStreamOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const stopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const startStream = (config: ResearchStreamConfig) => {
    stopStream();
    const params = new URLSearchParams({
      prompt: config.prompt,
      maxIterations: String(config.maxIterations),
      maxConcurrentResearchers: String(config.maxConcurrentResearchers),
      enableWebScraping: String(config.enableWebScraping)
    });

    const eventSource = new EventSource(`${STREAM_ENDPOINT}?${params}`);
    eventSourceRef.current = eventSource;
    let receivedEvent = false;

    eventSource.onmessage = (message) => {
      receivedEvent = true;
      let data: ProgressEvent;
      try {
        data = JSON.parse(message.data) as ProgressEvent;
      } catch {
        onEvent({ type: "error", message: STREAM_PARSE_ERROR_MESSAGE });
        stopStream();
        return;
      }

      onEvent(data);

      if (data.type === "complete" || data.type === "error") {
        stopStream();
      }
    };

    eventSource.onerror = () => {
      stopStream();
      if (!receivedEvent) {
        onFallback();
        return;
      }
      onEvent({ type: "error", message: STREAM_ERROR_MESSAGE });
    };
  };

  return { startStream, stopStream };
}
