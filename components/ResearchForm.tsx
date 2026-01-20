"use client";

interface ResearchFormProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  maxIterations: number;
  maxConcurrentResearchers: number;
  enableWebScraping: boolean;
  onSettingsChange: (settings: {
    maxIterations: number;
    maxConcurrentResearchers: number;
    enableWebScraping: boolean;
  }) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  loading: boolean;
}

export default function ResearchForm({
  prompt,
  onPromptChange,
  maxIterations,
  maxConcurrentResearchers,
  enableWebScraping,
  onSettingsChange,
  onSubmit,
  onCancel,
  loading
}: ResearchFormProps) {
  return (
    <section className="card">
      <h2>New Research</h2>
      <textarea
        rows={6}
        value={prompt}
        placeholder="Describe your research question..."
        onChange={(event) => onPromptChange(event.target.value)}
        style={{ width: "100%", marginBottom: 12, padding: 12 }}
      />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label>
          Max iterations
          <input
            type="number"
            min={1}
            max={30}
            value={maxIterations}
            onChange={(event) =>
              onSettingsChange({
                maxIterations: Number(event.target.value),
                maxConcurrentResearchers,
                enableWebScraping
              })
            }
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>
        <label>
          Parallel researchers
          <input
            type="number"
            min={1}
            max={5}
            value={maxConcurrentResearchers}
            onChange={(event) =>
              onSettingsChange({
                maxIterations,
                maxConcurrentResearchers: Number(event.target.value),
                enableWebScraping
              })
            }
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={enableWebScraping}
            onChange={(event) =>
              onSettingsChange({
                maxIterations,
                maxConcurrentResearchers,
                enableWebScraping: event.target.checked
              })
            }
          />
          Enable web scraping
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {loading && onCancel && (
            <button
              onClick={onCancel}
              type="button"
              style={{ padding: "8px 16px" }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={onSubmit}
            disabled={loading || !prompt.trim()}
            style={{ padding: "8px 16px" }}
          >
            {loading ? "Running..." : "Run Research"}
          </button>
        </div>
      </div>
    </section>
  );
}
