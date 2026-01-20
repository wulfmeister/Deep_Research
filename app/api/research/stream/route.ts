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

function createStreamHandler(
  send: (event: ProgressEvent) => void,
  controller: ReadableStreamDefaultController
) {
  return async (
    prompt: string,
    maxIterations: number,
    maxConcurrentResearchers: number,
    enableWebScraping: boolean
  ) => {
    const stats = createResearchStats();
    try {
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

      const messages: Message[] = [{ role: "user", content: prompt }];
      const researchBrief = await writeResearchBrief(messages, undefined, stats);

      send({ type: "step_complete", step: "brief" });
      send({
        type: "step_start",
        step: "draft",
        message: "Writing draft report"
      });

      const draftReport = await writeDraftReport(researchBrief, undefined, stats);

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
        send(event);
      };

      const supervisorResult = await runSupervisor(
        supervisorState,
        { maxIterations, maxConcurrentResearchers, enableWebScraping },
        stats,
        onProgress
      );

      send({ type: "step_complete", step: "research" });
      send({
        type: "step_start",
        step: "final",
        message: "Generating final report"
      });

      const report = await generateFinalReport({
        researchBrief,
        findings: supervisorResult.notes.join("\n"),
        draftReport: supervisorResult.draftReport,
        stats
      });

      send({ type: "step_complete", step: "final" });
      send({
        type: "complete",
        report,
        topics: supervisorResult.topics,
        stats
      });

      controller.close();
    } catch (error) {
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
  enableWebScraping: boolean
) {
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(formatSseEvent(event)));
      };

      const handler = createStreamHandler(send, controller);
      void handler(prompt, maxIterations, maxConcurrentResearchers, enableWebScraping);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
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
    Math.max(Number(searchParams.get("maxIterations") ?? 15), 1),
    30
  );
  const maxConcurrentResearchers = Math.min(
    Math.max(Number(searchParams.get("maxConcurrentResearchers") ?? 3), 1),
    5
  );
  const enableWebScraping = searchParams.get("enableWebScraping") !== "false";

  return createStreamResponse(
    prompt,
    maxIterations,
    maxConcurrentResearchers,
    enableWebScraping
  );
}

export async function POST(request: Request) {
  let payload: {
    prompt?: string;
    maxIterations?: number;
    maxConcurrentResearchers?: number;
    enableWebScraping?: boolean;
  };

  try {
    payload = await request.json();
  } catch (error) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = payload.prompt ?? "";

  if (!prompt) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  const maxIterations = Math.min(Math.max(payload.maxIterations ?? 15, 1), 30);
  const maxConcurrentResearchers = Math.min(
    Math.max(payload.maxConcurrentResearchers ?? 3, 1),
    5
  );
  const enableWebScraping = payload.enableWebScraping !== false;

  return createStreamResponse(
    prompt,
    maxIterations,
    maxConcurrentResearchers,
    enableWebScraping
  );
}
