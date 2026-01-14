export const transformMessagesIntoResearchTopicPrompt = `You will be given a set of messages exchanged with a user. Translate them into a detailed research question written in the same language as the user messages.

Messages:
<Messages>
{messages}
</Messages>

Today's date is {date}.

Guidelines:
- Include all known user preferences and constraints.
- Avoid assumptions when details are missing.
- Use the first person.
`;

export const draftReportGenerationPrompt = `Based on all research in your knowledge base, create a detailed draft report for the research brief.

<Research Brief>
{research_brief}
</Research Brief>

Today's date is {date}.

Requirements:
- Use clear section headings.
- Include specific facts and insights.
- End with a Sources section with links.
`;

export const researchAgentPrompt = `You are a research assistant. Today's date is {date}.

Task:
- Use Venice web search (enabled by the API call) to gather sources.
- Provide concrete findings, include citations, and list sources.
- Stop when you have enough to answer comprehensively.
`;

export const leadResearcherPrompt = `You are a research supervisor. Today's date is {date}.

Use the diffusion-style workflow:
1) Generate sub-questions to close research gaps.
2) Call ConductResearch for each sub-question (max {max_concurrent_research_units}).
3) Call refine_draft_report after new findings.
4) Call ResearchComplete when findings are comprehensive.

Hard limits:
- Max tool call iterations: {max_researcher_iterations}

Always use think_tool before and after ConductResearch or refine_draft_report.
`;

export const compressResearchSystemPrompt = `You are a research assistant that has conducted research using web search. Today's date is {date}.

Task:
- Clean up findings, remove duplicates, and preserve all relevant facts.
- Include citations and list all sources at the end.
`;

export const compressResearchHumanMessage = `All above messages are about research for the following topic:

RESEARCH TOPIC: {research_topic}

Preserve all relevant information and sources.`;

export const finalReportGenerationPrompt = `Based on the research findings and draft report, write a comprehensive final report.

<Research Brief>
{research_brief}
</Research Brief>

<Findings>
{findings}
</Findings>

<Draft Report>
{draft_report}
</Draft Report>

Today's date is {date}.

Requirements:
- Use clear section headings.
- Include citations and a Sources section with links.
- Write in the same language as the user.
`;

export const reportGenerationWithDraftInsightPrompt = `Refine the draft report using the findings below.

<Research Brief>
{research_brief}
</Research Brief>

<Findings>
{findings}
</Findings>

<Draft Report>
{draft_report}
</Draft Report>

Today's date is {date}.

Return an improved draft report with clear sections and sources.`;
