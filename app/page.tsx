"use client";

import { useEffect, useRef, useState } from "react";
import ResearchForm from "../components/ResearchForm";
import ReportViewer from "../components/ReportViewer";
import ExportButtons from "../components/PdfExport";
import ProgressSteps, {
  ActivityLogEntry,
  ProgressStep,
  StepStatus,
  TopicProgress
} from "../components/ProgressSteps";
import { ResearchRecord, useResearchHistory } from "../hooks/useResearchHistory";
import { MAX_SEARCH_ITERATIONS } from "../lib/workflow/config";
import type { ProgressEvent } from "../lib/workflow/progress";
import {
  createResearchStats,
  mergeResearchStats,
  ResearchStats
} from "../lib/venice/stats";

const ESTIMATED_MINUTES_PER_ITERATION = 12;
const ESTIMATED_COST_PER_RESEARCHER = 0.015;
const THEME_STORAGE_KEY = "opendeepresearch-theme";
const STEP_LABELS: Record<string, string> = {
  brief: "research brief",
  draft: "draft report",
  research: "research",
  final: "final report"
};

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [maxIterations, setMaxIterations] = useState(5);
  const [maxConcurrentResearchers, setMaxConcurrentResearchers] = useState(3);
  const [enableWebScraping, setEnableWebScraping] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ResearchStats | null>(null);
  const [topicProgress, setTopicProgress] = useState<TopicProgress[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [historyPreview, setHistoryPreview] = useState<ResearchRecord | null>(
    null
  );
  const [pendingHistoryExportId, setPendingHistoryExportId] = useState<string | null>(
    null
  );
  const eventSourceRef = useRef<EventSource | null>(null);
  const logCounterRef = useRef(0);

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

  const { history, saveRecord, deleteRecord } = useResearchHistory();

  const estimateUnits = maxIterations * maxConcurrentResearchers;
  const estimateMultiplier = enableWebScraping ? 2 : 1;
  const parallelSpeedup = Math.sqrt(Math.max(1, maxConcurrentResearchers));
  const estimatedMinutes = Math.max(
    1,
    Math.round(
      ((maxIterations * ESTIMATED_MINUTES_PER_ITERATION) / parallelSpeedup) *
        estimateMultiplier
    )
  );
  const estimatedCost =
    estimateUnits * ESTIMATED_COST_PER_RESEARCHER * estimateMultiplier;

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
      return;
    }
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!pendingHistoryExportId || !historyPreview) return;
    if (historyPreview.id !== pendingHistoryExportId) return;
    const exportPreview = async () => {
      const target = document.getElementById("history-report");
      if (!target) return;
      const html2pdf = (await import("html2pdf.js")).default;
      html2pdf()
        .from(target)
        .set({
          margin: 0.5,
          filename: `deep-research-${historyPreview.id}.pdf`,
          html2canvas: { scale: 2 },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
        })
        .save();
    };

    const timeout = window.setTimeout(() => {
      void exportPreview();
      setPendingHistoryExportId(null);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [historyPreview, pendingHistoryExportId]);

  const setStepStatus = (id: string, status: StepStatus) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, status } : step))
    );
  };

  const resetSteps = () => {
    setSteps(initialSteps.map((step) => ({ ...step, substeps: [] })));
    setTopicProgress([]);
    setActivityLog([]);
    logCounterRef.current = 0;
  };

  const addLogEntry = (message: string, level: ActivityLogEntry["level"] = "info") => {
    setActivityLog((prev) => [
      ...prev,
      {
        id: `log-${logCounterRef.current++}`,
        message,
        timestamp: Date.now(),
        level
      }
    ]);
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

  const renderStatsSummary = (stats: ResearchStats) => (
    <>
      API calls: {stats.apiCalls} · Searches: {stats.searchCalls} · Scrapes: {" "}
      {stats.scrapingCalls} · Tokens: {stats.promptTokens + stats.completionTokens} · Est.
      cost: ~${stats.estimatedCost.toFixed(2)}
      {!stats.pricingIncludesModel ? " (search/scrape only)" : ""}
    </>
  );

  const handleProgressEvent = (event: ProgressEvent) => {
    switch (event.type) {
      case "step_start":
        setStepStatus(event.step, "running");
        if (event.message) {
          addLogEntry(event.message);
        }
        break;
      case "step_complete":
        setStepStatus(event.step, "done");
        addLogEntry(
          `Completed ${STEP_LABELS[event.step] ?? event.step}.`,
          "success"
        );
        break;
      case "substep":
        addLogEntry(event.message);
        break;
      case "topic_start":
        addLogEntry(
          `Topic ${event.topicIndex}/${event.totalTopics} started: ${event.topic}`
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
        addLogEntry(
          `Topic search ${event.searchIndex}/${MAX_SEARCH_ITERATIONS}: ${event.topic} · ${event.query}`
        );
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
        addLogEntry(
          `Topic completed ${event.searchCount} search${
            event.searchCount === 1 ? "" : "es"
          }: ${event.topic}`,
          "success"
        );
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
        addLogEntry("Research complete.", "success");
        void saveRecord({
          id: crypto.randomUUID(),
          prompt,
          report: event.report,
          stats: event.stats,
          createdAt: new Date().toISOString()
        });
        break;
      case "error":
        setError(event.message);
        addLogEntry(`Error: ${event.message}`, "error");
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

  const handleCancel = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoading(false);
    setError("Research cancelled by user");
    addLogEntry("Research cancelled by user.", "error");
    setSteps((prev) => {
      const running = prev.find((step) => step.status === "running");
      if (!running) return prev;
      return prev.map((step) =>
        step.id === running.id ? { ...step, status: "error" } : step
      );
    });
  };

  const handleHistoryExport = (entry: ResearchRecord) => {
    setHistoryPreview(entry);
    setPendingHistoryExportId(entry.id);
  };

  const handleHistoryDelete = async (entry: ResearchRecord) => {
    const confirmed = window.confirm(
      "Delete this saved report? This cannot be undone."
    );
    if (!confirmed) return;
    if (historyPreview?.id === entry.id) {
      setHistoryPreview(null);
    }
    await deleteRecord(entry.id);
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
    let accumulatedStats = createResearchStats();
    setStats(accumulatedStats);
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
      accumulatedStats = mergeResearchStats(accumulatedStats, briefData.stats);
      setStats(accumulatedStats);
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
      accumulatedStats = mergeResearchStats(accumulatedStats, draftData.stats);
      setStats(accumulatedStats);
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
      accumulatedStats = mergeResearchStats(accumulatedStats, supervisorData.stats);
      setStats(accumulatedStats);
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
      accumulatedStats = mergeResearchStats(accumulatedStats, finalData.stats);
      setStats(accumulatedStats);
      setStepStatus("final", "done");
      setReport(finalData.report);

      await saveRecord({
        id: crypto.randomUUID(),
        prompt,
        report: finalData.report,
        stats: accumulatedStats,
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
      <div className="page-header">
        <div>
          <h1>OpenDeepResesarch</h1>
          <p className="page-subtitle">
        Powered by Venice and Brave Search. OpenDeepResesarch is a fork of
            ThinkDepth.ai Deep Research. Original Python repo: {" "}
            <a
              href="https://github.com/thinkdepthai/Deep_Research?tab=readme-ov-file"
              target="_blank"
              rel="noreferrer"
            >
              thinkdepthai/Deep_Research
            </a>
            . This is a rewrite in TypeScript, using Venice and Brave, and hosted on
            Vercel. Other features and prompts have been changed as part of the fork.
            Code is here: {" "}
            <a
              href="https://github.com/wulfmeister/Deep_Research"
              target="_blank"
              rel="noreferrer"
            >
              wulfmeister/Deep_Research
            </a>
            .
          </p>
        </div>
        <label className="theme-toggle">
          <span className="theme-label">Dark mode</span>
          <input
            type="checkbox"
            className="theme-toggle-input"
            checked={theme === "dark"}
            onChange={(event) =>
              setTheme(event.target.checked ? "dark" : "light")
            }
          />
          <span className="theme-toggle-slider" />
        </label>
      </div>
      <ResearchForm
        prompt={prompt}
        onPromptChange={setPrompt}
        maxIterations={maxIterations}
        maxConcurrentResearchers={maxConcurrentResearchers}
        enableWebScraping={enableWebScraping}
        estimatedMinutes={estimatedMinutes}
        estimatedCost={estimatedCost}
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
        onCancel={handleCancel}
        loading={loading}
      />

      <ProgressSteps
        steps={steps}
        topics={topicProgress}
        maxSearchIterations={MAX_SEARCH_ITERATIONS}
        activityLog={activityLog}
      />

      {error && (
        <section className="card">
          <h2>Error</h2>
          <p>{error}</p>
        </section>
      )}

      <section className="card">
        <div className="section-header">
          <h2>Report</h2>
          {report && <ExportButtons targetId="report-content" markdown={report} />}
        </div>
        {report && stats && (
          <p className="report-meta">{renderStatsSummary(stats)}</p>
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
              <div className="history-actions">
                <button
                  onClick={() => setHistoryPreview(entry)}
                  className="btn btn-secondary"
                >
                  View Report
                </button>
                <button
                  onClick={() => handleHistoryExport(entry)}
                  className="btn btn-secondary"
                >
                  Export PDF
                </button>
                <button
                  onClick={() => handleHistoryDelete(entry)}
                  className="btn btn-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
        <p className="helper-text">
          Viewing a saved report will not interrupt a running research job.
        </p>
        {historyPreview && (
          <div className="history-preview-bar">
            <span className="helper-text">
              Showing saved report from {new Date(historyPreview.createdAt).toLocaleString()}.
            </span>
            {historyPreview.stats && (
              <span className="helper-text">
                {renderStatsSummary(historyPreview.stats)}
              </span>
            )}
            <button
              onClick={() => setHistoryPreview(null)}
              type="button"
              className="btn btn-secondary"
            >
              Clear Preview
            </button>
          </div>
        )}
      </section>

      {historyPreview && (
        <ReportViewer
          report={historyPreview.report}
          title="Saved Report Preview"
          targetId="history-report"
          showTitle
          headerActions={
            <ExportButtons
              targetId="history-report"
              markdown={historyPreview.report}
            />
          }
        />
      )}
    </main>
  );
}
