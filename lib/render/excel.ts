import ExcelJS from "exceljs";
import type { HandoutTable } from "@/lib/engine/handouts";

/** Render handout tables to a styled multi-sheet .xlsx Blob (one sheet per handout). */
export async function handoutsToXlsx(tables: HandoutTable[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gators Race Director";

  for (const table of tables) {
    const ws = wb.addWorksheet(table.title.slice(0, 31)); // Excel sheet-name limit
    ws.addRow(table.headers);
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF496921" } };
    header.alignment = { vertical: "middle" };

    for (const row of table.rows) ws.addRow(row);

    // Wave stager: rule between waves (medium top border) and between categories
    // within a combined wave (dashed top border), mirroring the PDF.
    const groups = table.rowGroups;
    if (groups && groups.length === table.rows.length) {
      for (let i = 1; i < groups.length; i++) {
        const style =
          groups[i].wave !== groups[i - 1].wave
            ? ("medium" as const)
            : groups[i].category !== groups[i - 1].category
              ? ("dashed" as const)
              : null;
        if (!style) continue;
        ws.getRow(i + 2).eachCell((cell) => {
          cell.border = { ...cell.border, top: { style } };
        });
      }
    }

    table.headers.forEach((h, i) => {
      const maxCell = Math.max(
        h.length,
        ...table.rows.map((r) => String(r[i] ?? "").length),
      );
      ws.getColumn(i + 1).width = Math.min(Math.max(maxCell + 2, 6), 40);
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
