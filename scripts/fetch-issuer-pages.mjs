// Polite issuer-page checker. Fetches official bank pages from
// data/issuer-sources.json (sequential, robots.txt honoured, one request per
// few seconds), saves raw snapshots plus extracted fee/earn signals under
// data/snapshots/<date>/, and diffs signal sets between snapshot dirs.
//
// A human curator maps confirmed changes into data/catalog.curated.json.
// Nothing here writes seeds or Firestore automatically.
//
// Usage:
//   node scripts/fetch-issuer-pages.mjs [--cards=amex-cobalt,tangerine]
//     [--out=data/snapshots/2026-10-31] [--delay-ms=2500] [--timeout-ms=30000]
//   node scripts/fetch-issuer-pages.mjs --diff [dirA dirB]  (default: latest two)
//   node scripts/fetch-issuer-pages.mjs --help

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'card-offers-curator/0.1 (+weekly personal catalog check; one request per few seconds)';

function printHelp() {
  console.log(`fetch-issuer-pages.mjs — check official bank pages for card-term changes

Fetch mode (default):
  node scripts/fetch-issuer-pages.mjs [--cards=a,b] [--out=dir] [--delay-ms=2500] [--timeout-ms=30000]

Diff mode:
  node scripts/fetch-issuer-pages.mjs --diff [olderDir newerDir]
  With no dirs, diffs the two latest data/snapshots/* runs.

Snapshots: <out>/{cardId}.html|pdf + {cardId}.meta.json (signals + sha256).
Raw HTML is git-ignored; *.meta.json is versioned change history.`);
}

function parseArgs(argv) {
  const args = { cards: null, out: null, delayMs: 2500, timeoutMs: 30000, diff: false, help: false, rest: [] };
  for (const token of argv) {
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--diff') args.diff = true;
    else if (token.startsWith('--cards=')) args.cards = token.slice(8).split(',').map((s) => s.trim()).filter(Boolean);
    else if (token.startsWith('--out=')) args.out = token.slice(6);
    else if (token.startsWith('--delay-ms=')) args.delayMs = Number(token.slice(11));
    else if (token.startsWith('--timeout-ms=')) args.timeoutMs = Number(token.slice(13));
    else if (token.startsWith('--')) throw new Error(`unknown flag ${token} (see --help)`);
    else args.rest.push(token);
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Minimal robots.txt check: match our UA or `*` groups, honour Disallow prefixes. */
export function robotsAllows(robotsText, path) {
  if (robotsText == null) return { allowed: true, reason: 'robots-unreachable' };
  const lines = robotsText.split('\n').map((l) => l.split('#')[0].trim()).filter(Boolean);
  let inGroup = false;
  let groupApplies = false;
  const disallows = [];
  for (const line of lines) {
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, field, value] = m;
    if (/^user-agent$/i.test(field)) {
      inGroup = true;
      groupApplies = value === '*' || UA.toLowerCase().includes(value.toLowerCase());
    } else if (inGroup && groupApplies && /^disallow$/i.test(field) && value) {
      disallows.push(value.trim());
    }
  }
  const hit = disallows.find((d) => path.startsWith(d));
  return hit ? { allowed: false, reason: `disallowed-by-robots:${hit}` } : { allowed: true, reason: 'allowed' };
}

async function fetchText(url, timeoutMs) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  return res;
}

const ENTITY_MAP = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function decodeEntities(s) {
  return s
    .replace(/&(amp|lt|gt|quot|nbsp);|&#39;/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Tag matcher that tolerates `>` inside quoted attribute values (Adobe
// data-layer attributes embed JSON with comparison operators).
const TAG_RE = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

/** Crude but deterministic HTML -> text lines (no DOM dependency). */
export function htmlToTextLines(html) {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, ' ');
  const BLOCK_TAG = /^<\s*\/?\s*(br|p|div|li|tr|h[1-6]|section|article|header|footer|main|aside|nav|ul|ol|table)\b/i;
  const stripped = noScripts.replace(TAG_RE, (tag) => (BLOCK_TAG.test(tag) ? '\n' : ' '));
  return decodeEntities(stripped)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1);
}

export function extractJsonLdTypes(html) {
  const types = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(m[1]);
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      for (const b of blocks) {
        if (typeof b?.['@type'] === 'string') types.push(b['@type']);
        else if (Array.isArray(b?.['@graph'])) {
          for (const g of b['@graph']) if (typeof g?.['@type'] === 'string') types.push(g['@type']);
        }
      }
    } catch {
      types.push('unparseable');
    }
  }
  return [...new Set(types)].sort();
}

