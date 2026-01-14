# Deep Research (Venice + Next.js)

This project ports the original ThinkDepth deep-research workflow to a Venice-powered Next.js app.
Legacy Python code is preserved under `python_reference/` for reference.

## Local setup

1. Install dependencies:

```
npm install
```

2. Create a `.env.local` file with your Venice API key:

```
VENICE_API_KEY=your_api_key_here
```

3. Run the app:

```
npm run dev
```

Open `http://localhost:3000`.

## Notes
- The UI is intentionally minimal (single prompt + report view).
- Reports are stored locally in IndexedDB.
- PDF export uses `html2pdf.js`.
