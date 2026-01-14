"use client";

import { useState } from "react";
import ResearchForm from "../components/ResearchForm";
import ReportViewer from "../components/ReportViewer";
import PdfExport from "../components/PdfExport";
import { useResearchHistory } from "../hooks/useResearchHistory";

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [maxIterations, setMaxIterations] = useState(15);
  const [maxConcurrentResearchers, setMaxConcurrentResearchers] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const { history, saveRecord } = useResearchHistory();

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          maxIterations,
          maxConcurrentResearchers
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to run research");
      }

      const data = (await response.json()) as { report: string };
      setReport(data.report);

      await saveRecord({
        id: crypto.randomUUID(),
        prompt,
        report: data.report,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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

      {error && (
        <section className="card">
          <h2>Error</h2>
          <p>{error}</p>
        </section>
      )}

      <section className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Report</h2>
          {report && <PdfExport targetId="report-content" />}
        </div>
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
