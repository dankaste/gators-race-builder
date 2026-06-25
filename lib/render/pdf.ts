import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { HandoutTable } from "@/lib/engine/handouts";

/** Render handout tables to a print-ready multi-page PDF Blob (one handout per page). */
export function handoutsToPdf(tables: HandoutTable[], docTitle: string): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  tables.forEach((table, i) => {
    if (i > 0) doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor("#496921");
    doc.text(`${docTitle} — ${table.title}`, 40, 40);

    autoTable(doc, {
      head: [table.headers],
      body: table.rows.map((r) => r.map((c) => String(c ?? ""))),
      startY: 56,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [73, 105, 33], textColor: 255 }, // Trail Gators green
      alternateRowStyles: { fillColor: [245, 247, 244] },
      margin: { left: 40, right: 40 },
    });
  });

  return doc.output("blob");
}
