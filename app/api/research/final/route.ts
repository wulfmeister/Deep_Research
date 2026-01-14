import { generateFinalReport } from "../../../../lib/workflow/report";
import { createResearchStats } from "../../../../lib/venice/stats";

export const runtime = "nodejs";

interface FinalRequest {
  researchBrief: string;
  draftReport: string;
  findings: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as FinalRequest;

  if (!body.researchBrief || !body.draftReport) {
    return Response.json(
      { error: "Missing researchBrief or draftReport" },
      { status: 400 }
    );
  }

  const stats = createResearchStats();
  const report = await generateFinalReport({
    researchBrief: body.researchBrief,
    findings: body.findings ?? "",
    draftReport: body.draftReport,
    stats
  });

  return Response.json({ report, stats });
}
