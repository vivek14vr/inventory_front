/** Opens a print-ready HTML document. Avoid noopener — it makes window.open return null. */
export function openPrintWindow(html: string, title = "Report"): void {
  const win = window.open("about:blank", "_blank");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to download the PDF report.");
  }

  win.document.open();
  win.document.write(html);
  win.document.title = title;
  win.document.close();
  win.focus();

  // document.write + onload is unreliable; short delay before print.
  window.setTimeout(() => {
    win.print();
  }, 300);
}

export function escapeHtml(value: string | undefined | null): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