const FEE_LINE = /(annual fee|card fee|yearly fee|monthly fee|no annual fee|annualfee)/i;
const EARN_LINE = /(\d+(?:\.\d+)?)\s*(%|\s*x\b|×|pts?\b|points?\b)/i;
const EARN_TOPIC = /(grocer|dining|restaurant|food|gas|fuel|transit|travel|drug|pharmar|recur|bill|stream|insurance|foreign|u\.s\.|cash ?back|reward|earn|points per|per \$1|every \$1)/i;
const MONEY = /\$[\d,]+(?:\.\d{2})?/;

function pickLines(lines, predicate, cap) {
  const out = [];
  for (const line of lines) {
    if (out.length >= cap) break;
    if (predicate(line) && !out.includes(line)) out.push(line.slice(0, 180));
  }
  return out;
}

/** Fee/earn candidate lines. Heuristic triage for the curator, not parsed facts. */
export function extractSignals(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const lines = htmlToTextLines(html);
  const fees = pickLines(lines, (l) => FEE_LINE.test(l) && (MONEY.test(l) || /no annual fee/i.test(l)), 6);
  const earn = pickLines(lines, (l) => EARN_LINE.test(l) && EARN_TOPIC.test(l), 15);
  const fx = pickLines(lines, (l) => /foreign (transaction|currency)|conversion/i.test(l), 3);
  return { title, fees, earn, fx, jsonLdTypes: extractJsonLdTypes(html) };
}

function extensionFor(contentType, url) {
  if (/pdf/i.test(contentType ?? '') || /\.pdf(\?|$)/i.test(url)) return '.pdf';
  if (/html/i.test(contentType ?? '')) return '.html';
  return '.bin';
}

