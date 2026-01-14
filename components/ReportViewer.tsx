"use client";

import { useMemo } from "react";

interface ReportViewerProps {
  report: string;
}

type Chunk =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string };

function parseReport(report: string): Chunk[] {
  const lines = report.split("\n");
  const chunks: Chunk[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      chunks.push({
        type: "paragraph",
        text: paragraphLines.join(" ")
      });
      paragraphLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph();
      chunks.push({ type: "heading", level: 3, text: trimmed.slice(4) });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushParagraph();
      chunks.push({ type: "heading", level: 2, text: trimmed.slice(3) });
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushParagraph();
      chunks.push({ type: "heading", level: 1, text: trimmed.slice(2) });
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  return chunks;
}

export default function ReportViewer({ report }: ReportViewerProps) {
  const chunks = useMemo(() => parseReport(report), [report]);

  if (!report) {
    return (
      <section className="card">
        <h2>Report</h2>
        <p>No report yet.</p>
      </section>
    );
  }

  return (
    <section className="card report" id="report-content">
      {chunks.map((chunk, index) => {
        if (chunk.type === "heading") {
          const HeadingTag =
            chunk.level === 1 ? "h1" : chunk.level === 2 ? "h2" : "h3";
          return <HeadingTag key={index}>{chunk.text}</HeadingTag>;
        }
        return <p key={index}>{chunk.text}</p>;
      })}
    </section>
  );
}
