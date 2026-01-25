"use client";

interface ResearchFormProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  maxIterations: number;
  maxConcurrentResearchers: number;
  enableWebScraping: boolean;
  estimatedMinutes: number;
  estimatedCost: number;
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
  estimatedMinutes,
  estimatedCost,
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
        className="form-textarea"
      />
      <div className="settings-grid">
        <label className="settings-card">
          <span className="settings-label">Max iterations</span>
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
            className="settings-input"
          />
          <span className="settings-help">
            Supervisor cycles; higher means deeper research and more tool calls.
          </span>
          <span className="settings-limit">Max 30</span>
        </label>
        <label className="settings-card">
          <span className="settings-label">Parallel researchers</span>
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
            className="settings-input"
          />
          <span className="settings-help">
            Researchers per cycle; higher can speed up runs but adds API load.
          </span>
          <span className="settings-limit">Max 5</span>
        </label>
        <label className="settings-card settings-card-checkbox">
          <span className="settings-label">
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
              className="settings-checkbox"
            />
            Enable web scraping
          </span>
          <span className="settings-help">
            Scrapes URLs found in queries for more detail; can add latency, cost, and
            potentially overflow context windows (if scraping larger pages).
          </span>
        </label>
      </div>
      <div className="form-actions">
        {loading && onCancel && (
          <button onClick={onCancel} type="button" className="btn btn-secondary">
            Cancel
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={loading || !prompt.trim()}
          className="btn btn-primary"
        >
          {loading ? "Running..." : "Run Research"}
        </button>
      </div>
      <p className="form-estimate">
        Estimate: ~{estimatedMinutes} min · ~${estimatedCost.toFixed(2)} (search/scrape
        only)
      </p>
      <p className="form-note">
        Your research may take up to an hour - that is normal!
      </p>
    </section>
  );
}
