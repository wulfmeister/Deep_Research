import { writeDraftReport } from "../../../../lib/workflow/scope";
import { createResearchStats } from "../../../../lib/venice/stats";

export const runtime = "nodejs";

interface DraftRequest {
  researchBrief: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as DraftRequest;

  if (!body.researchBrief) {
    return Response.json({ error: "Missing researchBrief" }, { status: 400 });
  }

  const stats = createResearchStats();
  const draftReport = await writeDraftReport(body.researchBrief, undefined, stats);
  return Response.json({ draftReport, stats });
}
