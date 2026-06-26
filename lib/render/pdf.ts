import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { HandoutTable } from "@/lib/engine/handouts";

const GREEN: [number, number, number] = [73, 105, 33]; // Trail Gators green
const ALT: [number, number, number] = [245, 247, 244];
const BASE = {
  styles: { fontSize: 8, cellPadding: 3 },
  headStyles: { fillColor: GREEN, textColor: 255 },
  alternateRowStyles: { fillColor: ALT },
  margin: { left: 40, right: 40 },
} as const;

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function title(doc: jsPDF, text: string): number {
  doc.setFontSize(14);
  doc.setTextColor("#496921");
  doc.text(text, 40, 40);
  return 56;
}

/** Render handout tables to a print-ready multi-page PDF Blob (one handout per page). */
export function handoutsToPdf(tables: HandoutTable[], docTitle: string): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  tables.forEach((table, i) => {
    if (i > 0) doc.addPage();
    const heading = `${docTitle} — ${table.title}`;
    if (table.rowGroups && table.rowGroups.length === table.rows.length) {
      drawGroupedStager(doc, table, heading);
    } else {
      const startY = title(doc, heading);
      autoTable(doc, { head: [table.headers], body: table.rows.map((r) => r.map((c) => String(c ?? ""))), startY, ...BASE });
    }
  });

  return doc.output("blob");
}

/**
 * Wave-stager renderer: each wave is drawn as its own block so it never splits
 * across a page (waves are small). A bold rule separates waves; within a
 * combined (multi-category) wave a dashed rule separates the categories.
 */
function drawGroupedStager(doc: jsPDF, table: HandoutTable, heading: string) {
  const groups = table.rowGroups!;
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const bottom = 40;
  const ROW_H = 15; // generous estimate for fit checks
  const HEAD_H = 18;

  // Partition rows into waves (consecutive rows sharing a wave key).
  type Block = { wave: string | number; rows: string[][]; cats: string[] };
  const blocks: Block[] = [];
  table.rows.forEach((row, idx) => {
    const g = groups[idx];
    const last = blocks[blocks.length - 1];
    if (!last || last.wave !== g.wave) {
      blocks.push({ wave: g.wave, rows: [], cats: [] });
    }
    const cur = blocks[blocks.length - 1];
    cur.rows.push(row.map((c) => String(c ?? "")));
    cur.cats.push(g.category);
  });

  let startY = title(doc, heading);
  let headerShown = false;
  let firstOnPage = true;

  for (const block of blocks) {
    const needHead = !headerShown;
    const estH = (needHead ? HEAD_H : 0) + block.rows.length * ROW_H + 6;
    if (!firstOnPage && startY + estH > pageH - bottom) {
      doc.addPage();
      startY = title(doc, heading);
      headerShown = false;
      firstOnPage = true;
    }

    // Bold rule between waves (skip the first block on a page).
    if (!firstOnPage) {
      doc.setDrawColor(26, 29, 24);
      doc.setLineWidth(1.4);
      doc.line(40, startY, pageW - 40, startY);
      startY += 4;
    }

    const cats = block.cats;
    autoTable(doc, {
      head: headerShown ? undefined : [table.headers],
      body: block.rows,
      startY,
      ...BASE,
      // Dashed rule where the category changes within this combined wave.
      willDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const ri = data.row.index;
        if (ri > 0 && cats[ri] !== cats[ri - 1]) {
          const y = data.cell.y;
          doc.setDrawColor(138, 143, 132);
          doc.setLineWidth(0.8);
          doc.setLineDashPattern([2, 2], 0);
          doc.line(40, y, pageW - 40, y);
          doc.setLineDashPattern([], 0);
        }
      },
    });

    startY = finalY(doc);
    headerShown = true;
    firstOnPage = false;
  }
}
