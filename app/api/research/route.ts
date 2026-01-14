import { writeDraftReport, writeResearchBrief } from "../../../lib/workflow/scope";
import { runSupervisor } from "../../../lib/workflow/supervisor";
import { generateFinalReport } from "../../../lib/workflow/report";
import { Message } from "../../../lib/venice/types";
import { SupervisorState } from "../../../lib/workflow/types";
import { createResearchStats } from "../../../lib/venice/stats";

export const runtime = "nodejs";

interface ResearchRequest {
  prompt: string;
  maxIterations?: number;
  maxConcurrentResearchers?: number;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ResearchRequest;

  if (!body.prompt) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  const maxIterations = Math.min(Math.max(body.maxIterations ?? 15, 1), 30);
  const maxConcurrentResearchers = Math.min(
    Math.max(body.maxConcurrentResearchers ?? 3, 1),
    5
  );

  const stats = createResearchStats();
  const messages: Message[] = [{ role: "user", content: body.prompt }];

  const researchBrief = await writeResearchBrief(messages, undefined, stats);
  const draftReport = await writeDraftReport(researchBrief, undefined, stats);

  const initialSupervisorState: SupervisorState = {
    supervisorMessages: [
      {
        role: "user",
        content: `Research brief:\n${researchBrief}`
      },
      {
        role: "user",
        content: `Draft report:\n${draftReport}`
      }
    ],
    researchBrief,
    notes: [],
    rawNotes: [],
    researchIterations: 0,
    draftReport
  };

  const supervisorResult = await runSupervisor(
    initialSupervisorState,
    {
      maxIterations,
      maxConcurrentResearchers
    },
    stats
  );

  const findings = supervisorResult.notes.join("\n");
  const finalReport = await generateFinalReport({
    researchBrief,
    findings,
    draftReport: supervisorResult.draftReport ?? draftReport,
    stats
  });

  return Response.json({
    report: finalReport,
    researchBrief,
    draftReport: supervisorResult.draftReport ?? draftReport,
    topics: supervisorResult.topics,
    stats
  });
}
