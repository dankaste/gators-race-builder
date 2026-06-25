/** Trigger a client-side file download from in-memory content. */
export function downloadText(content: string, filename: string, type = "text/csv") {
  downloadBlob(new Blob([content], { type }), filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
