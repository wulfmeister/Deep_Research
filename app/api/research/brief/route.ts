import { writeResearchBrief } from "../../../../lib/workflow/scope";
import { Message } from "../../../../lib/venice/types";
import { createResearchStats } from "../../../../lib/venice/stats";

export const runtime = "nodejs";

interface BriefRequest {
  prompt: string;
}

export async function POST(request: Request) {
  let body: BriefRequest;

  try {
    body = (await request.json()) as BriefRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.prompt) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  try {
    const stats = createResearchStats();
    const messages: Message[] = [{ role: "user", content: body.prompt }];
    const researchBrief = await writeResearchBrief(messages, undefined, stats);

    return Response.json({ researchBrief, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
