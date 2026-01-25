import { runSupervisor } from "../../../../lib/workflow/supervisor";
import { SupervisorState } from "../../../../lib/workflow/types";
import { createResearchStats } from "../../../../lib/venice/stats";

export const runtime = "nodejs";

interface SupervisorRequest {
  researchBrief: string;
  draftReport: string;
  maxIterations?: number;
  maxConcurrentResearchers?: number;
  enableWebScraping?: boolean;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SupervisorRequest;

  if (!body.researchBrief || !body.draftReport) {
    return Response.json(
      { error: "Missing researchBrief or draftReport" },
      { status: 400 }
    );
  }

  const maxIterations = Math.min(Math.max(body.maxIterations ?? 2, 1), 10);
  const maxConcurrentResearchers = Math.min(
    Math.max(body.maxConcurrentResearchers ?? 5, 1),
    5
  );

  const stats = createResearchStats();
  const initialSupervisorState: SupervisorState = {
    supervisorMessages: [
      { role: "user", content: `Research brief:\n${body.researchBrief}` },
      { role: "user", content: `Draft report:\n${body.draftReport}` }
    ],
    researchBrief: body.researchBrief,
    notes: [],
    rawNotes: [],
    researchIterations: 0,
    draftReport: body.draftReport
  };

  const supervisorResult = await runSupervisor(
    initialSupervisorState,
    {
      maxIterations,
      maxConcurrentResearchers,
      enableWebScraping: body.enableWebScraping ?? true
    },
    stats
  );

  return Response.json({
    notes: supervisorResult.notes,
    draftReport: supervisorResult.draftReport,
    topics: supervisorResult.topics,
    stats
  });
}
