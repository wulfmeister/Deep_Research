"use client";

interface PdfExportProps {
  targetId: string;
  filename?: string;
}

export default function PdfExport({ targetId, filename }: PdfExportProps) {
  const handleExport = async () => {
    const target = document.getElementById(targetId);
    if (!target) return;

    const html2pdf = (await import("html2pdf.js")).default;
    html2pdf()
      .from(target)
      .set({
        margin: 0.5,
        filename: filename ?? "deep-research-report.pdf",
        html2canvas: { scale: 2 },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
      })
      .save();
  };

  return (
    <button onClick={handleExport} style={{ padding: "6px 12px" }}>
      Download PDF
    </button>
  );
}
