# AGENTS.md

## Scope
- Repository root instructions apply to all files.
- No nested AGENTS.md files exist yet.
- No Cursor or Copilot rule files detected.

## Project summary
- Next.js 14 + TypeScript app using the App Router.
- UI is minimal: `app/page.tsx` renders the research flow.
- API routes live under `app/api` and call Venice APIs.
- Legacy Python reference code lives in `python_reference/`.

## Environment
- Requires Node.js and npm.
- Needs `VENICE_API_KEY` in `.env.local`.
- Optional: `VENICE_DEBUG=1` to log citations.

## Install
- `npm install`

## Run (development)
- `npm run dev`
- Default port is `http://localhost:3000` (Next may use 3001 if busy).

## Build
- `npm run build`
- `npm run start`

## Lint
- `npm run lint`
- Single file lint: `npm run lint -- --file app/page.tsx`

## Tests
- No test runner configured in `package.json`.
- If you add tests, document the runner and single-test command here.
- For now, use manual verification via the UI and API routes.

## Formatting
- No explicit formatter config is present.
- Follow existing formatting patterns in the file being edited.
- Keep indentation at 2 spaces.
- Use semicolons.
- Use double quotes for strings and JSX attributes.

## Imports
- Order imports: external packages first, then internal relative imports.
- Keep imports grouped without extra blank lines unless it improves clarity.
- Prefer named imports for utilities, default imports for components.

## TypeScript
- `strict: true` in `tsconfig.json`; avoid `any`.
- Use explicit types for public APIs and exported functions.
- Prefer `interface` for React props and object shapes.
- Use `type` for unions and simple aliases.
- Avoid non-null assertions unless absolutely necessary.

## React / Next.js
- Use functional components and hooks.
- Add `"use client"` at the top of client components.
- Keep components in `components/` and hooks in `hooks/`.
- Keep API logic in `app/api` and workflow logic in `lib/`.
- Prefer `useState`/`useMemo`/`useCallback` only when necessary.

## State and data flow
- UI state stays in `app/page.tsx` unless it needs reuse.
- Persist history through `hooks/useResearchHistory` (IndexedDB).
- Keep API responses typed and validated.

## Error handling
- Check `response.ok` for fetch calls and throw meaningful errors.
- Catch errors at the top-level UI flow to display messages.
- Return structured error responses from API routes when possible.
- Avoid swallowing errors; log only when `VENICE_DEBUG=1`.

## API routes
- API handlers live in `app/api/**/route.ts`.
- Use `NextResponse.json` for consistent JSON responses.
- Validate required payload fields before calling Venice.
- Return non-200 statuses with `error` payloads.
- Keep handlers `async` and avoid side effects.
- Prefer reusing workflow helpers in `lib/workflow`.

## Report rendering
- Markdown rendering lives in `components/ReportViewer.tsx`.
- Keep citation parsing isolated to the viewer component.
- Preserve the `Sources` section formatting for linking.
- Avoid adding heavy Markdown plugins without need.

## Venice API usage
- Client lives in `lib/venice/client.ts`.
- Types in `lib/venice/types.ts` and stats in `lib/venice/stats.ts`.
- Use `DEFAULT_MODEL` from `lib/workflow/config` unless overridden.
- When using web search, pass `venice_parameters.web_search`.

## Prompts
- Prompts are centralized in `lib/prompts.ts`.
- Keep prompt text verbatim unless explicitly changing behavior.
- Use `formatPrompt` helpers for substitutions.

## Workflow
- The workflow is sequential: brief -> draft -> supervisor -> final.
- Supervisor delegates research tasks via tool calls (ConductResearch).
- Research batching obeys `maxConcurrentResearchers`.
- Avoid changing flow order unless requested.

## Researcher agent
- Each researcher runs a tool-calling loop in `lib/workflow/researcher.ts`.
- Tools available: `web_search` (Venice search) and `think_tool` (reflection).
- Max 5 search iterations per topic (`MAX_SEARCH_ITERATIONS` in config).
- After loop completes, findings are compressed via `compressResearchSystemPrompt`.
- Each `web_search` call is a separate Venice API call with Brave search enabled.
- Citations from all searches are aggregated and deduplicated.

## UI conventions
- Use Tailwind utility classes for layout/styling.
- Keep markup minimal and readable.
- Prefer semantic elements (`section`, `main`, `h1`/`h2`).
- Keep export logic in `components/PdfExport.tsx`.

## Naming conventions
- Use `camelCase` for variables and functions.
- Use `PascalCase` for components and types.
- Use descriptive names; avoid one-letter identifiers.
- Use `const` by default; `let` only when reassigning.

## File organization
- `app/`: routes and API handlers.
- `components/`: UI components.
- `hooks/`: reusable hooks.
- `lib/`: core logic, prompts, Venice client.
- `python_reference/`: legacy code only.

## Dependency notes
- `react-markdown` + `remark-gfm` for report rendering.
- `html2pdf.js` for PDF exports.
- Tailwind v4 with `@tailwindcss/postcss`.

## Updating docs
- Update `README.md` only when user-facing setup changes.
- Do not add new docs unless requested.

## Verification checklist
- Run `npm run lint` for static checks.
- Manually verify the UI flow if behavior changes.
- Confirm API routes respond with expected JSON shapes.

## Common paths
- `app/page.tsx`: main UI state and flow.
- `app/api/research/**/route.ts`: API endpoints.
- `lib/workflow/`: research orchestration helpers.
- `lib/venice/`: Venice client/types/stats.
- `hooks/useResearchHistory.ts`: IndexedDB history.

## Cursor/Copilot rules
- None found under `.cursor/` or `.github/copilot-instructions.md`.
- If added later, mirror them here.
