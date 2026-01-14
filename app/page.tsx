"use client";

import { useState } from "react";
import ResearchForm from "../components/ResearchForm";
import ReportViewer from "../components/ReportViewer";
import ExportButtons from "../components/PdfExport";
import { useResearchHistory } from "../hooks/useResearchHistory";
import {
  createResearchStats,
  mergeResearchStats,
  ResearchStats
} from "../lib/venice/stats";

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [maxIterations, setMaxIterations] = useState(15);
  const [maxConcurrentResearchers, setMaxConcurrentResearchers] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [stats, setStats] = useState<ResearchStats | null>(null);

  type StepStatus = "pending" | "running" | "done" | "error";

  interface Step {
    id: string;
    label: string;
    status: StepStatus;
  }

  const initialSteps: Step[] = [
    { id: "brief", label: "Generate research brief", status: "pending" },
    { id: "draft", label: "Write draft report", status: "pending" },
    { id: "research", label: "Run research", status: "pending" },
    { id: "final", label: "Generate final report", status: "pending" }
  ];

  const [steps, setSteps] = useState<Step[]>(initialSteps);

  const { history, saveRecord } = useResearchHistory();

  const setStepStatus = (id: string, status: StepStatus) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, status } : step))
    );
  };

  const resetSteps = () => {
    setSteps(initialSteps.map((step) => ({ ...step } as Step)));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setReport("");
    setTopics([]);
    setStats(createResearchStats());
    resetSteps();

    try {
      setStepStatus("brief", "running");
      const briefResponse = await fetch("/api/research/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      if (!briefResponse.ok) {
        throw new Error(await briefResponse.text());
      }

      const briefData = (await briefResponse.json()) as {
        researchBrief: string;
        stats: ResearchStats;
      };
      setStats((prev) =>
        mergeResearchStats(prev ?? createResearchStats(), briefData.stats)
      );
      setStepStatus("brief", "done");

      setStepStatus("draft", "running");
      const draftResponse = await fetch("/api/research/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ researchBrief: briefData.researchBrief })
      });

      if (!draftResponse.ok) {
        throw new Error(await draftResponse.text());
      }

      const draftData = (await draftResponse.json()) as {
        draftReport: string;
        stats: ResearchStats;
      };
      setStats((prev) =>
        mergeResearchStats(prev ?? createResearchStats(), draftData.stats)
      );
      setStepStatus("draft", "done");

      setStepStatus("research", "running");
      const supervisorResponse = await fetch("/api/research/supervisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          researchBrief: briefData.researchBrief,
          draftReport: draftData.draftReport,
          maxIterations,
          maxConcurrentResearchers
        })
      });

      if (!supervisorResponse.ok) {
        throw new Error(await supervisorResponse.text());
      }

      const supervisorData = (await supervisorResponse.json()) as {
        notes: string[];
        draftReport: string;
        topics: string[];
        stats: ResearchStats;
      };
      setStats((prev) =>
        mergeResearchStats(prev ?? createResearchStats(), supervisorData.stats)
      );
      setStepStatus("research", "done");
      setTopics(supervisorData.topics ?? []);

      setStepStatus("final", "running");
      const finalResponse = await fetch("/api/research/final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          researchBrief: briefData.researchBrief,
          draftReport: supervisorData.draftReport,
          findings: supervisorData.notes.join("\n")
        })
      });

      if (!finalResponse.ok) {
        throw new Error(await finalResponse.text());
      }

      const finalData = (await finalResponse.json()) as {
        report: string;
        stats: ResearchStats;
      };
      setStats((prev) =>
        mergeResearchStats(prev ?? createResearchStats(), finalData.stats)
      );
      setStepStatus("final", "done");
      setReport(finalData.report);

      await saveRecord({
        id: crypto.randomUUID(),
        prompt,
        report: finalData.report,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSteps((prev) => {
        const running = prev.find((step) => step.status === "running");
        if (!running) return prev;
        return prev.map((step) =>
          step.id === running.id ? { ...step, status: "error" } : step
        );
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h1>Deep Research (Venice)</h1>
      <ResearchForm
        prompt={prompt}
        onPromptChange={setPrompt}
        maxIterations={maxIterations}
        maxConcurrentResearchers={maxConcurrentResearchers}
        onSettingsChange={({ maxIterations, maxConcurrentResearchers }) => {
          setMaxIterations(maxIterations);
          setMaxConcurrentResearchers(maxConcurrentResearchers);
        }}
        onSubmit={handleSubmit}
        loading={loading}
      />

      <section className="card">
        <h2>Progress</h2>
        {steps.map((step) => (
          <div key={step.id} style={{ marginBottom: 8 }}>
            <strong>{step.label}</strong> — {step.status}
          </div>
        ))}
        {topics.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong>Topics</strong>
            <ul>
              {topics.map((topic, index) => (
                <li key={`${topic}-${index}`}>{topic}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {error && (
        <section className="card">
          <h2>Error</h2>
          <p>{error}</p>
        </section>
      )}

      <section className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Report</h2>
          {report && (
            <ExportButtons targetId="report-content" markdown={report} />
          )}
        </div>
        {report && stats && (
          <p style={{ marginTop: 12 }}>
            API calls: {stats.apiCalls} · Searches: {stats.searchCalls} · Tokens:
            {" "}
            {stats.promptTokens + stats.completionTokens} · Est. cost: ~$
            {stats.estimatedCost.toFixed(2)}
            {!stats.pricingIncludesModel ? " (search only)" : ""}
          </p>
        )}
      </section>

      <ReportViewer report={report} />

      <section className="card">
        <h2>History</h2>
        {history.length === 0 ? (
          <p>No saved reports yet.</p>
        ) : (
          history.map((entry) => (
            <div className="history-item" key={entry.id}>
              <strong>{new Date(entry.createdAt).toLocaleString()}</strong>
              <p>{entry.prompt}</p>
              <button onClick={() => setReport(entry.report)}>
                View Report
              </button>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