async function snapshotPage({ outDir, cardId, url, timeoutMs, robotsCache, suffix = '' }) {
  const u = new URL(url);
  const host = u.host;
  if (!robotsCache.has(host)) {
    let text = null;
    try {
      const res = await fetchText(`https://${host}/robots.txt`, timeoutMs);
      text = res.ok ? await res.text() : null;
      writeFileSync(join(outDir, '_robots', `${host}.txt`), text ?? `# unreachable (HTTP ${res.status})`);
    } catch (e) {
      writeFileSync(join(outDir, '_robots', `${host}.txt`), `# unreachable (${String(e).slice(0, 120)})`);
    }
    robotsCache.set(host, text);
  }
  const robots = robotsAllows(robotsCache.get(host), u.pathname);
  const base = `${cardId}${suffix}`;
  if (!robots.allowed) {
    const meta = { cardId, url, skipped: true, reason: robots.reason, fetchedAt: new Date().toISOString() };
    writeFileSync(join(outDir, `${base}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
    return { cardId, url, ok: false, skipped: true, reason: robots.reason };
  }
  const res = await fetchText(url, timeoutMs);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? '';
  const ext = extensionFor(contentType, res.url);
  const result = {
    cardId,
    url,
    finalUrl: res.url,
    fetchedAt: new Date().toISOString(),
    status: res.status,
    bytes: buf.length,
    sha256: sha256(buf),
    contentType,
    robots: robots.reason,
  };
  if (!res.ok) {
    const meta = { ...result, ok: false, error: `HTTP ${res.status}` };
    writeFileSync(join(outDir, `${base}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
    return { cardId, url, ok: false, reason: `HTTP ${res.status}` };
  }
  writeFileSync(join(outDir, `${base}${ext}`), buf);
  const meta = ext === '.html'
    ? { ...result, ok: true, file: `${base}${ext}`, signals: extractSignals(buf.toString('utf8')) }
    : { ...result, ok: true, file: `${base}${ext}`, signals: null, note: 'non-HTML payload; verify manually' };
  writeFileSync(join(outDir, `${base}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
  return { cardId, url, ok: true, bytes: buf.length };
}

function loadMetas(dir) {
  const metas = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.meta.json')) continue;
    try {
      const meta = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      metas.set(f.replace(/\.meta\.json$/, ''), meta);
    } catch {
      // ignore unreadable meta files; reported as missing below
    }
  }
  return metas;
}

function signalKey(meta) {
  if (!meta || meta.ok !== true) return `status:${meta?.skipped ? 'skipped' : 'failed'}:${meta?.reason ?? meta?.error ?? '?'}`;
  return JSON.stringify(meta.signals ?? { sha: meta.sha256 });
}

function setDiff(before, after) {
  const a = new Set(before);
  const b = new Set(after);
  return { added: after.filter((l) => !a.has(l)), removed: before.filter((l) => !b.has(l)) };
}

export function diffSnapshots(dirA, dirB) {
  const a = loadMetas(dirA);
  const b = loadMetas(dirB);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const rows = [];
  for (const key of keys) {
    const ma = a.get(key);
    const mb = b.get(key);
    if (!ma) rows.push({ key, status: 'new', detail: 'only in newer snapshot' });
    else if (!mb) rows.push({ key, status: 'missing', detail: 'absent from newer snapshot' });
    else if (signalKey(ma) === signalKey(mb)) rows.push({ key, status: 'unchanged', detail: '' });
    else {
      const parts = [];
      for (const field of ['fees', 'earn', 'fx']) {
        const d = setDiff(ma.signals?.[field] ?? [], mb.signals?.[field] ?? []);
        for (const l of d.added.slice(0, 4)) parts.push(`  + [${field}] ${l}`);
        for (const l of d.removed.slice(0, 4)) parts.push(`  - [${field}] ${l}`);
      }
      if ((ma.signals?.title ?? '') !== (mb.signals?.title ?? '')) {
        parts.push(`  ~ title: ${ma.signals?.title ?? '?'} -> ${mb.signals?.title ?? '?'}`);
      }
      if (parts.length === 0) parts.push(`  ~ page bytes changed (${ma.bytes} -> ${mb.bytes}), signals identical`);
      rows.push({ key, status: 'CHANGED', detail: parts.join('\n') });
    }
  }
  return rows;
}

function latestSnapshotDirs() {
  const root = join(ROOT, 'data', 'snapshots');
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return dirs.slice(-2).map((d) => join(root, d));
}

async function runFetch(args) {
  const registry = JSON.parse(readFileSync(join(ROOT, 'data', 'issuer-sources.json'), 'utf8'));
  const wanted = new Set(args.cards ?? []);
  const sources = registry.sources.filter((s) => wanted.size === 0 || wanted.has(s.id));
  if (args.cards && sources.length !== wanted.size) {
    const missing = [...wanted].filter((id) => !sources.some((s) => s.id === id));
    throw new Error(`unknown card id(s): ${missing.join(', ')}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const outDir = args.out ?? join(ROOT, 'data', 'snapshots', today);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, '_robots'), { recursive: true });

  const robotsCache = new Map();
  const results = [];
  for (const source of sources) {
    const urls = [source.primaryUrl, ...(source.extraUrls ?? [])];
    for (const [i, url] of urls.entries()) {
      if (results.length > 0) await sleep(args.delayMs);
      try {
        const r = await snapshotPage({
          outDir,
          cardId: source.id,
          url,
          timeoutMs: args.timeoutMs,
          robotsCache,
          suffix: i === 0 ? '' : `-extra${i}`,
        });
        results.push(r);
        console.log(`${r.ok ? 'ok     ' : 'FAILED '} ${source.id} <- ${url} ${r.ok ? `(${r.bytes} bytes)` : `(${r.reason})`}`);
      } catch (e) {
        results.push({ cardId: source.id, url, ok: false, reason: String(e).slice(0, 160) });
        console.log(`FAILED  ${source.id} <- ${url} (${String(e).slice(0, 120)})`);
      }
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\ndone: ${results.length - failed.length}/${results.length} pages saved to ${outDir}`);
  if (failed.length > 0) {
    console.log('action needed (manual browser check):');
    for (const f of failed) console.log(`  - ${f.cardId}: ${f.url} (${f.reason})`);
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.diff) {
    const [a, b] = args.rest.length === 2 ? args.rest : latestSnapshotDirs();
    if (!a || !b) throw new Error('need two snapshot dirs with *.meta.json (see --help)');
    const rows = diffSnapshots(a, b);
    console.log(`diff ${a} -> ${b}\n`);
    for (const r of rows) {
      console.log(`${r.status.padEnd(9)} ${r.key}${r.detail ? `\n${r.detail}` : ''}`);
    }
    const changed = rows.filter((r) => r.status === 'CHANGED').length;
    console.log(`\n${changed} changed, ${rows.length - changed} unchanged/new/missing.`);
    return;
  }
  await runFetch(args);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  await main().catch((e) => {
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  });
}
