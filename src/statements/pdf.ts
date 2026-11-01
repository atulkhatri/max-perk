import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerReady = false;

export type PdfReadError = 'password' | 'scanned' | 'unreadable';

/**
 * Extract plain-text lines from a statement PDF, in the browser.
 * The worker is bundled locally (see workerSrc below), so nothing is fetched
 * remotely and file bytes never leave the device.
 */
export async function pdfToLines(data: ArrayBuffer): Promise<{ lines?: string[]; error?: PdfReadError }> {
  try {
    if (!workerReady) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      workerReady = true;
    }
    const task = pdfjs.getDocument({ data });
    const doc = await task.promise;
    try {
      const lines: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        lines.push(...groupItems(content.items));
        await page.cleanup();
      }
      if (lines.join('\n').trim() === '') return { error: 'scanned' };
      return { lines };
    } finally {
      await task.destroy();
    }
  } catch (err) {
    if (err instanceof pdfjs.PasswordException) return { error: 'password' };
    return { error: 'unreadable' };
  }
}

interface TextItemShape {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

/** Prefer embedded line breaks; fall back to y-coordinate clustering. */
function groupItems(items: unknown[]): string[] {
  const typed = items as TextItemShape[];
  if (typed.some((item) => item.hasEOL)) {
    const lines: string[] = [];
    let current = '';
    for (const item of typed) {
      current += item.str;
      if (item.hasEOL) {
        lines.push(current);
        current = '';
      } else {
        current += ' ';
      }
    }
    if (current.trim() !== '') lines.push(current);
    return lines;
  }
  const placed = typed
    .map((item) => ({ text: item.str, x: item.transform?.[4] ?? 0, y: item.transform?.[5] ?? 0 }))
    .filter((item) => item.text.trim() !== '')
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let currentY = Number.POSITIVE_INFINITY;
  let current = '';
  for (const item of placed) {
    if (Math.abs(item.y - currentY) > 3 && current.trim() !== '') {
      lines.push(current);
      current = '';
    }
    currentY = item.y;
    current += `${item.text} `;
  }
  if (current.trim() !== '') lines.push(current);
  return lines;
}
