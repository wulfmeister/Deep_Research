import { writeResearchBrief } from "../../../../lib/workflow/scope";
import { Message } from "../../../../lib/venice/types";
import { createResearchStats } from "../../../../lib/venice/stats";

export const runtime = "nodejs";

interface BriefRequest {
  prompt: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as BriefRequest;

  if (!body.prompt) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  const stats = createResearchStats();
  const messages: Message[] = [{ role: "user", content: body.prompt }];
  const researchBrief = await writeResearchBrief(messages, undefined, stats);

  return Response.json({ researchBrief, stats });
}
