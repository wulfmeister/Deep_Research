"use client";

import React, { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReportViewerProps {
  report: string;
  targetId?: string;
  title?: string;
  showTitle?: boolean;
  headerActions?: ReactNode;
}

const citationRegex = /\^(\d+(?:,\d+)*)|\[(\d+(?:,\d+)*)\]/g;

function extractSources(report: string) {
  const sources: Record<string, string> = {};
  const lines = report.split("\n");
  const sourcesIndex = lines.findIndex((line) =>
    line.trim().toLowerCase().startsWith("# sources") ||
    line.trim().toLowerCase().startsWith("## sources") ||
    line.trim().toLowerCase().startsWith("### sources")
  );

  if (sourcesIndex === -1) return sources;

  for (let index = sourcesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("#")) break;
    const match = line.match(/^[-*]?\s*\[?(\d+)\]?[\.)]?\s+.*?(https?:\/\/\S+)/i);
    if (match) {
      sources[match[1]] = match[2];
    }
  }

  return sources;
}

function isSourceLine(text: string) {
  const trimmed = text.trim();
  return (
    (/^\[\d+\]/.test(trimmed) ||
      /^\d+\./.test(trimmed) ||
      /^[-*]\s*\[\d+\]/.test(trimmed) ||
      /^[-*]\s*\d+\./.test(trimmed)) &&
    /https?:\/\//.test(text)
  );
}

function replaceCitations(text: string, sources: Record<string, string>) {
  if (isSourceLine(text)) return text;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let keyIndex = 0;

  text.replace(citationRegex, (match, caretGroup, bracketGroup, offset) => {
    const group = caretGroup ?? bracketGroup;
    if (!group) return match;

    parts.push(text.slice(lastIndex, offset));
    const numbers = group.split(",").map((value: string) => value.trim());
    parts.push(
      <sup key={`citation-${keyIndex++}`} className="text-sm text-slate-500">
        {numbers.map((number: string, index: number) => {
          const href = sources[number] ?? "#sources";
          return (
            <React.Fragment key={`cite-${number}-${index}`}>
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noreferrer" : undefined}
                className="underline"
              >
                {number}
              </a>
              {index < numbers.length - 1 ? "," : ""}
            </React.Fragment>
          );
        })}
      </sup>
    );
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 0 ? text : parts;
}

function enhanceNode(node: ReactNode, sources: Record<string, string>): ReactNode {
  if (typeof node === "string") {
    return replaceCitations(node, sources);
  }

  if (Array.isArray(node)) {
    return node.flatMap((child, index) => (
      <React.Fragment key={`node-${index}`}>
        {enhanceNode(child, sources)}
      </React.Fragment>
    ));
  }

  if (React.isValidElement(node)) {
    return React.cloneElement(node, {
      ...node.props,
      children: enhanceNode(node.props.children, sources)
    });
  }

  return node;
}

export default function ReportViewer({
  report,
  targetId = "report-content",
  title = "Report",
  showTitle = false,
  headerActions
}: ReportViewerProps) {
  if (!report) {
    return (
      <section className="card">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p>No report yet.</p>
      </section>
    );
  }

  const sources = extractSources(report);

  return (
    <section className="card" id={targetId}>
      {(showTitle || headerActions) && (
        <div className="section-header report-viewer-header">
          {showTitle ? (
            <h2>{title}</h2>
          ) : (
            <span />
          )}
          {headerActions}
        </div>
      )}
      <div className="prose prose-slate max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p>{enhanceNode(children, sources)}</p>,
            li: ({ children }) => <li>{enhanceNode(children, sources)}</li>,
            h1: ({ children }) => {
              const text = String(children).trim();
              return (
                <h1 id={text.toLowerCase() === "sources" ? "sources" : undefined}>
                  {enhanceNode(children, sources)}
                </h1>
              );
            },
            h2: ({ children }) => {
              const text = String(children).trim();
              return (
                <h2 id={text.toLowerCase() === "sources" ? "sources" : undefined}>
                  {enhanceNode(children, sources)}
                </h2>
              );
            },
            h3: ({ children }) => {
              const text = String(children).trim();
              return (
                <h3 id={text.toLowerCase() === "sources" ? "sources" : undefined}>
                  {enhanceNode(children, sources)}
                </h3>
              );
            },
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          }}
        >
          {report}
        </ReactMarkdown>
      </div>
    </section>
  );
}
