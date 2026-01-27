"use client";

import { useEffect, useRef, useState } from "react";

export type StepStatus = "pending" | "running" | "done" | "error";

export interface ProgressStep {
  id: string;
  label: string;
  status: StepStatus;
  substeps: string[];
}

export interface TopicProgress {
  name: string;
  status: StepStatus;
  index: number;
  total: number;
  searchCount: number;
  currentSearch?: {
    index: number;
    query: string;
  };
}

export interface ActivityLogEntry {
  id: string;
  message: string;
  timestamp: number;
  level?: "info" | "success" | "error";
}

interface ProgressStepsProps {
  steps: ProgressStep[];
  topics: TopicProgress[];
  maxSearchIterations: number;
  activityLog: ActivityLogEntry[];
}

const TRUNCATE_LIMIT = 120;
const SCROLL_THRESHOLD = 24;

function truncateText(text: string, limit: number) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}...`;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function getStepClass(status: StepStatus) {
  return `progress-segment ${status}`;
}

export default function ProgressSteps({
  steps,
  topics,
  maxSearchIterations,
  activityLog
}: ProgressStepsProps) {
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [expandedLogEntries, setExpandedLogEntries] = useState<Record<string, boolean>>(
    {}
  );
  const logRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    const container = logRef.current;
    if (!container) return;
    if (!shouldAutoScrollRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [activityLog.length]);

  const handleLogScroll = () => {
    const container = logRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < SCROLL_THRESHOLD;
  };

  return (
    <section className="card">
      <h2>Progress</h2>
      <div className="progress-bar">
        {steps.map((step) => (
          <div key={step.id} className={getStepClass(step.status)}>
            <span className="progress-label">{step.label}</span>
          </div>
        ))}
      </div>

      <div className="progress-section">
        <div className="progress-section-title">Research topics</div>
        {topics.length === 0 ? (
          <div className="progress-empty">No topics yet.</div>
        ) : (
          <div className="topic-grid">
            {topics.map((topic) => {
              const topicKey = `${topic.index}-${topic.name}`;
              const isExpanded = expandedTopics[topicKey];
              const searchCount = Math.max(
                topic.searchCount,
                topic.currentSearch?.index ?? 0
              );
              const progressValue =
                topic.status === "done"
                  ? 100
                  : Math.min(
                      100,
                      Math.round((searchCount / maxSearchIterations) * 100)
                    );
              const hasToggle = topic.name.length > TRUNCATE_LIMIT;
              const displayName = isExpanded
                ? topic.name
                : truncateText(topic.name, TRUNCATE_LIMIT);

              return (
                <div key={topicKey} className="topic-card">
                  <div className="topic-header">
                    <span className="topic-meta">
                      Topic {topic.index}/{topic.total}
                    </span>
                    <span className={`topic-status ${topic.status}`}>
                      {topic.status === "running" && "In progress"}
                      {topic.status === "done" && "Completed"}
                      {topic.status === "error" && "Error"}
                      {topic.status === "pending" && "Pending"}
                    </span>
                  </div>
                  <div className="topic-title">
                    {displayName}
                    {hasToggle && (
                      <button
                        type="button"
                        className="truncate-toggle"
                        onClick={() =>
                          setExpandedTopics((prev) => ({
                            ...prev,
                            [topicKey]: !prev[topicKey]
                          }))
                        }
                      >
                        {isExpanded ? "Hide" : "Show full"}
                      </button>
                    )}
                  </div>
                  <div className="topic-progress">
                    <div className="topic-progress-track">
                      <div
                        className={`topic-progress-fill ${topic.status}`}
                        style={{ width: `${progressValue}%` }}
                      />
                    </div>
                    <span className="topic-progress-label">
                      Searches {Math.min(searchCount, maxSearchIterations)}/
                      {maxSearchIterations}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="progress-section">
        <div className="progress-section-title">Activity log</div>
        <div className="activity-log" ref={logRef} onScroll={handleLogScroll}>
          {activityLog.length === 0 ? (
            <div className="progress-empty">No activity yet.</div>
          ) : (
            activityLog.map((entry) => {
              const isExpanded = expandedLogEntries[entry.id];
              const hasToggle = entry.message.length > TRUNCATE_LIMIT;
              const displayMessage = isExpanded
                ? entry.message
                : truncateText(entry.message, TRUNCATE_LIMIT);

              return (
                <div
                  key={entry.id}
                  className={`activity-entry ${entry.level ?? "info"}`}
                >
                  <span className="activity-time">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span className="activity-message">
                    {displayMessage}
                    {hasToggle && (
                      <button
                        type="button"
                        className="truncate-toggle"
                        onClick={() =>
                          setExpandedLogEntries((prev) => ({
                            ...prev,
                            [entry.id]: !prev[entry.id]
                          }))
                        }
                      >
                        {isExpanded ? "Hide" : "Show full"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
