"use client";

import React from "react";

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

interface ProgressStepsProps {
  steps: ProgressStep[];
  topics: TopicProgress[];
  maxSearchIterations: number;
}

function statusIcon(status: StepStatus) {
  if (status === "done") return "✓";
  if (status === "error") return "✗";
  return "◌";
}

export default function ProgressSteps({
  steps,
  topics,
  maxSearchIterations
}: ProgressStepsProps) {
  return (
    <section className="card">
      <h2>Progress</h2>
      <div className="progress-list">
        {steps.map((step) => (
          <div key={step.id} className="progress-item">
            <div className="progress-row">
              <span className="status-icon">{statusIcon(step.status)}</span>
              <strong>{step.label}</strong>
              {step.status === "running" && <span className="spinner" />}
            </div>
            {step.substeps.length > 0 && (
              <div className="substep-list">
                {step.substeps.map((substep, index) => (
                  <div key={`${step.id}-sub-${index}`} className="substep">
                    {substep}
                  </div>
                ))}
              </div>
            )}
            {step.id === "research" && topics.length > 0 && (
              <div className="topic-list">
                {topics.map((topic) => (
                  <div key={topic.name} className="topic-item">
                    <div className="progress-row">
                      <span className="status-icon">
                        {statusIcon(topic.status)}
                      </span>
                      <span className="topic-title">
                        Topic {topic.index}/{topic.total}: {topic.name}
                      </span>
                      {topic.status === "running" && (
                        <span className="spinner" />
                      )}
                    </div>
                    {topic.currentSearch && (
                      <div className="substep">
                        Search {topic.currentSearch.index}/{maxSearchIterations}:{" "}
                        {topic.currentSearch.query}
                      </div>
                    )}
                    {topic.status === "done" && topic.searchCount > 0 && (
                      <div className="substep">
                        Completed {topic.searchCount} search
                        {topic.searchCount === 1 ? "" : "es"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
