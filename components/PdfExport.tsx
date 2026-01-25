"use client";

interface ExportButtonsProps {
  targetId: string;
  markdown: string;
  filename?: string;
}

export default function ExportButtons({
  targetId,
  markdown,
  filename
}: ExportButtonsProps) {
  const baseFilename = filename ?? "deep-research-report";

  const handlePdfExport = async () => {
    const target = document.getElementById(targetId);
    if (!target) return;

    const html2pdf = (await import("html2pdf.js")).default;
    html2pdf()
      .from(target)
      .set({
        margin: 0.5,
        filename: `${baseFilename}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
      })
      .save();
  };

  const handleMarkdownExport = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${baseFilename}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="export-actions">
      <button onClick={handlePdfExport} className="btn btn-secondary">
        Download PDF
      </button>
      <button onClick={handleMarkdownExport} className="btn btn-secondary">
        Export Markdown
      </button>
    </div>
  );
}
