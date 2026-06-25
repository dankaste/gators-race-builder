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
