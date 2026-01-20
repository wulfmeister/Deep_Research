"use client";

import { useEffect, useRef, useState } from "react";
import ResearchForm from "../components/ResearchForm";
import ReportViewer from "../components/ReportViewer";
import ExportButtons from "../components/PdfExport";
import ProgressSteps, {
  ProgressStep,
  StepStatus,
  TopicProgress
} from "../components/ProgressSteps";
import { useResearchHistory } from "../hooks/useResearchHistory";
import { MAX_SEARCH_ITERATIONS } from "../lib/workflow/config";
import type { ProgressEvent } from "../lib/workflow/progress";
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
  const [enableWebScraping, setEnableWebScraping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ResearchStats | null>(null);
  const [topicProgress, setTopicProgress] = useState<TopicProgress[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const initialSteps: ProgressStep[] = [
    {
      id: "brief",
      label: "Generate research brief",
      status: "pending",
      substeps: []
    },
    { id: "draft", label: "Write draft report", status: "pending", substeps: [] },
    { id: "research", label: "Run research", status: "pending", substeps: [] },
    {
      id: "final",
      label: "Generate final report",
      status: "pending",
      substeps: []
    }
  ];

  const [steps, setSteps] = useState<ProgressStep[]>(initialSteps);

  const { history, saveRecord } = useResearchHistory();

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const setStepStatus = (id: string, status: StepStatus) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, status } : step))
    );
  };

  const resetSteps = () => {
    setSteps(initialSteps.map((step) => ({ ...step, substeps: [] })));
    setTopicProgress([]);
  };

  const addSubstep = (stepId: string, message: string) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id !== stepId) return step;
        if (step.substeps.includes(message)) return step;
        return { ...step, substeps: [...step.substeps, message] };
      })
    );
  };

  const updateTopic = (
    topic: string,
    update: (current: TopicProgress | undefined) => TopicProgress
  ) => {
    setTopicProgress((prev) => {
      const existing = prev.find((entry) => entry.name === topic);
      const updated = update(existing);
      if (existing) {
        return prev.map((entry) => (entry.name === topic ? updated : entry));
      }
      return [...prev, updated];
    });
  };

  const handleProgressEvent = (event: ProgressEvent) => {
    switch (event.type) {
      case "step_start":
        setStepStatus(event.step, "running");
        if (event.message) {
          addSubstep(event.step, event.message);
        }
        break;
      case "step_complete":
        setStepStatus(event.step, "done");
        break;
      case "substep":
        addSubstep(event.step, event.message);
        break;
      case "topic_start":
        addSubstep(
          "research",
          `Running searches across ${event.totalTopics} topic${
            event.totalTopics === 1 ? "" : "s"
          }`
        );
        updateTopic(event.topic, (current) => ({
          name: event.topic,
          status: current?.status ?? "running",
          index: event.topicIndex,
          total: event.totalTopics,
          searchCount: current?.searchCount ?? 0,
          currentSearch: current?.currentSearch
        }));
        break;
      case "topic_search":
        updateTopic(event.topic, (current) => ({
          name: event.topic,
          status: "running",
          index: current?.index ?? 1,
          total: current?.total ?? 1,
          searchCount: Math.max(current?.searchCount ?? 0, event.searchIndex),
          currentSearch: { index: event.searchIndex, query: event.query }
        }));
        break;
      case "topic_complete":
        updateTopic(event.topic, (current) => ({
          name: event.topic,
          status: "done",
          index: current?.index ?? 1,
          total: current?.total ?? 1,
          searchCount: event.searchCount,
          currentSearch: undefined
        }));
        break;
      case "complete":
        setStats(event.stats);
        setReport(event.report);
        setLoading(false);
        void saveRecord({
          id: crypto.randomUUID(),
          prompt,
          report: event.report,
          createdAt: new Date().toISOString()
        });
        break;
      case "error":
        setError(event.message);
        setSteps((prev) => {
          const running = prev.find((step) => step.status === "running");
          if (!running) return prev;
          return prev.map((step) =>
            step.id === running.id ? { ...step, status: "error" } : step
          );
        });
        setLoading(false);
        break;
      default:
        break;
    }
  };

  const handleStreamingSubmit = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setLoading(true);
    setError(null);
    setReport("");
    setStats(createResearchStats());
    resetSteps();

    const params = new URLSearchParams({
      prompt,
      maxIterations: String(maxIterations),
      maxConcurrentResearchers: String(maxConcurrentResearchers),
      enableWebScraping: String(enableWebScraping)
    });

    const eventSource = new EventSource(`/api/research/stream?${params}`);
    eventSourceRef.current = eventSource;
    let receivedEvent = false;

    eventSource.onmessage = (message) => {
      receivedEvent = true;
      const data = JSON.parse(message.data) as ProgressEvent;
      handleProgressEvent(data);

      if (data.type === "complete" || data.type === "error") {
        eventSource.close();
        eventSourceRef.current = null;
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      if (!receivedEvent) {
        void handleSubmit();
        return;
      }
      setError("Streaming connection lost. Please retry.");
      setLoading(false);
    };
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setReport("");
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
          maxConcurrentResearchers,
          enableWebScraping
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
      const completedTopics = supervisorData.topics ?? [];
      setTopicProgress(
        completedTopics.map((topic, index) => ({
          name: topic,
          status: "done",
          index: index + 1,
          total: completedTopics.length,
          searchCount: 0
        }))
      );

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
        enableWebScraping={enableWebScraping}
        onSettingsChange={({
          maxIterations,
          maxConcurrentResearchers,
          enableWebScraping
        }) => {
          setMaxIterations(maxIterations);
          setMaxConcurrentResearchers(maxConcurrentResearchers);
          setEnableWebScraping(enableWebScraping);
        }}
        onSubmit={handleStreamingSubmit}
        loading={loading}
      />

      <ProgressSteps
        steps={steps}
        topics={topicProgress}
        maxSearchIterations={MAX_SEARCH_ITERATIONS}
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
          {report && (
            <ExportButtons targetId="report-content" markdown={report} />
          )}
        </div>
        {report && stats && (
          <p style={{ marginTop: 12 }}>
            API calls: {stats.apiCalls} · Searches: {stats.searchCalls} · Scrapes: {" "}
            {stats.scrapingCalls} · Tokens: {stats.promptTokens + stats.completionTokens} · Est.
            cost: ~${stats.estimatedCost.toFixed(2)}
            {!stats.pricingIncludesModel ? " (search/scrape only)" : ""}
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
