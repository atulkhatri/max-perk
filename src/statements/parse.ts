/** One parsed spend line, before categorization. Amounts are signed dollars. */
export interface RawTransaction {
  date: string;
  description: string;
  amountCAD: number;
}

export interface ParseResult {
  transactions: RawTransaction[];
  /** Rows seen but not understood (counted, never thrown). */
  skipped: number;
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const fullYear = y < 100 ? 2000 + y : y;
  return `${fullYear}-${pad(m)}-${pad(d)}`;
}

/**
 * Supported statement dates. Slash-numeric dates read month-first
 * (MM/DD/YYYY); bank CSV exports in Canada use that or ISO. Ambiguous
 * DD/MM pairs therefore resolve as MM/DD — stated in the UI coverage note.
 */
export function parseStatementDate(raw: string): string | null {
  const text = raw.trim();
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/))) {
    return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if ((m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
    return iso(Number(m[3]), Number(m[1]), Number(m[2]));
  }
  if (
    (m = text.match(
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/i,
    ))
  ) {
    return iso(Number(m[3]), Number(MONTHS[m[1].toLowerCase()]), Number(m[2]));
  }
  if (
    (m = text.match(
      /^(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+(\d{2,4})$/i,
    ))
  ) {
    return iso(Number(m[3]), Number(MONTHS[m[2].toLowerCase()]), Number(m[1]));
  }
  return null;
}

/** Signed dollars from statement conventions: $1,234.56, (12.34), 12.34CR/DR. */
export function parseStatementAmount(raw: string): number | null {
  let text = raw.trim().replace(/[$,\s]/g, '');
  if (text === '') return null;
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1);
  }
  const suffix = text.slice(-2).toUpperCase();
  if (suffix === 'CR') {
    negative = true;
    text = text.slice(0, -2);
  } else if (suffix === 'DR' || suffix === 'DB') {
    text = text.slice(0, -2);
  }
  if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1);
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

const DATE_HEADERS = ['transaction date', 'trans date', 'posting date', 'posted', 'date'];
const DESC_HEADERS = ['merchant name', 'description', 'details', 'merchant', 'narrative', 'transaction'];
const AMOUNT_HEADERS = ['transaction amount', 'amount', 'cad', 'value'];
const DEBIT_HEADERS = ['withdrawal', 'withdrawals', 'debit', 'paid out', 'money out'];
const CREDIT_HEADERS = ['deposit', 'deposits', 'credit', 'paid in', 'money in'];

function headerIndex(cells: string[], names: string[]): number {
  const lowered = cells.map((c) => c.toLowerCase());
  for (const name of names) {
    const idx = lowered.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Parse bank CSV text with tolerant header detection. */
export function parseCsvTransactions(text: string): ParseResult {
  const transactions: RawTransaction[] = [];
  let skipped = 0;
  const lines = text.split(/\r?\n/);
  let headerAt = -1;
  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length < 2) continue;
    const d = headerIndex(cells, DATE_HEADERS);
    const n = headerIndex(cells, DESC_HEADERS);
    const a = headerIndex(cells, AMOUNT_HEADERS);
    const db = headerIndex(cells, DEBIT_HEADERS);
    const cr = headerIndex(cells, CREDIT_HEADERS);
    if (d >= 0 && n >= 0 && (a >= 0 || db >= 0 || cr >= 0)) {
      headerAt = i;
      dateCol = d;
      descCol = n;
      amountCol = a;
      debitCol = db;
      creditCol = cr;
      break;
    }
  }
  if (headerAt < 0) return { transactions, skipped: lines.filter((l) => l.trim() !== '').length };
  for (let i = headerAt + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const cells = splitCsvLine(lines[i]);
    const date = parseStatementDate(cells[dateCol] ?? '');
    const description = (cells[descCol] ?? '').trim();
    let amount: number | null = null;
    if (amountCol >= 0) {
      amount = parseStatementAmount(cells[amountCol] ?? '');
    } else {
      const debit = debitCol >= 0 ? parseStatementAmount(cells[debitCol] ?? '') : null;
      const credit = creditCol >= 0 ? parseStatementAmount(cells[creditCol] ?? '') : null;
      const d = debit ?? 0;
      const c = credit ?? 0;
      amount = debit === null && credit === null ? null : Math.abs(d) - Math.abs(c);
    }
    if (!date || description === '' || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    transactions.push({ date, description, amountCAD: amount });
  }
  return { transactions, skipped };
}

const PDF_AMOUNT_END =
  /^(.*?)\s+([(]?-?\$?[\d,]+\.\d{2}[)]?(?:\s?(?:CR|DR|DB))?)\s*$/i;
const PDF_JUNK = /^(page \d+|continued|continued on next page|statement period|account (number|summary))$/i;

/**
 * Parse plain-text lines extracted from a PDF (one transaction per
 * date-led line; continuation lines append to the previous description).
 */
export function parsePdfLines(lines: string[]): ParseResult {
  const transactions: RawTransaction[] = [];
  let skipped = 0;
  let open: RawTransaction | null = null;
  let continuations = 0;
  const flush = (): void => {
    open = null;
    continuations = 0;
  };
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/\s+/g, ' ');
    if (line === '' || PDF_JUNK.test(line)) continue;
    // A date-led line starts a new transaction.
    const dateProbe = line.match(
      /^(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+\d{2,4})\b/i,
    );
    if (dateProbe) {
      const rest = line.slice(dateProbe[0].length).trim();
      const tail = rest.match(PDF_AMOUNT_END);
      const date = parseStatementDate(dateProbe[1]);
      if (!date || !tail) {
        skipped++;
        flush();
        continue;
      }
      const amount = parseStatementAmount(tail[2]);
      const description = tail[1].trim();
      if (amount === null || amount === 0 || description === '') {
        skipped++;
        flush();
        continue;
      }
      open = { date, description, amountCAD: amount };
      transactions.push(open);
      continuations = 0;
      continue;
    }
    // Otherwise it may continue the previous description. Statement fragments
    // are conventionally all-caps; mixed-case sentences are headers or prose.
    if (open && continuations < 2 && !/^\d/.test(line) && !/[a-z]/.test(line)) {
      open.description += ` ${line}`;
      continuations++;
    } else {
      skipped++;
      flush();
    }
  }
  return { transactions, skipped };
}

/**
 * Account payments ("PAYMENT THANK YOU") move money to the card, not out to
 * merchants. They must not count as spending; refunds ("AMAZON REFUND") stay
 * because they reverse category spend.
 */
export function isAccountPayment(description: string, amountCAD: number): boolean {
  if (amountCAD >= 0) return false;
  return /payment.*thank|thank you|payment received|autopay|auto-?pay|pre-authorized payment|statement credit/i.test(
    description,
  );
}

/** Drop exact repeats from overlapping statements; keeps first occurrence. */
export function dedupeTransactions(transactions: RawTransaction[]): RawTransaction[] {
  const seen = new Set<string>();
  const out: RawTransaction[] = [];
  for (const t of transactions) {
    const key = `${t.date}|${t.description.toLowerCase().replace(/\s+/g, ' ')}|${t.amountCAD.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
