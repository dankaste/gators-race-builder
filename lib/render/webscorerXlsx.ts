import ExcelJS from "exceljs";
import type { RaceEvent, Rider } from "@/lib/engine/models";
import {
  toRelayWebScorerRows,
  toWebScorerRows,
  WEBSCORER_HEADERS,
  WEBSCORER_RELAY_HEADERS,
} from "@/lib/engine/export_webscorer";

/**
 * Render a WebScorer start list as a real .xlsx Blob.
 *
 * WebScorer's "Post start list from file" importer rejected our generated CSV
 * even though it was structurally valid; the same data imported fine as .xlsx.
 * Cause unknown, but .xlsx is the confirmed-working format. We hand it the exact
 * same rows the CSV exporter builds — one header row, then one row per rider.
 *
 * All values stay strings, so ExcelJS writes text cells and WebScorer never
 * reinterprets bibs/phones/ages as numbers.
 */
async function rowsToXlsx(
  headers: readonly string[],
  rows: Record<string, string>[],
  sheetName: string,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gators Race Director";
  const ws = wb.addWorksheet(sheetName.slice(0, 31)); // Excel sheet-name limit

  ws.addRow([...headers]);
  ws.getRow(1).font = { bold: true };

  for (const row of rows) {
    ws.addRow(headers.map((h) => row[h] ?? ""));
  }

  headers.forEach((h, i) => {
    const maxCell = Math.max(h.length, ...rows.map((r) => (r[h] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maxCell + 2, 6), 40);
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function toWebScorerXlsx(riders: Rider[], event: RaceEvent): Promise<Blob> {
  return rowsToXlsx(WEBSCORER_HEADERS, toWebScorerRows(riders, event), "Start List");
}

export function toRelayWebScorerXlsx(riders: Rider[], event: RaceEvent): Promise<Blob> {
  return rowsToXlsx(WEBSCORER_RELAY_HEADERS, toRelayWebScorerRows(riders, event), "Relay Start List");
}
