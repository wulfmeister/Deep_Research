import { writeDraftReport, writeResearchBrief } from "../../../../lib/workflow/scope";
import { runSupervisor } from "../../../../lib/workflow/supervisor";
import { generateFinalReport } from "../../../../lib/workflow/report";
import { createResearchStats } from "../../../../lib/venice/stats";
import { Message } from "../../../../lib/venice/types";
import {
  formatSseEvent,
  ProgressCallback,
  ProgressEvent
} from "../../../../lib/workflow/progress";
import { SupervisorState } from "../../../../lib/workflow/types";

export const runtime = "nodejs";

const encoder = new TextEncoder();

class RequestAbortedError extends Error {
  constructor() {
    super("Request was aborted by the client");
    this.name = "RequestAbortedError";
  }
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RequestAbortedError();
  }
}

const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds - Railway needs frequent heartbeats

function createStreamHandler(
  send: (event: ProgressEvent) => void,
  controller: ReadableStreamDefaultController,
  abortSignal?: AbortSignal
) {
  return async (
    prompt: string,
    maxIterations: number,
    maxConcurrentResearchers: number,
    enableWebScraping: boolean,
    useOriginalPrompts: boolean
  ) => {
    const stats = createResearchStats();

    // Start heartbeat interval to keep connection alive during long operations
    const heartbeatInterval = setInterval(() => {
      try {
        send({ type: "heartbeat", timestamp: Date.now() });
      } catch {
        // Stream may be closed, interval will be cleared below
      }
    }, HEARTBEAT_INTERVAL_MS);

    const cleanup = () => {
      clearInterval(heartbeatInterval);
    };

    try {
      checkAborted(abortSignal);

      send({
        type: "ack",
        message: "Stream started",
        timestamp: Date.now()
      });
      send({
        type: "step_start",
        step: "brief",
        message: "Generating research brief"
      });

      checkAborted(abortSignal);
      const messages: Message[] = [{ role: "user", content: prompt }];
      const researchBrief = await writeResearchBrief(messages, undefined, stats);

      checkAborted(abortSignal);
      send({ type: "step_complete", step: "brief" });
      send({
        type: "step_start",
        step: "draft",
        message: "Writing draft report"
      });

      checkAborted(abortSignal);
      const draftReport = await writeDraftReport(researchBrief, undefined, stats, useOriginalPrompts);

      checkAborted(abortSignal);
      send({ type: "step_complete", step: "draft" });
      send({
        type: "step_start",
        step: "research",
        message: "Running research"
      });

      const supervisorState: SupervisorState = {
        supervisorMessages: [
          { role: "user", content: `Research brief:\n${researchBrief}` },
          { role: "user", content: `Draft report:\n${draftReport}` }
        ],
        researchBrief,
        notes: [],
        rawNotes: [],
        researchIterations: 0,
        draftReport
      };

      const onProgress: ProgressCallback = (event) => {
        checkAborted(abortSignal);
        send(event);
      };

      checkAborted(abortSignal);
      const supervisorResult = await runSupervisor(
        supervisorState,
        { maxIterations, maxConcurrentResearchers, enableWebScraping, useOriginalPrompts },
        stats,
        onProgress
      );

      checkAborted(abortSignal);
      send({ type: "step_complete", step: "research" });
      send({
        type: "step_start",
        step: "final",
        message: "Generating final report"
      });

      checkAborted(abortSignal);
      const report = await generateFinalReport({
        researchBrief,
        findings: supervisorResult.notes.join("\n"),
        draftReport: supervisorResult.draftReport,
        stats,
        useOriginalPrompts
      });

      checkAborted(abortSignal);
      send({ type: "step_complete", step: "final" });
      send({
        type: "complete",
        report,
        topics: supervisorResult.topics,
        stats
      });

      cleanup();
      controller.close();
    } catch (error) {
      cleanup();
      if (error instanceof RequestAbortedError) {
        try {
          controller.close();
        } catch {
          // Controller may already be closed
        }
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      send({ type: "error", message });
      controller.close();
    }
  };
}

function createStreamResponse(
  prompt: string,
  maxIterations: number,
  maxConcurrentResearchers: number,
  enableWebScraping: boolean,
  useOriginalPrompts: boolean,
  requestSignal?: AbortSignal
) {
  const abortController = new AbortController();

  if (requestSignal) {
    requestSignal.addEventListener("abort", () => {
      abortController.abort();
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        } catch {
          // Stream may be closed
        }
      };

      const handler = createStreamHandler(send, controller, abortController.signal);
      void handler(prompt, maxIterations, maxConcurrentResearchers, enableWebScraping, useOriginalPrompts);
    },
    cancel() {
      abortController.abort();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no" // Disable nginx/proxy buffering for SSE
    }
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prompt = searchParams.get("prompt") ?? "";

  if (!prompt) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  const maxIterations = Math.min(
    Math.max(Number(searchParams.get("maxIterations") ?? 2), 1),
    10
  );
  const maxConcurrentResearchers = Math.min(
    Math.max(Number(searchParams.get("maxConcurrentResearchers") ?? 5), 1),
    5
  );
  const enableWebScraping = searchParams.get("enableWebScraping") !== "false";
  const useOriginalPrompts = searchParams.get("useOriginalPrompts") === "true";

  return createStreamResponse(
    prompt,
    maxIterations,
    maxConcurrentResearchers,
    enableWebScraping,
    useOriginalPrompts,
    request.signal
  );
}

export async function POST(request: Request) {
  let payload: {
    prompt?: string;
    maxIterations?: number;
    maxConcurrentResearchers?: number;
    enableWebScraping?: boolean;
    useOriginalPrompts?: boolean;
  };

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = payload.prompt ?? "";

  if (!prompt) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  const maxIterations = Math.min(Math.max(payload.maxIterations ?? 2, 1), 10);
  const maxConcurrentResearchers = Math.min(
    Math.max(payload.maxConcurrentResearchers ?? 5, 1),
    5
  );
  const enableWebScraping = payload.enableWebScraping !== false;
  const useOriginalPrompts = payload.useOriginalPrompts ?? false;

  return createStreamResponse(
    prompt,
    maxIterations,
    maxConcurrentResearchers,
    enableWebScraping,
    useOriginalPrompts,
    request.signal
  );
}
