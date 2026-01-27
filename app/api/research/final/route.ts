import { generateFinalReport } from "../../../../lib/workflow/report";
import { createResearchStats } from "../../../../lib/venice/stats";

export const runtime = "nodejs";

interface FinalRequest {
  researchBrief: string;
  draftReport: string;
  findings: string;
}

export async function POST(request: Request) {
  let body: FinalRequest;

  try {
    body = (await request.json()) as FinalRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.researchBrief || !body.draftReport) {
    return Response.json(
      { error: "Missing researchBrief or draftReport" },
      { status: 400 }
    );
  }

  try {
    const stats = createResearchStats();
    const report = await generateFinalReport({
      researchBrief: body.researchBrief,
      findings: body.findings ?? "",
      draftReport: body.draftReport,
      stats
    });

    return Response.json({ report, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
